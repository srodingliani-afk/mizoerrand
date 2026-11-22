import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Camera,
  FileCheck2,
  Lock,
  Receipt,
  ShieldAlert,
  Video,
} from 'lucide-react';
import type {
  AppRemoteConfig,
  DisputeCase,
  EmergencySosTicket,
  ErrandRequest,
  EscrowLedgerEntry,
  KycQueueItem,
  Language,
  MizoramDistrict,
  PartnerProfile,
  PayrollRecord,
  StaffAttendanceLog,
  StaffLeaveRequest,
  StaffingBooking,
  TrustBadge,
  WorkforceMember,
} from '../shared/types';
import { TRANSLATIONS } from '../i18n/translations';
import { ALL_MIZORAM_DISTRICT_NAMES, MIZORAM_DISTRICTS, getDistrictInfo } from '../data/mizoramDistricts';
import { MizoramMap } from './MizoramMap';
import { AdminStaffingConsole } from './AdminStaffingConsole';
import { MasterSystemControlPanel } from './MasterSystemControlPanel';
import { LiveVideoInterviewModal } from './LiveVideoInterviewModal';
import { triggerHaptic } from '../lib/nativeBridge';

type AdminRole = 'Super Admin' | 'Operations Lead' | 'KYC & HR Officer' | 'Finance & Payroll';
type AdminTab = 'dispatch' | 'kyc' | 'payroll' | 'disputes' | 'master_control';

interface AdminDashboardProps {
  lang: Language;
  adminToken: string;
  onAuthExpired: () => void;
  selectedDistrict: MizoramDistrict;
  mapsApiKey: string;
  remoteConfig: AppRemoteConfig;
  partners: PartnerProfile[];
  errands: ErrandRequest[];
  sosTickets: EmergencySosTicket[];
  workforce: WorkforceMember[];
  staffingBookings: StaffingBooking[];
  leaveRequests: StaffLeaveRequest[];
  attendanceLogs: StaffAttendanceLog[];
  payrollRecords: PayrollRecord[];
  onRefresh: () => Promise<void>;
  onOpenDevStudio: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  lang,
  adminToken,
  onAuthExpired,
  selectedDistrict,
  mapsApiKey,
  remoteConfig,
  partners,
  errands,
  sosTickets,
  workforce,
  staffingBookings,
  leaveRequests,
  attendanceLogs,
  payrollRecords,
  onRefresh,
  onOpenDevStudio,
}) => {
  const t = TRANSLATIONS[lang];
  const [role, setRole] = useState<AdminRole>('Super Admin');
  const [tab, setTab] = useState<AdminTab>('dispatch');
  const [districtFilter, setDistrictFilter] = useState<MizoramDistrict | 'All'>('All');
  const [kycQueue, setKycQueue] = useState<Array<KycQueueItem & { signedDocumentUrl?: string; signedExpiresAt?: string }>>([]);
  const [disputes, setDisputes] = useState<DisputeCase[]>([]);
  const [ledger, setLedger] = useState<EscrowLedgerEntry[]>([]);
  const [blacklisted, setBlacklisted] = useState<string[]>([]);
  const [badgeSelection, setBadgeSelection] = useState<Record<string, TrustBadge>>({});
  const [signedCheckMsg, setSignedCheckMsg] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [activeVideoKycItem, setActiveVideoKycItem] = useState<KycQueueItem | null>(null);

  const handleVideoInterviewAction = async (
    kycId: string,
    action: 'require_or_schedule' | 'open_live_room' | 'complete_passed' | 'complete_failed' | 'waive'
  ) => {
    triggerHaptic('medium');
    try {
      const res = await fetch(`/api/auth-kyc/video-interview/${kycId}`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({
          action,
          interviewerName: `${role} Officer`,
          interviewScore: 95,
        }),
      });
      if (res.status === 401) {
        onAuthExpired();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionStatus(data.error || 'Could not update video interview status.');
        return;
      }
      setActionStatus(`KYC ${kycId} Live Video Interview -> ${data.item?.videoInterview?.status}`);
      await fetchAdminDetails();
    } catch {
      setActionStatus('Network error updating live video interview.');
    }
  };

  const authHeaders = (withJson = false): Record<string, string> =>
    withJson
      ? { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }
      : { Authorization: `Bearer ${adminToken}` };

  const fetchAdminDetails = async () => {
    try {
      const [kycRes, escRes] = await Promise.all([
        fetch('/api/auth-kyc/queue', { headers: authHeaders() }),
        fetch('/api/escrow/ledger', { headers: authHeaders() }),
      ]);
      if (kycRes.status === 401 || escRes.status === 401) {
        onAuthExpired();
        return;
      }
      if (kycRes.ok) {
        const k = await kycRes.json();
        setKycQueue(k.kycQueue || []);
      }
      if (escRes.ok) {
        const e = await escRes.json();
        setDisputes(e.disputes || []);
        setLedger(e.ledger || []);
        setBlacklisted(e.blacklistedCustomers || []);
      }
    } catch {
      // ignore offline
    }
  };

  useEffect(() => {
    void fetchAdminDetails();
  }, [errands, sosTickets, adminToken]);

  const canAccessTab = (target: AdminTab): boolean => {
    if (role === 'Super Admin') return true;
    if (role === 'Operations Lead') return target === 'dispatch' || target === 'disputes';
    if (role === 'KYC & HR Officer') return target === 'kyc' || target === 'payroll';
    if (role === 'Finance & Payroll') return target === 'payroll' || target === 'disputes';
    return false;
  };

  const handleToggleSundayMode = async () => {
    triggerHaptic('warning');
    try {
      const res = await fetch('/api/sdui/quick-toggle', {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ sundayEmergencyMode: !remoteConfig.sundayEmergencyMode }),
      });
      if (res.status === 401) {
        onAuthExpired();
        return;
      }
      if (!res.ok) {
        triggerHaptic('error');
        const err = await res.json().catch(() => ({}));
        setActionStatus(err.error || 'Could not update Sunday Emergency Mode.');
        return;
      }
      triggerHaptic('success');
      setActionStatus(`Sunday Emergency Mode set to ${!remoteConfig.sundayEmergencyMode}`);
      await onRefresh();
    } catch {
      triggerHaptic('error');
      setActionStatus('Network error updating Sunday Emergency Mode.');
    }
  };

  const handleSetRainSurge = async (mult: number) => {
    triggerHaptic('medium');
    try {
      const res = await fetch('/api/sdui/quick-toggle', {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ rainSurgeMultiplier: mult }),
      });
      if (res.status === 401) {
        onAuthExpired();
        return;
      }
      if (!res.ok) {
        triggerHaptic('error');
        const err = await res.json().catch(() => ({}));
        setActionStatus(err.error || 'Could not update Rain Surge multiplier.');
        return;
      }
      triggerHaptic('success');
      setActionStatus(`Rain Surge updated to ${mult}x via SDUI`);
      await onRefresh();
    } catch {
      triggerHaptic('error');
      setActionStatus('Network error updating Rain Surge multiplier.');
    }
  };

  const handleResolveSos = async (ticketId: string, status: EmergencySosTicket['status'], spareParts = 0) => {
    triggerHaptic(status === 'en_route' ? 'sos' : 'success');
    try {
      const res = await fetch(`/api/emergency/tickets/${ticketId}/update`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ status, sparePartsAmount: spareParts }),
      });
      if (res.status === 401) {
        onAuthExpired();
        return;
      }
      if (!res.ok) {
        triggerHaptic('error');
        const err = await res.json().catch(() => ({}));
        setActionStatus(err.error || 'Could not update SOS ticket.');
        return;
      }
      setActionStatus(`SOS ticket ${ticketId} marked ${status}.`);
      await onRefresh();
    } catch {
      triggerHaptic('error');
      setActionStatus('Network error updating SOS ticket.');
    }
  };

  const handleVerifySignedUrl = async (
    item: KycQueueItem & { signedDocumentUrl?: string; signedExpiresAt?: string }
  ) => {
    try {
      if (item.kycDocumentPath) {
        const res = await fetch('/api/media/kyc/signed-url', {
          method: 'POST',
          headers: authHeaders(true),
          body: JSON.stringify({ objectPath: item.kycDocumentPath, ttlSeconds: 60 }),
        });
        if (res.status === 401) {
          onAuthExpired();
          return;
        }
        const data = await res.json();
        if (res.ok) {
          setSignedCheckMsg(
            `Admin 2FA 60s Signed URL issued (${data.bucket} · ${data.provider}) — Expires ${new Date(data.expiresAt).toLocaleTimeString()}`
          );
          return;
        }
        setSignedCheckMsg(data.error || 'Could not issue KYC signed URL.');
        return;
      }
      if (!item.signedDocumentUrl) return;
      const res = await fetch(item.signedDocumentUrl);
      const data = await res.json();
      if (res.ok) {
        setSignedCheckMsg(`Verified 60s Private URL for ${data.resourceId} (Expires ${new Date(data.expiresAt).toLocaleTimeString()})`);
      } else {
        setSignedCheckMsg(data.error || 'Signed URL expired');
      }
    } catch {
      setSignedCheckMsg('Network error verifying signed URL.');
    }
  };

  const handleKycDecision = async (id: string, decision: 'approved' | 'rejected') => {
    const badge = badgeSelection[id] || 'Police Verified - Green Shield';
    try {
      const res = await fetch('/api/auth-kyc/review', {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ id, decision, badge }),
      });
      if (res.status === 401) {
        onAuthExpired();
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setActionStatus(err.error || 'Could not save KYC review.');
        return;
      }
      const data = await res.json().catch(() => ({}));
      const publishedNote = data.promotedWorkforce
        ? ` · Auto-published to Workforce Directory (${data.promotedWorkforce.id})`
        : data.promotedPartner
          ? ` · Auto-published to Fleet Partners (${data.promotedPartner.id})`
          : '';
      setActionStatus(`KYC ${id} marked ${decision} (${badge})${publishedNote}`);
      await Promise.all([fetchAdminDetails(), onRefresh()]);
    } catch {
      setActionStatus('Network error saving KYC review.');
    }
  };

  const handleResolveDispute = async (
    id: string,
    resolution: 'resolved_refund' | 'resolved_payout' | 'blacklisted',
    blacklistCustomer = false
  ) => {
    try {
      const res = await fetch(`/api/escrow/disputes/${id}/resolve`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ resolution, blacklistCustomer }),
      });
      if (res.status === 401) {
        onAuthExpired();
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setActionStatus(err.error || 'Could not resolve dispute.');
        return;
      }
      setActionStatus(`Dispute ${id} -> ${resolution}`);
      await fetchAdminDetails();
    } catch {
      setActionStatus('Network error resolving dispute.');
    }
  };

  const handleReconcileWebhook = async (ledgerId: string) => {
    try {
      const res = await fetch('/api/escrow/webhooks/razorpay-reconcile', {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ ledgerId }),
      });
      if (res.status === 401) {
        onAuthExpired();
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setActionStatus(err.error || 'Could not reconcile webhook.');
        return;
      }
      setActionStatus(`Razorpay/Cashfree auto-reconciliation webhook verified for ${ledgerId}.`);
      await fetchAdminDetails();
    } catch {
      setActionStatus('Network error reconciling webhook.');
    }
  };

  const visiblePartners =
    districtFilter === 'All'
      ? partners
      : partners.filter((p) => (p.district || 'Aizawl') === districtFilter);
  const visibleErrands =
    districtFilter === 'All'
      ? errands
      : errands.filter((e) => (e.district || 'Aizawl') === districtFilter || e.isInterDistrict);
  const visibleSosTickets =
    districtFilter === 'All'
      ? sosTickets
      : sosTickets.filter((s) => (s.district || 'Aizawl') === districtFilter);
  const visibleKycQueue =
    districtFilter === 'All'
      ? kycQueue
      : kycQueue.filter((k) => (k.district || 'Aizawl') === districtFilter);

  const mapDistrict: MizoramDistrict = districtFilter === 'All' ? selectedDistrict : districtFilter;
  const mapDistrictInfo = getDistrictInfo(mapDistrict);

  const flashingSos = visibleSosTickets.filter((s) => s.status === 'flashing_dispatch');
  const stuckOrders = visibleErrands.filter((e) => e.status === 'bidding');

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* Command Header + RBAC Role Switcher + District Hub Filter */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t.adminTitle}</h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Mumbai (asia-south1) · All 11 Mizoram District Capitals · Real-time Dispatch, KYC &amp; Shift Roster, Payroll, Escrow GST &amp; SDUI
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="admin-district-filter" className="text-xs font-medium text-slate-600">
              District Hub:
            </label>
            <select
              id="admin-district-filter"
              value={districtFilter}
              onChange={(e) => setDistrictFilter(e.target.value as MizoramDistrict | 'All')}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-teal-900"
            >
              <option value="All">{t.allDistrictsLabel}</option>
              {ALL_MIZORAM_DISTRICT_NAMES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="admin-rbac-role" className="text-xs font-medium text-slate-600">
              RBAC Role:
            </label>
            <select
              id="admin-rbac-role"
              value={role}
              onChange={(e) => {
                const next = e.target.value as AdminRole;
                setRole(next);
                if (next === 'KYC & HR Officer') setTab('kyc');
                else if (next === 'Finance & Payroll') setTab('payroll');
                else setTab('dispatch');
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
            >
              <option value="Super Admin">Super Admin (Full Access)</option>
              <option value="Operations Lead">Operations Lead</option>
              <option value="KYC & HR Officer">KYC &amp; HR Officer</option>
              <option value="Finance & Payroll">Finance &amp; Payroll</option>
            </select>
          </div>

          {role === 'Super Admin' && (
            <button
              type="button"
              onClick={onOpenDevStudio}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <Lock className="w-3.5 h-3.5" /> Open Server Dev Studio
            </button>
          )}
        </div>
      </div>

      {/* Flashing Red 24x7 SOS Alert Bar (30-second SLA) */}
      {flashingSos.length > 0 && (
        <div className="rounded-2xl border-2 border-red-600 bg-red-50 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-red-900">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <div>
              <p className="text-sm font-bold">
                URGENT 24×7 SOS ALERT ({flashingSos.length}) · 30-Second Dispatch SLA
              </p>
              <p className="text-xs">
                {flashingSos[0].id} · {flashingSos[0].veng} · {flashingSos[0].category.replace(/_/g, ' ')} · Assigned: {flashingSos[0].assignedTechName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleResolveSos(flashingSos[0].id, 'en_route', 150)}
            className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
          >
            Confirm Tech En-Route
          </button>
        </div>
      )}

      {/* Admin Module Tabs */}
      <div className="flex flex-wrap gap-2 rounded-xl bg-slate-200/70 p-1.5">
        {(
          [
            ['dispatch', 'Live Ops & 24x7 Dispatch'],
            ['kyc', 'KYC, Vetting & 3-Shift Roster'],
            ['payroll', 'Managed Staffing & Payroll'],
            ['disputes', 'Disputes, Fraud & GST Escrow'],
            ['master_control', 'Master System Control (Edit All)'],
          ] as const
        ).map(([key, label]) => {
          const allowed = canAccessTab(key);
          return (
            <button
              key={key}
              type="button"
              disabled={!allowed}
              onClick={() => setTab(key)}
              className={`min-h-[40px] rounded-lg px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                tab === key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : allowed
                    ? 'text-slate-700 hover:text-slate-900'
                    : 'text-slate-400 cursor-not-allowed'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {actionStatus && (
        <p role="status" className="rounded-xl bg-teal-50 p-3 text-xs font-medium text-teal-900">
          {actionStatus}
        </p>
      )}

      {/* TAB 1: LIVE OPERATIONS & SDUI CONTROL */}
      {tab === 'dispatch' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">
                Live {districtFilter === 'All' ? `Mizoram (${mapDistrict} Focus)` : districtFilter} Fleet, Routes &amp; SOS Map
              </h2>
              <span className="text-xs font-mono text-slate-600">
                {visiblePartners.filter((p) => p.online).length} Online Partners · {stuckOrders.length} Bidding Orders
              </span>
            </div>
            <MizoramMap
              apiKey={mapsApiKey}
              district={mapDistrict}
              districtCenter={mapDistrictInfo.center}
              districtVengs={mapDistrictInfo.vengs}
              partners={visiblePartners}
              sosTickets={visibleSosTickets}
              origin={visibleErrands[0]?.origin}
              stops={visibleErrands[0]?.stops}
              destination={visibleErrands[0]?.destination}
              heightClass="h-80 lg:h-96"
            />
          </div>

          <div className="lg:col-span-4 space-y-4">
            {/* SDUI Instant Remote Config Controls */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-900">
                Zero-Install SDUI Remote Controls
              </h3>
              <p className="text-xs text-slate-600">
                Changes broadcast immediately to all Customer &amp; Partner PWAs without app updates.
              </p>
              <button
                type="button"
                onClick={handleToggleSundayMode}
                className={`w-full min-h-[42px] rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
                  remoteConfig.sundayEmergencyMode
                    ? 'bg-amber-600 text-white'
                    : 'border border-slate-300 text-slate-800 hover:bg-slate-50'
                }`}
              >
                {remoteConfig.sundayEmergencyMode
                  ? 'Disable Sunday Emergency Mode'
                  : 'Enable Sunday Emergency Mode'}
              </button>
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-xs text-slate-700">Rain Surge Multiplier:</span>
                <div className="flex gap-1">
                  {[1.0, 1.25, 1.5].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => handleSetRainSurge(m)}
                      className={`rounded-md px-2.5 py-1 text-xs font-mono font-semibold ${
                        remoteConfig.rainSurgeMultiplier === m
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {m}x
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 24x7 SOS Ticket Queue */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-900">
                24×7 Emergency SOS Queue ({visibleSosTickets.length})
              </h3>
              {visibleSosTickets.map((ticket) => (
                <div key={ticket.id} className="border-t border-slate-100 pt-2.5 space-y-1.5">
                  <p className="text-xs font-semibold text-slate-900">
                    {ticket.id} · {ticket.veng} ({ticket.district || 'Aizawl'}) · <span className="text-red-700">{ticket.status}</span>
                  </p>
                  <p className="text-xs text-slate-600">
                    {ticket.assignedTechName} · SLA {ticket.slaTargetMinutes}m · Rs. {ticket.standardizedRate + ticket.sparePartsAmount}
                  </p>
                  {ticket.status !== 'resolved' && (
                    <button
                      type="button"
                      onClick={() => handleResolveSos(ticket.id, 'resolved', ticket.sparePartsAmount || 200)}
                      className="rounded-md bg-teal-700 px-2.5 py-1 text-[11px] font-semibold text-white"
                    >
                      Mark Resolved + Attach Spare Receipt
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: KYC, VETTING & 3-SHIFT ROSTER */}
      {tab === 'kyc' && (
        <div className="space-y-6">
          {signedCheckMsg && (
            <p role="status" className="rounded-xl bg-slate-900 p-3 text-xs font-mono text-white">
              {signedCheckMsg}
            </p>
          )}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Camera AI OCR KYC, Live Video Interview &amp; Server Staff Verification Queue ({visibleKycQueue.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Phone Camera-Only Capture · Full 12-Digit Aadhaar AI OCR Auto-Masked · In-App WebRTC Video Interview for Awmpui &amp; Drivers
                </p>
              </div>
            </div>
            <div className="space-y-4">
              {visibleKycQueue.map((item) => {
                const vid = item.videoInterview;
                const videoBlockingApproval =
                  vid?.required &&
                  vid.status !== 'completed_passed' &&
                  vid.status !== 'waived_by_staff';
                return (
                <div key={item.id} className="rounded-xl border border-slate-200 p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-mono text-slate-500">
                          {item.id} · {item.targetCategory.toUpperCase()} · {item.veng} ({item.district || 'Aizawl'}) · Score {item.practicalTestScore}/100
                        </p>
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                            item.requestType === 'partner_doc_update' || item.requestType === 'staff_doc_update'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-emerald-100 text-emerald-900'
                          }`}
                        >
                          {item.requestType === 'partner_doc_update'
                            ? `Partner Doc Update (${item.targetEntityId})`
                            : item.requestType === 'staff_doc_update'
                              ? `Staff Doc Update (${item.targetEntityId})`
                              : 'New Onboarding'}
                        </span>
                        {item.cameraCaptureVerified && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-900">
                            <Camera className="w-3 h-3" /> Live Phone Camera Verified
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-semibold text-slate-900">{item.applicantName}</h3>
                      <p className="text-xs text-slate-600">
                        Aadhaar {item.aadhaarMasked}{' '}
                        {item.aadhaarFull12Validated ? '(12-Digit UIDAI AI Verified)' : ''} · Voter {item.voterIdNumber}
                        {item.drivingLicenceNumber ? ` · DL ${item.drivingLicenceNumber}` : ''}
                        {item.commercialPermitNumber ? ` · Permit ${item.commercialPermitNumber}` : ''}
                        {item.vehicleRcNumber ? ` · RC ${item.vehicleRcNumber}` : ''}
                      </p>
                      <p className="text-xs text-teal-800">
                        PVC: {item.pvcNumber || 'Pending'} · Local Ref: {item.ymaVcReference}
                      </p>
                      <p className="text-xs text-slate-500">Resume: {item.resumeSummary}</p>

                      {item.aiOcrReport && (
                        <div className="mt-2 rounded-lg bg-slate-50 border border-slate-200 p-2.5 text-[11px] text-slate-700 space-y-0.5">
                          <p className="font-bold text-slate-900 flex items-center gap-1.5">
                            <Bot className="w-3.5 h-3.5 text-teal-700" />
                            AI Agent OCR Report · Confidence {item.aiOcrReport.aiConfidenceScore}% ·{' '}
                            {item.aiOcrReport.aiModelUsed} · {item.aiOcrReport.aadhaarVerificationHash}
                          </p>
                          <p>{item.aiOcrReport.aiSummary}</p>
                        </div>
                      )}

                      {/* Live Video Interview Status & Server-Side Staff Controls */}
                      <div className="mt-2 rounded-xl bg-teal-50/70 border border-teal-200 p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div>
                          <p className="font-bold text-teal-950 flex items-center gap-1.5">
                            <Video className="w-3.5 h-3.5 text-teal-700" />
                            In-App Live Video Interview:{' '}
                            <span className="uppercase font-mono text-teal-800">
                              {vid ? vid.status.replace(/_/g, ' ') : 'optional'}
                            </span>
                            {vid?.interviewScore ? ` (${vid.interviewScore}/100)` : ''}
                          </p>
                          <p className="text-[11px] text-slate-600">
                            {vid?.interviewerNotes ||
                              'Server-side staff discretion: Launch live video call, mark passed, or waive interview.'}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setActiveVideoKycItem(item)}
                            className="inline-flex items-center gap-1 rounded-lg bg-teal-800 hover:bg-teal-900 px-3 py-1.5 text-xs font-bold text-white"
                          >
                            <Video className="w-3.5 h-3.5" /> Launch Live Video Call
                          </button>
                          {vid?.status !== 'completed_passed' && (
                            <button
                              type="button"
                              onClick={() => void handleVideoInterviewAction(item.id, 'complete_passed')}
                              className="rounded-lg border border-emerald-400 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 text-[11px] font-bold text-emerald-900"
                            >
                              Pass Video
                            </button>
                          )}
                          {vid?.required && vid.status !== 'waived_by_staff' && (
                            <button
                              type="button"
                              onClick={() => void handleVideoInterviewAction(item.id, 'waive')}
                              className="rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 px-2.5 py-1.5 text-[11px] font-bold text-amber-900"
                            >
                              Waive (Staff Choice)
                            </button>
                          )}
                          {!vid?.required && (
                            <button
                              type="button"
                              onClick={() => void handleVideoInterviewAction(item.id, 'require_or_schedule')}
                              className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700"
                            >
                              Require Video
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleVerifySignedUrl(item)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
                      >
                        <FileCheck2 className="w-3.5 h-3.5 text-teal-700" /> View 60s Signed Docs
                      </button>

                      {item.status === 'pending' ? (
                        <>
                          <select
                            aria-label={`Assign Trust Badge for ${item.applicantName}`}
                            value={badgeSelection[item.id] || 'Police Verified - Green Shield'}
                            onChange={(e) =>
                              setBadgeSelection((p) => ({ ...p, [item.id]: e.target.value as TrustBadge }))
                            }
                            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                          >
                            <option value="Basic Verified">Basic Verified</option>
                            <option value="Police Verified - Green Shield">Police Verified - Green Shield</option>
                            <option value="Gold Pro">Gold Pro</option>
                            <option value="Company Certified">Company Certified</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => handleKycDecision(item.id, 'approved')}
                            title={
                              videoBlockingApproval
                                ? 'Pass or Waive Live Video Interview first'
                                : 'Verify & Approve KYC'
                            }
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white ${
                              videoBlockingApproval
                                ? 'bg-slate-500 hover:bg-slate-600'
                                : 'bg-teal-700 hover:bg-teal-800'
                            }`}
                          >
                            Verify &amp; Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => handleKycDecision(item.id, 'rejected')}
                            className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700"
                          >
                            Reject
                          </button>
                        </>
                      ) : (
                        <span className="text-xs font-semibold text-teal-800 uppercase">
                          {item.status} · {item.assignedBadge}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
              })}
            </div>
          </div>

          {/* 24x7 Shift Roster */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <h3 className="text-base font-semibold text-slate-900">24×7 Salaried Technician 3-Shift Roster</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-4">Shift Window</th>
                    <th className="py-2 pr-4">Technician / Unit</th>
                    <th className="py-2 pr-4">Zone</th>
                    <th className="py-2">Certification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="py-2.5 pr-4 font-mono">Morning (06:00–14:00)</td>
                    <td className="py-2.5 pr-4 font-medium text-slate-900">Rohlupuia Fanai</td>
                    <td className="py-2.5 pr-4">Zarkawt / Central</td>
                    <td className="py-2.5 text-teal-800">Company Certified · Plumbing &amp; Electrical</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-mono">Evening (14:00–22:00)</td>
                    <td className="py-2.5 pr-4 font-medium text-slate-900">Lalmalsawma Renthlei</td>
                    <td className="py-2.5 pr-4">Chanmari / Bawngkawn</td>
                    <td className="py-2.5 text-teal-800">Company Certified · Roadside &amp; Towing</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-mono">Night (22:00–06:00)</td>
                    <td className="py-2.5 pr-4 font-medium text-slate-900">Zonunmawia Squad</td>
                    <td className="py-2.5 pr-4">Kulikawn / Urgent Medical</td>
                    <td className="py-2.5 text-teal-800">Company Certified · Locksmith &amp; Night Cab</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* All 11 Mizoram District Capitals Hub Coverage */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <h3 className="text-base font-semibold text-slate-900">
              All 11 Mizoram District Capitals · Active Fleet &amp; 24×7 Hub Roster
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-4">District Capital</th>
                    <th className="py-2 pr-4">RTO</th>
                    <th className="py-2 pr-4">Vengs</th>
                    <th className="py-2 pr-4">Elevation</th>
                    <th className="py-2 pr-4">Online Partners</th>
                    <th className="py-2">Corridor &amp; Hub Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {MIZORAM_DISTRICTS.map((d) => {
                    const count = partners.filter((p) => (p.district || 'Aizawl') === d.district && p.online).length;
                    return (
                      <tr key={d.district}>
                        <td className="py-2 pr-4 font-semibold text-slate-900">{d.district}</td>
                        <td className="py-2 pr-4 font-mono text-slate-600">{d.rtoCode}</td>
                        <td className="py-2 pr-4 font-mono text-slate-700">{d.vengs.length} Vengs</td>
                        <td className="py-2 pr-4 font-mono text-slate-600">{d.elevationM}m</td>
                        <td className="py-2 pr-4 font-mono text-teal-800 font-semibold">{count} Online</td>
                        <td className="py-2 text-slate-600">{d.corridorNoteEn}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: MANAGED STAFFING, HR DIRECTORY, CONTRACTS & PAYROLL */}
      {tab === 'payroll' && (
        <AdminStaffingConsole
          lang={lang}
          adminToken={adminToken}
          onAuthExpired={onAuthExpired}
          districtFilter={districtFilter}
          workforce={workforce}
          staffingBookings={staffingBookings}
          leaveRequests={leaveRequests}
          attendanceLogs={attendanceLogs}
          payrollRecords={payrollRecords}
          onRefresh={onRefresh}
          onActionStatus={setActionStatus}
        />
      )}

      {/* TAB 5: MASTER SYSTEM CONTROL & ENTITY OVERRIDE */}
      {tab === 'master_control' && (
        <MasterSystemControlPanel
          adminToken={adminToken}
          onAuthExpired={onAuthExpired}
          onLiveUpdated={onRefresh}
        />
      )}

      {/* TAB 4: DISPUTES, FRAUD & 100% ESCROW GST LEDGER */}
      {tab === 'disputes' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900 inline-flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-600" /> Dispute &amp; Prank-Caller Safeguard Center
              </h2>
              <span className="text-xs font-mono text-slate-600">
                Blacklisted Accounts: {blacklisted.length > 0 ? blacklisted.join(', ') : 'None'}
              </span>
            </div>

            {disputes.map((d) => (
              <div key={d.id} className="rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-mono text-slate-500">
                      {d.id} · Order {d.orderRef} · Strikes: {d.prankStrikeCount} · Status: {d.status}
                    </p>
                    <p className="text-sm font-semibold text-slate-900 mt-0.5">
                      {d.customerName} vs. {d.partnerName} (Rs. {d.amountInvolved})
                    </p>
                    <p className="text-xs text-slate-600 mt-1">{d.reason}</p>
                    <p className="text-xs font-mono text-teal-800 mt-1">{d.gpsCheckSummary}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleResolveDispute(d.id, 'resolved_payout')}
                      className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Release to Partner
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResolveDispute(d.id, 'resolved_refund')}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-800"
                    >
                      Refund Customer
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResolveDispute(d.id, 'blacklisted', true)}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Auto-Blacklist Prank Caller
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 inline-flex items-center gap-2">
              <Receipt className="w-4 h-4 text-teal-700" /> 100% In-App Escrow &amp; All-Inclusive GST Split Ledger
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3">Escrow ID</th>
                    <th className="py-2 pr-3">Order</th>
                    <th className="py-2 pr-3 text-right">Customer Total</th>
                    <th className="py-2 pr-3 text-right">18% GST</th>
                    <th className="py-2 pr-3 text-right">Net Comm.</th>
                    <th className="py-2 pr-3 text-right">Insurance</th>
                    <th className="py-2 pr-3 text-right">Partner</th>
                    <th className="py-2 pr-3 text-right">Merchant</th>
                    <th className="py-2">Status &amp; Webhook</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {ledger.map((row) => (
                    <tr key={row.id}>
                      <td className="py-2.5 pr-3">{row.id}</td>
                      <td className="py-2.5 pr-3">{row.orderRef}</td>
                      <td className="py-2.5 pr-3 text-right font-bold">Rs. {row.grossAllInclusive}</td>
                      <td className="py-2.5 pr-3 text-right">Rs. {row.gstAmount}</td>
                      <td className="py-2.5 pr-3 text-right">Rs. {row.platformCommission}</td>
                      <td className="py-2.5 pr-3 text-right">Rs. {row.microInsuranceSachet}</td>
                      <td className="py-2.5 pr-3 text-right text-teal-800">Rs. {row.partnerPayout}</td>
                      <td className="py-2.5 pr-3 text-right">Rs. {row.merchantSettlement}</td>
                      <td className="py-2.5">
                        {row.escrowStatus === 'reconciled_webhook' ? (
                          <span className="text-teal-800">Reconciled</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleReconcileWebhook(row.id)}
                            className="font-sans rounded border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            {row.escrowStatus} · Reconcile
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <LiveVideoInterviewModal
        open={Boolean(activeVideoKycItem)}
        onClose={() => setActiveVideoKycItem(null)}
        lang={lang}
        kycItem={activeVideoKycItem}
        isServerStaff={true}
        adminToken={adminToken}
        onUpdated={async () => {
          await fetchAdminDetails();
          await onRefresh();
        }}
      />
    </div>
  );
};

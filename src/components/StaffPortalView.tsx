import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  ShieldCheck,
  UserPlus,
  Video,
  Wallet,
} from 'lucide-react';
import type {
  KycAiOcrExtraction,
  KycQueueItem,
  Language,
  MizoramDistrict,
  PayrollRecord,
  StaffAttendanceLog,
  StaffLeaveRequest,
  StaffingBooking,
  WorkforceMember,
} from '../shared/types';
import { LayerWindow } from './LayerWindow';
import { triggerHaptic } from '../lib/nativeBridge';
import { resolveAddressFromCoords } from '../lib/geolocation';
import {
  ALL_MIZORAM_DISTRICT_NAMES,
  findAnyMizoramVeng,
  getVengsForDistrict,
} from '../data/mizoramDistricts';
import { CameraCaptureModal, type CameraCaptureResult } from './CameraCaptureModal';
import { LiveVideoInterviewModal } from './LiveVideoInterviewModal';

type StaffPortalTab = 'assignment' | 'attendance' | 'payslips';

interface StaffPortalViewProps {
  lang: Language;
  selectedDistrict: MizoramDistrict;
  workforce: WorkforceMember[];
  staffingBookings: StaffingBooking[];
  leaveRequests: StaffLeaveRequest[];
  attendanceLogs: StaffAttendanceLog[];
  payrollRecords: PayrollRecord[];
  onRefresh: () => Promise<void>;
  onOpenApply: () => void;
}

export const StaffPortalView: React.FC<StaffPortalViewProps> = ({
  lang,
  selectedDistrict,
  workforce,
  staffingBookings,
  leaveRequests,
  attendanceLogs,
  payrollRecords,
  onRefresh,
  onOpenApply,
}) => {
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>(workforce[0]?.id || 'wrk-1');
  const [tab, setTab] = useState<StaffPortalTab>('assignment');
  const [leaveFrom, setLeaveFrom] = useState('2026-11-28');
  const [leaveTo, setLeaveTo] = useState('2026-11-29');
  const [leaveReason, setLeaveReason] = useState('');
  const [needsReplacement, setNeedsReplacement] = useState(true);
  const [selectedPayslip, setSelectedPayslip] = useState<PayrollRecord | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingStaffProfile, setEditingStaffProfile] = useState(false);
  const [staffDraftName, setStaffDraftName] = useState('');
  const [staffDraftPhone, setStaffDraftPhone] = useState('');
  const [staffDraftDistrict, setStaffDraftDistrict] = useState<MizoramDistrict>(selectedDistrict);
  const [staffDraftVeng, setStaffDraftVeng] = useState('Dawrpui');
  const [staffDraftSkills, setStaffDraftSkills] = useState('');
  const [staffDraftStatus, setStaffDraftStatus] = useState<'active' | 'on_leave'>('active');
  const [staffKycCameraOpen, setStaffKycCameraOpen] = useState(false);
  const [staffAiOcr, setStaffAiOcr] = useState<KycAiOcrExtraction | null>(null);
  const [staffKycDocPath, setStaffKycDocPath] = useState<string>('');
  const [queuedStaffKycItem, setQueuedStaffKycItem] = useState<KycQueueItem | null>(null);
  const [staffVideoModalOpen, setStaffVideoModalOpen] = useState(false);

  const activeWorker = useMemo(
    () => workforce.find((w) => w.id === selectedWorkerId) || workforce[0],
    [workforce, selectedWorkerId]
  );

  React.useEffect(() => {
    if (!activeWorker) return;
    setStaffDraftName(activeWorker.name);
    setStaffDraftPhone(activeWorker.phone || '+91-9862001122');
    setStaffDraftDistrict(activeWorker.district || selectedDistrict);
    setStaffDraftVeng(activeWorker.veng);
    setStaffDraftSkills(activeWorker.skills.join(', '));
    setStaffDraftStatus(
      activeWorker.availabilityStatus === 'on_leave' ? 'on_leave' : 'active'
    );
    setStaffAiOcr(null);
    setStaffKycDocPath('');
    void fetch(`/api/auth-kyc/my-status?targetEntityId=${encodeURIComponent(activeWorker.id)}`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.items) && d.items.length > 0) {
          setQueuedStaffKycItem(d.items[0]);
        }
      })
      .catch(() => {});
  }, [activeWorker, selectedDistrict]);

  const handleStaffKycCameraCaptured = async (result: CameraCaptureResult) => {
    if (!activeWorker) return;
    setStaffKycDocPath(result.objectPath);
    try {
      const res = await fetch('/api/auth-kyc/ai-ocr-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docType: 'combined_kyc_sheet',
          imageDataUrl: result.previewDataUrl,
          objectPath: result.objectPath,
          applicantHintName: staffDraftName || activeWorker.name,
          roleCategory: 'staff',
          district: staffDraftDistrict,
          captureSource: result.captureSource,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.extraction) {
        setStaffAiOcr(data.extraction as KycAiOcrExtraction);
        triggerHaptic('success');
      } else {
        setFeedback({ type: 'err', msg: data.error || 'AI KYC OCR scan failed.' });
      }
    } catch {
      setFeedback({ type: 'err', msg: 'Network error running AI OCR Agent.' });
    }
  };

  const handleSaveStaffProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorker) return;
    if (!staffAiOcr) {
      triggerHaptic('error');
      setFeedback({
        type: 'err',
        msg:
          lang === 'miz'
            ? 'Awmpui/Driver KYC & Profile update tur chuan Phone Camera hmangin ID/Document thla la phawt rawh (AI Agent OCR).'
            : 'Capture your KYC ID/Document with Phone Camera first so the AI Agent can scan and stage it for Server Staff verification.',
      });
      return;
    }
    setBusy(true);
    setFeedback(null);
    triggerHaptic('medium');
    try {
      const res = await fetch(`/api/auth-kyc/staff-profile/${activeWorker.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: staffDraftName,
          phone: staffDraftPhone,
          district: staffDraftDistrict,
          veng: staffDraftVeng,
          skills: staffDraftSkills
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          availabilityStatus: staffDraftStatus,
          kycDocumentPath: staffKycDocPath,
          cameraCaptureVerified: true,
          aiOcrReport: staffAiOcr,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback({ type: 'err', msg: data.error || 'Could not update staff profile.' });
        return;
      }
      triggerHaptic('success');
      setEditingStaffProfile(false);
      if (data.kycItem) setQueuedStaffKycItem(data.kycItem);
      setFeedback({
        type: 'ok',
        msg:
          data.message ||
          `AI Agent-in i KYC document (${staffAiOcr.aadhaarMasked}) a scan fel a, Server Staff verify leh Live Video Interview turin queue-ah dah luh a ni!`,
      });
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const myBookings = useMemo(
    () =>
      activeWorker
        ? staffingBookings.filter(
            (b) => b.workerId === activeWorker.id || b.replacementWorkerId === activeWorker.id
          )
        : [],
    [staffingBookings, activeWorker]
  );

  const myAttendance = useMemo(
    () => (activeWorker ? attendanceLogs.filter((a) => a.workerId === activeWorker.id) : []),
    [attendanceLogs, activeWorker]
  );

  const myLeaves = useMemo(
    () => (activeWorker ? leaveRequests.filter((l) => l.workerId === activeWorker.id) : []),
    [leaveRequests, activeWorker]
  );

  const myPayslips = useMemo(
    () =>
      activeWorker
        ? payrollRecords.filter(
            (p) => p.staffName.toLowerCase() === activeWorker.name.toLowerCase()
          )
        : [],
    [payrollRecords, activeWorker]
  );

  const handleCheckIn = async (status: 'present' | 'half_day') => {
    if (!activeWorker) return;
    setBusy(true);
    setFeedback(null);
    triggerHaptic('medium');
    try {
      const detectCoords = (): Promise<{ lat: number; lng: number; accuracyMeters?: number }> =>
        new Promise((resolve) => {
          const fallbackPt = findAnyMizoramVeng(activeWorker.veng);
          if (typeof navigator === 'undefined' || !navigator.geolocation) {
            resolve({ lat: fallbackPt.lat, lng: fallbackPt.lng });
            return;
          }
          navigator.geolocation.getCurrentPosition(
            (pos) =>
              resolve({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracyMeters: Math.round(pos.coords.accuracy),
              }),
            () => resolve({ lat: fallbackPt.lat, lng: fallbackPt.lng }),
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 4000 }
          );
        });

      const coords = await detectCoords();
      const resolvedAddr = await resolveAddressFromCoords(
        coords.lat,
        coords.lng,
        activeWorker.district || selectedDistrict,
        coords.accuracyMeters
      );

      const res = await fetch('/api/staffing/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workerId: activeWorker.id,
          status,
          veng: resolvedAddr.veng || activeWorker.veng,
          lat: coords.lat,
          lng: coords.lng,
          accuracyMeters: coords.accuracyMeters,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback({ type: 'err', msg: data.error || 'Could not record attendance.' });
        return;
      }
      triggerHaptic('success');
      setFeedback({
        type: 'ok',
        msg:
          lang === 'miz'
            ? `Vawiin attendance (${status}) ${data.entry.checkInTime}-ah GPS (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)} · ${data.entry.veng}) nen chhinchhiah a ni.`
            : `Attendance logged as ${status.replace('_', ' ')} at ${data.entry.checkInTime} with GPS lock (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)} · ${data.entry.veng}).`,
      });
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorker) return;
    setFeedback(null);
    if (leaveReason.trim().length < 5) {
      setFeedback({
        type: 'err',
        msg:
          lang === 'miz'
            ? 'Chawlh dil chhan tawi te tal (character 5+) ziak rawh.'
            : 'Please enter a short reason for your leave request (min 5 chars).',
      });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/staffing/leave-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workerId: activeWorker.id,
          bookingId: myBookings[0]?.id,
          fromDate: leaveFrom,
          toDate: leaveTo,
          reason: leaveReason.trim(),
          needsInstantReplacement: needsReplacement,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback({ type: 'err', msg: data.error || 'Could not submit leave request.' });
        return;
      }
      triggerHaptic('success');
      setLeaveReason('');
      setFeedback({
        type: 'ok',
        msg:
          lang === 'miz'
            ? 'Chawlh dilna Admin HR-ah thawn fel a ni. Aiawh tur an lo ruahman ang.'
            : 'Leave request sent to HR Operations. Backup replacement will be coordinated.',
      });
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const handleWorkerSos = async (bookingId: string) => {
    setBusy(true);
    triggerHaptic('sos');
    try {
      const res = await fetch(`/api/staffing/bookings/${bookingId}/worker-sos`, {
        method: 'POST',
      });
      if (res.ok) {
        setFeedback({
          type: 'ok',
          msg:
            lang === 'miz'
              ? 'Worker Safety SOS thawn nghal a ni! HR Welfare Officer in an rawn be nghal ang che.'
              : 'Worker Safety SOS triggered! HR Welfare Officer has been alerted immediately.',
        });
        await onRefresh();
      }
    } finally {
      setBusy(false);
    }
  };

  if (!activeWorker) {
    return (
      <div className="rounded-3xl bg-white p-6 text-center space-y-3">
        <p className="text-sm font-semibold text-slate-900">
          {lang === 'miz' ? 'Staff profile hmuh tur a awm rih lo.' : 'No verified staff profiles yet.'}
        </p>
        <button
          type="button"
          onClick={onOpenApply}
          className="min-h-[44px] rounded-xl bg-emerald-800 px-5 text-xs font-semibold text-white"
        >
          {lang === 'miz' ? 'Awmpui / Driver Dilna Thehlut Rawh' : 'Apply as Awmpui / Driver'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24 md:pb-8">
      {/* Staff Profile Hero Header */}
      <section className="rounded-3xl bg-emerald-950 text-white p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <img
              src={activeWorker.avatarUrl}
              alt={activeWorker.name}
              referrerPolicy="no-referrer"
              className="w-14 h-14 rounded-2xl object-cover bg-white/10 shrink-0"
            />
            <div className="min-w-0">
              <p className="text-xs text-emerald-300 font-semibold">
                {lang === 'miz' ? 'Awmpui & Family Driver Portal' : 'Awmpui & Family Driver Staff Portal'}
              </p>
              <h1 className="text-lg sm:text-xl font-bold truncate">{activeWorker.name}</h1>
              <p className="text-xs text-emerald-100/90 truncate">
                {lang === 'miz' ? activeWorker.roleTitleMiz : activeWorker.roleTitle} ·{' '}
                {activeWorker.district || selectedDistrict} ({activeWorker.veng})
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="staff-portal-switcher" className="sr-only">
              Select verified staff profile
            </label>
            <select
              id="staff-portal-switcher"
              value={activeWorker.id}
              onChange={(e) => {
                setSelectedWorkerId(e.target.value);
                setFeedback(null);
              }}
              className="min-h-[42px] rounded-xl bg-white/10 border border-white/20 px-3 text-xs font-semibold text-white focus:outline-none"
            >
              {workforce.map((w) => (
                <option key={w.id} value={w.id} className="text-slate-900">
                  {w.name} ({w.mode === 'company_managed_staffing' ? 'Managed' : 'Daily'})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setEditingStaffProfile((prev) => !prev)}
              className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl bg-white/15 hover:bg-white/25 px-3.5 text-xs font-semibold text-white whitespace-nowrap"
            >
              {editingStaffProfile
                ? lang === 'miz'
                  ? 'Khâr'
                  : 'Close KYC Update'
                : lang === 'miz'
                  ? 'Camera KYC Update'
                  : 'Camera KYC Update'}
            </button>
            {queuedStaffKycItem && (
              <button
                type="button"
                onClick={() => setStaffVideoModalOpen(true)}
                className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 px-3.5 text-xs font-extrabold text-slate-950 whitespace-nowrap"
              >
                <Video className="w-4 h-4" />
                {lang === 'miz' ? 'HR Video Interview Lut Rawh' : 'Join HR Video Call'}
              </button>
            )}
            <button
              type="button"
              onClick={onOpenApply}
              className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3.5 text-xs font-semibold text-white whitespace-nowrap"
            >
              <UserPlus className="w-4 h-4" />
              {lang === 'miz' ? 'Thar Inziah Luh' : 'New Registration'}
            </button>
          </div>
        </div>

        {editingStaffProfile && (
          <form
            onSubmit={handleSaveStaffProfile}
            className="rounded-2xl bg-white/10 border border-white/20 p-4 space-y-3 text-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-bold text-emerald-200 flex items-center gap-1.5">
                  <Bot className="w-4 h-4 text-emerald-300" />
                  {lang === 'miz'
                    ? 'Awmpui / Driver KYC & Profile Update (Phone Camera AI OCR + Server Staff Verification)'
                    : 'Awmpui / Driver KYC & Profile Update (Phone Camera AI OCR + Server Staff Verification)'}
                </p>
                <p className="text-[11px] text-emerald-100/80 mt-0.5">
                  {lang === 'miz'
                    ? 'Document pawimawh mahnia update tlang theih a ni lo. Phone Camera-in thla la la, AI Agent-in a scan hnuah Server Staff ten an verify ang.'
                    : 'Direct unverified edits are blocked. Capture your ID/Document via Phone Camera so the AI Agent stages it for Server Staff approval.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStaffKycCameraOpen(true)}
                className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 px-3.5 py-1.5 text-xs font-extrabold text-emerald-950"
              >
                <Camera className="w-3.5 h-3.5" />
                {staffAiOcr ? 'Retake Camera KYC' : '1. Scan KYC with Phone Camera'}
              </button>
            </div>

            {staffAiOcr && (
              <div className="rounded-xl bg-emerald-900/80 border border-emerald-400/40 p-2.5 text-xs text-emerald-50 space-y-0.5">
                <p className="font-bold text-emerald-200">
                  AI OCR Verified ({staffAiOcr.aiConfidenceScore}%): Aadhaar {staffAiOcr.aadhaarMasked} · Voter {staffAiOcr.voterIdNumber || 'N/A'} · PVC {staffAiOcr.pvcNumber || 'N/A'}
                </p>
                <p className="text-[11px] text-emerald-100/90">{staffAiOcr.aiSummary}</p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <input
                type="text"
                required
                value={staffDraftName}
                onChange={(e) => setStaffDraftName(e.target.value)}
                placeholder="Full Name"
                className="min-h-[38px] rounded-xl bg-white text-slate-900 px-3 font-semibold"
              />
              <input
                type="text"
                required
                value={staffDraftPhone}
                onChange={(e) => setStaffDraftPhone(e.target.value)}
                placeholder="Phone Number"
                className="min-h-[38px] rounded-xl bg-white text-slate-900 px-3 font-semibold"
              />
              <select
                value={staffDraftStatus}
                onChange={(e) => setStaffDraftStatus(e.target.value as 'active' | 'on_leave')}
                className="min-h-[38px] rounded-xl bg-white text-slate-900 px-3 font-semibold"
              >
                <option value="active">Active · Ready for Assignment</option>
                <option value="on_leave">On Leave</option>
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <select
                value={staffDraftDistrict}
                onChange={(e) => {
                  const d = e.target.value as MizoramDistrict;
                  setStaffDraftDistrict(d);
                  setStaffDraftVeng(getVengsForDistrict(d)[0]?.name || d);
                }}
                className="min-h-[38px] rounded-xl bg-white text-slate-900 px-3 font-semibold"
              >
                {ALL_MIZORAM_DISTRICT_NAMES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <select
                value={staffDraftVeng}
                onChange={(e) => setStaffDraftVeng(e.target.value)}
                className="min-h-[38px] rounded-xl bg-white text-slate-900 px-3 font-semibold"
              >
                {getVengsForDistrict(staffDraftDistrict).map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={staffDraftSkills}
                onChange={(e) => setStaffDraftSkills(e.target.value)}
                placeholder="Skills (comma-separated)"
                className="min-h-[38px] rounded-xl bg-white text-slate-900 px-3 font-semibold"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={busy}
                className="min-h-[36px] rounded-xl bg-emerald-400 hover:bg-emerald-300 px-4 font-extrabold text-emerald-950"
              >
                {lang === 'miz' ? 'Staff Profile Save Rawh' : 'Save Staff Profile'}
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-white/15 text-xs">
          <div>
            <p className="text-emerald-200/80">Status</p>
            <p className="font-bold text-sm mt-0.5 capitalize">
              {(activeWorker.availabilityStatus || 'active').replace('_', ' ')}
            </p>
          </div>
          <div>
            <p className="text-emerald-200/80">Skill Score</p>
            <p className="font-mono tabular-nums font-bold text-sm mt-0.5">
              {activeWorker.practicalSkillScore}/100
            </p>
          </div>
          <div>
            <p className="text-emerald-200/80">Direct Bank</p>
            <p className="font-mono font-bold text-sm mt-0.5 truncate">
              {activeWorker.bankAccountMasked || 'SBI Verified'}
            </p>
          </div>
        </div>
      </section>

      {/* Segmented Portal Tabs */}
      <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-white p-1.5 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
        {(
          [
            ['assignment', lang === 'miz' ? 'Ka Hna & SOS' : 'Assignment & SOS'],
            ['attendance', lang === 'miz' ? 'Attendance & Chawlh' : 'Attendance & Leave'],
            ['payslips', lang === 'miz' ? 'Hlawh & Payslip' : 'Salary & Payslips'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setTab(key);
            }}
            className={`min-h-[42px] rounded-xl px-2 text-xs font-bold transition-colors ${
              tab === key ? 'bg-emerald-900 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {feedback && (
        <div
          role="status"
          className={`rounded-2xl px-4 py-3 text-xs font-semibold ${
            feedback.type === 'ok'
              ? 'bg-emerald-900 text-white'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {feedback.msg}
        </div>
      )}

      {/* TAB 1: ACTIVE HOUSEHOLD ASSIGNMENT & WORKER SAFETY SOS */}
      {tab === 'assignment' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 rounded-3xl bg-white p-5 border border-slate-200/80 space-y-4">
            <h2 className="text-base font-bold text-slate-900 inline-flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              {lang === 'miz' ? 'Contract Kal Lai & Venhimna' : 'Active Household Assignments'}
            </h2>

            {myBookings.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">
                {lang === 'miz'
                  ? 'Tunah chuan contract kal lai i nei rih lo. HR team in chhungkaw thar an lo en mek.'
                  : 'No active household placement right now. HR Operations will notify you on match.'}
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {myBookings.map((b) => (
                  <div key={b.id} className="py-4 first:pt-0 last:pb-0 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-mono text-slate-500">
                          {b.contractId} · {b.status.toUpperCase()}
                        </p>
                        <h3 className="text-sm font-bold text-slate-900 mt-0.5">{b.customerName}</h3>
                        <p className="text-xs text-slate-600 mt-0.5">
                          {b.tripartiteAgreement
                            ? 'Tripartite Company Agreement · Fixed Payout by 7th'
                            : 'On-Demand Daily Assignment'}
                        </p>
                      </div>
                      <p className="text-base font-extrabold font-mono tabular-nums text-emerald-900">
                        ₹{b.allInclusiveAmount.toLocaleString()}
                      </p>
                    </div>

                    {b.isOutstationOrLiveIn && (
                      <p className="text-xs text-slate-700 bg-slate-50 rounded-xl px-3 py-2">
                        Welfare Safeguards Verified: Room ({b.accommodationProvided ? 'Yes' : 'No'}) · Food (
                        {b.foodProvided ? 'Yes' : 'No'}) · Travel ({b.travelCovered ? 'Yes' : 'No'})
                      </p>
                    )}

                    {b.replacementWorkerName && (
                      <p className="text-xs font-semibold text-emerald-800">
                        Backup Replacement Coordinated: {b.replacementWorkerName}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={busy || b.workerSosActive}
                        onClick={() => void handleWorkerSos(b.id)}
                        className={`min-h-[44px] inline-flex items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-white transition-colors ${
                          b.workerSosActive
                            ? 'bg-red-800 opacity-80'
                            : 'bg-red-600 hover:bg-red-700'
                        }`}
                      >
                        <AlertTriangle className="w-4 h-4" />
                        {b.workerSosActive
                          ? lang === 'miz'
                            ? 'Worker SOS a kal mek — HR hriattir tawh'
                            : 'Worker SOS Active — HR Alerted'
                          : lang === 'miz'
                            ? 'Hnathawktu Himna SOS Hmet Rawh'
                            : 'Trigger Worker Safety SOS'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-5 rounded-3xl bg-white p-5 border border-slate-200/80 space-y-4">
            <h2 className="text-base font-bold text-slate-900 inline-flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-emerald-700" />
              {lang === 'miz' ? 'Vawiin Attendance Check-In' : 'Quick Daily Check-In'}
            </h2>
            <p className="text-xs text-slate-600">
              {lang === 'miz'
                ? 'Hna i thlen rualin i attendance chhinchhiah la, thla tawp hlawh peknaah a felfai bik ang.'
                : 'Log your daily presence so HR payroll and household records stay verified.'}
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleCheckIn('present')}
                className="min-h-[46px] rounded-2xl bg-emerald-800 text-white text-xs font-bold hover:bg-emerald-700"
              >
                {lang === 'miz' ? 'Ka Thleng (Present)' : 'Mark Present'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleCheckIn('half_day')}
                className="min-h-[46px] rounded-2xl border border-slate-300 text-slate-800 text-xs font-bold hover:bg-slate-50"
              >
                {lang === 'miz' ? 'Chawhma / Half Day' : 'Log Half Day'}
              </button>
            </div>
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <p className="text-xs font-semibold text-slate-700">Recent Check-Ins</p>
              {myAttendance.slice(0, 4).map((a) => (
                <div key={a.id} className="flex items-center justify-between text-xs gap-2">
                  <span className="text-slate-600 truncate">
                    {a.date} · {a.veng}
                    {a.gpsVerified && typeof a.lat === 'number' && typeof a.lng === 'number'
                      ? ` · GPS (${a.lat.toFixed(4)}, ${a.lng.toFixed(4)})`
                      : ''}
                  </span>
                  <span className="font-mono font-semibold text-emerald-800 shrink-0">
                    {a.checkInTime} ({a.status.replace('_', ' ')})
                  </span>
                </div>
              ))}
              {myAttendance.length === 0 && (
                <p className="text-xs text-slate-400">No check-ins logged yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ATTENDANCE & LEAVE REQUESTS */}
      {tab === 'attendance' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <form
            onSubmit={handleSubmitLeave}
            className="lg:col-span-6 rounded-3xl bg-white p-5 border border-slate-200/80 space-y-4"
          >
            <h2 className="text-base font-bold text-slate-900 inline-flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-amber-600" />
              {lang === 'miz' ? 'Chawlh Dil & Aiawh Ruahman' : 'Request Leave & Instant Backup'}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="leave-from" className="block text-xs font-semibold text-slate-700 mb-1">
                  {lang === 'miz' ? 'Tan Ni' : 'From Date'}
                </label>
                <input
                  id="leave-from"
                  type="date"
                  required
                  value={leaveFrom}
                  onChange={(e) => setLeaveFrom(e.target.value)}
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 text-sm font-mono"
                />
              </div>
              <div>
                <label htmlFor="leave-to" className="block text-xs font-semibold text-slate-700 mb-1">
                  {lang === 'miz' ? 'Tawp Ni' : 'To Date'}
                </label>
                <input
                  id="leave-to"
                  type="date"
                  required
                  value={leaveTo}
                  onChange={(e) => setLeaveTo(e.target.value)}
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 text-sm font-mono"
                />
              </div>
            </div>

            <div>
              <label htmlFor="leave-reason" className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'miz' ? 'Chawlh Chhan' : 'Reason'}
              </label>
              <textarea
                id="leave-reason"
                rows={3}
                value={leaveReason}
                onChange={(e) => setLeaveReason(e.target.value)}
                placeholder={
                  lang === 'miz'
                    ? 'Entirnan: Khuaah chhungkaw thil pawimawh vangin ni 2 chawlh ka dil e.'
                    : 'e.g. Family visit / medical appointment — requesting 2 days leave.'
                }
                className="w-full rounded-xl border border-slate-300 p-3 text-sm"
              />
            </div>

            <label className="flex items-center gap-2.5 text-xs font-medium text-slate-700 cursor-pointer min-h-[40px]">
              <input
                type="checkbox"
                checked={needsReplacement}
                onChange={(e) => setNeedsReplacement(e.target.checked)}
              />
              {lang === 'miz'
                ? 'Chhungkua tan Company Instant Replacement aiawh rawn tirh dil tel rawh'
                : 'Coordinate a Company Instant Replacement worker for the household'}
            </label>

            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-[46px] rounded-2xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-50"
            >
              {lang === 'miz' ? 'Chawlh Dilna Thawn Rawh' : 'Submit Leave Request to HR'}
            </button>
          </form>

          <div className="lg:col-span-6 rounded-3xl bg-white p-5 border border-slate-200/80 space-y-3">
            <h2 className="text-base font-bold text-slate-900">
              {lang === 'miz' ? 'Ka Chawlh Dilna History' : 'Your Leave History'} ({myLeaves.length})
            </h2>
            <div className="divide-y divide-slate-100">
              {myLeaves.map((l) => (
                <div key={l.id} className="py-3 flex items-start justify-between gap-3 text-xs">
                  <div>
                    <p className="font-mono font-semibold text-slate-900">
                      {l.fromDate} → {l.toDate}
                    </p>
                    <p className="text-slate-600 mt-0.5">{l.reason}</p>
                  </div>
                  <span
                    className={`font-bold uppercase shrink-0 ${
                      l.status === 'approved'
                        ? 'text-emerald-700'
                        : l.status === 'rejected'
                          ? 'text-red-700'
                          : 'text-amber-700'
                    }`}
                  >
                    {l.status}
                  </span>
                </div>
              ))}
              {myLeaves.length === 0 && (
                <p className="py-6 text-center text-xs text-slate-500">No leave requests yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: DIRECT-TO-BANK SALARY & DIGITAL PAYSLIPS */}
      {tab === 'payslips' && (
        <div className="rounded-3xl bg-white p-5 border border-slate-200/80 space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 inline-flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-700" />
              {lang === 'miz' ? 'Direct-to-Bank Hlawh & Payslips' : 'Direct-to-Bank Salary & Digital Payslips'}
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              {lang === 'miz'
                ? 'Thla tin ni 7 hmain i bank account-ah dik takin a lut thin.'
                : 'Direct bank transfer by the 7th of every month with transparent payslip breakdown.'}
            </p>
          </div>

          {myPayslips.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">
              No monthly payslips issued yet for this worker.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {myPayslips.map((slip) => (
                <div
                  key={slip.id}
                  className="py-3.5 flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-xs font-mono text-slate-500">
                      {slip.payslipId} · {slip.bankAccountMasked}
                    </p>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">{slip.clientName}</p>
                    <p className="text-xs text-slate-600">
                      {slip.status === 'salary_disbursed' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Credited to Bank
                        </span>
                      ) : (
                        <span className="text-amber-700 font-semibold">Client Billed · Payout By 7th</span>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-base font-extrabold font-mono tabular-nums text-slate-900">
                        ₹{slip.netSalaryDisbursed.toLocaleString()}
                      </p>
                      <p className="text-[11px] text-slate-500">Net Take-Home</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedPayslip(slip)}
                      className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      <FileText className="w-3.5 h-3.5" /> View Slip
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Digital Payslip Detail LayerWindow */}
      <LayerWindow
        open={Boolean(selectedPayslip)}
        onClose={() => setSelectedPayslip(null)}
        title={selectedPayslip ? `Digital Payslip · ${selectedPayslip.payslipId}` : 'Payslip'}
        subtitle="ZoRûn Mizoram Managed Staffing Payroll"
        size="sm"
      >
        {selectedPayslip && (
          <div className="space-y-4 text-xs">
            <div className="rounded-2xl bg-slate-50 p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Staff Member</span>
                <span className="font-bold text-slate-900">{selectedPayslip.staffName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Client Household</span>
                <span className="font-semibold text-slate-900">{selectedPayslip.clientName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Bank Account</span>
                <span className="font-mono font-semibold text-slate-900">{selectedPayslip.bankAccountMasked}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payout Window</span>
                <span className="font-mono text-slate-800">{selectedPayslip.payoutWindow}</span>
              </div>
            </div>

            <div className="border-t border-b border-slate-200 py-3 space-y-2 font-mono tabular-nums">
              <div className="flex justify-between">
                <span className="font-sans text-slate-600">Client Monthly Package</span>
                <span>₹{selectedPayslip.monthlyPackage.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-sans text-slate-600">Platform Management &amp; Welfare Fee</span>
                <span className="text-slate-500">- ₹{selectedPayslip.platformMgmtFee.toLocaleString()}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-100 text-sm font-extrabold text-emerald-900">
                <span className="font-sans">Net Direct-to-Bank Salary</span>
                <span>₹{selectedPayslip.netSalaryDisbursed.toLocaleString()}</span>
              </div>
            </div>

            <p className="text-slate-500 text-center">
              Status: <strong className="text-emerald-800 uppercase">{selectedPayslip.status.replace('_', ' ')}</strong>
            </p>
          </div>
        )}
      </LayerWindow>

      <CameraCaptureModal
        open={staffKycCameraOpen}
        onClose={() => setStaffKycCameraOpen(false)}
        lang={lang}
        category="kyc_doc"
        cameraOnly={true}
        district={staffDraftDistrict}
        titleEn="Phone Camera Staff KYC Scan (AI OCR Agent)"
        titleMiz="Phone Camera-in Staff KYC Thla La Rawh (AI OCR)"
        subtitleEn="Gallery upload is disabled. AI Agent scans 12-digit Aadhaar, Voter ID & PVC for Server Staff verification."
        subtitleMiz="Gallery upload phal a ni lo. AI Agent-in Aadhaar digit 12, Voter ID leh PVC a chhiar nghal ang."
        onCaptured={(result) => void handleStaffKycCameraCaptured(result)}
      />

      <LiveVideoInterviewModal
        open={staffVideoModalOpen}
        onClose={() => setStaffVideoModalOpen(false)}
        lang={lang}
        kycItem={queuedStaffKycItem}
        isServerStaff={false}
      />
    </div>
  );
};

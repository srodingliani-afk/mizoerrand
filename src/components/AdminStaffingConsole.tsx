import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileSpreadsheet,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import type {
  Language,
  MizoramDistrict,
  PayrollRecord,
  StaffAttendanceLog,
  StaffLeaveRequest,
  StaffingBooking,
  WorkforceAvailability,
  WorkforceMember,
} from '../shared/types';
import { ALL_MIZORAM_DISTRICT_NAMES, getDistrictInfo } from '../data/mizoramDistricts';
import { LayerWindow } from './LayerWindow';
import { triggerHaptic } from '../lib/nativeBridge';

type SubTab = 'directory' | 'contracts' | 'leave' | 'payroll';

interface AdminStaffingConsoleProps {
  lang: Language;
  adminToken: string;
  onAuthExpired: () => void;
  districtFilter: MizoramDistrict | 'All';
  workforce: WorkforceMember[];
  staffingBookings: StaffingBooking[];
  leaveRequests: StaffLeaveRequest[];
  attendanceLogs: StaffAttendanceLog[];
  payrollRecords: PayrollRecord[];
  onRefresh: () => Promise<void>;
  onActionStatus: (msg: string) => void;
}

interface WorkerFormState {
  id?: string;
  name: string;
  phone: string;
  mode: 'company_managed_staffing' | 'on_demand_workforce';
  roleTitle: string;
  roleTitleMiz: string;
  district: MizoramDistrict;
  veng: string;
  monthlyPackageRate: string;
  dailyRate: string;
  hourlyRate: string;
  skillsText: string;
  practicalSkillScore: string;
  bankAccountMasked: string;
  outstationAvailable: boolean;
  liveInAvailable: boolean;
  availabilityStatus: WorkforceAvailability;
}

const EMPTY_WORKER_FORM: WorkerFormState = {
  name: '',
  phone: '',
  mode: 'company_managed_staffing',
  roleTitle: 'Company-Managed Awmpui & Home Caregiver',
  roleTitleMiz: 'Awmpui & In Enkawltu (Company Trained)',
  district: 'Aizawl',
  veng: 'Khatla',
  monthlyPackageRate: '14500',
  dailyRate: '1100',
  hourlyRate: '220',
  skillsText: 'Housekeeping, Mizo Cooking, Elderly Care, First Aid',
  practicalSkillScore: '92',
  bankAccountMasked: 'SBI •••• 5521',
  outstationAvailable: true,
  liveInAvailable: true,
  availabilityStatus: 'active',
};

export const AdminStaffingConsole: React.FC<AdminStaffingConsoleProps> = ({
  lang,
  adminToken,
  onAuthExpired,
  districtFilter,
  workforce,
  staffingBookings,
  leaveRequests,
  attendanceLogs,
  payrollRecords,
  onRefresh,
  onActionStatus,
}) => {
  const [subTab, setSubTab] = useState<SubTab>('directory');
  const [searchQuery, setSearchQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<'all' | 'company_managed_staffing' | 'on_demand_workforce'>('all');
  const [workerModalOpen, setWorkerModalOpen] = useState(false);
  const [workerForm, setWorkerForm] = useState<WorkerFormState>(EMPTY_WORKER_FORM);
  const [savingWorker, setSavingWorker] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [replacementPicker, setReplacementPicker] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const authHeaders = (withJson = false): Record<string, string> =>
    withJson
      ? { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }
      : { Authorization: `Bearer ${adminToken}` };

  const visibleWorkforce = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return workforce.filter((w) => {
      if (districtFilter !== 'All' && (w.district || 'Aizawl') !== districtFilter) return false;
      if (modeFilter !== 'all' && w.mode !== modeFilter) return false;
      if (!q) return true;
      return (
        w.name.toLowerCase().includes(q) ||
        w.roleTitle.toLowerCase().includes(q) ||
        w.veng.toLowerCase().includes(q) ||
        w.skills.some((s) => s.toLowerCase().includes(q))
      );
    });
  }, [workforce, districtFilter, modeFilter, searchQuery]);

  const activeSosBookings = staffingBookings.filter((b) => b.workerSosActive);
  const pendingLeaves = leaveRequests.filter((l) => l.status === 'pending');

  const openAddWorker = () => {
    triggerHaptic('light');
    setFormError(null);
    const initialDistrict = districtFilter === 'All' ? 'Aizawl' : districtFilter;
    setWorkerForm({
      ...EMPTY_WORKER_FORM,
      district: initialDistrict,
      veng: getDistrictInfo(initialDistrict).vengs[0]?.name || 'Khatla',
    });
    setWorkerModalOpen(true);
  };

  const openEditWorker = (w: WorkforceMember) => {
    triggerHaptic('light');
    setFormError(null);
    setWorkerForm({
      id: w.id,
      name: w.name,
      phone: w.phone || '',
      mode: w.mode,
      roleTitle: w.roleTitle,
      roleTitleMiz: w.roleTitleMiz,
      district: w.district || 'Aizawl',
      veng: w.veng,
      monthlyPackageRate: String(w.monthlyPackageRate || 14500),
      dailyRate: String(w.dailyRate || 1100),
      hourlyRate: String(w.hourlyRate || 220),
      skillsText: w.skills.join(', '),
      practicalSkillScore: String(w.practicalSkillScore),
      bankAccountMasked: w.bankAccountMasked || 'SBI •••• 0000',
      outstationAvailable: w.outstationAvailable,
      liveInAvailable: w.liveInAvailable,
      availabilityStatus: w.availabilityStatus || 'active',
    });
    setWorkerModalOpen(true);
  };

  const handleSaveWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (workerForm.name.trim().length < 3 || workerForm.roleTitle.trim().length < 3) {
      setFormError('Worker full name and role title must be at least 3 characters.');
      return;
    }

    setSavingWorker(true);
    try {
      const payload = {
        name: workerForm.name.trim(),
        phone: workerForm.phone.trim(),
        mode: workerForm.mode,
        roleTitle: workerForm.roleTitle.trim(),
        roleTitleMiz: workerForm.roleTitleMiz.trim() || workerForm.roleTitle.trim(),
        district: workerForm.district,
        veng: workerForm.veng.trim(),
        monthlyPackageRate: Number(workerForm.monthlyPackageRate) || 14500,
        dailyRate: Number(workerForm.dailyRate) || 1100,
        hourlyRate: Number(workerForm.hourlyRate) || 220,
        skills: workerForm.skillsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        practicalSkillScore: Number(workerForm.practicalSkillScore) || 92,
        bankAccountMasked: workerForm.bankAccountMasked.trim(),
        outstationAvailable: workerForm.outstationAvailable,
        liveInAvailable: workerForm.liveInAvailable,
        availabilityStatus: workerForm.availabilityStatus,
      };

      const isEdit = Boolean(workerForm.id);
      const res = await fetch(
        isEdit ? `/api/staffing/workers/${workerForm.id}` : '/api/staffing/workers',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: authHeaders(true),
          body: JSON.stringify(payload),
        }
      );

      if (res.status === 401) {
        onAuthExpired();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.error || 'Could not save worker profile.');
        return;
      }

      triggerHaptic('success');
      setWorkerModalOpen(false);
      onActionStatus(
        isEdit
          ? `Updated workforce profile: ${payload.name}`
          : `Published new verified staff profile: ${payload.name}`
      );
      await onRefresh();
    } catch {
      setFormError('Network error saving worker profile.');
    } finally {
      setSavingWorker(false);
    }
  };

  const handleQuickStatus = async (worker: WorkforceMember, nextStatus: WorkforceAvailability) => {
    setBusyId(worker.id);
    try {
      const res = await fetch(`/api/staffing/workers/${worker.id}`, {
        method: 'PATCH',
        headers: authHeaders(true),
        body: JSON.stringify({ availabilityStatus: nextStatus }),
      });
      if (res.status === 401) {
        onAuthExpired();
        return;
      }
      if (res.ok) {
        triggerHaptic('light');
        onActionStatus(`${worker.name} availability set to ${nextStatus.replace('_', ' ')}.`);
        await onRefresh();
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleAssignReplacement = async (bookingId: string) => {
    const replacementWorkerId = replacementPicker[bookingId];
    if (!replacementWorkerId) {
      onActionStatus('Select an eligible replacement worker first.');
      return;
    }
    setBusyId(bookingId);
    try {
      const res = await fetch(`/api/staffing/bookings/${bookingId}/replace`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ replacementWorkerId }),
      });
      if (res.status === 401) {
        onAuthExpired();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onActionStatus(data.error || 'Could not assign replacement worker.');
        return;
      }
      triggerHaptic('success');
      onActionStatus(
        `Instant Replacement assigned for ${data.booking.contractId}: ${data.booking.replacementWorkerName}`
      );
      await onRefresh();
    } finally {
      setBusyId(null);
    }
  };

  const handleResolveWorkerSos = async (bookingId: string) => {
    setBusyId(bookingId);
    try {
      const res = await fetch(`/api/staffing/bookings/${bookingId}/resolve-sos`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({
          resolutionNote: 'HR Welfare Officer spoke with worker & household; safety verified.',
        }),
      });
      if (res.status === 401) {
        onAuthExpired();
        return;
      }
      if (res.ok) {
        triggerHaptic('success');
        onActionStatus(`Worker Safety SOS resolved for booking ${bookingId}.`);
        await onRefresh();
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleContractStatus = async (booking: StaffingBooking) => {
    const next = booking.status === 'active' ? 'completed' : 'active';
    setBusyId(booking.id);
    try {
      const res = await fetch(`/api/staffing/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: authHeaders(true),
        body: JSON.stringify({ status: next }),
      });
      if (res.status === 401) {
        onAuthExpired();
        return;
      }
      if (res.ok) {
        onActionStatus(`Contract ${booking.contractId} marked ${next}.`);
        await onRefresh();
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleReviewLeave = async (id: string, decision: 'approved' | 'rejected') => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/staffing/leave-requests/${id}/review`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ decision }),
      });
      if (res.status === 401) {
        onAuthExpired();
        return;
      }
      if (res.ok) {
        triggerHaptic('success');
        onActionStatus(`Leave request ${id} ${decision}.`);
        await onRefresh();
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleGeneratePayroll = async () => {
    setBusyId('generate-payroll');
    try {
      const res = await fetch('/api/staffing/payroll/generate', {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({}),
      });
      if (res.status === 401) {
        onAuthExpired();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onActionStatus(data.error || 'Could not generate payroll cycle.');
        return;
      }
      triggerHaptic('success');
      onActionStatus(
        `Generated ${data.created?.length || 0} monthly payroll bill(s) from active managed contracts.`
      );
      await onRefresh();
    } finally {
      setBusyId(null);
    }
  };

  const handleDisbursePayroll = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/staffing/payroll/${id}/disburse`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (res.status === 401) {
        onAuthExpired();
        return;
      }
      if (res.ok) {
        triggerHaptic('success');
        onActionStatus(`Direct-to-bank salary disbursed & digital payslip issued for ${id}.`);
        await onRefresh();
      }
    } finally {
      setBusyId(null);
    }
  };

  const totalNetPayroll = payrollRecords.reduce((acc, r) => acc + r.netSalaryDisbursed, 0);

  return (
    <div className="space-y-5">
      {/* Worker SOS Escalation Banner */}
      {activeSosBookings.length > 0 && (
        <div className="rounded-2xl border-2 border-red-600 bg-red-50 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-red-900">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <div>
              <p className="text-sm font-bold">
                ACTIVE WORKER SAFETY SOS ({activeSosBookings.length})
              </p>
              <p className="text-xs">
                {activeSosBookings[0].workerName} · {activeSosBookings[0].contractId} ·{' '}
                {activeSosBookings[0].customerName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleResolveWorkerSos(activeSosBookings[0].id)}
            className="min-h-[40px] rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 whitespace-nowrap"
          >
            Verify Safety &amp; Resolve SOS
          </button>
        </div>
      )}

      {/* Top KPI Summary Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Verified Awmpui &amp; Drivers</p>
          <p className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 mt-1">
            {workforce.length}
          </p>
          <p className="text-xs text-emerald-700 mt-0.5">
            {workforce.filter((w) => (w.availabilityStatus || 'active') === 'active').length} Active ·{' '}
            {workforce.filter((w) => w.mode === 'company_managed_staffing').length} Managed
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Active Household Contracts</p>
          <p className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 mt-1">
            {staffingBookings.filter((b) => b.status === 'active').length}
          </p>
          <p className="text-xs text-slate-600 mt-0.5">
            {staffingBookings.filter((b) => b.replacementWorkerName).length} Backup Assigned
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Pending Leave &amp; Attendance</p>
          <p className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 mt-1">
            {pendingLeaves.length}
          </p>
          <p className="text-xs text-slate-600 mt-0.5">
            {attendanceLogs.length} Check-in Logs Recorded
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Monthly Staff Net Payroll</p>
          <p className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 mt-1">
            ₹{totalNetPayroll.toLocaleString()}
          </p>
          <p className="text-xs text-emerald-700 mt-0.5">
            {payrollRecords.filter((p) => p.status === 'salary_disbursed').length}/{payrollRecords.length} Disbursed
          </p>
        </div>
      </div>

      {/* Sub-navigation + Primary Action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5 rounded-xl bg-slate-100 p-1">
          {(
            [
              ['directory', `Awmpui & Drivers (${workforce.length})`],
              ['contracts', `Contracts & Replacement (${staffingBookings.length})`],
              ['leave', `Leave & Attendance (${pendingLeaves.length})`],
              ['payroll', `Monthly Payroll (${payrollRecords.length})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSubTab(key)}
              className={`min-h-[40px] rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                subTab === key
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {subTab === 'payroll' && (
            <button
              type="button"
              disabled={busyId === 'generate-payroll'}
              onClick={() => void handleGeneratePayroll()}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-emerald-700 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Generate Monthly Cycle
            </button>
          )}
          <button
            type="button"
            onClick={openAddWorker}
            className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-emerald-800 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            {lang === 'miz' ? 'Awmpui / Driver Dah Belh' : 'Add Awmpui / Driver'}
          </button>
        </div>
      </div>

      {/* ================================================================= */}
      {/* SUB-TAB 1: WORKFORCE DIRECTORY CRUD                               */}
      {/* ================================================================= */}
      {subTab === 'directory' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                aria-label="Search Awmpui and Drivers"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, role, skill or Veng..."
                className="w-full min-h-[40px] rounded-xl border border-slate-300 pl-9 pr-3 text-xs text-slate-900 focus:border-emerald-700 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 rounded-xl bg-slate-100 p-1">
              {(
                [
                  ['all', 'All'],
                  ['company_managed_staffing', 'Managed Staff'],
                  ['on_demand_workforce', 'On-Demand'],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModeFilter(m)}
                  className={`min-h-[34px] rounded-lg px-3 text-xs font-semibold whitespace-nowrap ${
                    modeFilter === m ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 pr-4">Staff Member</th>
                  <th className="py-2.5 pr-4">Category &amp; Mode</th>
                  <th className="py-2.5 pr-4">District / Veng</th>
                  <th className="py-2.5 pr-4 text-right">Rate</th>
                  <th className="py-2.5 pr-4 text-right">Skill</th>
                  <th className="py-2.5 pr-4">Status</th>
                  <th className="py-2.5 text-right">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleWorkforce.map((w) => {
                  const status = w.availabilityStatus || 'active';
                  return (
                    <tr key={w.id} className="hover:bg-slate-50/70">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2.5">
                          <img
                            src={w.avatarUrl}
                            alt={w.name}
                            referrerPolicy="no-referrer"
                            className="w-9 h-9 rounded-xl object-cover bg-slate-100 shrink-0"
                          />
                          <div>
                            <p className="font-semibold text-slate-900">{w.name}</p>
                            <p className="text-[11px] text-slate-500">
                              {w.bankAccountMasked || 'Bank pending'} · {w.verifiedBadge || 'Verified'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-slate-800">{w.roleTitle}</p>
                        <p className="text-[11px] text-slate-500">
                          {w.mode === 'company_managed_staffing' ? 'Company Managed' : 'On-Demand'} ·{' '}
                          {w.liveInAvailable ? 'Live-in OK' : 'Day Shift'}
                        </p>
                      </td>
                      <td className="py-3 pr-4 text-slate-700">
                        {w.district || 'Aizawl'} · {w.veng}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular-nums font-bold text-slate-900">
                        {w.monthlyPackageRate
                          ? `₹${w.monthlyPackageRate.toLocaleString()}/mo`
                          : `₹${(w.dailyRate || 1100).toLocaleString()}/day`}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular-nums text-slate-700">
                        {w.practicalSkillScore}/100
                      </td>
                      <td className="py-3 pr-4">
                        <select
                          aria-label={`Availability status for ${w.name}`}
                          disabled={busyId === w.id}
                          value={status}
                          onChange={(e) =>
                            void handleQuickStatus(w, e.target.value as WorkforceAvailability)
                          }
                          className={`rounded-lg border px-2 py-1 text-xs font-semibold ${
                            status === 'active'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                              : status === 'on_leave'
                                ? 'border-amber-200 bg-amber-50 text-amber-900'
                                : 'border-red-200 bg-red-50 text-red-900'
                          }`}
                        >
                          <option value="active">Active</option>
                          <option value="on_leave">On Leave</option>
                          <option value="suspended">Suspended</option>
                        </select>
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openEditWorker(w)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {visibleWorkforce.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      No matching Awmpui or Drivers found. Click “Add Awmpui / Driver” to create one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* SUB-TAB 2: ACTIVE CONTRACTS, WORKER SOS & INSTANT REPLACEMENT     */}
      {/* ================================================================= */}
      {subTab === 'contracts' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 inline-flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              Active Contracts, Safeguards &amp; Instant Replacement Manager
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Monitor live household placements, verify Outstation/Live-In safeguards, resolve Worker SOS, and dispatch instant replacements.
            </p>
          </div>

          <div className="divide-y divide-slate-200">
            {staffingBookings.map((booking) => {
              const eligibleReplacements = workforce.filter(
                (w) =>
                  w.id !== booking.workerId &&
                  (w.availabilityStatus || 'active') === 'active' &&
                  (booking.mode !== 'company_managed_staffing' ||
                    w.mode === 'company_managed_staffing')
              );
              return (
                <div key={booking.id} className="py-4 first:pt-1 last:pb-1 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-mono tabular-nums text-slate-500">
                        {booking.contractId} · {booking.status.toUpperCase()} ·{' '}
                        {booking.tripartiteAgreement ? 'Tripartite Managed' : 'On-Demand'}
                      </p>
                      <h3 className="text-sm font-bold text-slate-900 mt-0.5">
                        {booking.workerName} → {booking.customerName}
                      </h3>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Package: <span className="font-mono font-bold text-slate-900">₹{booking.allInclusiveAmount.toLocaleString()}</span> ·{' '}
                        {booking.isOutstationOrLiveIn
                          ? `Live-In Safeguards: Room ${booking.accommodationProvided ? 'Yes' : 'No'} / Food ${booking.foodProvided ? 'Yes' : 'No'} / Travel ${booking.travelCovered ? 'Yes' : 'No'}`
                          : 'Daily Local Commute'}
                      </p>
                      {booking.replacementWorkerName && (
                        <p className="text-xs font-semibold text-emerald-800 mt-1">
                          Instant Replacement Active: {booking.replacementWorkerName}
                        </p>
                      )}
                      {booking.workerSosActive && (
                        <p className="text-xs font-bold text-red-700 mt-1">
                          ALERT: Worker Safety SOS active — immediate HR welfare call required.
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {booking.workerSosActive && (
                        <button
                          type="button"
                          disabled={busyId === booking.id}
                          onClick={() => void handleResolveWorkerSos(booking.id)}
                          className="min-h-[38px] rounded-xl bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                        >
                          Resolve Worker SOS
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busyId === booking.id}
                        onClick={() => void handleToggleContractStatus(booking)}
                        className="min-h-[38px] rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                      >
                        {booking.status === 'active' ? 'Mark Completed' : 'Re-open Active'}
                      </button>
                    </div>
                  </div>

                  {booking.status === 'active' && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <label htmlFor={`rep-${booking.id}`} className="text-xs font-medium text-slate-600">
                        Instant Replacement:
                      </label>
                      <select
                        id={`rep-${booking.id}`}
                        value={replacementPicker[booking.id] || ''}
                        onChange={(e) =>
                          setReplacementPicker((prev) => ({ ...prev, [booking.id]: e.target.value }))
                        }
                        className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-900"
                      >
                        <option value="">Choose active backup worker...</option>
                        {eligibleReplacements.map((cand) => (
                          <option key={cand.id} value={cand.id}>
                            {cand.name} ({cand.district || 'Aizawl'} · {cand.roleTitle})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={busyId === booking.id || !replacementPicker[booking.id]}
                        onClick={() => void handleAssignReplacement(booking.id)}
                        className="min-h-[36px] inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Assign Replacement
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {staffingBookings.length === 0 && (
              <p className="py-6 text-center text-xs text-slate-500">
                No active staffing contracts recorded yet.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* SUB-TAB 3: LEAVE REQUESTS & DAILY ATTENDANCE LOGS                 */}
      {/* ================================================================= */}
      {subTab === 'leave' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 inline-flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-amber-600" />
              Staff Leave &amp; Replacement Requests ({leaveRequests.length})
            </h2>
            <div className="divide-y divide-slate-100">
              {leaveRequests.map((req) => (
                <div key={req.id} className="py-3.5 first:pt-0 last:pb-0 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-mono text-slate-500">
                      {req.id} · {req.fromDate} → {req.toDate} · {req.status.toUpperCase()}
                    </p>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">{req.workerName}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{req.reason}</p>
                    {req.needsInstantReplacement && (
                      <p className="text-[11px] font-semibold text-amber-800 mt-1">
                        Requested Backup Replacement for Household
                      </p>
                    )}
                  </div>
                  {req.status === 'pending' ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busyId === req.id}
                        onClick={() => void handleReviewLeave(req.id, 'approved')}
                        className="min-h-[36px] rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-600"
                      >
                        Approve Leave
                      </button>
                      <button
                        type="button"
                        disabled={busyId === req.id}
                        onClick={() => void handleReviewLeave(req.id, 'rejected')}
                        className="min-h-[36px] rounded-lg border border-red-300 px-3 text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        Reject
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs font-semibold text-emerald-800">
                      {req.status === 'approved' ? 'Approved' : 'Rejected'} · {req.reviewedBy || 'HR'}
                    </span>
                  )}
                </div>
              ))}
              {leaveRequests.length === 0 && (
                <p className="py-6 text-center text-xs text-slate-500">No leave requests submitted.</p>
              )}
            </div>
          </div>

          <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 inline-flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-700" />
              Recent Daily Check-Ins ({attendanceLogs.length})
            </h2>
            <div className="divide-y divide-slate-100">
              {attendanceLogs.slice(0, 10).map((log) => (
                <div key={log.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                  <div>
                    <p className="font-semibold text-slate-900">{log.workerName}</p>
                    <p className="text-slate-500">
                      {log.date} · {log.veng}
                    </p>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <p className="font-bold text-emerald-800">{log.status.replace('_', ' ')}</p>
                    <p className="text-[11px] text-slate-500">{log.checkInTime}</p>
                  </div>
                </div>
              ))}
              {attendanceLogs.length === 0 && (
                <p className="py-6 text-center text-xs text-slate-500">No attendance check-ins yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* SUB-TAB 4: DIRECT-TO-BANK MONTHLY PAYROLL                         */}
      {/* ================================================================= */}
      {subTab === 'payroll' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 inline-flex items-center gap-2">
              <Users className="w-4 h-4 text-teal-700" /> Managed Staffing &amp; Direct-to-Bank Payroll
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Client billing 1st–5th · Automated direct-to-bank staff salaries &amp; digital payslips by 7th.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4">Payslip ID</th>
                  <th className="py-2 pr-4">Staff Member</th>
                  <th className="py-2 pr-4">Client Household</th>
                  <th className="py-2 pr-4">Cycle</th>
                  <th className="py-2 pr-4 text-right">Package</th>
                  <th className="py-2 pr-4 text-right">Mgmt Fee</th>
                  <th className="py-2 pr-4 text-right">Net Salary</th>
                  <th className="py-2">Bank &amp; Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payrollRecords.map((rec) => (
                  <tr key={rec.id}>
                    <td className="py-3 pr-4 font-mono tabular-nums text-slate-700">{rec.payslipId}</td>
                    <td className="py-3 pr-4 font-medium text-slate-900">{rec.staffName}</td>
                    <td className="py-3 pr-4 text-slate-600">{rec.clientName}</td>
                    <td className="py-3 pr-4 font-mono text-slate-600">
                      Bill {rec.billingWindow} · Pay {rec.payoutWindow}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular-nums">
                      ₹{rec.monthlyPackage.toLocaleString()}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular-nums text-slate-500">
                      ₹{rec.platformMgmtFee.toLocaleString()}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular-nums font-bold text-slate-900">
                      ₹{rec.netSalaryDisbursed.toLocaleString()}
                    </td>
                    <td className="py-3">
                      {rec.status === 'salary_disbursed' ? (
                        <span className="inline-flex items-center gap-1 text-teal-800 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Disbursed ({rec.bankAccountMasked})
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={busyId === rec.id}
                          onClick={() => void handleDisbursePayroll(rec.id)}
                          className="min-h-[34px] rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                        >
                          Disburse to {rec.bankAccountMasked}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* ADD / EDIT WORKER MODAL (LAYER WINDOW)                            */}
      {/* ================================================================= */}
      <LayerWindow
        open={workerModalOpen}
        onClose={() => setWorkerModalOpen(false)}
        title={workerForm.id ? 'Edit Awmpui / Driver Profile' : 'Add Verified Awmpui / Family Driver'}
        subtitle="Changes publish immediately to Customer Directory & Staff Portal"
        size="md"
      >
        <form onSubmit={handleSaveWorker} className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="wf-name" className="block text-xs font-semibold text-slate-700 mb-1">
                Full Name
              </label>
              <input
                id="wf-name"
                required
                value={workerForm.name}
                onChange={(e) => setWorkerForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Lalnunmawii Tochhawng"
                className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 text-sm"
              />
            </div>
            <div>
              <label htmlFor="wf-phone" className="block text-xs font-semibold text-slate-700 mb-1">
                Mobile Number
              </label>
              <input
                id="wf-phone"
                value={workerForm.phone}
                onChange={(e) => setWorkerForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+91 98620 XXXXX"
                className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="wf-mode" className="block text-xs font-semibold text-slate-700 mb-1">
                Staffing Mode
              </label>
              <select
                id="wf-mode"
                value={workerForm.mode}
                onChange={(e) =>
                  setWorkerForm((f) => ({
                    ...f,
                    mode: e.target.value as 'company_managed_staffing' | 'on_demand_workforce',
                  }))
                }
                className="w-full min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="company_managed_staffing">Company-Managed Awmpui / Driver</option>
                <option value="on_demand_workforce">On-Demand Daily Workforce</option>
              </select>
            </div>
            <div>
              <label htmlFor="wf-bank" className="block text-xs font-semibold text-slate-700 mb-1">
                Direct-to-Bank Account (Masked)
              </label>
              <input
                id="wf-bank"
                value={workerForm.bankAccountMasked}
                onChange={(e) => setWorkerForm((f) => ({ ...f, bankAccountMasked: e.target.value }))}
                placeholder="SBI •••• 4821"
                className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="wf-role-en" className="block text-xs font-semibold text-slate-700 mb-1">
                Role Title (English)
              </label>
              <input
                id="wf-role-en"
                required
                value={workerForm.roleTitle}
                onChange={(e) => setWorkerForm((f) => ({ ...f, roleTitle: e.target.value }))}
                className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 text-sm"
              />
            </div>
            <div>
              <label htmlFor="wf-role-miz" className="block text-xs font-semibold text-slate-700 mb-1">
                Role Title (Mizo)
              </label>
              <input
                id="wf-role-miz"
                value={workerForm.roleTitleMiz}
                onChange={(e) => setWorkerForm((f) => ({ ...f, roleTitleMiz: e.target.value }))}
                className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="wf-district" className="block text-xs font-semibold text-slate-700 mb-1">
                District
              </label>
              <select
                id="wf-district"
                value={workerForm.district}
                onChange={(e) => {
                  const next = e.target.value as MizoramDistrict;
                  setWorkerForm((f) => ({
                    ...f,
                    district: next,
                    veng: getDistrictInfo(next).vengs[0]?.name || f.veng,
                  }));
                }}
                className="w-full min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 text-sm"
              >
                {ALL_MIZORAM_DISTRICT_NAMES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="wf-veng" className="block text-xs font-semibold text-slate-700 mb-1">
                Veng / Locality
              </label>
              <input
                id="wf-veng"
                required
                value={workerForm.veng}
                onChange={(e) => setWorkerForm((f) => ({ ...f, veng: e.target.value }))}
                className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 text-sm"
              />
            </div>
            <div>
              <label htmlFor="wf-rate" className="block text-xs font-semibold text-slate-700 mb-1">
                {workerForm.mode === 'company_managed_staffing' ? 'Monthly Package (₹)' : 'Daily Rate (₹)'}
              </label>
              <input
                id="wf-rate"
                type="number"
                value={
                  workerForm.mode === 'company_managed_staffing'
                    ? workerForm.monthlyPackageRate
                    : workerForm.dailyRate
                }
                onChange={(e) =>
                  setWorkerForm((f) =>
                    f.mode === 'company_managed_staffing'
                      ? { ...f, monthlyPackageRate: e.target.value }
                      : { ...f, dailyRate: e.target.value }
                  )
                }
                className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 text-sm font-mono"
              />
            </div>
          </div>

          <div>
            <label htmlFor="wf-skills" className="block text-xs font-semibold text-slate-700 mb-1">
              Skills (comma-separated)
            </label>
            <input
              id="wf-skills"
              value={workerForm.skillsText}
              onChange={(e) => setWorkerForm((f) => ({ ...f, skillsText: e.target.value }))}
              className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-4 pt-1 text-xs font-medium text-slate-700">
            <label className="inline-flex items-center gap-2 min-h-[36px] cursor-pointer">
              <input
                type="checkbox"
                checked={workerForm.liveInAvailable}
                onChange={(e) => setWorkerForm((f) => ({ ...f, liveInAvailable: e.target.checked }))}
              />
              Live-In Placement Available
            </label>
            <label className="inline-flex items-center gap-2 min-h-[36px] cursor-pointer">
              <input
                type="checkbox"
                checked={workerForm.outstationAvailable}
                onChange={(e) => setWorkerForm((f) => ({ ...f, outstationAvailable: e.target.checked }))}
              />
              Outstation District Available
            </label>
          </div>

          {formError && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
              {formError}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setWorkerModalOpen(false)}
              className="min-h-[44px] rounded-xl border border-slate-300 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingWorker}
              className="min-h-[44px] rounded-xl bg-emerald-800 px-5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {savingWorker ? 'Saving...' : workerForm.id ? 'Save Changes' : 'Publish Staff Profile'}
            </button>
          </div>
        </form>
      </LayerWindow>
    </div>
  );
};

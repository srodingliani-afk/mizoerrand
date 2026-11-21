import { Router } from 'express';
import { db } from '../infrastructure/store';
import { realtimeHub } from '../infrastructure/realtimeHub';
import { requireAdminAuth } from '../infrastructure/adminAuth';
import {
  calculateManagedPayrollSplit,
  selectEligibleReplacements,
  validateOutstationSafeguards,
} from '../domain/staffingRules';
import type {
  MizoramDistrict,
  PayrollRecord,
  StaffAttendanceLog,
  StaffLeaveRequest,
  StaffingBooking,
  TrustBadge,
  WorkforceAvailability,
  WorkforceMember,
} from '../../src/shared/types';

export const managedStaffingRouter = Router();

const ALLOWED_AVAILABILITY = new Set<WorkforceAvailability>(['active', 'on_leave', 'suspended']);

managedStaffingRouter.get('/directory', (_req, res) => {
  const state = db.get();
  res.json({
    workforce: state.workforce,
    bookings: state.staffingBookings,
    payrollRecords: state.payrollRecords,
    leaveRequests: state.staffLeaveRequests,
    attendanceLogs: state.staffAttendanceLogs,
  });
});

// =========================================================================
// ADMIN HR: WORKFORCE DIRECTORY CRUD (AWMPUI, CAREGIVERS & FAMILY DRIVERS)
// =========================================================================
managedStaffingRouter.post('/workers', requireAdminAuth, (req, res) => {
  const body = req.body as Partial<WorkforceMember>;
  const name = (body.name || '').trim();
  const roleTitle = (body.roleTitle || '').trim();
  const roleTitleMiz = (body.roleTitleMiz || roleTitle).trim();
  const veng = (body.veng || '').trim();
  const mode =
    body.mode === 'on_demand_workforce' ? 'on_demand_workforce' : 'company_managed_staffing';

  if (name.length < 3 || roleTitle.length < 3 || veng.length < 2) {
    res.status(400).json({ error: 'Name, role title, and Veng are required (min 3 chars).' });
    return;
  }

  const state = db.get();
  const isDriver = /driver/i.test(roleTitle);
  const worker: WorkforceMember = {
    id: `wrk-${Date.now().toString().slice(-5)}`,
    name,
    phone: (body.phone || '').trim().slice(0, 20) || undefined,
    mode,
    roleTitle,
    roleTitleMiz,
    skills:
      Array.isArray(body.skills) && body.skills.length > 0
        ? body.skills.map((s) => String(s).trim()).filter(Boolean).slice(0, 8)
        : ['Verified Background', 'Mizoram Local'],
    district: (body.district as MizoramDistrict) || 'Aizawl',
    veng,
    hourlyRate:
      mode === 'on_demand_workforce'
        ? Math.max(100, Math.round(Number(body.hourlyRate) || 220))
        : undefined,
    dailyRate:
      mode === 'on_demand_workforce'
        ? Math.max(400, Math.round(Number(body.dailyRate) || 1100))
        : undefined,
    monthlyPackageRate:
      mode === 'company_managed_staffing'
        ? Math.max(6000, Math.round(Number(body.monthlyPackageRate) || 14500))
        : undefined,
    practicalSkillScore: Math.max(50, Math.min(100, Math.round(Number(body.practicalSkillScore) || 92))),
    groomingTrainingStatus:
      (body.groomingTrainingStatus || '').trim() || 'Company Certified · Vetted 2026',
    outstationAvailable: Boolean(body.outstationAvailable),
    liveInAvailable: Boolean(body.liveInAvailable),
    replacementGuarantee: mode === 'company_managed_staffing' ? true : Boolean(body.replacementGuarantee),
    availabilityStatus: 'active',
    bankAccountMasked: (body.bankAccountMasked || '').trim() || 'SBI •••• 0000',
    verifiedBadge: (body.verifiedBadge as TrustBadge) || 'Company Certified',
    avatarUrl: isDriver
      ? '/src/assets/images/partner_hill_rider_1794891322041.jpg'
      : '/src/assets/images/staffing_caregiver_portrait_1794891321006.jpg',
    portfolioUrls: [
      isDriver
        ? '/src/assets/images/partner_hill_rider_1794891322041.jpg'
        : '/src/assets/images/staffing_caregiver_portrait_1794891321006.jpg',
    ],
    rating: 4.9,
  };

  state.workforce.unshift(worker);
  db.addAudit('hr-admin', 'WORKFORCE_CREATED', `${worker.name} (${worker.roleTitle} · ${worker.district})`);
  realtimeHub.broadcast('staffing_update', { worker });
  res.status(201).json({ worker });
});

managedStaffingRouter.patch('/workers/:id', requireAdminAuth, (req, res) => {
  const state = db.get();
  const worker = state.workforce.find((w) => w.id === req.params.id);
  if (!worker) {
    res.status(404).json({ error: 'Worker profile not found' });
    return;
  }

  const body = req.body as Partial<WorkforceMember>;
  if (typeof body.name === 'string' && body.name.trim().length >= 3) {
    worker.name = body.name.trim();
  }
  if (typeof body.roleTitle === 'string' && body.roleTitle.trim().length >= 3) {
    worker.roleTitle = body.roleTitle.trim();
  }
  if (typeof body.roleTitleMiz === 'string' && body.roleTitleMiz.trim().length >= 3) {
    worker.roleTitleMiz = body.roleTitleMiz.trim();
  }
  if (typeof body.veng === 'string' && body.veng.trim().length >= 2) {
    worker.veng = body.veng.trim();
  }
  if (body.district) worker.district = body.district;
  if (typeof body.monthlyPackageRate === 'number' && body.monthlyPackageRate >= 4000) {
    worker.monthlyPackageRate = Math.round(body.monthlyPackageRate);
  }
  if (typeof body.dailyRate === 'number' && body.dailyRate >= 300) {
    worker.dailyRate = Math.round(body.dailyRate);
  }
  if (typeof body.hourlyRate === 'number' && body.hourlyRate >= 80) {
    worker.hourlyRate = Math.round(body.hourlyRate);
  }
  if (typeof body.practicalSkillScore === 'number') {
    worker.practicalSkillScore = Math.max(50, Math.min(100, Math.round(body.practicalSkillScore)));
  }
  if (typeof body.outstationAvailable === 'boolean') {
    worker.outstationAvailable = body.outstationAvailable;
  }
  if (typeof body.liveInAvailable === 'boolean') {
    worker.liveInAvailable = body.liveInAvailable;
  }
  if (typeof body.bankAccountMasked === 'string' && body.bankAccountMasked.trim()) {
    worker.bankAccountMasked = body.bankAccountMasked.trim().slice(0, 32);
  }
  if (body.availabilityStatus && ALLOWED_AVAILABILITY.has(body.availabilityStatus)) {
    worker.availabilityStatus = body.availabilityStatus;
  }

  db.addAudit(
    'hr-admin',
    'WORKFORCE_UPDATED',
    `${worker.name} (${worker.availabilityStatus || 'active'})`
  );
  realtimeHub.broadcast('staffing_update', { worker });
  res.json({ worker });
});

// =========================================================================
// CUSTOMER BOOKING, WORKER SOS & ADMIN INSTANT REPLACEMENT
// =========================================================================
managedStaffingRouter.post('/book', (req, res) => {
  const {
    workerId,
    customerName = 'Pi Lalrinchhani',
    isOutstationOrLiveIn = false,
    accommodationProvided = false,
    foodProvided = false,
    travelCovered = false,
  } = req.body as {
    workerId: string;
    customerName?: string;
    isOutstationOrLiveIn?: boolean;
    accommodationProvided?: boolean;
    foodProvided?: boolean;
    travelCovered?: boolean;
  };

  const state = db.get();
  const worker = state.workforce.find((w) => w.id === workerId);
  if (!worker) {
    res.status(404).json({ error: 'Worker profile not found' });
    return;
  }
  if (worker.availabilityStatus === 'suspended') {
    res.status(400).json({ error: 'This worker profile is currently paused by HR.' });
    return;
  }

  const safeguardCheck = validateOutstationSafeguards({
    isOutstationOrLiveIn,
    accommodationProvided,
    foodProvided,
    travelCovered,
  });
  if (!safeguardCheck.valid) {
    res.status(400).json({ error: safeguardCheck.error });
    return;
  }

  const allInclusiveAmount =
    worker.mode === 'company_managed_staffing'
      ? worker.monthlyPackageRate || 14500
      : worker.dailyRate || 1100;

  const booking: StaffingBooking = {
    id: `stf-${Date.now().toString().slice(-5)}`,
    workerId: worker.id,
    workerName: worker.name,
    mode: worker.mode,
    customerName: customerName.trim() || 'Pi Lalrinchhani',
    isOutstationOrLiveIn,
    accommodationProvided,
    foodProvided,
    travelCovered,
    allInclusiveAmount,
    contractId: `CTR-MZ-${Date.now().toString().slice(-6)}`,
    tripartiteAgreement: worker.mode === 'company_managed_staffing',
    workerSosActive: false,
    status: 'active',
    createdAt: new Date().toISOString(),
  };

  state.staffingBookings.unshift(booking);
  db.addAudit(booking.customerName, 'STAFFING_BOOKED', `${worker.name} (${booking.contractId})`);
  realtimeHub.broadcast('staffing_update', { booking });
  res.status(201).json({ booking });
});

managedStaffingRouter.post('/bookings/:id/worker-sos', (req, res) => {
  const state = db.get();
  const booking = state.staffingBookings.find((b) => b.id === req.params.id);
  if (!booking) {
    res.status(404).json({ error: 'Booking not found' });
    return;
  }
  booking.workerSosActive = true;
  booking.sosResolvedAt = undefined;
  db.addAudit(booking.workerName, 'WORKER_SOS_TRIGGERED', `Contract ${booking.contractId}`);
  realtimeHub.broadcast('sos_alert', {
    source: 'worker_safety',
    bookingId: booking.id,
    workerName: booking.workerName,
  });
  res.json({ booking });
});

managedStaffingRouter.post('/bookings/:id/resolve-sos', requireAdminAuth, (req, res) => {
  const { resolutionNote = 'HR Welfare Officer verified worker safety on call.' } = req.body as {
    resolutionNote?: string;
  };
  const state = db.get();
  const booking = state.staffingBookings.find((b) => b.id === req.params.id);
  if (!booking) {
    res.status(404).json({ error: 'Booking not found' });
    return;
  }
  booking.workerSosActive = false;
  booking.sosResolvedAt = new Date().toISOString();
  booking.sosResolutionNote = resolutionNote.trim().slice(0, 240);
  db.addAudit(
    'hr-welfare',
    'WORKER_SOS_RESOLVED',
    `${booking.contractId} (${booking.workerName}): ${booking.sosResolutionNote}`
  );
  realtimeHub.broadcast('staffing_update', { booking });
  res.json({ booking });
});

managedStaffingRouter.post('/bookings/:id/replace', requireAdminAuth, (req, res) => {
  const { replacementWorkerId } = req.body as { replacementWorkerId?: string };
  const state = db.get();
  const booking = state.staffingBookings.find((b) => b.id === req.params.id);
  if (!booking) {
    res.status(404).json({ error: 'Contract booking not found' });
    return;
  }
  const eligible = selectEligibleReplacements(state.workforce, booking);
  const replacement = eligible.find((w) => w.id === replacementWorkerId);
  if (!replacement) {
    res.status(400).json({
      error: 'Selected replacement worker is not eligible or unavailable for this contract.',
    });
    return;
  }

  booking.replacementWorkerId = replacement.id;
  booking.replacementWorkerName = replacement.name;
  db.addAudit(
    'hr-admin',
    'INSTANT_REPLACEMENT_ASSIGNED',
    `${booking.contractId}: ${booking.workerName} -> Backup ${replacement.name}`
  );
  realtimeHub.broadcast('staffing_update', { booking });
  res.json({ booking });
});

managedStaffingRouter.patch('/bookings/:id', requireAdminAuth, (req, res) => {
  const { status } = req.body as { status?: 'active' | 'completed' };
  const state = db.get();
  const booking = state.staffingBookings.find((b) => b.id === req.params.id);
  if (!booking) {
    res.status(404).json({ error: 'Contract booking not found' });
    return;
  }
  if (status === 'active' || status === 'completed') {
    booking.status = status;
  }
  db.addAudit('hr-admin', 'CONTRACT_STATUS_UPDATED', `${booking.contractId} -> ${booking.status}`);
  realtimeHub.broadcast('staffing_update', { booking });
  res.json({ booking });
});

// =========================================================================
// STAFF PORTAL: ATTENDANCE CHECK-IN & LEAVE REQUESTS
// =========================================================================
managedStaffingRouter.post('/attendance', (req, res) => {
  const { workerId, status = 'present', veng } = req.body as {
    workerId?: string;
    status?: StaffAttendanceLog['status'];
    veng?: string;
  };
  const state = db.get();
  const worker = state.workforce.find((w) => w.id === workerId);
  if (!worker) {
    res.status(404).json({ error: 'Worker profile not found' });
    return;
  }
  const allowedStatus: StaffAttendanceLog['status'] =
    status === 'half_day' || status === 'on_leave' ? status : 'present';

  const now = new Date();
  const entry: StaffAttendanceLog = {
    id: `att-${Date.now().toString().slice(-5)}`,
    workerId: worker.id,
    workerName: worker.name,
    date: now.toISOString().slice(0, 10),
    checkInTime: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    status: allowedStatus,
    veng: (veng || worker.veng).trim().slice(0, 60),
  };

  state.staffAttendanceLogs.unshift(entry);
  if (state.staffAttendanceLogs.length > 60) {
    state.staffAttendanceLogs.length = 60;
  }
  db.addAudit(worker.name, 'STAFF_ATTENDANCE', `${entry.date} ${entry.checkInTime} (${entry.status})`);
  realtimeHub.broadcast('staffing_update', { attendance: entry });
  res.status(201).json({ entry });
});

managedStaffingRouter.post('/leave-requests', (req, res) => {
  const {
    workerId,
    bookingId,
    fromDate,
    toDate,
    reason,
    needsInstantReplacement = true,
  } = req.body as Partial<StaffLeaveRequest>;

  const state = db.get();
  const worker = state.workforce.find((w) => w.id === workerId);
  if (!worker) {
    res.status(404).json({ error: 'Worker profile not found' });
    return;
  }
  const cleanReason = (reason || '').trim();
  if (!fromDate || !toDate || cleanReason.length < 5) {
    res.status(400).json({ error: 'From date, to date, and a brief reason (min 5 chars) are required.' });
    return;
  }

  const leaveReq: StaffLeaveRequest = {
    id: `lvr-${Date.now().toString().slice(-5)}`,
    workerId: worker.id,
    workerName: worker.name,
    bookingId,
    fromDate: String(fromDate).slice(0, 16),
    toDate: String(toDate).slice(0, 16),
    reason: cleanReason.slice(0, 240),
    needsInstantReplacement: Boolean(needsInstantReplacement),
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  state.staffLeaveRequests.unshift(leaveReq);
  db.addAudit(worker.name, 'STAFF_LEAVE_REQUEST', `${leaveReq.fromDate} to ${leaveReq.toDate}`);
  realtimeHub.broadcast('staffing_update', { leaveRequest: leaveReq });
  res.status(201).json({ leaveRequest: leaveReq });
});

managedStaffingRouter.post('/leave-requests/:id/review', requireAdminAuth, (req, res) => {
  const { decision } = req.body as { decision?: 'approved' | 'rejected' };
  if (decision !== 'approved' && decision !== 'rejected') {
    res.status(400).json({ error: 'Decision must be approved or rejected.' });
    return;
  }
  const state = db.get();
  const leaveReq = state.staffLeaveRequests.find((l) => l.id === req.params.id);
  if (!leaveReq) {
    res.status(404).json({ error: 'Leave request not found' });
    return;
  }
  leaveReq.status = decision;
  leaveReq.reviewedBy = 'KYC & HR Officer';
  if (decision === 'approved') {
    const worker = state.workforce.find((w) => w.id === leaveReq.workerId);
    if (worker) worker.availabilityStatus = 'on_leave';
  }
  db.addAudit('hr-admin', 'STAFF_LEAVE_REVIEWED', `${leaveReq.workerName} -> ${decision}`);
  realtimeHub.broadcast('staffing_update', { leaveRequest: leaveReq });
  res.json({ leaveRequest: leaveReq });
});

// =========================================================================
// DIRECT-TO-BANK PAYROLL GENERATION & DISBURSEMENT
// =========================================================================
managedStaffingRouter.post('/payroll/generate', requireAdminAuth, (req, res) => {
  const { bookingId } = req.body as { bookingId?: string };
  const state = db.get();
  const targetBookings = bookingId
    ? state.staffingBookings.filter((b) => b.id === bookingId && b.status === 'active')
    : state.staffingBookings.filter(
        (b) => b.status === 'active' && b.mode === 'company_managed_staffing'
      );

  if (targetBookings.length === 0) {
    res.status(400).json({ error: 'No active managed staffing contracts available to bill.' });
    return;
  }

  const created: PayrollRecord[] = [];
  const stamp = new Date().toISOString().slice(0, 7).replace('-', '');

  for (const booking of targetBookings) {
    const worker = state.workforce.find((w) => w.id === booking.workerId);
    const split = calculateManagedPayrollSplit(booking.allInclusiveAmount);
    const seq = `${state.payrollRecords.length + created.length + 1}`.padStart(2, '0');
    const record: PayrollRecord = {
      id: `pay-${Date.now().toString().slice(-5)}-${seq}`,
      staffName: booking.workerName,
      clientName: booking.customerName,
      billingWindow: '1st-5th',
      payoutWindow: 'By 7th',
      monthlyPackage: split.monthlyPackage,
      platformMgmtFee: split.platformMgmtFee,
      netSalaryDisbursed: split.netSalaryDisbursed,
      bankAccountMasked: worker?.bankAccountMasked || 'SBI •••• 6120',
      status: 'client_billed',
      payslipId: `SLIP-${stamp}-${seq}`,
    };
    state.payrollRecords.unshift(record);
    created.push(record);
  }

  db.addAudit('hr-payroll', 'PAYROLL_CYCLE_GENERATED', `Generated ${created.length} monthly payroll record(s)`);
  realtimeHub.broadcast('staffing_update', { payrollGenerated: created.length });
  res.status(201).json({ created });
});

managedStaffingRouter.post('/payroll/:id/disburse', requireAdminAuth, (req, res) => {
  const state = db.get();
  const record = state.payrollRecords.find((p) => p.id === req.params.id);
  if (!record) {
    res.status(404).json({ error: 'Payroll record not found' });
    return;
  }
  record.status = 'salary_disbursed';
  db.addAudit(
    'hr-payroll',
    'SALARY_DISBURSED',
    `${record.staffName} (${record.payslipId}) Rs. ${record.netSalaryDisbursed}`
  );
  realtimeHub.broadcast('staffing_update', { payrollRecord: record });
  res.json({ record });
});

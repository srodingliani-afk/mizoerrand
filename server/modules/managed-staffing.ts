import { Router } from 'express';
import { db } from '../infrastructure/store';
import { realtimeHub } from '../infrastructure/realtimeHub';
import type { StaffingBooking } from '../../src/shared/types';

export const managedStaffingRouter = Router();

managedStaffingRouter.get('/directory', (_req, res) => {
  const state = db.get();
  res.json({
    workforce: state.workforce,
    bookings: state.staffingBookings,
    payrollRecords: state.payrollRecords,
  });
});

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

  if (
    isOutstationOrLiveIn &&
    (!accommodationProvided || !foodProvided || !travelCovered)
  ) {
    res.status(400).json({
      error:
        'Outstation & Live-In protocol mandates checking Accommodation, Food, and Travel coverage before booking.',
    });
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
    customerName,
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
  db.addAudit(customerName, 'STAFFING_BOOKED', `${worker.name} (${booking.contractId})`);
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
  db.addAudit(booking.workerName, 'WORKER_SOS_TRIGGERED', `Contract ${booking.contractId}`);
  realtimeHub.broadcast('sos_alert', {
    source: 'worker_safety',
    bookingId: booking.id,
    workerName: booking.workerName,
  });
  res.json({ booking });
});

managedStaffingRouter.post('/payroll/:id/disburse', (req, res) => {
  const state = db.get();
  const record = state.payrollRecords.find((p) => p.id === req.params.id);
  if (!record) {
    res.status(404).json({ error: 'Payroll record not found' });
    return;
  }
  record.status = 'salary_disbursed';
  db.addAudit('hr-payroll', 'SALARY_DISBURSED', `${record.staffName} (${record.payslipId}) Rs. ${record.netSalaryDisbursed}`);
  realtimeHub.broadcast('staffing_update', { payrollRecord: record });
  res.json({ record });
});

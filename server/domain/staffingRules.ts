import type {
  MizoramDistrict,
  PartnerCategory,
  StaffingBooking,
  WorkforceMember,
} from '../../src/shared/types';

export interface ManagedPayrollSplit {
  monthlyPackage: number;
  platformMgmtFee: number;
  netSalaryDisbursed: number;
}

/**
 * Computes transparent Company-Managed Staffing monthly payroll split:
 * Platform management fee is ~10.5% rounded to nearest Rs. 50 (clamped between Rs. 1,000 and Rs. 2,500),
 * ensuring netSalaryDisbursed + platformMgmtFee === monthlyPackage with zero hidden deductions.
 */
export function calculateManagedPayrollSplit(monthlyPackage: number): ManagedPayrollSplit {
  const safePackage = Math.max(4000, Math.round(monthlyPackage));
  const rawFee = Math.round((safePackage * 0.105) / 50) * 50;
  const platformMgmtFee = Math.max(1000, Math.min(2500, Math.min(rawFee, Math.floor(safePackage * 0.2))));
  const netSalaryDisbursed = safePackage - platformMgmtFee;
  return {
    monthlyPackage: safePackage,
    platformMgmtFee,
    netSalaryDisbursed,
  };
}

/**
 * Masks an Aadhaar input down to its last 4 numeric digits only so raw 12-digit numbers
 * are never stored in memory or disk.
 */
export function maskAadhaarLast4(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (digits.length < 4) return null;
  const last4 = digits.slice(-4);
  return `XXXX-XXXX-${last4}`;
}

export interface OnboardingApplicationInput {
  applicantName: string;
  phone: string;
  targetCategory: PartnerCategory | 'staff';
  staffMode?: 'on_demand_workforce' | 'company_managed_staffing';
  roleTitle?: string;
  district: MizoramDistrict;
  veng: string;
  aadhaarLast4: string;
  voterIdNumber: string;
  drivingLicenceNumber?: string;
  commercialPermitNumber?: string;
  vehicleRcNumber?: string;
  pvcNumber?: string;
  ymaVcReference: string;
  resumeSummary: string;
  expectedMonthlyRate?: number;
  expectedDailyRate?: number;
}

const VALID_CATEGORIES = new Set<string>(['walker', 'bike', 'auto_taxi', 'pickup_truck', 'staff']);
const MOTORIZED_CATEGORIES = new Set<string>(['bike', 'auto_taxi', 'pickup_truck']);

export function validateOnboardingApplication(input: Partial<OnboardingApplicationInput>): {
  valid: boolean;
  errors: string[];
  aadhaarMasked?: string;
} {
  const errors: string[] = [];
  const name = (input.applicantName || '').trim();
  const phone = (input.phone || '').replace(/\D/g, '');
  const veng = (input.veng || '').trim();
  const voterId = (input.voterIdNumber || '').trim();
  const ymaRef = (input.ymaVcReference || '').trim();
  const resume = (input.resumeSummary || '').trim();
  const category = input.targetCategory || '';

  if (name.length < 3 || name.length > 80) {
    errors.push('Full name must be between 3 and 80 characters.');
  }
  if (phone.length < 10 || phone.length > 13) {
    errors.push('Valid 10-digit mobile number is required.');
  }
  if (!VALID_CATEGORIES.has(category)) {
    errors.push('Please select a valid role category.');
  }
  if (veng.length < 2 || veng.length > 60) {
    errors.push('Locality / Veng is required.');
  }
  const masked = maskAadhaarLast4(input.aadhaarLast4 || '');
  if (!masked) {
    errors.push('Last 4 digits of Aadhaar are required for verification.');
  }
  if (voterId.length < 5) {
    errors.push('Valid Mizoram Voter ID / EPIC number is required.');
  }
  if (ymaRef.length < 5) {
    errors.push('Local YMA Branch or Village Council (VC) reference is required.');
  }
  if (resume.length < 8) {
    errors.push('Please provide a short experience / skills summary (min 8 characters).');
  }

  const isDriverRole =
    MOTORIZED_CATEGORIES.has(category) ||
    (category === 'staff' && /driver/i.test(input.roleTitle || ''));

  if (isDriverRole && !(input.drivingLicenceNumber || '').trim()) {
    errors.push('Driving Licence (DL) number is mandatory for all Driver & Rider roles.');
  }
  if (category === 'auto_taxi' && !(input.commercialPermitNumber || '').trim()) {
    errors.push('Commercial Permit number is mandatory for Auto / Taxi drivers.');
  }

  return {
    valid: errors.length === 0,
    errors,
    aadhaarMasked: masked || undefined,
  };
}

/**
 * Selects active, non-suspended replacement candidates from the workforce directory
 * for a given staffing booking (excluding the current primary worker).
 */
export function selectEligibleReplacements(
  workforce: WorkforceMember[],
  booking: Pick<StaffingBooking, 'workerId' | 'mode' | 'isOutstationOrLiveIn'>
): WorkforceMember[] {
  return workforce.filter((w) => {
    if (w.id === booking.workerId) return false;
    if (w.availabilityStatus === 'suspended' || w.availabilityStatus === 'on_leave') return false;
    if (booking.mode === 'company_managed_staffing' && w.mode !== 'company_managed_staffing') {
      return false;
    }
    if (booking.isOutstationOrLiveIn && !w.outstationAvailable && !w.liveInAvailable) {
      return false;
    }
    return true;
  });
}

/**
 * Validates Outstation & Live-In worker welfare safeguard checkboxes.
 */
export function validateOutstationSafeguards(params: {
  isOutstationOrLiveIn: boolean;
  accommodationProvided: boolean;
  foodProvided: boolean;
  travelCovered: boolean;
}): { valid: boolean; error?: string } {
  if (!params.isOutstationOrLiveIn) {
    return { valid: true };
  }
  if (!params.accommodationProvided || !params.foodProvided || !params.travelCovered) {
    return {
      valid: false,
      error:
        'Outstation & Live-In protocol mandates checking Accommodation, Food, and Travel coverage before booking.',
    };
  }
  return { valid: true };
}

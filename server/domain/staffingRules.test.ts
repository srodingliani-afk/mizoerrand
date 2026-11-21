import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateManagedPayrollSplit,
  maskAadhaarLast4,
  selectEligibleReplacements,
  validateOnboardingApplication,
  validateOutstationSafeguards,
} from './staffingRules';
import type { WorkforceMember } from '../../src/shared/types';

test('calculateManagedPayrollSplit preserves package sum and clamps platform fee', () => {
  const standard = calculateManagedPayrollSplit(14500);
  assert.equal(standard.monthlyPackage, 14500);
  assert.equal(standard.platformMgmtFee + standard.netSalaryDisbursed, 14500);
  assert.ok(standard.platformMgmtFee >= 1000 && standard.platformMgmtFee <= 2500);

  const highPackage = calculateManagedPayrollSplit(35000);
  assert.equal(highPackage.platformMgmtFee, 2500);
  assert.equal(highPackage.netSalaryDisbursed, 32500);

  const lowPackage = calculateManagedPayrollSplit(7000);
  assert.equal(lowPackage.platformMgmtFee, 1000);
  assert.equal(lowPackage.netSalaryDisbursed, 6000);
});

test('maskAadhaarLast4 retains only last 4 digits and rejects short inputs', () => {
  assert.equal(maskAadhaarLast4('4821'), 'XXXX-XXXX-4821');
  assert.equal(maskAadhaarLast4('1234 5678 9012'), 'XXXX-XXXX-9012');
  assert.equal(maskAadhaarLast4('12'), null);
});

test('validateOnboardingApplication enforces required KYC fields and driver DL/Permit', () => {
  const missingFields = validateOnboardingApplication({
    applicantName: 'A',
    phone: '123',
    targetCategory: 'staff',
    district: 'Aizawl',
    veng: '',
    aadhaarLast4: '12',
    voterIdNumber: '',
    ymaVcReference: '',
    resumeSummary: 'short',
  });
  assert.equal(missingFields.valid, false);
  assert.ok(missingFields.errors.length >= 5);

  const validAwmpui = validateOnboardingApplication({
    applicantName: 'Lalrinmawii Sailo',
    phone: '9862011223',
    targetCategory: 'staff',
    staffMode: 'company_managed_staffing',
    roleTitle: 'Awmpui & Elderly Caregiver',
    district: 'Aizawl',
    veng: 'Khatla',
    aadhaarLast4: '7741',
    voterIdNumber: 'MIZ/01/558120',
    ymaVcReference: 'Khatla Branch YMA Secretary',
    resumeSummary: '3 years full-time housekeeping and child care in Aizawl',
  });
  assert.equal(validAwmpui.valid, true);
  assert.equal(validAwmpui.aadhaarMasked, 'XXXX-XXXX-7741');

  const driverWithoutDl = validateOnboardingApplication({
    applicantName: 'Hmingthansanga Pachuau',
    phone: '9862099881',
    targetCategory: 'staff',
    roleTitle: 'Personal Family Driver',
    district: 'Aizawl',
    veng: 'Zarkawt',
    aadhaarLast4: '9912',
    voterIdNumber: 'MIZ/01/771209',
    ymaVcReference: 'Zarkawt VC Chairman',
    resumeSummary: '8 years hill road SUV & school run driving',
  });
  assert.equal(driverWithoutDl.valid, false);
  assert.ok(driverWithoutDl.errors.some((e) => /Driving Licence/i.test(e)));

  const taxiWithoutPermit = validateOnboardingApplication({
    applicantName: 'Lalrinfela',
    phone: '9436112233',
    targetCategory: 'auto_taxi',
    district: 'Aizawl',
    veng: 'Dawrpui',
    aadhaarLast4: '3321',
    voterIdNumber: 'MIZ/01/332100',
    drivingLicenceNumber: 'MZ01-2020001122',
    ymaVcReference: 'Dawrpui Branch YMA',
    resumeSummary: '5 years commercial local taxi driving',
  });
  assert.equal(taxiWithoutPermit.valid, false);
  assert.ok(taxiWithoutPermit.errors.some((e) => /Commercial Permit/i.test(e)));
});

test('selectEligibleReplacements excludes current, suspended, on_leave, and incompatible mode workers', () => {
  const sampleWorkforce: WorkforceMember[] = [
    {
      id: 'w1',
      name: 'Primary',
      mode: 'company_managed_staffing',
      roleTitle: 'Awmpui',
      roleTitleMiz: 'Awmpui',
      skills: [],
      veng: 'Khatla',
      practicalSkillScore: 95,
      groomingTrainingStatus: 'Certified',
      outstationAvailable: true,
      liveInAvailable: true,
      replacementGuarantee: true,
      availabilityStatus: 'active',
      avatarUrl: '',
      portfolioUrls: [],
      rating: 4.9,
    },
    {
      id: 'w2',
      name: 'Active Managed Backup',
      mode: 'company_managed_staffing',
      roleTitle: 'Awmpui',
      roleTitleMiz: 'Awmpui',
      skills: [],
      veng: 'Zarkawt',
      practicalSkillScore: 92,
      groomingTrainingStatus: 'Certified',
      outstationAvailable: true,
      liveInAvailable: true,
      replacementGuarantee: true,
      availabilityStatus: 'active',
      avatarUrl: '',
      portfolioUrls: [],
      rating: 4.8,
    },
    {
      id: 'w3',
      name: 'Suspended Managed',
      mode: 'company_managed_staffing',
      roleTitle: 'Awmpui',
      roleTitleMiz: 'Awmpui',
      skills: [],
      veng: 'Bawngkawn',
      practicalSkillScore: 88,
      groomingTrainingStatus: 'Certified',
      outstationAvailable: true,
      liveInAvailable: true,
      replacementGuarantee: true,
      availabilityStatus: 'suspended',
      avatarUrl: '',
      portfolioUrls: [],
      rating: 4.5,
    },
    {
      id: 'w4',
      name: 'On Demand Daily',
      mode: 'on_demand_workforce',
      roleTitle: 'Gardener',
      roleTitleMiz: 'Gardener',
      skills: [],
      veng: 'Vaivakawn',
      practicalSkillScore: 90,
      groomingTrainingStatus: 'Certified',
      outstationAvailable: true,
      liveInAvailable: false,
      replacementGuarantee: false,
      availabilityStatus: 'active',
      avatarUrl: '',
      portfolioUrls: [],
      rating: 4.7,
    },
  ];

  const eligible = selectEligibleReplacements(sampleWorkforce, {
    workerId: 'w1',
    mode: 'company_managed_staffing',
    isOutstationOrLiveIn: true,
  });
  assert.deepEqual(
    eligible.map((w) => w.id),
    ['w2']
  );
});

test('validateOutstationSafeguards blocks live-in bookings missing any welfare safeguard', () => {
  assert.equal(
    validateOutstationSafeguards({
      isOutstationOrLiveIn: false,
      accommodationProvided: false,
      foodProvided: false,
      travelCovered: false,
    }).valid,
    true
  );
  assert.equal(
    validateOutstationSafeguards({
      isOutstationOrLiveIn: true,
      accommodationProvided: true,
      foodProvided: true,
      travelCovered: false,
    }).valid,
    false
  );
  assert.equal(
    validateOutstationSafeguards({
      isOutstationOrLiveIn: true,
      accommodationProvided: true,
      foodProvided: true,
      travelCovered: true,
    }).valid,
    true
  );
});

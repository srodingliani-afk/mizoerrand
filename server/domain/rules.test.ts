import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAllInclusiveFare,
  calculateEscrowSplit,
  distanceToRouteCorridorMeters,
  evaluateSduiServiceVisibility,
  filterJobsForPartner,
  isPointWithinRouteCorridor,
  validateCheckBeforePayReturn,
} from './rules';
import type { AppRemoteConfig, ErrandRequest, PartnerProfile } from '../../src/shared/types';

const baseConfig: AppRemoteConfig = {
  appName: 'ZoRun',
  region: 'ap-south-1',
  sundayEmergencyMode: false,
  rainSurgeMultiplier: 1.0,
  trafficSurgeMultiplier: 1.0,
  baseWalkerRate: 40,
  baseBikeRate: 50,
  baseAutoTaxiRate: 90,
  basePickupRate: 350,
  returnDeliveryFee: 45,
  monthlyReturnLimit: 3,
  codCashLimitRs: 2500,
  microInsuranceSachetRs: 3,
  visibleServices: {
    errands: true,
    marketplace: true,
    workforce: true,
    managedStaffing: true,
    emergency24x7: true,
  },
  announcementEn: 'Live across Aizawl',
  announcementMiz: 'Aizawl pumah hman theih',
  updatedAt: new Date().toISOString(),
};

const walkerPartner: PartnerProfile = {
  id: 'p-walker',
  name: 'Lalrinawma',
  phone: '+919436100001',
  veng: 'Dawrpui',
  category: 'walker',
  online: true,
  lat: 23.7271,
  lng: 92.7176,
  rating: 4.9,
  completedJobs: 120,
  badges: ['Police Verified - Green Shield'],
  commercialPermitVerified: false,
  policeVerified: true,
  securityDepositVerified: true,
  codCashHeld: 500,
  walletBalance: 1200,
  lastHeartbeatAt: new Date().toISOString(),
};

const bikePartner: PartnerProfile = {
  ...walkerPartner,
  id: 'p-bike',
  name: 'Zothana',
  category: 'bike',
};

const unpermittedAutoPartner: PartnerProfile = {
  ...walkerPartner,
  id: 'p-auto-unverified',
  name: 'Mawia',
  category: 'auto_taxi',
  commercialPermitVerified: false,
};

const stepDeliveryJob: ErrandRequest = {
  id: 'j-step-1',
  customerId: 'c1',
  customerName: 'Malsawmi',
  title: 'Deliver medicines down 140 steps in Mission Veng',
  jobType: 'step_delivery',
  origin: { lat: 23.7271, lng: 92.7176, label: 'Dawrpui' },
  stops: [],
  destination: { lat: 23.7195, lng: 92.7152, label: 'Mission Veng' },
  distanceKm: 0.9,
  accessType: 'long_steps_walk',
  needsWalkerHelper: false,
  declaredValue: 650,
  paymentMethod: 'upi_escrow',
  microInsuranceOptIn: true,
  microInsuranceFee: 3,
  allInclusiveTotal: 61,
  advanceTokenAmount: 0,
  advanceTokenPaid: false,
  requiresPoliceVerifiedPartner: false,
  otpCode: '4821',
  status: 'bidding',
  bids: [],
  createdAt: new Date().toISOString(),
};

const bikeJob: ErrandRequest = {
  ...stepDeliveryJob,
  id: 'j-bike-1',
  title: 'Express document from Chanmari to Khatla',
  jobType: 'bike_express',
  distanceKm: 3.4,
  accessType: 'vehicle_accessible',
};

const autoJob: ErrandRequest = {
  ...stepDeliveryJob,
  id: 'j-auto-1',
  title: 'Airport taxi drop to Lengpui road',
  jobType: 'auto_cab_ride',
  distanceKm: 4.5,
  accessType: 'vehicle_accessible',
};

test('Strict Vehicle & Role Separation excludes vehicles from walker-only step errands', () => {
  const jobs = [stepDeliveryJob, bikeJob, autoJob];
  const walkerFeed = filterJobsForPartner(walkerPartner, jobs);
  const bikeFeed = filterJobsForPartner(bikePartner, jobs);
  const autoFeed = filterJobsForPartner(unpermittedAutoPartner, jobs);

  assert.deepEqual(walkerFeed.map((j) => j.id), ['j-step-1']);
  assert.deepEqual(bikeFeed.map((j) => j.id), ['j-bike-1']);
  assert.equal(autoFeed.length, 0, 'Unpermitted auto/taxi must not receive auto_cab_ride');
});

test('COD Rs. 2,500 limit blocks new COD jobs while allowing UPI escrow jobs', () => {
  const cappedPartner: PartnerProfile = { ...bikePartner, codCashHeld: 2500 };
  const codBikeJob: ErrandRequest = { ...bikeJob, paymentMethod: 'dynamic_qr_cod' };
  const feed = filterJobsForPartner(cappedPartner, [codBikeJob, bikeJob], 2500);
  assert.deepEqual(feed.map((j) => j.id), ['j-bike-1']);
});

test('PostGIS ST_DWithin 500m corridor matcher detects partners on route and rejects distant partners', () => {
  const route = [
    { lat: 23.7365, lng: 92.719 }, // Chanmari
    { lat: 23.7271, lng: 92.7176 }, // Dawrpui
  ];
  const nearPartner = { lat: 23.7318, lng: 92.7185 }; // ~50m off straight corridor
  const farPartner = { lat: 23.7318, lng: 92.735 }; // >1500m east

  assert.equal(isPointWithinRouteCorridor(nearPartner, route, 500), true);
  assert.equal(isPointWithinRouteCorridor(farPartner, route, 500), false);
  assert.ok(distanceToRouteCorridorMeters(nearPartner, route) < 200);
});

test('Check-Before-Pay enforces hygiene exclusions, monthly return cap, and Rs. 40-50 return fee', () => {
  const hygieneReject = validateCheckBeforePayReturn({
    hygieneCategory: 'innerwear',
    userReturnsThisMonth: 0,
    monthlyReturnLimit: 3,
    returnDeliveryFee: 45,
    action: 'reject',
  });
  assert.equal(hygieneReject.allowed, false);
  assert.equal(hygieneReject.canOpenBox, false);

  const validReject = validateCheckBeforePayReturn({
    hygieneCategory: 'standard',
    userReturnsThisMonth: 1,
    monthlyReturnLimit: 3,
    returnDeliveryFee: 45,
    action: 'reject',
  });
  assert.equal(validReject.allowed, true);
  assert.equal(validReject.returnFeeCharged, 45);

  const cappedReject = validateCheckBeforePayReturn({
    hygieneCategory: 'standard',
    userReturnsThisMonth: 3,
    monthlyReturnLimit: 3,
    returnDeliveryFee: 45,
    action: 'reject',
  });
  assert.equal(cappedReject.allowed, false);
});

test('All-inclusive pricing & Escrow GST split enforces >1000 advance token & >5000 police verified gate', () => {
  const fare = calculateAllInclusiveFare({
    category: 'bike',
    distanceKm: 4,
    stopsCount: 1,
    needsWalkerHelper: false,
    microInsuranceOptIn: true,
    config: baseConfig,
  });
  assert.equal(fare.microInsuranceFee, 3);
  assert.ok(fare.allInclusiveTotal > 100);

  const split = calculateEscrowSplit({
    grossAllInclusive: 1500,
    productAmount: 1200,
    microInsuranceSachet: 3,
    declaredValue: 5500,
  });
  assert.equal(split.advanceTokenRequired, 300); // 20% of 1500
  assert.equal(split.requiresPoliceVerified, true);
  assert.equal(
    split.gstAmount + split.platformCommission + split.partnerPayout + split.merchantSettlement + split.microInsuranceSachet,
    1500
  );
});

test('SDUI Sunday Emergency Mode restricts retail marketplace while keeping 24x7 Emergency active', () => {
  const sundayConfig = { ...baseConfig, sundayEmergencyMode: true };
  const vis = evaluateSduiServiceVisibility(sundayConfig);
  assert.equal(vis.marketplace, false);
  assert.equal(vis.emergency24x7, true);
  assert.equal(vis.sundayRestrictionActive, true);
});

test('District separation scopes local jobs to their District Capital while allowing inter-district cargo', () => {
  const aizawlWalker: PartnerProfile = { ...walkerPartner, district: 'Aizawl' };
  const lungleiWalker: PartnerProfile = {
    ...walkerPartner,
    id: 'p-lunglei-w',
    name: 'Lalsanga Lunglei',
    district: 'Lunglei',
    veng: 'Bazar Veng (Lunglei)',
    lat: 22.8886,
    lng: 92.7393,
  };
  const lungleiPickup: PartnerProfile = {
    ...lungleiWalker,
    id: 'p-lunglei-p',
    category: 'pickup_truck',
    commercialPermitVerified: true,
  };

  const lungleiStepJob: ErrandRequest = {
    ...stepDeliveryJob,
    id: 'j-lng-1',
    district: 'Lunglei',
    origin: { lat: 22.8886, lng: 92.7393, label: 'Lunglei Bazar Veng' },
    destination: { lat: 22.8935, lng: 92.7428, label: 'Lunglei Chanmari' },
  };
  const interDistrictCargo: ErrandRequest = {
    ...stepDeliveryJob,
    id: 'j-inter-1',
    district: 'Aizawl',
    isInterDistrict: true,
    jobType: 'heavy_cargo_shift',
    accessType: 'vehicle_accessible',
    distanceKm: 165,
  };

  assert.equal(filterJobsForPartner(aizawlWalker, [lungleiStepJob]).length, 0);
  assert.deepEqual(
    filterJobsForPartner(lungleiWalker, [lungleiStepJob]).map((j) => j.id),
    ['j-lng-1']
  );
  assert.deepEqual(
    filterJobsForPartner(lungleiPickup, [interDistrictCargo]).map((j) => j.id),
    ['j-inter-1']
  );
});

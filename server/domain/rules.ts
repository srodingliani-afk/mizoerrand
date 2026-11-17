import type {
  AppRemoteConfig,
  ErrandJobType,
  ErrandRequest,
  HygieneCategory,
  LatLng,
  PartnerCategory,
  PartnerProfile,
} from '../../src/shared/types';

const EARTH_RADIUS_METERS = 6371000;

export function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineDistanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * PostGIS ST_DWithin equivalent for a point against a multi-segment polyline corridor.
 * Uses local equirectangular tangent-plane projection (accurate at Aizawl city scale).
 */
export function pointToSegmentDistanceMeters(
  point: LatLng,
  segStart: LatLng,
  segEnd: LatLng
): number {
  const latScale = 111320;
  const lngScale = 111320 * Math.cos(toRadians((segStart.lat + segEnd.lat) / 2));

  const px = (point.lng - segStart.lng) * lngScale;
  const py = (point.lat - segStart.lat) * latScale;
  const vx = (segEnd.lng - segStart.lng) * lngScale;
  const vy = (segEnd.lat - segStart.lat) * latScale;

  const segLenSq = vx * vx + vy * vy;
  if (segLenSq === 0) {
    return Math.hypot(px, py);
  }
  const t = Math.max(0, Math.min(1, (px * vx + py * vy) / segLenSq));
  const projX = t * vx;
  const projY = t * vy;
  return Math.hypot(px - projX, py - projY);
}

export function distanceToRouteCorridorMeters(
  partnerPos: LatLng,
  routeWaypoints: LatLng[]
): number {
  if (routeWaypoints.length === 0) return Infinity;
  if (routeWaypoints.length === 1) {
    return haversineDistanceMeters(partnerPos, routeWaypoints[0]);
  }
  let minMeters = Infinity;
  for (let i = 0; i < routeWaypoints.length - 1; i++) {
    const d = pointToSegmentDistanceMeters(partnerPos, routeWaypoints[i], routeWaypoints[i + 1]);
    if (d < minMeters) minMeters = d;
  }
  return Math.round(minMeters);
}

export function isPointWithinRouteCorridor(
  partnerPos: LatLng,
  routeWaypoints: LatLng[],
  corridorRadiusMeters = 500
): boolean {
  return distanceToRouteCorridorMeters(partnerPos, routeWaypoints) <= corridorRadiusMeters;
}

const WALKER_EXCLUSIVE_JOB_TYPES: ReadonlySet<ErrandJobType> = new Set([
  'hyperlocal_errand',
  'step_delivery',
  'queue_standing',
  'truck_helper',
]);

/**
 * STRICT VEHICLE & ROLE SEPARATION RULE:
 * - Category A (`walker` - On-Foot Tirhkah): EXCLUSIVE access to <1.5km hyperlocal errands,
 *   steep/long step deliveries (`long_steps_walk`), queue standing, and pickup/truck helper slots.
 *   Vehicles (`bike`, `auto_taxi`, `pickup_truck`) MUST NEVER receive walker-exclusive offers.
 * - Category B (`bike`): Fast light deliveries (`bike_express`) on vehicle-accessible routes.
 * - Category C (`auto_taxi`): Commercial permit verified (`commercialPermitVerified === true`) only.
 * - Category D (`pickup_truck`): Heavy cargo shifts (`heavy_cargo_shift`), optionally paired with walker helper.
 */
export function isPartnerEligibleForJob(
  partner: PartnerProfile,
  job: Pick<
    ErrandRequest,
    | 'district'
    | 'isInterDistrict'
    | 'jobType'
    | 'distanceKm'
    | 'accessType'
    | 'needsWalkerHelper'
    | 'declaredValue'
    | 'paymentMethod'
    | 'allInclusiveTotal'
  >,
  codLimitRs = 2500
): { eligible: boolean; reason?: string } {
  if (!partner.online) {
    return { eligible: false, reason: 'Partner is offline' };
  }

  if (
    job.district &&
    partner.district &&
    !job.isInterDistrict &&
    job.district !== partner.district
  ) {
    return {
      eligible: false,
      reason: `Job belongs to ${job.district} district hub`,
    };
  }

  // COD Rs. 2,500 cash held block
  if (job.paymentMethod === 'dynamic_qr_cod' && partner.codCashHeld >= codLimitRs) {
    return {
      eligible: false,
      reason: `COD cash held (Rs. ${partner.codCashHeld}) reached Rs. ${codLimitRs} limit until UPI deposit`,
    };
  }

  // High-value item (> Rs. 5,000) safeguard
  if (
    job.declaredValue > 5000 &&
    (!partner.policeVerified || !partner.securityDepositVerified)
  ) {
    return {
      eligible: false,
      reason: 'Orders > Rs. 5,000 require Police Verified + Security Deposit partner',
    };
  }

  const isWalkerExclusive =
    WALKER_EXCLUSIVE_JOB_TYPES.has(job.jobType) ||
    job.accessType === 'long_steps_walk' ||
    (job.jobType === 'hyperlocal_errand' && job.distanceKm < 1.5);

  if (partner.category === 'walker') {
    if (isWalkerExclusive) {
      return { eligible: true };
    }
    if (job.jobType === 'heavy_cargo_shift' && job.needsWalkerHelper) {
      return { eligible: true };
    }
    return { eligible: false, reason: 'Motorized vehicle required for this route' };
  }

  // Vehicles (B, C, D) MUST NOT receive walker-exclusive jobs
  if (isWalkerExclusive) {
    return {
      eligible: false,
      reason: 'Walker-exclusive errand (<1.5km / long steps / queue / helper)',
    };
  }

  if (partner.category === 'bike') {
    return job.jobType === 'bike_express'
      ? { eligible: true }
      : { eligible: false, reason: 'Job requires Auto/Cab or Pickup Truck' };
  }

  if (partner.category === 'auto_taxi') {
    if (!partner.commercialPermitVerified) {
      return {
        eligible: false,
        reason: 'Commercial permit verification required for Auto/Cab',
      };
    }
    return job.jobType === 'auto_cab_ride'
      ? { eligible: true }
      : { eligible: false, reason: 'Job tier mismatch for Auto/Cab' };
  }

  if (partner.category === 'pickup_truck') {
    return job.jobType === 'heavy_cargo_shift'
      ? { eligible: true }
      : { eligible: false, reason: 'Heavy cargo tier only' };
  }

  return { eligible: false, reason: 'Unknown partner category' };
}

export function filterJobsForPartner(
  partner: PartnerProfile,
  jobs: ErrandRequest[],
  codLimitRs = 2500
): ErrandRequest[] {
  return jobs.filter((job) => isPartnerEligibleForJob(partner, job, codLimitRs).eligible);
}

const NON_RETURNABLE_HYGIENE: ReadonlySet<HygieneCategory> = new Set([
  'innerwear',
  'opened_cosmetics',
  'perishable_food',
]);

export function validateCheckBeforePayReturn(params: {
  hygieneCategory: HygieneCategory;
  userReturnsThisMonth: number;
  monthlyReturnLimit: number;
  returnDeliveryFee: number;
  action: 'accept' | 'reject';
}): {
  allowed: boolean;
  canOpenBox: boolean;
  returnFeeCharged: number;
  reason?: string;
} {
  const canOpenBox = !NON_RETURNABLE_HYGIENE.has(params.hygieneCategory);

  if (params.action === 'accept') {
    return {
      allowed: true,
      canOpenBox,
      returnFeeCharged: 0,
    };
  }

  if (!canOpenBox) {
    return {
      allowed: false,
      canOpenBox: false,
      returnFeeCharged: 0,
      reason: `Hygiene exclusion: ${params.hygieneCategory.replace('_', ' ')} cannot be opened or returned`,
    };
  }

  if (params.userReturnsThisMonth >= params.monthlyReturnLimit) {
    return {
      allowed: false,
      canOpenBox: true,
      returnFeeCharged: 0,
      reason: `Monthly return limit (${params.monthlyReturnLimit}) reached for this customer`,
    };
  }

  const clampedFee = Math.max(40, Math.min(50, Math.round(params.returnDeliveryFee)));
  return {
    allowed: true,
    canOpenBox: true,
    returnFeeCharged: clampedFee,
  };
}

export function calculateAllInclusiveFare(params: {
  category: PartnerCategory;
  distanceKm: number;
  stopsCount: number;
  needsWalkerHelper: boolean;
  microInsuranceOptIn: boolean;
  config: AppRemoteConfig;
}): {
  allInclusiveTotal: number;
  microInsuranceFee: number;
  surgeMultiplier: number;
} {
  const baseByCategory: Record<PartnerCategory, number> = {
    walker: params.config.baseWalkerRate,
    bike: params.config.baseBikeRate,
    auto_taxi: params.config.baseAutoTaxiRate,
    pickup_truck: params.config.basePickupRate,
  };

  const perKm: Record<PartnerCategory, number> = {
    walker: 20,
    bike: 18,
    auto_taxi: 30,
    pickup_truck: 55,
  };

  const surgeMultiplier =
    Math.round(
      params.config.rainSurgeMultiplier * params.config.trafficSurgeMultiplier * 100
    ) / 100;

  const rawTrip =
    (baseByCategory[params.category] +
      Math.max(0.5, params.distanceKm) * perKm[params.category] +
      params.stopsCount * 25 +
      (params.needsWalkerHelper ? 120 : 0)) *
    surgeMultiplier;

  const microInsuranceFee = params.microInsuranceOptIn
    ? Math.max(1, Math.min(5, params.config.microInsuranceSachetRs))
    : 0;

  // Single all-inclusive price shown upfront; GST & platform commission are extracted internally
  const allInclusiveTotal = Math.round(rawTrip + microInsuranceFee);
  return {
    allInclusiveTotal,
    microInsuranceFee,
    surgeMultiplier,
  };
}

export function calculateEscrowSplit(params: {
  grossAllInclusive: number;
  productAmount?: number;
  microInsuranceSachet: number;
  declaredValue: number;
}): {
  grossAllInclusive: number;
  gstAmount: number;
  platformCommission: number;
  microInsuranceSachet: number;
  partnerPayout: number;
  merchantSettlement: number;
  advanceTokenRequired: number;
  requiresPoliceVerified: boolean;
} {
  const productAmount = params.productAmount ?? 0;
  const servicePool = Math.max(0, params.grossAllInclusive - productAmount - params.microInsuranceSachet);

  // Platform commission is 15% of service pool (inclusive of 18% GST on commission)
  const platformGrossFee = Math.round(servicePool * 0.15);
  const gstAmount = Math.round((platformGrossFee * 18) / 118);
  const platformCommission = platformGrossFee - gstAmount;
  const partnerPayout = servicePool - platformGrossFee;
  const merchantSettlement = productAmount;

  const advanceTokenRequired =
    params.grossAllInclusive > 1000 ? Math.round(params.grossAllInclusive * 0.2) : 0;
  const requiresPoliceVerified = params.declaredValue > 5000;

  return {
    grossAllInclusive: params.grossAllInclusive,
    gstAmount,
    platformCommission,
    microInsuranceSachet: params.microInsuranceSachet,
    partnerPayout,
    merchantSettlement,
    advanceTokenRequired,
    requiresPoliceVerified,
  };
}

export function evaluateSduiServiceVisibility(config: AppRemoteConfig): {
  errands: boolean;
  marketplace: boolean;
  workforce: boolean;
  managedStaffing: boolean;
  emergency24x7: boolean;
  sundayRestrictionActive: boolean;
} {
  if (config.sundayEmergencyMode) {
    return {
      errands: config.visibleServices.errands,
      marketplace: false, // Sunday Emergency Mode restricts commercial retail
      workforce: false,
      managedStaffing: config.visibleServices.managedStaffing,
      emergency24x7: true, // Always active in Sunday Emergency Mode
      sundayRestrictionActive: true,
    };
  }
  return {
    ...config.visibleServices,
    sundayRestrictionActive: false,
  };
}

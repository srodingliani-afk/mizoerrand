import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from '../infrastructure/store';
import { liveGpsCache } from '../infrastructure/redisCache';
import { realtimeHub } from '../infrastructure/realtimeHub';
import { isTrustedMediaUrl } from '../infrastructure/driveStorage';
import {
  postEscrowHoldJournal,
  postEscrowSettlementJournal,
} from '../infrastructure/ledgerService';
import {
  calculateAllInclusiveFare,
  calculateEscrowSplit,
  distanceToRouteCorridorMeters,
  filterJobsForPartner,
  haversineDistanceMeters,
  isCustomerBlacklisted,
  isPartnerEligibleForJob,
  isPointWithinRouteCorridor,
} from '../domain/rules';
import { findNearestMizoramVeng } from '../../src/data/mizoramDistricts';
import type {
  AccessType,
  ErrandJobType,
  ErrandRequest,
  KailawnStepTier,
  LatLng,
  MizoramDistrict,
  MizoramLandmarkAddress,
  PartnerCategory,
} from '../../src/shared/types';

const VALID_KAILAWN_TIERS = new Set<KailawnStepTier>([
  'none',
  'steps_0_15',
  'steps_15_40',
  'steps_40_plus',
]);

const MIZORAM_DISTRICTS_ENUM = [
  'Aizawl',
  'Lunglei',
  'Champhai',
  'Serchhip',
  'Kolasib',
  'Lawngtlai',
  'Mamit',
  'Siaha',
  'Saitual',
  'Khawzawl',
  'Hnahthial',
] as const;

const latLngSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  label: z.string().trim().max(160).optional(),
});

const landmarkSchema = z
  .object({
    veng: z.string().trim().max(80),
    ymaSection: z.string().trim().max(60).optional(),
    nearestLandmark: z.string().trim().max(120).optional(),
    gpsPinned: z.boolean().optional(),
  })
  .optional();

const estimateFareSchema = z.object({
  jobType: z.enum([
    'hyperlocal_errand',
    'step_delivery',
    'queue_standing',
    'truck_helper',
    'bike_express',
    'auto_cab_ride',
    'heavy_cargo_shift',
  ]),
  origin: latLngSchema,
  stops: z.array(latLngSchema).max(6).optional().default([]),
  destination: latLngSchema,
  district: z.enum(MIZORAM_DISTRICTS_ENUM).optional().default('Aizawl'),
  isInterDistrict: z.boolean().optional().default(false),
  needsWalkerHelper: z.boolean().optional().default(false),
  kailawnNeeded: z.boolean().optional().default(false),
  kailawnStepTier: z.enum(['none', 'steps_0_15', 'steps_15_40', 'steps_40_plus']).optional().default('none'),
  microInsuranceOptIn: z.boolean().optional().default(false),
});

const createJobSchema = estimateFareSchema.extend({
  customerId: z.string().trim().min(1).max(128).optional().default('cust-1'),
  customerName: z.string().trim().min(1).max(80).optional().default('Lalhriatpuii'),
  title: z.string().trim().min(1).max(160),
  accessType: z.enum(['vehicle_accessible', 'long_steps_walk']),
  pickupLandmark: landmarkSchema,
  dropLandmark: landmarkSchema,
  buildingPhotoUrl: z.string().trim().max(2048).optional(),
  voiceNoteUrl: z.string().trim().max(2048).optional(),
  voiceNoteDurationSec: z.number().finite().min(1).max(15).optional(),
  voiceNoteTranscript: z.string().trim().max(240).optional(),
  declaredValue: z.number().finite().min(0).max(500000).optional().default(500),
  paymentMethod: z.enum(['upi_escrow', 'dynamic_qr_cod']).optional().default('upi_escrow'),
  payWithWallet: z.boolean().optional().default(false),
  microInsuranceOptIn: z.boolean().optional().default(true),
});

const bidSchema = z.object({
  partnerId: z.string().trim().min(1).max(64),
  bidAmount: z.number().finite().min(30).max(100000),
  etaMinutes: z.number().finite().min(1).max(240).optional(),
});

const selectBidSchema = z.object({
  bidId: z.string().trim().min(1).max(64),
});

function sanitizeAudioUrl(url?: string): string | undefined {
  return isTrustedMediaUrl(url, 'audio');
}

function sanitizeLandmark(
  raw?: MizoramLandmarkAddress
): MizoramLandmarkAddress | undefined {
  if (!raw || typeof raw !== 'object' || !raw.veng) return undefined;
  return {
    veng: String(raw.veng).trim().slice(0, 80),
    ymaSection: raw.ymaSection ? String(raw.ymaSection).trim().slice(0, 60) : undefined,
    nearestLandmark: raw.nearestLandmark
      ? String(raw.nearestLandmark).trim().slice(0, 120)
      : undefined,
    gpsPinned: Boolean(raw.gpsPinned),
  };
}

function resolveServerMapsApiKey(): string {
  const candidates = [process.env.GOOGLE_MAPS_API_KEY, process.env.VITE_GOOGLE_MAPS_API_KEY];
  for (const raw of candidates) {
    const trimmed = (raw || '').trim();
    if (
      trimmed.length >= 30 &&
      trimmed.startsWith('AIza') &&
      !/your_|placeholder|example|dummy/i.test(trimmed)
    ) {
      return trimmed;
    }
  }
  return '';
}

function parseProtoDurationSeconds(raw?: string): number {
  if (!raw || typeof raw !== 'string') return 0;
  const match = raw.match(/^([\d.]+)s$/);
  return match ? Number(match[1]) : 0;
}

/**
 * Computes distance and ETA along ordered waypoints using Google Maps Routes API
 * `computeRouteMatrix` (v2), falling back to Mizoram hillside terrain estimate
 * (Haversine * 1.35) when offline or no Maps API key is configured.
 */
async function computeRouteMetrics(
  waypoints: LatLng[],
  category: PartnerCategory
): Promise<{
  distanceKm: number;
  durationMinutes: number;
  distanceSource: 'google_routes_matrix' | 'mizoram_terrain_estimate';
}> {
  const fallbackDistanceMeters = () => {
    let meters = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
      meters += haversineDistanceMeters(waypoints[i], waypoints[i + 1]);
    }
    return meters;
  };

  const apiKey = resolveServerMapsApiKey();
  if (apiKey && waypoints.length >= 2) {
    const travelMode =
      category === 'walker' ? 'WALK' : category === 'bike' ? 'TWO_WHEELER' : 'DRIVE';
    try {
      let totalMeters = 0;
      let totalSeconds = 0;
      let allLegsSucceeded = true;

      for (let i = 0; i < waypoints.length - 1; i++) {
        const originPt = waypoints[i];
        const destPt = waypoints[i + 1];
        const payload: Record<string, unknown> = {
          origins: [
            {
              waypoint: {
                location: { latLng: { latitude: originPt.lat, longitude: originPt.lng } },
              },
            },
          ],
          destinations: [
            {
              waypoint: {
                location: { latLng: { latitude: destPt.lat, longitude: destPt.lng } },
              },
            },
          ],
          travelMode,
        };
        if (travelMode === 'DRIVE' || travelMode === 'TWO_WHEELER') {
          payload.routingPreference = 'TRAFFIC_AWARE';
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);
        const res = await fetch(
          'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': apiKey,
              'X-Goog-FieldMask':
                'originIndex,destinationIndex,duration,distanceMeters,status,condition',
              'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          }
        );
        clearTimeout(timeout);

        if (!res.ok) {
          allLegsSucceeded = false;
          break;
        }
        const elements = (await res.json()) as Array<{
          distanceMeters?: number;
          duration?: string;
          condition?: string;
        }>;
        const first = Array.isArray(elements) ? elements[0] : undefined;
        if (!first || first.condition !== 'ROUTE_EXISTS' || typeof first.distanceMeters !== 'number') {
          allLegsSucceeded = false;
          break;
        }
        totalMeters += first.distanceMeters;
        totalSeconds += parseProtoDurationSeconds(first.duration);
      }

      if (allLegsSucceeded && totalMeters > 0) {
        return {
          distanceKm: Math.max(0.4, Math.round((totalMeters / 1000) * 10) / 10),
          durationMinutes: Math.max(3, Math.round(totalSeconds / 60)),
          distanceSource: 'google_routes_matrix',
        };
      }
    } catch {
      // Fall back cleanly to terrain Haversine curve
    }
  }

  const meters = fallbackDistanceMeters();
  const distanceKm = Math.max(0.4, Math.round((meters / 1000) * 1.35 * 10) / 10);
  const speedKmh = category === 'walker' ? 4.2 : category === 'bike' ? 24 : 20;
  const durationMinutes = Math.max(4, Math.round((distanceKm / speedKmh) * 60));
  return {
    distanceKm,
    durationMinutes,
    distanceSource: 'mizoram_terrain_estimate',
  };
}

export const errandFleetRouter = Router();

const TIER_FOR_JOB_TYPE: Record<ErrandJobType, PartnerCategory> = {
  hyperlocal_errand: 'walker',
  step_delivery: 'walker',
  queue_standing: 'walker',
  truck_helper: 'walker',
  bike_express: 'bike',
  auto_cab_ride: 'auto_taxi',
  heavy_cargo_shift: 'pickup_truck',
};

errandFleetRouter.get('/partners', (_req, res) => {
  const state = db.get();
  const cachedCoords = liveGpsCache.getAllActiveCoordinates();
  const coordMap: Record<string, { lat: number; lng: number; online: boolean }> = {};
  for (const c of cachedCoords) {
    coordMap[c.partnerId] = { lat: c.lat, lng: c.lng, online: c.online };
  }
  const partners = state.partners.map((p) => {
    const live = coordMap[p.id];
    return live ? { ...p, lat: live.lat, lng: live.lng, online: live.online } : p;
  });
  res.json({ partners });
});

errandFleetRouter.post('/partners/:id/heartbeat', (req, res) => {
  const { id } = req.params;
  const { lat, lng, online } = req.body as { lat?: number; lng?: number; online?: boolean };
  const state = db.get();
  const partner = state.partners.find((p) => p.id === id);
  if (!partner) {
    res.status(404).json({ error: 'Partner not found' });
    return;
  }
  if (typeof lat === 'number' && Number.isFinite(lat)) partner.lat = lat;
  if (typeof lng === 'number' && Number.isFinite(lng)) partner.lng = lng;
  if (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    const nearest = findNearestMizoramVeng(lat, lng, partner.district);
    if (nearest.isWithinMizoramBounds) {
      partner.veng = nearest.veng.name;
      partner.district = nearest.veng.district;
    }
  }
  if (typeof online === 'boolean') partner.online = online;
  partner.lastHeartbeatAt = new Date().toISOString();

  liveGpsCache.setPartnerLocation(partner.id, partner.lat, partner.lng, partner.online);
  db.commit();
  realtimeHub.broadcast('errand_update', { partnerUpdated: partner.id });
  res.json({ partner });
});

errandFleetRouter.get('/jobs', (req, res) => {
  const state = db.get();
  const partnerId = typeof req.query.partnerId === 'string' ? req.query.partnerId : undefined;
  if (partnerId) {
    const partner = state.partners.find((p) => p.id === partnerId);
    if (!partner) {
      res.status(404).json({ error: 'Partner not found' });
      return;
    }
    const filtered = filterJobsForPartner(
      partner,
      state.errands,
      state.remoteConfig.codCashLimitRs,
      state.plugins
    ).map((job) => ({
      ...job,
      // Mask customer handover OTP in Partner API responses so partners must verify at customer's doorstep
      otpCode: '••••',
    }));
    res.json({ jobs: filtered, strictFilterApplied: true, partnerCategory: partner.category });
    return;
  }
  res.json({ jobs: state.errands });
});

async function handleFareEstimate(req: Request, res: Response): Promise<void> {
  const parsed = estimateFareSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message || 'jobType, origin, and destination are required',
    });
    return;
  }

  const {
    jobType,
    origin,
    stops,
    destination,
    district,
    isInterDistrict,
    needsWalkerHelper,
    kailawnNeeded,
    kailawnStepTier,
    microInsuranceOptIn,
  } = parsed.data;

  const safeTier: KailawnStepTier = VALID_KAILAWN_TIERS.has(kailawnStepTier)
    ? kailawnStepTier
    : 'none';
  const waypoints = [origin, ...stops, destination];
  const tier = TIER_FOR_JOB_TYPE[jobType];
  const metrics = await computeRouteMetrics(waypoints, tier);
  const state = db.get();

  const fare = calculateAllInclusiveFare({
    category: tier,
    jobType,
    distanceKm: metrics.distanceKm,
    stopsCount: stops.length,
    needsWalkerHelper,
    kailawnNeeded: Boolean(kailawnNeeded),
    kailawnStepTier: safeTier,
    microInsuranceOptIn,
    config: state.remoteConfig,
  });

  const corridorMatches = state.partners
    .filter(
      (p) =>
        p.online &&
        p.category === tier &&
        (isInterDistrict || !p.district || p.district === (district as MizoramDistrict))
    )
    .map((p) => ({
      partnerId: p.id,
      name: p.name,
      corridorMeters: distanceToRouteCorridorMeters({ lat: p.lat, lng: p.lng }, waypoints),
      within500m: isPointWithinRouteCorridor({ lat: p.lat, lng: p.lng }, waypoints, 500),
    }));

  res.json({
    distanceKm: metrics.distanceKm,
    durationMinutes: metrics.durationMinutes,
    distanceSource: metrics.distanceSource,
    tier,
    ...fare,
    corridorMatches,
  });
}

errandFleetRouter.post('/estimate', (req, res) => {
  void handleFareEstimate(req, res);
});

errandFleetRouter.post('/fare', (req, res) => {
  void handleFareEstimate(req, res);
});

errandFleetRouter.post('/jobs', async (req, res) => {
  const parsed = createJobSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({
      error:
        parsed.error.issues[0]?.message ||
        'Title, job type, terrain access tag, origin, and destination are required.',
    });
    return;
  }

  const state = db.get();
  const {
    customerId,
    customerName,
    district,
    isInterDistrict,
    title,
    jobType,
    origin,
    stops,
    destination,
    accessType,
    kailawnNeeded,
    kailawnStepTier,
    pickupLandmark,
    dropLandmark,
    needsWalkerHelper,
    buildingPhotoUrl,
    voiceNoteUrl,
    voiceNoteDurationSec,
    voiceNoteTranscript,
    declaredValue,
    paymentMethod,
    payWithWallet,
    microInsuranceOptIn,
  } = parsed.data;

  if (isCustomerBlacklisted(state.blacklistedCustomers, customerId, customerName)) {
    res.status(403).json({
      error: 'Account suspended due to repeated prank bookings or fake emergency alerts.',
    });
    return;
  }

  const safeKailawnTier: KailawnStepTier = VALID_KAILAWN_TIERS.has(kailawnStepTier)
    ? kailawnStepTier
    : 'none';
  const effectiveAccessType: AccessType =
    kailawnNeeded && safeKailawnTier === 'steps_40_plus' ? 'long_steps_walk' : accessType;

  const waypoints = [origin, ...stops, destination];
  const tier = TIER_FOR_JOB_TYPE[jobType];
  const metrics = await computeRouteMetrics(waypoints, tier);

  const fare = calculateAllInclusiveFare({
    category: tier,
    jobType,
    distanceKm: metrics.distanceKm,
    stopsCount: stops.length,
    needsWalkerHelper,
    kailawnNeeded: Boolean(kailawnNeeded),
    kailawnStepTier: safeKailawnTier,
    microInsuranceOptIn,
    config: state.remoteConfig,
  });

  const advanceTokenAmount =
    fare.allInclusiveTotal > 1000 ? Math.round(fare.allInclusiveTotal * 0.2) : 0;

  if (payWithWallet && paymentMethod === 'upi_escrow') {
    if (state.customerWallet.balanceRs < fare.allInclusiveTotal) {
      res.status(400).json({
        error: `Insufficient ZoRûn Wallet balance (₹${state.customerWallet.balanceRs}) for ₹${fare.allInclusiveTotal} errand.`,
      });
      return;
    }
    state.customerWallet.balanceRs -= fare.allInclusiveTotal;
    state.customerWallet.loyaltyPoints += Math.max(5, Math.round(fare.allInclusiveTotal / 35));
    state.customerWallet.transactions.unshift({
      id: `wtx-${Date.now()}`,
      type: 'parcel_payment',
      title: `Errand Booking (${title.slice(0, 48)})`,
      amountRs: -fare.allInclusiveTotal,
      pointsDelta: Math.max(5, Math.round(fare.allInclusiveTotal / 35)),
      createdAt: new Date().toISOString(),
    });
  }

  const cleanVoiceUrl = sanitizeAudioUrl(voiceNoteUrl);
  const cleanVoiceDuration =
    typeof voiceNoteDurationSec === 'number' && Number.isFinite(voiceNoteDurationSec)
      ? Math.max(1, Math.min(15, Math.round(voiceNoteDurationSec)))
      : undefined;

  const job: ErrandRequest = {
    id: `err-${Date.now().toString().slice(-5)}`,
    customerId,
    customerName,
    district,
    isInterDistrict,
    title,
    jobType,
    origin,
    stops,
    destination,
    distanceKm: metrics.distanceKm,
    accessType: effectiveAccessType,
    kailawnNeeded: Boolean(kailawnNeeded),
    kailawnStepTier: Boolean(kailawnNeeded) ? safeKailawnTier : 'none',
    kailawnSurchargeRs: fare.kailawnSurchargeRs,
    pickupLandmark: sanitizeLandmark(pickupLandmark),
    dropLandmark: sanitizeLandmark(dropLandmark),
    needsWalkerHelper,
    buildingPhotoUrl:
      isTrustedMediaUrl(buildingPhotoUrl, 'image') ||
      '/src/assets/images/mizoram_hero_hills_1794891319409.jpg',
    voiceNoteUrl: cleanVoiceUrl || '/api/auth-kyc/signed-media/voice-guide',
    voiceNoteDurationSec: cleanVoiceDuration,
    voiceNoteTranscript:
      (voiceNoteTranscript || '').trim().slice(0, 240) ||
      'Gate beside concrete steps, call on arrival.',
    declaredValue: Number(declaredValue) || 0,
    paymentMethod,
    microInsuranceOptIn,
    microInsuranceFee: fare.microInsuranceFee,
    allInclusiveTotal: fare.allInclusiveTotal,
    advanceTokenAmount,
    advanceTokenPaid: advanceTokenAmount > 0,
    requiresPoliceVerifiedPartner: Number(declaredValue) > 5000,
    otpCode: String(Math.floor(1000 + Math.random() * 9000)),
    status: 'bidding',
    bids: [],
    createdAt: new Date().toISOString(),
  };

  for (const p of state.partners) {
    const elig = isPartnerEligibleForJob(p, job, state.remoteConfig.codCashLimitRs, state.plugins);
    if (elig.eligible) {
      const corridorMeters = distanceToRouteCorridorMeters({ lat: p.lat, lng: p.lng }, waypoints);
      if (corridorMeters <= 1800) {
        job.bids.push({
          id: `bid-${Date.now().toString().slice(-4)}-${p.id.slice(-2)}`,
          errandId: job.id,
          partnerId: p.id,
          partnerName: p.name,
          partnerCategory: p.category,
          partnerRating: p.rating,
          partnerBadges: p.badges,
          bidAmount: job.allInclusiveTotal,
          etaMinutes: Math.max(4, Math.round(corridorMeters / 150) + 4),
          corridorMatchMeters: corridorMeters <= 500 ? corridorMeters : null,
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  state.errands.unshift(job);
  db.addAudit(
    customerName,
    'ERRAND_CREATED',
    `${job.id} (${job.jobType}, ${job.accessType}, ${metrics.distanceSource}) Rs. ${job.allInclusiveTotal}`
  );
  realtimeHub.broadcast('errand_update', { job });
  res.status(201).json({ job });
});

errandFleetRouter.post('/jobs/:id/bids', (req, res) => {
  const parsed = bidSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid bid payload' });
    return;
  }
  const { partnerId, bidAmount, etaMinutes } = parsed.data;
  const state = db.get();
  const job = state.errands.find((e) => e.id === req.params.id);
  const partner = state.partners.find((p) => p.id === partnerId);
  if (!job || !partner) {
    res.status(404).json({ error: 'Job or Partner not found' });
    return;
  }
  if (job.status !== 'bidding') {
    res.status(400).json({ error: 'Job is no longer accepting new bids' });
    return;
  }

  const eligibility = isPartnerEligibleForJob(
    partner,
    job,
    state.remoteConfig.codCashLimitRs,
    state.plugins
  );
  if (!eligibility.eligible) {
    res.status(403).json({ error: eligibility.reason || 'Partner category not eligible for this job' });
    return;
  }

  const waypoints = [job.origin, ...job.stops, job.destination];
  const corridorMeters = distanceToRouteCorridorMeters(
    { lat: partner.lat, lng: partner.lng },
    waypoints
  );

  const bid = {
    id: `bid-${Date.now().toString().slice(-6)}`,
    errandId: job.id,
    partnerId: partner.id,
    partnerName: partner.name,
    partnerCategory: partner.category,
    partnerRating: partner.rating,
    partnerBadges: partner.badges,
    bidAmount: Math.max(30, Math.round(bidAmount)),
    etaMinutes: Math.max(3, Math.round(etaMinutes ?? 9)),
    corridorMatchMeters: corridorMeters <= 500 ? corridorMeters : null,
    createdAt: new Date().toISOString(),
  };

  const existingIdx = job.bids.findIndex((b) => b.partnerId === partner.id);
  if (existingIdx >= 0) {
    job.bids[existingIdx] = bid;
  } else {
    job.bids.unshift(bid);
  }
  db.commit();
  realtimeHub.broadcast('errand_update', { jobId: job.id, bid });
  res.status(201).json({ bid, job });
});

errandFleetRouter.post('/jobs/:id/select-bid', (req, res) => {
  const parsed = selectBidSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'bidId is required' });
    return;
  }
  const { bidId } = parsed.data;
  const state = db.get();
  const job = state.errands.find((e) => e.id === req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  if (job.status !== 'bidding') {
    res.status(400).json({ error: 'Partner has already been selected for this job' });
    return;
  }
  const bid = job.bids.find((b) => b.id === bidId);
  if (!bid) {
    res.status(404).json({ error: 'Bid not found' });
    return;
  }

  job.selectedBidId = bid.id;
  job.assignedPartnerId = bid.partnerId;
  job.allInclusiveTotal = bid.bidAmount;
  job.status = 'assigned';

  const split = calculateEscrowSplit({
    grossAllInclusive: job.allInclusiveTotal,
    microInsuranceSachet: job.microInsuranceFee,
    declaredValue: job.declaredValue,
  });
  const existingLedger = state.escrowLedger.find((e) => e.orderRef === job.id);
  if (!existingLedger) {
    state.escrowLedger.unshift({
      id: `esc-${Date.now().toString().slice(-5)}`,
      orderRef: job.id,
      grossAllInclusive: split.grossAllInclusive,
      gstAmount: split.gstAmount,
      platformCommission: split.platformCommission,
      microInsuranceSachet: split.microInsuranceSachet,
      partnerPayout: split.partnerPayout,
      merchantSettlement: 0,
      paymentMode: job.paymentMethod,
      escrowStatus: 'held_until_otp',
      createdAt: new Date().toISOString(),
    });

    postEscrowHoldJournal(state, {
      orderRef: job.id,
      customerId: job.customerId,
      grossAllInclusive: job.allInclusiveTotal,
      paymentMode: job.paymentMethod,
    });
  }

  db.addAudit(job.customerName, 'BID_SELECTED', `${job.id} -> ${bid.partnerName} (Rs. ${bid.bidAmount})`);
  realtimeHub.broadcast('errand_update', { job });
  realtimeHub.broadcast('escrow_update', { orderRef: job.id });
  res.json({ job });
});

errandFleetRouter.post('/jobs/:id/proof', (req, res) => {
  const { stage, proofUrl } = req.body as { stage: 'before' | 'after'; proofUrl?: string };
  const state = db.get();
  const job = state.errands.find((e) => e.id === req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  const url =
    isTrustedMediaUrl(proofUrl, 'image') || '/src/assets/images/partner_hill_rider_1794891322041.jpg';
  if (stage === 'before') {
    job.beforeProofUrl = url;
    job.status = 'in_progress';
  } else {
    job.afterProofUrl = url;
  }
  db.commit();
  realtimeHub.broadcast('errand_update', { job });
  res.json({ job });
});

errandFleetRouter.post('/jobs/:id/complete-otp', (req, res) => {
  const { otpCode } = req.body as { otpCode: string };
  const state = db.get();
  const job = state.errands.find((e) => e.id === req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  if (job.status === 'completed') {
    res.status(400).json({ error: 'Job is already completed and escrow has been settled.' });
    return;
  }
  if (job.status !== 'assigned' && job.status !== 'in_progress') {
    res.status(400).json({ error: 'Job must be assigned to a partner before OTP completion.' });
    return;
  }
  if (!job.beforeProofUrl || !job.afterProofUrl) {
    res.status(400).json({
      error: 'Both Before and After photo/video proofs are mandatory before OTP completion.',
    });
    return;
  }
  if (otpCode !== job.otpCode) {
    res.status(400).json({ error: 'Invalid customer handover OTP code.' });
    return;
  }

  job.status = 'completed';
  const partner = state.partners.find((p) => p.id === job.assignedPartnerId);
  const ledger = state.escrowLedger.find((e) => e.orderRef === job.id);
  if (ledger) {
    ledger.escrowStatus = 'split_settled';
    postEscrowSettlementJournal(state, {
      entry: ledger,
      partnerId: partner?.id,
    });
  }
  if (partner) {
    partner.completedJobs += 1;
    const payout = ledger ? ledger.partnerPayout : Math.round(job.allInclusiveTotal * 0.85);
    partner.walletBalance += payout;
    if (job.paymentMethod === 'dynamic_qr_cod') {
      partner.codCashHeld += job.allInclusiveTotal;
    }
  }

  db.addAudit('escrow-engine', 'OTP_RELEASED', `Job ${job.id} OTP verified & payout split settled`);
  realtimeHub.broadcast('errand_update', { job });
  realtimeHub.broadcast('escrow_update', { orderRef: job.id });
  res.json({ job, ledger });
});

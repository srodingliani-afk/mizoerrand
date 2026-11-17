import { Router } from 'express';
import { db } from '../infrastructure/store';
import { liveGpsCache } from '../infrastructure/redisCache';
import { realtimeHub } from '../infrastructure/realtimeHub';
import {
  calculateAllInclusiveFare,
  calculateEscrowSplit,
  distanceToRouteCorridorMeters,
  filterJobsForPartner,
  haversineDistanceMeters,
  isPartnerEligibleForJob,
  isPointWithinRouteCorridor,
} from '../domain/rules';
import type {
  AccessType,
  ErrandJobType,
  ErrandRequest,
  LatLng,
  MizoramDistrict,
  PartnerCategory,
} from '../../src/shared/types';

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
  if (typeof lat === 'number') partner.lat = lat;
  if (typeof lng === 'number') partner.lng = lng;
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
      state.remoteConfig.codCashLimitRs
    );
    res.json({ jobs: filtered, strictFilterApplied: true, partnerCategory: partner.category });
    return;
  }
  res.json({ jobs: state.errands });
});

errandFleetRouter.post('/estimate', (req, res) => {
  const {
    jobType,
    origin,
    stops = [],
    destination,
    district = 'Aizawl',
    isInterDistrict = false,
    needsWalkerHelper = false,
    microInsuranceOptIn = false,
  } = req.body as {
    jobType: ErrandJobType;
    origin: LatLng;
    stops?: LatLng[];
    destination: LatLng;
    district?: MizoramDistrict;
    isInterDistrict?: boolean;
    needsWalkerHelper?: boolean;
    microInsuranceOptIn?: boolean;
  };
  if (!origin || !destination || !jobType) {
    res.status(400).json({ error: 'jobType, origin, and destination are required' });
    return;
  }
  const waypoints = [origin, ...stops, destination];
  let totalMeters = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    totalMeters += haversineDistanceMeters(waypoints[i], waypoints[i + 1]);
  }
  const distanceKm = Math.max(0.4, Math.round((totalMeters / 1000) * 1.35 * 10) / 10);
  const tier = TIER_FOR_JOB_TYPE[jobType];
  const state = db.get();
  const fare = calculateAllInclusiveFare({
    category: tier,
    distanceKm,
    stopsCount: stops.length,
    needsWalkerHelper,
    microInsuranceOptIn,
    config: state.remoteConfig,
  });

  const corridorMatches = state.partners
    .filter(
      (p) =>
        p.online &&
        p.category === tier &&
        (isInterDistrict || !p.district || p.district === district)
    )
    .map((p) => ({
      partnerId: p.id,
      name: p.name,
      corridorMeters: distanceToRouteCorridorMeters({ lat: p.lat, lng: p.lng }, waypoints),
      within500m: isPointWithinRouteCorridor({ lat: p.lat, lng: p.lng }, waypoints, 500),
    }));

  res.json({
    distanceKm,
    tier,
    ...fare,
    corridorMatches,
  });
});

errandFleetRouter.post('/jobs', (req, res) => {
  const state = db.get();
  const {
    customerId = 'cust-1',
    customerName = 'Lalhriatpuii',
    district = 'Aizawl',
    isInterDistrict = false,
    title,
    jobType,
    origin,
    stops = [],
    destination,
    accessType,
    needsWalkerHelper = false,
    buildingPhotoUrl,
    voiceNoteUrl,
    voiceNoteTranscript,
    declaredValue = 500,
    paymentMethod = 'upi_escrow',
    microInsuranceOptIn = true,
  } = req.body as {
    customerId?: string;
    customerName?: string;
    district?: MizoramDistrict;
    isInterDistrict?: boolean;
    title: string;
    jobType: ErrandJobType;
    origin: LatLng;
    stops?: LatLng[];
    destination: LatLng;
    accessType: AccessType;
    needsWalkerHelper?: boolean;
    buildingPhotoUrl?: string;
    voiceNoteUrl?: string;
    voiceNoteTranscript?: string;
    declaredValue?: number;
    paymentMethod?: 'upi_escrow' | 'dynamic_qr_cod';
    microInsuranceOptIn?: boolean;
  };

  if (state.blacklistedCustomers.includes(customerId)) {
    res.status(403).json({
      error: 'Account suspended due to repeated prank bookings or fake emergency alerts.',
    });
    return;
  }

  if (!title || !title.trim() || !origin || !destination || !jobType || !accessType) {
    res.status(400).json({
      error: 'Title, job type, terrain access tag, origin, and destination are required.',
    });
    return;
  }

  const waypoints = [origin, ...stops, destination];
  let totalMeters = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    totalMeters += haversineDistanceMeters(waypoints[i], waypoints[i + 1]);
  }
  const distanceKm = Math.max(0.4, Math.round((totalMeters / 1000) * 1.35 * 10) / 10);
  const tier = TIER_FOR_JOB_TYPE[jobType];

  const fare = calculateAllInclusiveFare({
    category: tier,
    distanceKm,
    stopsCount: stops.length,
    needsWalkerHelper,
    microInsuranceOptIn,
    config: state.remoteConfig,
  });

  const advanceTokenAmount =
    fare.allInclusiveTotal > 1000 ? Math.round(fare.allInclusiveTotal * 0.2) : 0;

  const job: ErrandRequest = {
    id: `err-${Date.now().toString().slice(-5)}`,
    customerId,
    customerName,
    district,
    isInterDistrict,
    title: title.trim(),
    jobType,
    origin,
    stops,
    destination,
    distanceKm,
    accessType,
    needsWalkerHelper,
    buildingPhotoUrl: buildingPhotoUrl || '/src/assets/images/mizoram_hero_hills_1794891319409.jpg',
    voiceNoteUrl: voiceNoteUrl || '/api/auth-kyc/signed-media/voice-guide',
    voiceNoteTranscript:
      voiceNoteTranscript || 'Gate beside concrete steps, call on arrival.',
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

  // Auto-seed corridor-matched eligible partner initial bid for fluid UX if eligible partners exist
  for (const p of state.partners) {
    const elig = isPartnerEligibleForJob(p, job, state.remoteConfig.codCashLimitRs);
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
  db.addAudit(customerName, 'ERRAND_CREATED', `${job.id} (${job.jobType}, ${job.accessType}) Rs. ${job.allInclusiveTotal}`);
  realtimeHub.broadcast('errand_update', { job });
  res.status(201).json({ job });
});

errandFleetRouter.post('/jobs/:id/bids', (req, res) => {
  const { partnerId, bidAmount, etaMinutes } = req.body as {
    partnerId: string;
    bidAmount: number;
    etaMinutes?: number;
  };
  const state = db.get();
  const job = state.errands.find((e) => e.id === req.params.id);
  const partner = state.partners.find((p) => p.id === partnerId);
  if (!job || !partner) {
    res.status(404).json({ error: 'Job or Partner not found' });
    return;
  }

  const eligibility = isPartnerEligibleForJob(partner, job, state.remoteConfig.codCashLimitRs);
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
    bidAmount: Math.max(30, Math.round(Number(bidAmount) || job.allInclusiveTotal)),
    etaMinutes: Math.max(3, Math.round(Number(etaMinutes) || 9)),
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
  const { bidId } = req.body as { bidId: string };
  const state = db.get();
  const job = state.errands.find((e) => e.id === req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
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

  // Hold funds in escrow until OTP handover completion
  const split = calculateEscrowSplit({
    grossAllInclusive: job.allInclusiveTotal,
    microInsuranceSachet: job.microInsuranceFee,
    declaredValue: job.declaredValue,
  });
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
  const url = proofUrl || '/src/assets/images/partner_hill_rider_1794891322041.jpg';
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

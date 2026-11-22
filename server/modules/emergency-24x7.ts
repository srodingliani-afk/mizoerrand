import { Router } from 'express';
import { z } from 'zod';
import { db } from '../infrastructure/store';
import { realtimeHub } from '../infrastructure/realtimeHub';
import { requireAdminAuth } from '../infrastructure/adminAuth';
import {
  postEscrowHoldJournal,
  postEscrowSettlementJournal,
} from '../infrastructure/ledgerService';
import { calculateEscrowSplit, isCustomerBlacklisted } from '../domain/rules';
import type { EmergencyCategory, EmergencySosTicket, MizoramDistrict } from '../../src/shared/types';

export const emergency24x7Router = Router();

const RATE_CARDS: Record<EmergencyCategory, { rate: number; slaMinutes: number }> = {
  plumber_water: { rate: 450, slaMinutes: 20 },
  electrician_power: { rate: 500, slaMinutes: 20 },
  roadside_mechanic_towing: { rate: 650, slaMinutes: 25 },
  locksmith: { rate: 550, slaMinutes: 20 },
  medical_urgent_cab: { rate: 400, slaMinutes: 15 },
  ambulance_oxygen: { rate: 850, slaMinutes: 12 },
  night_pharmacy_run: { rate: 180, slaMinutes: 15 },
  lpg_gas_leak: { rate: 400, slaMinutes: 15 },
  landslide_drain_clear: { rate: 750, slaMinutes: 25 },
  water_tanker_urgent: { rate: 900, slaMinutes: 30 },
  tyre_puncture_fuel: { rate: 300, slaMinutes: 20 },
  women_night_escort: { rate: 350, slaMinutes: 15 },
};

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

const dispatchSosSchema = z.object({
  customerName: z.string().trim().min(1).max(80).optional().default('Pu Vanlalrema'),
  district: z.enum(MIZORAM_DISTRICTS_ENUM).optional().default('Aizawl'),
  veng: z.string().trim().min(1).max(80).optional().default('Dawrpui'),
  lat: z.number().finite().min(21.0).max(25.5).optional().default(23.7271),
  lng: z.number().finite().min(91.5).max(94.0).optional().default(92.7176),
  category: z.enum([
    'plumber_water',
    'electrician_power',
    'roadside_mechanic_towing',
    'locksmith',
    'medical_urgent_cab',
    'ambulance_oxygen',
    'night_pharmacy_run',
    'lpg_gas_leak',
    'landslide_drain_clear',
    'water_tanker_urgent',
    'tyre_puncture_fuel',
    'women_night_escort',
  ]),
  voiceNoteTranscript: z
    .string()
    .trim()
    .max(240)
    .optional()
    .default('Urgent assistance needed at main gate.'),
});

const techUpdateSchema = z.object({
  status: z.enum(['en_route', 'resolved']),
  sparePartsAmount: z.number().finite().min(0).max(50000).optional(),
  sparePartReceiptUrl: z.string().trim().max(240).optional(),
  techName: z.string().trim().min(1).max(60).optional(),
});

// Sliding-window SOS dispatch rate limiter (max 5 SOS dispatches per 5 minutes per client)
const SOS_WINDOW_MS = 5 * 60 * 1000;
const SOS_MAX_PER_WINDOW = 5;
const sosDispatchHistory = new Map<string, number[]>();

function checkSosRateLimit(clientKey: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const timestamps = (sosDispatchHistory.get(clientKey) || []).filter(
    (ts) => now - ts < SOS_WINDOW_MS
  );
  if (timestamps.length >= SOS_MAX_PER_WINDOW) {
    const oldest = timestamps[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((SOS_WINDOW_MS - (now - oldest)) / 1000));
    sosDispatchHistory.set(clientKey, timestamps);
    return { allowed: false, retryAfterSeconds };
  }
  timestamps.push(now);
  sosDispatchHistory.set(clientKey, timestamps);
  return { allowed: true, retryAfterSeconds: 0 };
}

emergency24x7Router.get('/tickets', (_req, res) => {
  const state = db.get();
  res.json({ tickets: state.sosTickets, rateCards: RATE_CARDS });
});

emergency24x7Router.post('/dispatch', (req, res) => {
  const clientKey = (req.ip || req.socket.remoteAddress || 'unknown').trim();
  const limit = checkSosRateLimit(clientKey);
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfterSeconds));
    res.status(429).json({
      error: `Too many SOS dispatches in 5 minutes. Please wait ${limit.retryAfterSeconds}s or call 112/108 immediately.`,
      retryAfterSeconds: limit.retryAfterSeconds,
    });
    return;
  }

  const parsed = dispatchSosSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Valid emergency category and location are required',
    });
    return;
  }

  const { customerName, district, veng, lat, lng, category, voiceNoteTranscript } = parsed.data;
  const state = db.get();
  if (isCustomerBlacklisted(state.blacklistedCustomers, undefined, customerName)) {
    res.status(403).json({
      error: 'Account suspended due to repeated prank bookings or fake emergency alerts.',
    });
    return;
  }
  const salariedTech =
    state.partners.find((p) => p.district === (district as MizoramDistrict) && p.isSalariedTechnician && p.online) ||
    state.partners.find((p) => p.district === (district as MizoramDistrict) && p.online) ||
    state.partners.find((p) => p.isSalariedTechnician && p.online) ||
    state.partners[0];
  const card = RATE_CARDS[category];

  const ticket: EmergencySosTicket = {
    id: `sos-${Date.now().toString().slice(-5)}`,
    customerName,
    district,
    veng,
    lat,
    lng,
    category,
    voiceNoteTranscript,
    assignedTechName: salariedTech ? salariedTech.name : '24x7 Shift Technician',
    assignedTechShift: salariedTech?.shift || 'Morning (06-14)',
    standardizedRate: card.rate,
    sparePartsAmount: 0,
    slaTargetMinutes: card.slaMinutes,
    dispatchSlaSeconds: 15,
    status: 'flashing_dispatch',
    createdAt: new Date().toISOString(),
  };

  state.sosTickets.unshift(ticket);
  db.addAudit(customerName, 'SOS_DISPATCH', `${ticket.id} (${category}) in ${district} · ${veng}`);
  realtimeHub.broadcast('sos_alert', { ticket });
  res.status(201).json({ ticket });
});

function settleSosTicketIfResolved(ticket: EmergencySosTicket): void {
  if (ticket.status !== 'resolved') return;
  const state = db.get();
  const alreadySettled = state.escrowLedger.some((e) => e.orderRef === ticket.id);
  if (alreadySettled) return;

  const grossTotal = Math.max(100, Math.round(ticket.standardizedRate + ticket.sparePartsAmount));
  const split = calculateEscrowSplit({
    grossAllInclusive: grossTotal,
    productAmount: ticket.sparePartsAmount,
    microInsuranceSachet: 0,
    declaredValue: grossTotal,
  });

  const entry = {
    id: `esc-${Date.now().toString().slice(-5)}`,
    orderRef: ticket.id,
    grossAllInclusive: split.grossAllInclusive,
    gstAmount: split.gstAmount,
    platformCommission: split.platformCommission,
    microInsuranceSachet: 0,
    partnerPayout: split.partnerPayout,
    merchantSettlement: split.merchantSettlement,
    paymentMode: 'upi_escrow' as const,
    escrowStatus: 'split_settled' as const,
    createdAt: new Date().toISOString(),
  };
  state.escrowLedger.unshift(entry);

  const tech = state.partners.find(
    (p) => p.name.toLowerCase().includes(ticket.assignedTechName.toLowerCase()) || p.isSalariedTechnician
  );
  if (tech) {
    tech.walletBalance += split.partnerPayout + ticket.sparePartsAmount;
    tech.completedJobs += 1;
  }

  postEscrowHoldJournal(state, {
    orderRef: ticket.id,
    customerId: ticket.customerName,
    grossAllInclusive: grossTotal,
    paymentMode: 'upi_escrow',
  });
  postEscrowSettlementJournal(state, {
    entry,
    partnerId: tech?.id || 'sos-tech',
    merchantId: 'spare-parts-reimbursement',
  });
}

emergency24x7Router.post('/tickets/:id/update', requireAdminAuth, (req, res) => {
  const { status, sparePartsAmount, sparePartReceiptUrl } = req.body as {
    status?: EmergencySosTicket['status'];
    sparePartsAmount?: number;
    sparePartReceiptUrl?: string;
  };
  const state = db.get();
  const ticket = state.sosTickets.find((t) => t.id === req.params.id);
  if (!ticket) {
    res.status(404).json({ error: 'SOS ticket not found' });
    return;
  }
  if (status) ticket.status = status;
  if (typeof sparePartsAmount === 'number') ticket.sparePartsAmount = Math.max(0, sparePartsAmount);
  if (sparePartReceiptUrl) ticket.sparePartReceiptUrl = sparePartReceiptUrl;

  settleSosTicketIfResolved(ticket);
  db.commit();
  realtimeHub.broadcast('sos_alert', { ticket });
  res.json({ ticket });
});

emergency24x7Router.post('/tickets/:id/tech-update', (req, res) => {
  const parsed = techUpdateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Valid technician status (en_route or resolved) is required.',
    });
    return;
  }

  const { status, sparePartsAmount, sparePartReceiptUrl, techName } = parsed.data;
  const state = db.get();
  const ticket = state.sosTickets.find((t) => t.id === req.params.id);
  if (!ticket) {
    res.status(404).json({ error: 'SOS ticket not found' });
    return;
  }

  ticket.status = status;
  if (typeof sparePartsAmount === 'number') {
    ticket.sparePartsAmount = Math.round(sparePartsAmount);
  }
  if (sparePartReceiptUrl) {
    ticket.sparePartReceiptUrl = sparePartReceiptUrl;
  }
  if (techName) {
    ticket.assignedTechName = techName;
  }

  settleSosTicketIfResolved(ticket);
  db.addAudit(
    ticket.assignedTechName,
    'TECH_SOS_UPDATE',
    `${ticket.id} -> ${ticket.status} (Parts Rs. ${ticket.sparePartsAmount})`
  );
  realtimeHub.broadcast('sos_alert', { ticket });
  res.json({ ticket });
});

import { Router } from 'express';
import { db } from '../infrastructure/store';
import { realtimeHub } from '../infrastructure/realtimeHub';
import { requireAdminAuth } from '../infrastructure/adminAuth';
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

emergency24x7Router.get('/tickets', (_req, res) => {
  const state = db.get();
  res.json({ tickets: state.sosTickets, rateCards: RATE_CARDS });
});

emergency24x7Router.post('/dispatch', (req, res) => {
  const {
    customerName = 'Pu Vanlalrema',
    district = 'Aizawl',
    veng = 'Dawrpui',
    lat = 23.7271,
    lng = 92.7176,
    category,
    voiceNoteTranscript = 'Urgent assistance needed at main gate.',
  } = req.body as {
    customerName?: string;
    district?: MizoramDistrict;
    veng?: string;
    lat?: number;
    lng?: number;
    category: EmergencyCategory;
    voiceNoteTranscript?: string;
  };

  if (!category || !RATE_CARDS[category]) {
    res.status(400).json({ error: 'Valid emergency category is required' });
    return;
  }

  const state = db.get();
  const salariedTech =
    state.partners.find((p) => p.district === district && p.isSalariedTechnician && p.online) ||
    state.partners.find((p) => p.district === district && p.online) ||
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

  db.commit();
  realtimeHub.broadcast('sos_alert', { ticket });
  res.json({ ticket });
});

emergency24x7Router.post('/tickets/:id/tech-update', (req, res) => {
  const { status, sparePartsAmount, sparePartReceiptUrl, techName } = req.body as {
    status?: 'en_route' | 'resolved';
    sparePartsAmount?: number;
    sparePartReceiptUrl?: string;
    techName?: string;
  };

  if (status !== 'en_route' && status !== 'resolved') {
    res.status(400).json({ error: 'Valid technician status (en_route or resolved) is required.' });
    return;
  }

  const state = db.get();
  const ticket = state.sosTickets.find((t) => t.id === req.params.id);
  if (!ticket) {
    res.status(404).json({ error: 'SOS ticket not found' });
    return;
  }

  ticket.status = status;
  if (typeof sparePartsAmount === 'number' && Number.isFinite(sparePartsAmount)) {
    ticket.sparePartsAmount = Math.max(0, Math.min(50000, Math.round(sparePartsAmount)));
  }
  if (typeof sparePartReceiptUrl === 'string' && sparePartReceiptUrl.trim()) {
    ticket.sparePartReceiptUrl = sparePartReceiptUrl.trim().slice(0, 120);
  }
  if (typeof techName === 'string' && techName.trim()) {
    ticket.assignedTechName = techName.trim().slice(0, 60);
  }

  db.addAudit(
    ticket.assignedTechName,
    'TECH_SOS_UPDATE',
    `${ticket.id} -> ${ticket.status} (Parts Rs. ${ticket.sparePartsAmount})`
  );
  realtimeHub.broadcast('sos_alert', { ticket });
  res.json({ ticket });
});


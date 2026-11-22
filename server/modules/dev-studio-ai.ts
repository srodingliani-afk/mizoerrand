import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { Type, type Content, type FunctionDeclaration } from '@google/genai';
import { db } from '../infrastructure/store';
import { getGeminiClient, getGeminiModel } from '../infrastructure/geminiClient';
import { realtimeHub } from '../infrastructure/realtimeHub';
import { evaluateSduiServiceVisibility } from '../domain/rules';
import {
  claimInitialAdminPasscode,
  extractAdminToken,
  getAdminAuthStatus,
  isValidAdminToken,
  requireAdminAuth,
  revokeAdminSession,
  verifyAdminPasscode,
} from '../infrastructure/adminAuth';
import type {
  AppRemoteConfig,
  ErrandRequest,
  MarketplaceOrder,
  MarketplaceProduct,
  MizoramDistrict,
  PartnerCategory,
  PartnerProfile,
  SumoParcelBooking,
  SystemIntegrationConfig,
  SystemPlugin,
  TrustBadge,
} from '../../src/shared/types';
import { liveGpsCache } from '../infrastructure/redisCache';
import { findDistrictVeng, getDistrictInfo } from '../../src/data/mizoramDistricts';
import crypto from 'crypto';

export const devStudioAiRouter = Router();

devStudioAiRouter.get('/auth-status', (req, res) => {
  const status = getAdminAuthStatus();
  const token = extractAdminToken(req);
  res.json({
    ...status,
    authenticated: isValidAdminToken(token),
  });
});

devStudioAiRouter.post('/setup-admin', (req, res) => {
  const { pin, passcode } = req.body as { pin?: string; passcode?: string };
  const secret = typeof passcode === 'string' ? passcode : typeof pin === 'string' ? pin : '';
  const result = claimInitialAdminPasscode(secret);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.status(201).json({
    token: result.token,
    source: result.source,
    expiresAt: result.expiresAt,
    authenticated: true,
  });
});

devStudioAiRouter.post('/verify-2fa', (req, res) => {
  const { pin, passcode } = req.body as { pin?: string; passcode?: string };
  const secret = typeof passcode === 'string' ? passcode : typeof pin === 'string' ? pin : '';
  const result = verifyAdminPasscode(req, secret);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({
    token: result.token,
    source: result.source,
    expiresAt: result.expiresAt,
    authenticated: true,
  });
});

devStudioAiRouter.post('/logout', (req, res) => {
  revokeAdminSession(extractAdminToken(req));
  res.json({ ok: true });
});

devStudioAiRouter.get('/workspace', requireAdminAuth, (_req, res) => {
  const state = db.get();
  res.json({
    plugins: state.plugins,
    remoteConfig: state.remoteConfig,
    sandboxConfig: state.sandboxConfig,
    snapshots: state.snapshots.map((s) => ({
      id: s.id,
      label: s.label,
      createdAt: s.createdAt,
      pluginCount: s.plugins.length,
    })),
  });
});

devStudioAiRouter.post('/plugins', requireAdminAuth, (req, res) => {
  const { id, key, name, description, module, code, enabled } = req.body as Partial<SystemPlugin>;
  const state = db.get();
  const now = new Date().toISOString();

  if (id) {
    const existing = state.plugins.find((p) => p.id === id);
    if (!existing) {
      res.status(404).json({ error: 'Plugin not found' });
      return;
    }
    if (typeof name === 'string') existing.name = name;
    if (typeof description === 'string') existing.description = description;
    if (typeof code === 'string') existing.code = code;
    if (typeof enabled === 'boolean') existing.enabled = enabled;
    if (module) existing.module = module;
    existing.updatedAt = now;
    db.addAudit('dev-studio', 'PLUGIN_UPDATED', `${existing.key} (enabled=${existing.enabled})`);
    realtimeHub.broadcast('plugin_update', { plugins: state.plugins });
    realtimeHub.broadcast('sdui_update', {
      config: state.remoteConfig,
      effectiveVisibility: evaluateSduiServiceVisibility(state.remoteConfig, state.plugins),
    });
    res.json({ plugin: existing });
    return;
  }

  if (!key || !name || !code || !module) {
    res.status(400).json({ error: 'key, name, module, and code are required for new plugins' });
    return;
  }

  const created: SystemPlugin = {
    id: `plg-${Date.now().toString().slice(-5)}`,
    key,
    name,
    description: description || 'Custom SDUI extension plugin',
    module,
    enabled: enabled ?? true,
    version: '1.0.0',
    code,
    updatedAt: now,
  };
  state.plugins.unshift(created);
  db.addAudit('dev-studio', 'PLUGIN_CREATED', `${created.key}`);
  realtimeHub.broadcast('plugin_update', { plugins: state.plugins });
  res.status(201).json({ plugin: created });
});

devStudioAiRouter.delete('/plugins/:id', requireAdminAuth, (req, res) => {
  const state = db.get();
  const idx = state.plugins.findIndex((p) => p.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Plugin not found' });
    return;
  }
  const [removed] = state.plugins.splice(idx, 1);
  db.addAudit('dev-studio', 'PLUGIN_DELETED', `${removed.key}`);
  realtimeHub.broadcast('plugin_update', { plugins: state.plugins });
  res.json({ deleted: removed.id });
});

devStudioAiRouter.post('/sandbox', requireAdminAuth, (req, res) => {
  const patch = req.body as Partial<AppRemoteConfig>;
  const state = db.get();
  const base = state.sandboxConfig || state.remoteConfig;
  state.sandboxConfig = {
    ...base,
    ...patch,
    visibleServices: {
      ...base.visibleServices,
      ...(patch.visibleServices || {}),
    },
    updatedAt: new Date().toISOString(),
  };
  db.addAudit('dev-studio', 'SANDBOX_UPDATED', 'Staged remote config changes to sandbox preview');
  res.json({
    sandboxConfig: state.sandboxConfig,
    sandboxVisibility: evaluateSduiServiceVisibility(state.sandboxConfig),
  });
});

devStudioAiRouter.post('/publish', requireAdminAuth, (req, res) => {
  const { label } = req.body as { label?: string };
  const state = db.get();
  const now = new Date().toISOString();

  // Save rollback snapshot before publishing live
  state.snapshots.unshift({
    id: `snap-${Date.now().toString().slice(-6)}`,
    label: label || `Pre-publish snapshot (${new Date().toLocaleTimeString()})`,
    createdAt: now,
    config: structuredClone(state.remoteConfig),
    plugins: structuredClone(state.plugins),
  });
  if (state.snapshots.length > 15) state.snapshots.length = 15;

  if (state.sandboxConfig) {
    state.remoteConfig = {
      ...state.sandboxConfig,
      updatedAt: now,
    };
    state.sandboxConfig = null;
  } else {
    state.remoteConfig.updatedAt = now;
  }

  db.addAudit('dev-studio', 'LIVE_PUBLISHED', 'One-click live publish pushed to all PWA clients');
  realtimeHub.broadcast('sdui_update', {
    config: state.remoteConfig,
    effectiveVisibility: evaluateSduiServiceVisibility(state.remoteConfig),
  });
  res.json({
    remoteConfig: state.remoteConfig,
    snapshots: state.snapshots.map((s) => ({
      id: s.id,
      label: s.label,
      createdAt: s.createdAt,
      pluginCount: s.plugins.length,
    })),
  });
});

devStudioAiRouter.post('/rollback', requireAdminAuth, (req, res) => {
  const { snapshotId } = req.body as { snapshotId?: string };
  const state = db.get();
  const snap = snapshotId
    ? state.snapshots.find((s) => s.id === snapshotId)
    : state.snapshots[0];
  if (!snap) {
    res.status(404).json({ error: 'No rollback snapshot found' });
    return;
  }

  state.remoteConfig = structuredClone(snap.config);
  state.remoteConfig.updatedAt = new Date().toISOString();
  state.plugins = structuredClone(snap.plugins);
  state.sandboxConfig = null;

  db.addAudit('dev-studio', 'SNAPSHOT_ROLLBACK', `Rolled back to ${snap.label}`);
  realtimeHub.broadcast('sdui_update', {
    config: state.remoteConfig,
    effectiveVisibility: evaluateSduiServiceVisibility(state.remoteConfig),
  });
  realtimeHub.broadcast('plugin_update', { plugins: state.plugins });

  res.json({
    restoredSnapshot: snap.id,
    remoteConfig: state.remoteConfig,
    plugins: state.plugins,
  });
});

// ============================================================================
// MASTER SYSTEM ADMIN CRUD & OVERRIDE ENDPOINTS (100% EDITABLE STATE)
// ============================================================================

devStudioAiRouter.get('/master-state', requireAdminAuth, (_req, res) => {
  const state = db.get();
  res.json({
    remoteConfig: state.remoteConfig,
    sandboxConfig: state.sandboxConfig,
    integrationConfig: state.integrationConfig,
    plugins: state.plugins,
    partners: state.partners,
    errands: state.errands,
    products: state.products,
    marketplaceOrders: state.marketplaceOrders,
    workforce: state.workforce,
    staffingBookings: state.staffingBookings,
    payrollRecords: state.payrollRecords,
    sosTickets: state.sosTickets,
    kycQueue: state.kycQueue,
    disputes: state.disputes,
    blacklistedCustomers: state.blacklistedCustomers,
    userMonthlyReturns: state.userMonthlyReturns,
    prankStrikeCounts: state.prankStrikeCounts,
    customerWallet: state.customerWallet,
    sumoParcels: state.sumoParcels,
  });
});

devStudioAiRouter.get('/integrations', requireAdminAuth, (_req, res) => {
  const state = db.get();
  res.json({ integrationConfig: state.integrationConfig });
});

devStudioAiRouter.put('/integrations', requireAdminAuth, (req, res) => {
  const patch = (req.body || {}) as Partial<SystemIntegrationConfig>;
  const state = db.get();
  const prev = state.integrationConfig;

  state.integrationConfig = {
    ...prev,
    ...(typeof patch.geminiApiKey === 'string' ? { geminiApiKey: patch.geminiApiKey.trim() } : {}),
    ...(typeof patch.geminiModel === 'string' && patch.geminiModel.trim()
      ? { geminiModel: patch.geminiModel.trim() }
      : {}),
    ...(typeof patch.enforceCameraOnlyKyc === 'boolean'
      ? { enforceCameraOnlyKyc: patch.enforceCameraOnlyKyc }
      : {}),
    ...(typeof patch.requireFull12DigitAadhaarScan === 'boolean'
      ? { requireFull12DigitAadhaarScan: patch.requireFull12DigitAadhaarScan }
      : {}),
    ...(typeof patch.aiOcrMinConfidence === 'number'
      ? { aiOcrMinConfidence: Math.max(50, Math.min(99, Math.round(patch.aiOcrMinConfidence))) }
      : {}),
    ...(typeof patch.requireServerStaffVerificationForUpdates === 'boolean'
      ? { requireServerStaffVerificationForUpdates: patch.requireServerStaffVerificationForUpdates }
      : {}),
    ...(patch.videoProvider &&
    ['jitsi_webrtc', 'google_meet_v2', 'daily_co', 'livekit_cloud', 'agora_rtc'].includes(
      patch.videoProvider
    )
      ? { videoProvider: patch.videoProvider }
      : {}),
    ...(typeof patch.videoServerDomain === 'string' && patch.videoServerDomain.trim()
      ? { videoServerDomain: patch.videoServerDomain.trim().replace(/\/+$/, '') }
      : {}),
    ...(typeof patch.videoApiKey === 'string' ? { videoApiKey: patch.videoApiKey.trim() } : {}),
    ...(typeof patch.videoApiSecret === 'string'
      ? { videoApiSecret: patch.videoApiSecret.trim() }
      : {}),
    ...(typeof patch.roomPrefix === 'string' && patch.roomPrefix.trim()
      ? { roomPrefix: patch.roomPrefix.trim().replace(/[^a-zA-Z0-9-_]/g, '') }
      : {}),
    ...(typeof patch.defaultRequireVideoForAwmpuiAndDrivers === 'boolean'
      ? { defaultRequireVideoForAwmpuiAndDrivers: patch.defaultRequireVideoForAwmpuiAndDrivers }
      : {}),
    updatedAt: new Date().toISOString(),
  };

  db.addAudit(
    'super-admin',
    'INTEGRATION_CONFIG_UPDATED',
    `AI Model=${state.integrationConfig.geminiModel} · CameraOnlyKYC=${state.integrationConfig.enforceCameraOnlyKyc} · VideoProvider=${state.integrationConfig.videoProvider}`
  );
  res.json({ integrationConfig: state.integrationConfig });
});

devStudioAiRouter.post('/config-direct', requireAdminAuth, (req, res) => {
  const patch = req.body as Partial<AppRemoteConfig>;
  const state = db.get();
  const now = new Date().toISOString();

  state.remoteConfig = {
    ...state.remoteConfig,
    ...(typeof patch.appName === 'string' && patch.appName.trim() ? { appName: patch.appName.trim() } : {}),
    ...(typeof patch.region === 'string' && patch.region.trim() ? { region: patch.region.trim() } : {}),
    ...(typeof patch.sundayEmergencyMode === 'boolean' ? { sundayEmergencyMode: patch.sundayEmergencyMode } : {}),
    ...(typeof patch.rainSurgeMultiplier === 'number'
      ? { rainSurgeMultiplier: Math.max(1.0, Math.min(3.0, Number(patch.rainSurgeMultiplier))) }
      : {}),
    ...(typeof patch.trafficSurgeMultiplier === 'number'
      ? { trafficSurgeMultiplier: Math.max(1.0, Math.min(3.0, Number(patch.trafficSurgeMultiplier))) }
      : {}),
    ...(typeof patch.baseWalkerRate === 'number' ? { baseWalkerRate: Math.max(10, Math.round(patch.baseWalkerRate)) } : {}),
    ...(typeof patch.baseBikeRate === 'number' ? { baseBikeRate: Math.max(10, Math.round(patch.baseBikeRate)) } : {}),
    ...(typeof patch.baseAutoTaxiRate === 'number' ? { baseAutoTaxiRate: Math.max(20, Math.round(patch.baseAutoTaxiRate)) } : {}),
    ...(typeof patch.basePickupRate === 'number' ? { basePickupRate: Math.max(50, Math.round(patch.basePickupRate)) } : {}),
    ...(typeof patch.returnDeliveryFee === 'number' ? { returnDeliveryFee: Math.max(0, Math.round(patch.returnDeliveryFee)) } : {}),
    ...(typeof patch.monthlyReturnLimit === 'number' ? { monthlyReturnLimit: Math.max(1, Math.round(patch.monthlyReturnLimit)) } : {}),
    ...(typeof patch.codCashLimitRs === 'number' ? { codCashLimitRs: Math.max(500, Math.round(patch.codCashLimitRs)) } : {}),
    ...(typeof patch.microInsuranceSachetRs === 'number' ? { microInsuranceSachetRs: Math.max(0, Math.round(patch.microInsuranceSachetRs)) } : {}),
    ...(typeof patch.announcementEn === 'string' ? { announcementEn: patch.announcementEn.trim() } : {}),
    ...(typeof patch.announcementMiz === 'string' ? { announcementMiz: patch.announcementMiz.trim() } : {}),
    visibleServices: {
      ...state.remoteConfig.visibleServices,
      ...(patch.visibleServices || {}),
    },
    updatedAt: now,
  };

  db.addAudit('super-admin', 'MASTER_CONFIG_UPDATED', `Updated live SDUI config (${state.remoteConfig.appName})`);
  const effectiveVisibility = evaluateSduiServiceVisibility(state.remoteConfig, state.plugins);
  realtimeHub.broadcast('sdui_update', {
    config: state.remoteConfig,
    effectiveVisibility,
  });
  res.json({ remoteConfig: state.remoteConfig, effectiveVisibility });
});

devStudioAiRouter.post('/partners', requireAdminAuth, (req, res) => {
  const body = req.body as Partial<PartnerProfile>;
  const name = (body.name || '').trim();
  if (name.length < 2) {
    res.status(400).json({ error: 'Partner name is required.' });
    return;
  }
  const state = db.get();
  const district: MizoramDistrict = body.district || 'Aizawl';
  const info = getDistrictInfo(district);
  const veng = (body.veng || info.vengs[0]?.name || 'Dawrpui').trim();
  const vengPt = findDistrictVeng(district, veng);
  const category: PartnerCategory = body.category || 'walker';

  const created: PartnerProfile = {
    id: `ptr-${Date.now().toString().slice(-5)}`,
    name,
    phone: (body.phone || '+91 94361 00000').trim(),
    district,
    veng,
    category,
    online: body.online ?? true,
    lat: typeof body.lat === 'number' ? body.lat : vengPt?.lat ?? info.center.lat,
    lng: typeof body.lng === 'number' ? body.lng : vengPt?.lng ?? info.center.lng,
    rating: typeof body.rating === 'number' ? Math.max(1, Math.min(5, body.rating)) : 4.9,
    completedJobs: typeof body.completedJobs === 'number' ? Math.max(0, Math.round(body.completedJobs)) : 0,
    badges:
      Array.isArray(body.badges) && body.badges.length > 0
        ? (body.badges as TrustBadge[])
        : ['Police Verified - Green Shield'],
    commercialPermitVerified: body.commercialPermitVerified ?? category === 'auto_taxi',
    policeVerified: body.policeVerified ?? true,
    securityDepositVerified: body.securityDepositVerified ?? true,
    codCashHeld: typeof body.codCashHeld === 'number' ? Math.max(0, Math.round(body.codCashHeld)) : 0,
    walletBalance: typeof body.walletBalance === 'number' ? Math.max(0, Math.round(body.walletBalance)) : 0,
    shift: body.shift,
    isSalariedTechnician: Boolean(body.isSalariedTechnician),
    lastHeartbeatAt: new Date().toISOString(),
  };

  state.partners.unshift(created);
  liveGpsCache.setPartnerLocation(created.id, created.lat, created.lng, created.online, 3600_000);
  db.addAudit('super-admin', 'PARTNER_CREATED', `${created.name} (${created.category} · ${created.district})`);
  realtimeHub.broadcast('errand_update', { partnerUpdated: created.id });
  res.status(201).json({ partner: created });
});

devStudioAiRouter.patch('/partners/:id', requireAdminAuth, (req, res) => {
  const state = db.get();
  const partner = state.partners.find((p) => p.id === req.params.id);
  if (!partner) {
    res.status(404).json({ error: 'Partner not found' });
    return;
  }
  const patch = req.body as Partial<PartnerProfile>;
  if (typeof patch.name === 'string' && patch.name.trim()) partner.name = patch.name.trim();
  if (typeof patch.phone === 'string' && patch.phone.trim()) partner.phone = patch.phone.trim();
  if (patch.district) partner.district = patch.district;
  if (typeof patch.veng === 'string' && patch.veng.trim()) {
    partner.veng = patch.veng.trim();
    const vengPt = findDistrictVeng(partner.district || 'Aizawl', partner.veng);
    if (vengPt && typeof patch.lat !== 'number') {
      partner.lat = vengPt.lat;
      partner.lng = vengPt.lng;
    }
  }
  if (patch.category) partner.category = patch.category;
  if (typeof patch.online === 'boolean') partner.online = patch.online;
  if (typeof patch.rating === 'number') partner.rating = Math.max(1, Math.min(5, patch.rating));
  if (typeof patch.completedJobs === 'number') partner.completedJobs = Math.max(0, Math.round(patch.completedJobs));
  if (typeof patch.commercialPermitVerified === 'boolean') {
    partner.commercialPermitVerified = patch.commercialPermitVerified;
  }
  if (typeof patch.policeVerified === 'boolean') partner.policeVerified = patch.policeVerified;
  if (typeof patch.securityDepositVerified === 'boolean') {
    partner.securityDepositVerified = patch.securityDepositVerified;
  }
  if (typeof patch.codCashHeld === 'number') partner.codCashHeld = Math.max(0, Math.round(patch.codCashHeld));
  if (typeof patch.walletBalance === 'number') partner.walletBalance = Math.max(0, Math.round(patch.walletBalance));
  if (Array.isArray(patch.badges)) partner.badges = patch.badges as TrustBadge[];
  if ('shift' in patch) partner.shift = patch.shift;
  if (typeof patch.isSalariedTechnician === 'boolean') {
    partner.isSalariedTechnician = patch.isSalariedTechnician;
  }
  partner.lastHeartbeatAt = new Date().toISOString();

  liveGpsCache.setPartnerLocation(partner.id, partner.lat, partner.lng, partner.online, 3600_000);
  db.addAudit('super-admin', 'PARTNER_UPDATED', `${partner.name} (${partner.id})`);
  realtimeHub.broadcast('errand_update', { partnerUpdated: partner.id });
  res.json({ partner });
});

devStudioAiRouter.delete('/partners/:id', requireAdminAuth, (req, res) => {
  const state = db.get();
  const idx = state.partners.findIndex((p) => p.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Partner not found' });
    return;
  }
  const [removed] = state.partners.splice(idx, 1);
  db.addAudit('super-admin', 'PARTNER_DELETED', `${removed.name} (${removed.id})`);
  realtimeHub.broadcast('errand_update', { partnerDeleted: removed.id });
  res.json({ deleted: removed.id });
});

devStudioAiRouter.patch('/errands/:id', requireAdminAuth, (req, res) => {
  const state = db.get();
  const job = state.errands.find((e) => e.id === req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Errand not found' });
    return;
  }
  const patch = req.body as Partial<ErrandRequest>;
  if (typeof patch.title === 'string' && patch.title.trim()) job.title = patch.title.trim();
  if (patch.status) job.status = patch.status;
  if (patch.jobType) job.jobType = patch.jobType;
  if (patch.accessType) job.accessType = patch.accessType;
  if (patch.district) job.district = patch.district;
  if (typeof patch.allInclusiveTotal === 'number') {
    job.allInclusiveTotal = Math.max(20, Math.round(patch.allInclusiveTotal));
  }
  if ('assignedPartnerId' in patch) {
    job.assignedPartnerId = patch.assignedPartnerId || undefined;
  }
  db.addAudit('super-admin', 'ERRAND_OVERRIDDEN', `${job.id} (status=${job.status}, Rs. ${job.allInclusiveTotal})`);
  realtimeHub.broadcast('errand_update', { job });
  res.json({ job });
});

devStudioAiRouter.delete('/errands/:id', requireAdminAuth, (req, res) => {
  const state = db.get();
  const idx = state.errands.findIndex((e) => e.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Errand not found' });
    return;
  }
  const [removed] = state.errands.splice(idx, 1);
  db.addAudit('super-admin', 'ERRAND_DELETED', `${removed.id} (${removed.title})`);
  realtimeHub.broadcast('errand_update', { deletedErrandId: removed.id });
  res.json({ deleted: removed.id });
});

devStudioAiRouter.patch('/marketplace-orders/:id', requireAdminAuth, (req, res) => {
  const state = db.get();
  const order = state.marketplaceOrders.find((o) => o.id === req.params.id);
  if (!order) {
    res.status(404).json({ error: 'Marketplace order not found' });
    return;
  }
  const patch = req.body as Partial<MarketplaceOrder>;
  if (patch.status) order.status = patch.status;
  if (typeof patch.allInclusiveTotal === 'number') {
    order.allInclusiveTotal = Math.max(20, Math.round(patch.allInclusiveTotal));
  }
  if (typeof patch.returnFeeOnReject === 'number') {
    order.returnFeeOnReject = Math.max(0, Math.round(patch.returnFeeOnReject));
  }
  if ('assignedPartnerId' in patch) {
    const p = state.partners.find((pt) => pt.id === patch.assignedPartnerId);
    order.assignedPartnerId = p?.id;
    order.assignedPartnerName = p?.name;
  }
  db.addAudit('super-admin', 'MARKETPLACE_ORDER_OVERRIDDEN', `${order.id} -> ${order.status}`);
  realtimeHub.broadcast('marketplace_update', { order });
  res.json({ order });
});

devStudioAiRouter.delete('/marketplace-orders/:id', requireAdminAuth, (req, res) => {
  const state = db.get();
  const idx = state.marketplaceOrders.findIndex((o) => o.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Marketplace order not found' });
    return;
  }
  const [removed] = state.marketplaceOrders.splice(idx, 1);
  db.addAudit('super-admin', 'MARKETPLACE_ORDER_DELETED', `${removed.id}`);
  realtimeHub.broadcast('marketplace_update', { deletedOrderId: removed.id });
  res.json({ deleted: removed.id });
});

devStudioAiRouter.patch('/sumo-parcels/:id', requireAdminAuth, (req, res) => {
  const state = db.get();
  const parcel = state.sumoParcels.find((s) => s.id === req.params.id);
  if (!parcel) {
    res.status(404).json({ error: 'Sumo parcel not found' });
    return;
  }
  const patch = req.body as Partial<SumoParcelBooking>;
  if (patch.status) parcel.status = patch.status;
  if (typeof patch.allInclusiveTotal === 'number') {
    parcel.allInclusiveTotal = Math.max(50, Math.round(patch.allInclusiveTotal));
  }
  if (typeof patch.sumoVehicleNumber === 'string') {
    parcel.sumoVehicleNumber = patch.sumoVehicleNumber.trim();
  }
  if ('assignedRunnerId' in patch) {
    const runner = state.partners.find((p) => p.id === patch.assignedRunnerId);
    parcel.assignedRunnerId = runner?.id;
    parcel.assignedRunnerName = runner?.name;
  }
  db.addAudit('super-admin', 'SUMO_PARCEL_OVERRIDDEN', `${parcel.trackingCode} -> ${parcel.status}`);
  realtimeHub.broadcast('errand_update', { sumoParcelId: parcel.id });
  res.json({ parcel });
});

devStudioAiRouter.delete('/sumo-parcels/:id', requireAdminAuth, (req, res) => {
  const state = db.get();
  const idx = state.sumoParcels.findIndex((s) => s.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Sumo parcel not found' });
    return;
  }
  const [removed] = state.sumoParcels.splice(idx, 1);
  db.addAudit('super-admin', 'SUMO_PARCEL_DELETED', `${removed.trackingCode}`);
  realtimeHub.broadcast('errand_update', { deletedSumoParcelId: removed.id });
  res.json({ deleted: removed.id });
});

devStudioAiRouter.post('/blacklist', requireAdminAuth, (req, res) => {
  const { action, target } = req.body as {
    action?: 'add' | 'remove' | 'clear_all' | 'reset_returns';
    target?: string;
  };
  const state = db.get();
  const cleanTarget = (target || '').trim();

  if (action === 'add' && cleanTarget) {
    if (!state.blacklistedCustomers.includes(cleanTarget)) {
      state.blacklistedCustomers.push(cleanTarget);
    }
    db.addAudit('super-admin', 'BLACKLIST_ADDED', `Blacklisted ${cleanTarget}`);
  } else if (action === 'remove' && cleanTarget) {
    state.blacklistedCustomers = state.blacklistedCustomers.filter(
      (item) => item.toLowerCase() !== cleanTarget.toLowerCase()
    );
    delete state.prankStrikeCounts[cleanTarget];
    db.addAudit('super-admin', 'BLACKLIST_REMOVED', `Unblocked ${cleanTarget}`);
  } else if (action === 'clear_all') {
    state.blacklistedCustomers = [];
    state.prankStrikeCounts = {};
    db.addAudit('super-admin', 'BLACKLIST_CLEARED', 'Cleared all blacklisted accounts & strikes');
  } else if (action === 'reset_returns') {
    state.userMonthlyReturns = {};
    db.addAudit('super-admin', 'MONTHLY_RETURNS_RESET', 'Reset monthly return counters for all customers');
  } else {
    res.status(400).json({ error: 'Valid blacklist action and target are required' });
    return;
  }

  realtimeHub.broadcast('escrow_update', { blacklistedCustomers: state.blacklistedCustomers });
  res.json({
    blacklistedCustomers: state.blacklistedCustomers,
    prankStrikeCounts: state.prankStrikeCounts,
    userMonthlyReturns: state.userMonthlyReturns,
  });
});

devStudioAiRouter.patch('/customer-wallet', requireAdminAuth, (req, res) => {
  const { balanceRs, loyaltyPoints, plusPassActive, referralCode } = req.body as {
    balanceRs?: number;
    loyaltyPoints?: number;
    plusPassActive?: boolean;
    referralCode?: string;
  };
  const state = db.get();
  if (typeof balanceRs === 'number' && Number.isFinite(balanceRs)) {
    state.customerWallet.balanceRs = Math.max(0, Math.round(balanceRs));
  }
  if (typeof loyaltyPoints === 'number' && Number.isFinite(loyaltyPoints)) {
    state.customerWallet.loyaltyPoints = Math.max(0, Math.round(loyaltyPoints));
  }
  if (typeof plusPassActive === 'boolean') {
    state.customerWallet.plusPassActive = plusPassActive;
  }
  if (typeof referralCode === 'string' && referralCode.trim().length >= 5) {
    state.customerWallet.referralCode = referralCode.trim().toUpperCase();
  }
  db.addAudit(
    'super-admin',
    'CUSTOMER_WALLET_OVERRIDDEN',
    `Balance=₹${state.customerWallet.balanceRs}, Pts=${state.customerWallet.loyaltyPoints}, PlusPass=${state.customerWallet.plusPassActive}`
  );
  realtimeHub.broadcast('escrow_update', { walletBalanceRs: state.customerWallet.balanceRs });
  res.json({ customerWallet: state.customerWallet });
});

devStudioAiRouter.post('/change-passcode', requireAdminAuth, (req, res) => {
  const { newPasscode } = req.body as { newPasscode?: string };
  const trimmed = (newPasscode || '').trim();
  if (trimmed.length < 6 || trimmed.length > 128) {
    res.status(400).json({ error: 'New Super Admin passcode must be between 6 and 128 characters.' });
    return;
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(trimmed, salt, 64).toString('hex');
  db.get().adminAuth = {
    passcodeHash: hash,
    salt,
    claimedAt: new Date().toISOString(),
  };
  db.addAudit('super-admin', 'ADMIN_PASSCODE_ROTATED', 'Super Admin 2FA passcode rotated');
  res.json({ ok: true, updatedAt: db.get().adminAuth?.claimedAt });
});

// Tool Declarations for Built-In AI Software Engineer (gemini-4-hydrogen)
const ARCHITECT_TOOLS: FunctionDeclaration[] = [
  {
    name: 'read_codebase',
    description: 'Read a file from the ZoRun codebase or inspect current system_plugins & app_remote_config state.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        targetPath: {
          type: Type.STRING,
          description: 'Relative path like "server/domain/rules.ts" or "state://sdui" for current live SDUI config and plugins.',
        },
      },
      required: ['targetPath'],
    },
  },
  {
    name: 'write_plugin_code',
    description: 'Create or update a plugin inside system_plugins with TypeScript/JS code.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        key: { type: Type.STRING, description: 'Unique slug key for the plugin' },
        name: { type: Type.STRING, description: 'Human-readable plugin name' },
        module: {
          type: Type.STRING,
          description: 'Module name: auth-kyc | errand-fleet | marketplace-ai | managed-staffing | emergency-24x7 | payment-escrow | remote-config-sdui',
        },
        description: { type: Type.STRING },
        code: { type: Type.STRING, description: 'Valid TypeScript/JS code for the plugin' },
      },
      required: ['key', 'name', 'module', 'code'],
    },
  },
  {
    name: 'run_db_migration',
    description: 'Update app_remote_config fields (rates, surge multipliers, return fees, Sunday Emergency Mode, announcements) in live SDUI state.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        sundayEmergencyMode: { type: Type.BOOLEAN },
        rainSurgeMultiplier: { type: Type.NUMBER },
        trafficSurgeMultiplier: { type: Type.NUMBER },
        baseWalkerRate: { type: Type.NUMBER },
        baseBikeRate: { type: Type.NUMBER },
        returnDeliveryFee: { type: Type.NUMBER },
        announcementEn: { type: Type.STRING },
        announcementMiz: { type: Type.STRING },
      },
    },
  },
  {
    name: 'toggle_plugin',
    description: 'Enable or disable an existing plugin in system_plugins by key.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        key: { type: Type.STRING },
        enabled: { type: Type.BOOLEAN },
      },
      required: ['key', 'enabled'],
    },
  },
  {
    name: 'deploy_to_sandbox',
    description: 'Stage changes into the Dev Studio sandbox preview for founder inspection.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        sundayEmergencyMode: { type: Type.BOOLEAN },
        rainSurgeMultiplier: { type: Type.NUMBER },
        baseWalkerRate: { type: Type.NUMBER },
        announcementEn: { type: Type.STRING },
      },
    },
  },
];

function executeArchitectTool(name: string, args: Record<string, unknown>): Record<string, unknown> {
  const state = db.get();
  const now = new Date().toISOString();

  if (name === 'read_codebase') {
    const targetPath = String(args.targetPath || 'state://sdui');
    if (targetPath.startsWith('state://')) {
      return {
        remoteConfig: state.remoteConfig,
        plugins: state.plugins.map((p) => ({
          key: p.key,
          name: p.name,
          module: p.module,
          enabled: p.enabled,
        })),
      };
    }
    const allowedRoots = [
      path.resolve(process.cwd(), 'src') + path.sep,
      path.resolve(process.cwd(), 'server') + path.sep,
    ];
    const resolved = path.resolve(process.cwd(), targetPath.replace(/^\/+/, ''));
    const inAllowedRoot = allowedRoots.some((root) => resolved.startsWith(root));
    if (!inAllowedRoot || !fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
      return { error: `File not accessible or not found: ${targetPath}` };
    }
    const content = fs.readFileSync(resolved, 'utf8');
    return { targetPath, content: content.slice(0, 6000) };
  }

  if (name === 'write_plugin_code') {
    const key = String(args.key);
    const existing = state.plugins.find((p) => p.key === key);
    if (existing) {
      existing.name = String(args.name || existing.name);
      existing.code = String(args.code || existing.code);
      if (args.description) existing.description = String(args.description);
      existing.updatedAt = now;
      db.addAudit('ai-architect', 'AI_WRITE_PLUGIN', `Updated plugin ${key}`);
      realtimeHub.broadcast('plugin_update', { plugins: state.plugins });
      return { status: 'updated', plugin: existing };
    }
    const created: SystemPlugin = {
      id: `plg-${Date.now().toString().slice(-5)}`,
      key,
      name: String(args.name),
      description: String(args.description || 'AI-authored SDUI plugin'),
      module: (args.module as SystemPlugin['module']) || 'remote-config-sdui',
      enabled: true,
      version: '1.0.0',
      code: String(args.code),
      updatedAt: now,
    };
    state.plugins.unshift(created);
    db.addAudit('ai-architect', 'AI_CREATE_PLUGIN', `Created plugin ${key}`);
    realtimeHub.broadcast('plugin_update', { plugins: state.plugins });
    return { status: 'created', plugin: created };
  }

  if (name === 'run_db_migration') {
    if (typeof args.sundayEmergencyMode === 'boolean') {
      state.remoteConfig.sundayEmergencyMode = args.sundayEmergencyMode;
    }
    if (typeof args.rainSurgeMultiplier === 'number') {
      state.remoteConfig.rainSurgeMultiplier = args.rainSurgeMultiplier;
    }
    if (typeof args.trafficSurgeMultiplier === 'number') {
      state.remoteConfig.trafficSurgeMultiplier = args.trafficSurgeMultiplier;
    }
    if (typeof args.baseWalkerRate === 'number') {
      state.remoteConfig.baseWalkerRate = args.baseWalkerRate;
    }
    if (typeof args.baseBikeRate === 'number') {
      state.remoteConfig.baseBikeRate = args.baseBikeRate;
    }
    if (typeof args.returnDeliveryFee === 'number') {
      state.remoteConfig.returnDeliveryFee = args.returnDeliveryFee;
    }
    if (typeof args.announcementEn === 'string') {
      state.remoteConfig.announcementEn = args.announcementEn;
    }
    if (typeof args.announcementMiz === 'string') {
      state.remoteConfig.announcementMiz = args.announcementMiz;
    }
    state.remoteConfig.updatedAt = now;
    db.addAudit('ai-architect', 'AI_DB_MIGRATION', JSON.stringify(args));
    realtimeHub.broadcast('sdui_update', {
      config: state.remoteConfig,
      effectiveVisibility: evaluateSduiServiceVisibility(state.remoteConfig),
    });
    return { status: 'migrated', remoteConfig: state.remoteConfig };
  }

  if (name === 'toggle_plugin') {
    const key = String(args.key);
    const plugin = state.plugins.find((p) => p.key === key);
    if (!plugin) return { error: `Plugin ${key} not found` };
    plugin.enabled = Boolean(args.enabled);
    plugin.updatedAt = now;
    db.addAudit('ai-architect', 'AI_TOGGLE_PLUGIN', `${key} -> ${plugin.enabled}`);
    realtimeHub.broadcast('plugin_update', { plugins: state.plugins });
    return { status: 'toggled', key, enabled: plugin.enabled };
  }

  if (name === 'deploy_to_sandbox') {
    const base = state.sandboxConfig || state.remoteConfig;
    state.sandboxConfig = {
      ...base,
      ...(typeof args.sundayEmergencyMode === 'boolean'
        ? { sundayEmergencyMode: args.sundayEmergencyMode }
        : {}),
      ...(typeof args.rainSurgeMultiplier === 'number'
        ? { rainSurgeMultiplier: args.rainSurgeMultiplier }
        : {}),
      ...(typeof args.baseWalkerRate === 'number'
        ? { baseWalkerRate: args.baseWalkerRate }
        : {}),
      ...(typeof args.announcementEn === 'string'
        ? { announcementEn: args.announcementEn }
        : {}),
      updatedAt: now,
    };
    db.addAudit('ai-architect', 'AI_DEPLOY_SANDBOX', 'Staged changes to Dev Studio Sandbox');
    return { status: 'staged_to_sandbox', sandboxConfig: state.sandboxConfig };
  }

  return { error: `Unknown tool: ${name}` };
}

devStudioAiRouter.post('/ai-architect', requireAdminAuth, async (req, res) => {
  const { prompt } = req.body as { prompt?: string };
  if (!prompt || !prompt.trim()) {
    res.status(400).json({ error: 'Prompt is required' });
    return;
  }

  try {
    const ai = getGeminiClient();
    const state = db.get();
    const systemInstruction = `You are the Principal AI Software Engineer embedded inside ZoRun's /admin/dev-studio for Mizoram.
You have live tool-calling access to inspect the codebase & SDUI schema (read_codebase), create/edit plugins (write_plugin_code), migrate app_remote_config rate cards or Sunday Emergency Mode (run_db_migration), toggle plugins (toggle_plugin), and stage sandbox previews (deploy_to_sandbox).
Current active plugins: ${state.plugins.map((p) => `${p.key} (${p.enabled ? 'enabled' : 'disabled'})`).join(', ')}.
Current remoteConfig: sundayEmergencyMode=${state.remoteConfig.sundayEmergencyMode}, rainSurge=${state.remoteConfig.rainSurgeMultiplier}, baseWalkerRate=${state.remoteConfig.baseWalkerRate}.
Execute requested changes decisively using your tools, then explain concisely what you changed.`;

    const contents: Content[] = [{ role: 'user', parts: [{ text: prompt }] }];
    const toolInvocations: Array<{ name: string; args: Record<string, unknown>; result: unknown }> = [];

    let finalReply = '';
    for (let step = 0; step < 5; step++) {
      const response = await ai.models.generateContent({
        model: getGeminiModel(),
        contents,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: ARCHITECT_TOOLS }],
        },
      });

      const candidateContent = response.candidates?.[0]?.content;
      const calls = response.functionCalls;

      if (!calls || calls.length === 0) {
        finalReply = response.text || 'Completed.';
        break;
      }

      if (candidateContent) {
        contents.push(candidateContent);
      }

      const responseParts = calls.map((call) => {
        const args = (call.args || {}) as Record<string, unknown>;
        const result = executeArchitectTool(call.name || '', args);
        toolInvocations.push({ name: call.name || '', args, result });
        return {
          functionResponse: {
            id: call.id,
            name: call.name || '',
            response: { result },
          },
        };
      });

      contents.push({ role: 'user', parts: responseParts });
    }

    res.json({
      reply: finalReply || 'Tool actions executed.',
      toolInvocations,
      remoteConfig: state.remoteConfig,
      sandboxConfig: state.sandboxConfig,
      plugins: state.plugins,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI Architect execution failed';
    res.status(502).json({ error: message });
  }
});

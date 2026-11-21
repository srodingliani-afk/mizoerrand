import { Router } from 'express';
import { db } from '../infrastructure/store';
import { evaluateSduiServiceVisibility } from '../domain/rules';
import { realtimeHub } from '../infrastructure/realtimeHub';
import { requireAdminAuth } from '../infrastructure/adminAuth';

export const remoteConfigSduiRouter = Router();

remoteConfigSduiRouter.get('/config', (_req, res) => {
  const state = db.get();
  res.json({
    config: state.remoteConfig,
    effectiveVisibility: evaluateSduiServiceVisibility(state.remoteConfig),
    plugins: state.plugins.map((p) => ({
      id: p.id,
      key: p.key,
      name: p.name,
      module: p.module,
      enabled: p.enabled,
      version: p.version,
    })),
    auditLogs: state.auditLogs.slice(0, 20),
  });
});

remoteConfigSduiRouter.post('/quick-toggle', requireAdminAuth, (req, res) => {
  const { sundayEmergencyMode, rainSurgeMultiplier, trafficSurgeMultiplier } = req.body as {
    sundayEmergencyMode?: boolean;
    rainSurgeMultiplier?: number;
    trafficSurgeMultiplier?: number;
  };
  const state = db.get();
  if (typeof sundayEmergencyMode === 'boolean') {
    state.remoteConfig.sundayEmergencyMode = sundayEmergencyMode;
  }
  if (typeof rainSurgeMultiplier === 'number') {
    state.remoteConfig.rainSurgeMultiplier = Math.max(1.0, Math.min(2.5, rainSurgeMultiplier));
  }
  if (typeof trafficSurgeMultiplier === 'number') {
    state.remoteConfig.trafficSurgeMultiplier = Math.max(1.0, Math.min(2.5, trafficSurgeMultiplier));
  }
  state.remoteConfig.updatedAt = new Date().toISOString();
  db.addAudit(
    'sdui-ops',
    'SDUI_CONFIG_UPDATED',
    `Sunday=${state.remoteConfig.sundayEmergencyMode}, Rain=${state.remoteConfig.rainSurgeMultiplier}x, Traffic=${state.remoteConfig.trafficSurgeMultiplier}x`
  );
  realtimeHub.broadcast('sdui_update', {
    config: state.remoteConfig,
    effectiveVisibility: evaluateSduiServiceVisibility(state.remoteConfig),
  });
  res.json({
    config: state.remoteConfig,
    effectiveVisibility: evaluateSduiServiceVisibility(state.remoteConfig),
  });
});

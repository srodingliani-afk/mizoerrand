import { Router, type Request, type Response, type NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Type, type Content, type FunctionDeclaration } from '@google/genai';
import { db } from '../infrastructure/store';
import { getGeminiClient } from '../infrastructure/geminiClient';
import { realtimeHub } from '../infrastructure/realtimeHub';
import { evaluateSduiServiceVisibility } from '../domain/rules';
import type { AppRemoteConfig, SystemPlugin } from '../../src/shared/types';

export const devStudioAiRouter = Router();

const activeSessions = new Set<string>();
const EXPECTED_2FA_PIN = process.env.SUPER_ADMIN_2FA_PIN || '482910';

function requireDevStudioAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.header('x-dev-studio-token');
  if (!token || !activeSessions.has(token)) {
    res.status(401).json({ error: 'Super-Admin 2FA verification required' });
    return;
  }
  next();
}

devStudioAiRouter.post('/verify-2fa', (req, res) => {
  const { pin } = req.body as { pin?: string };
  if (!pin || pin.trim() !== EXPECTED_2FA_PIN) {
    res.status(403).json({ error: 'Invalid Super-Admin 2FA code.' });
    return;
  }
  const token = crypto.randomBytes(24).toString('hex');
  activeSessions.add(token);
  db.addAudit('super-admin', 'DEV_STUDIO_2FA_UNLOCKED', 'Authenticated session opened for /admin/dev-studio');
  res.json({ token, authenticated: true });
});

devStudioAiRouter.get('/workspace', requireDevStudioAuth, (_req, res) => {
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

devStudioAiRouter.post('/plugins', requireDevStudioAuth, (req, res) => {
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

devStudioAiRouter.delete('/plugins/:id', requireDevStudioAuth, (req, res) => {
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

devStudioAiRouter.post('/sandbox', requireDevStudioAuth, (req, res) => {
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

devStudioAiRouter.post('/publish', requireDevStudioAuth, (req, res) => {
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

devStudioAiRouter.post('/rollback', requireDevStudioAuth, (req, res) => {
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
    const resolved = path.resolve(process.cwd(), targetPath.replace(/^\/+/, ''));
    if (!resolved.startsWith(process.cwd()) || !fs.existsSync(resolved)) {
      return { error: `File not found: ${targetPath}` };
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

devStudioAiRouter.post('/ai-architect', requireDevStudioAuth, async (req, res) => {
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
        model: 'gemini-4-hydrogen',
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

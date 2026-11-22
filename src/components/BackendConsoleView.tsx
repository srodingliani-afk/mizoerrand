import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  Clock,
  Database,
  Flame,
  HardDrive,
  Map as MapIcon,
  Play,
  RefreshCw,
  Server,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import type { Language } from '../shared/types';
import { triggerHaptic } from '../lib/nativeBridge';
import { getGoogleDriveAccessToken } from '../lib/firebase';

interface SystemStatusPayload {
  status: string;
  region: string;
  uptimeSeconds: number;
  connectedMobileClients: number;
  sundayEmergencyMode: boolean;
  configUpdatedAt: string;
  firebase?: {
    projectId: string;
    appConfigured: boolean;
    verificationMode: string;
  };
  database?: {
    driver: 'local_json' | 'postgres_cloudsql';
    target: string;
    region: string;
    connected: boolean;
    fallbackActive: boolean;
    latencyMs: number | null;
    lastSavedAt: string | null;
    pool?: {
      totalCount: number;
      idleCount: number;
      waitingCount: number;
    };
    error?: string;
  };
  driveStorage?: {
    provider: 'google_drive' | 'local_fallback';
    configured: boolean;
    tokenActive: boolean;
    latencyMs: number | null;
    folders: Array<{
      id: string;
      folderName: string;
      privacy: 'public' | 'private';
      maxSizeMb: number;
      status: 'online' | 'missing' | 'unauthenticated' | 'error';
      detail?: string;
    }>;
    error?: string;
  };
  ledgerIntegrity?: {
    totalJournals: number;
    balancedJournals: number;
    unbalancedJournals: number;
    totalDebitsRs: number;
    totalCreditsRs: number;
    isBalanced: boolean;
  };
  mapsPlatform?: {
    routesMatrixReady: boolean;
    geocodingReady: boolean;
    hasApiKey: boolean;
  };
  cronWorker?: {
    schedule: string;
    lastRunAt: string | null;
    runCount: number;
    slaBreachesDetected: number;
    staleBiddingJobs: number;
  };
  counts: {
    partnersTotal: number;
    partnersOnline: number;
    errandsActive: number;
    errandsTotal: number;
    marketplaceProducts: number;
    marketplaceOrders: number;
    workforceTotal: number;
    staffingBookings: number;
    sosOpen: number;
    kycPending: number;
    pluginsEnabled: number;
    pluginsTotal: number;
  };
  auditLogs: Array<{
    id: string;
    actor: string;
    action: string;
    detail: string;
    at: string;
  }>;
  endpoints: Array<{
    key: string;
    name: string;
    method: string;
    path: string;
    purpose: string;
  }>;
}

interface EndpointPingResult {
  path: string;
  status: number;
  latencyMs: number;
  preview: string;
}

interface BackendConsoleViewProps {
  lang: Language;
  adminToken: string;
  onAuthExpired: () => void;
  onOpenMobileApp: () => void;
  onOpenOperations: () => void;
  onOpenDevStudio: () => void;
}

function formatUptime(sec: number): string {
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const rem = sec % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${rem}s`;
  return `${rem}s`;
}

export const BackendConsoleView: React.FC<BackendConsoleViewProps> = ({
  lang,
  adminToken,
  onAuthExpired,
  onOpenMobileApp,
  onOpenOperations,
  onOpenDevStudio,
}) => {
  const [statusData, setStatusData] = useState<SystemStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pingingPath, setPingingPath] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<EndpointPingResult | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${adminToken}`,
      };
      const driveToken = getGoogleDriveAccessToken();
      if (driveToken) {
        headers['X-Google-Access-Token'] = driveToken;
      }

      const res = await fetch('/api/system/status', { headers });
      if (res.status === 401) {
        onAuthExpired();
        return;
      }
      if (!res.ok) throw new Error('Failed to reach backend status endpoint');
      const json = (await res.json()) as SystemStatusPayload;
      setStatusData(json);
    } catch {
      setError('Could not load live server status.');
    } finally {
      setLoading(false);
    }
  }, [adminToken, onAuthExpired]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleTestEndpoint = async (path: string) => {
    setPingingPath(path);
    const start = performance.now();
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${adminToken}`,
      };
      const driveToken = getGoogleDriveAccessToken();
      if (driveToken) {
        headers['X-Google-Access-Token'] = driveToken;
      }
      const res = await fetch(path, { headers });
      if (res.status === 401) {
        onAuthExpired();
        return;
      }
      const elapsed = Math.round(performance.now() - start);
      const text = await res.text();
      let formatted = text;
      try {
        formatted = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        // leave plain text
      }
      setPingResult({
        path,
        status: res.status,
        latencyMs: elapsed,
        preview: formatted.slice(0, 1800) + (formatted.length > 1800 ? '\n... (truncated)' : ''),
      });
    } catch {
      setPingResult({
        path,
        status: 0,
        latencyMs: Math.round(performance.now() - start),
        preview: 'Network error reaching endpoint.',
      });
    } finally {
      setPingingPath(null);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Header Summary */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-teal-800">
            Express Microservices · Google Cloud ({statusData?.region || 'asia-south1'}) · Port 3000
          </p>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">
            Server Backend Web App &amp; API Console
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            {lang === 'miz'
              ? 'User Mobile Standalone App (/, /partner, /merchant) zawng zawng enkawltu Express REST API, Firebase Auth, Double-Entry Ledger leh Google Drive telemetry.'
              : 'Dedicated web backend serving ZoRûn Mobile App over REST & SSE, backed by Firebase Auth, Double-Entry Ledger, Google Drive, and Maps Routes v2.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('sync');
              void loadStatus();
            }}
            className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Telemetry
          </button>
          <button
            type="button"
            onClick={onOpenMobileApp}
            className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
          >
            <Smartphone className="w-3.5 h-3.5" />
            Open User Mobile App
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs text-slate-500">Connected Mobile Clients (SSE)</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {statusData?.connectedMobileClients ?? 0}
          </p>
          <p className="text-xs text-teal-800 mt-1">Realtime SDUI &amp; Dispatch stream</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs text-slate-500">Server Uptime</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {statusData ? formatUptime(statusData.uptimeSeconds) : '—'}
          </p>
          <p className="text-xs text-slate-600 mt-1">Node + Express · {statusData?.region || 'asia-south1'}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs text-slate-500">Live Fleet &amp; Errands</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {statusData ? `${statusData.counts.partnersOnline}/${statusData.counts.partnersTotal}` : '—'}
          </p>
          <p className="text-xs text-slate-600 mt-1">
            {statusData ? `${statusData.counts.errandsActive} active errands · ${statusData.counts.sosOpen} open SOS` : 'Loading...'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs text-slate-500">Active SDUI Plugins</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {statusData ? `${statusData.counts.pluginsEnabled}/${statusData.counts.pluginsTotal}` : '—'}
          </p>
          <p className="text-xs text-slate-600 mt-1">
            {statusData ? `${statusData.counts.kycPending} KYC pending review` : 'Loading...'}
          </p>
        </div>
      </div>

      {/* Live Firebase, Persistence & Ledger, Google Drive Folders, Maps & Cron Health */}
      {statusData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Persistence & Double-Entry Ledger */}
          {statusData.database && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Database className="w-4 h-4 text-teal-700" />
                  Persistence &amp; ACID Ledger ({statusData.database.region})
                </h2>
                <span
                  className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md ${
                    statusData.database.driver === 'postgres_cloudsql' && statusData.database.connected
                      ? 'bg-emerald-100 text-emerald-900'
                      : 'bg-teal-50 text-teal-900'
                  }`}
                >
                  {statusData.database.driver === 'postgres_cloudsql' && statusData.database.connected
                    ? `POSTGRES · ${statusData.database.latencyMs ?? 0}ms`
                    : `LOCAL JSON · ${statusData.database.latencyMs ?? 0}ms`}
                </span>
              </div>
              <p className="text-xs font-mono text-slate-600 break-all">
                Store: {statusData.database.target}
              </p>
              {statusData.ledgerIntegrity && (
                <div className="rounded-xl bg-slate-50 p-3 flex items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
                    <ShieldCheck className="w-4 h-4 text-emerald-700" />
                    Double-Entry Ledger ({statusData.ledgerIntegrity.balancedJournals}/{statusData.ledgerIntegrity.totalJournals} balanced)
                  </span>
                  <span className="font-mono font-bold text-emerald-800">
                    ₹{statusData.ledgerIntegrity.totalDebitsRs.toLocaleString()} Dr = Cr
                  </span>
                </div>
              )}
              {statusData.database.pool && (
                <p className="text-xs font-mono text-slate-500">
                  Pool: total {statusData.database.pool.totalCount} · idle {statusData.database.pool.idleCount} · waiting {statusData.database.pool.waitingCount}
                </p>
              )}
            </div>
          )}

          {/* Google Drive Storage Folders */}
          {statusData.driveStorage && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-teal-700" />
                  Google Drive Media Folders
                </h2>
                <span className="text-[11px] font-mono text-slate-600">
                  {statusData.driveStorage.tokenActive
                    ? `Drive API v3 · ${statusData.driveStorage.latencyMs ?? 0}ms`
                    : 'Sign in w/ Google to activate Drive'}
                </span>
              </div>
              <div className="space-y-1.5">
                {statusData.driveStorage.folders.map((folder) => (
                  <div
                    key={folder.id}
                    className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="font-mono font-semibold text-slate-900">{folder.folderName}</span>
                      <span className="text-[11px] text-slate-500 ml-2">
                        {folder.privacy === 'private' ? 'Private (Admin 2FA)' : 'Shareable'} · ≤{folder.maxSizeMb}MB
                      </span>
                    </div>
                    <span
                      className={`text-[11px] font-mono font-semibold uppercase ${
                        folder.status === 'online'
                          ? 'text-emerald-700'
                          : folder.status === 'unauthenticated'
                            ? 'text-slate-500'
                            : 'text-amber-700'
                      }`}
                    >
                      {folder.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Firebase Auth & Firestore */}
          {statusData.firebase && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-600" />
                  Firebase Auth &amp; Firestore RBAC
                </h2>
                <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900">
                  {statusData.firebase.appConfigured ? 'ACTIVE' : 'CONFIG PENDING'}
                </span>
              </div>
              <p className="text-xs font-mono text-slate-600">
                Project: {statusData.firebase.projectId} · Verifier: {statusData.firebase.verificationMode}
              </p>
              <p className="text-xs text-slate-500">
                District-scoped Firestore rules deployed for Runners, Orders &amp; 24×7 SOS alerts.
              </p>
            </div>
          )}

          {/* Google Maps Routes v2 + Cron SLA Worker */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <MapIcon className="w-4 h-4 text-teal-700" />
                Google Maps v2 &amp; SLA Worker
              </h2>
              <span className="text-[11px] font-mono font-semibold text-teal-800">
                {statusData.mapsPlatform?.hasApiKey ? 'Routes & Geocoding LIVE' : 'Terrain Fallback Ready'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl bg-slate-50 p-2.5">
                <p className="text-[11px] text-slate-500">Routes Matrix &amp; Geocode</p>
                <p className="font-semibold text-slate-900 mt-0.5">
                  {statusData.mapsPlatform?.hasApiKey ? 'API v2 + v4 Key Loaded' : 'Haversine × 1.35'}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5">
                <p className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Cron SLA ({statusData.cronWorker?.schedule || '* * * * *'})
                </p>
                <p className="font-mono font-semibold text-slate-900 mt-0.5">
                  Runs: {statusData.cronWorker?.runCount ?? 0} · SOS SLA: {statusData.cronWorker?.slaBreachesDetected ?? 0}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Split: Express API Catalog + Live Response Inspector & Architecture Map */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Server className="w-4 h-4 text-teal-700" />
              Mounted Backend REST API Modules
            </h2>
            <span className="text-xs font-mono text-slate-500">
              {statusData?.endpoints.length ?? 0} Active Routes
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {(statusData?.endpoints || []).map((ep) => (
              <div
                key={ep.key}
                className="py-3 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {ep.name}{' '}
                    <span className="font-mono text-xs font-medium text-teal-800 ml-1">
                      {ep.method} {ep.path}
                    </span>
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">{ep.purpose}</p>
                </div>
                <button
                  type="button"
                  disabled={pingingPath === ep.path}
                  onClick={() => void handleTestEndpoint(ep.path)}
                  className="min-h-[38px] inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 shrink-0"
                >
                  <Play className="w-3 h-3 text-teal-700" />
                  {pingingPath === ep.path ? 'Testing...' : 'Test API'}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 space-y-5">
          {/* Live API Response Inspector */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Activity className="w-4 h-4 text-teal-700" />
                Live API Response Inspector
              </h2>
              {pingResult && (
                <span className="text-xs font-mono text-teal-800">
                  HTTP {pingResult.status} · {pingResult.latencyMs}ms
                </span>
              )}
            </div>
            {pingResult ? (
              <div className="space-y-2">
                <p className="text-xs font-mono text-slate-600">{pingResult.path}</p>
                <pre className="rounded-xl bg-slate-950 text-slate-100 p-3.5 text-[11px] font-mono overflow-x-auto max-h-64 leading-relaxed">
                  {pingResult.preview}
                </pre>
              </div>
            ) : (
              <p className="text-xs text-slate-600 rounded-xl bg-slate-50 p-4">
                Click <strong>Test API</strong> on any backend route to inspect the live JSON payload returned to mobile standalone clients.
              </p>
            )}
          </div>

          {/* Client / Server Separation Architecture Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-4 h-4 text-teal-700" />
              App Separation Architecture
            </h2>
            <div className="space-y-2.5 text-xs text-slate-700">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="font-semibold text-slate-900">1. User Mobile Standalone App (PWA)</p>
                <p className="mt-0.5 text-slate-600">
                  Routes <span className="font-mono">/</span>, <span className="font-mono">/partner</span>, <span className="font-mono">/merchant</span> · Installable standalone display, thumb-zone bottom bar, offline IndexedDB &amp; Workbox API caching.
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="font-semibold text-slate-900">2. Server Backend Web App</p>
                <p className="mt-0.5 text-slate-600">
                  Routes <span className="font-mono">/admin</span>, <span className="font-mono">/admin/dev-studio</span>, <span className="font-mono">/backend</span>, <span className="font-mono">/api/*</span> · Full desktop operations, 2FA Dev Studio, and Express microservices.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={onOpenOperations}
                className="min-h-[40px] flex-1 inline-flex items-center justify-center gap-1 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
              >
                Operations Center <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onOpenDevStudio}
                className="min-h-[40px] flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Server Dev Studio <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Server Audit Log */}
      {statusData && statusData.auditLogs.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="text-base font-bold text-slate-900">Recent Server Audit Events</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4">Time</th>
                  <th className="py-2 pr-4">Actor</th>
                  <th className="py-2 pr-4">Action</th>
                  <th className="py-2">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {statusData.auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2 pr-4 font-mono text-slate-500 whitespace-nowrap">
                      {new Date(log.at).toLocaleTimeString()}
                    </td>
                    <td className="py-2 pr-4 font-medium text-slate-900 whitespace-nowrap">{log.actor}</td>
                    <td className="py-2 pr-4 font-mono text-teal-800 whitespace-nowrap">{log.action}</td>
                    <td className="py-2 text-slate-600">{log.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

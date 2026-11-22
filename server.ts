import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import zlib from 'zlib';
import cron from 'node-cron';
import { createServer as createViteServer } from 'vite';
import { authKycRouter } from './server/modules/auth-kyc';
import { errandFleetRouter } from './server/modules/errand-fleet';
import { marketplaceAiRouter } from './server/modules/marketplace-ai';
import { managedStaffingRouter } from './server/modules/managed-staffing';
import { emergency24x7Router } from './server/modules/emergency-24x7';
import { paymentEscrowRouter } from './server/modules/payment-escrow';
import { remoteConfigSduiRouter } from './server/modules/remote-config-sdui';
import { devStudioAiRouter } from './server/modules/dev-studio-ai';
import { premiumServicesRouter } from './server/modules/premium-services';
import { mediaStorageRouter } from './server/modules/media-storage';
import { realtimeHub } from './server/infrastructure/realtimeHub';
import { db } from './server/infrastructure/store';
import { checkDriveFoldersHealth } from './server/infrastructure/driveStorage';
import { getFirebaseAdminStatus, optionalFirebaseAuth } from './server/infrastructure/firebaseAdmin';
import { verifyLedgerIntegrity } from './server/infrastructure/ledgerService';
import { evaluateSduiServiceVisibility } from './server/domain/rules';
import { requireAdminAuth } from './server/infrastructure/adminAuth';
import { findNearestMizoramVeng } from './src/data/mizoramDistricts';

const SERVER_STARTED_AT = Date.now();

const cronWorkerState = {
  active: true,
  schedule: '* * * * *',
  runCount: 0,
  lastRunAt: null as string | null,
  slaBreachesDetected: 0,
};

/**
 * Lightweight zero-dependency gzip middleware for JSON, JS, CSS, HTML & SVG
 * dramatically cutting mobile data payload sizes over Mizoram cellular networks.
 */
function gzipMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  if (req.path === '/api/realtime/stream') {
    next();
    return;
  }
  const acceptEncoding = String(req.headers['accept-encoding'] || '');
  if (!acceptEncoding.includes('gzip')) {
    next();
    return;
  }

  const origJson = res.json.bind(res);
  res.json = (body: unknown) => {
    const raw = Buffer.from(JSON.stringify(body));
    if (raw.length < 1024) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.send(raw);
    }
    zlib.gzip(raw, { level: 6 }, (err, compressed) => {
      if (err) {
        origJson(body);
        return;
      }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      res.send(compressed);
    });
    return res;
  };
  next();
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '12mb' }));
  app.use(gzipMiddleware);

  // Aggressive browser caching for static optimized images
  app.use('/src/assets/images', (_req, res, next) => {
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    next();
  });

  // Verify optional Firebase ID tokens attached by authenticated PWA clients
  app.use('/api', optionalFirebaseAuth);

  // Modular micro-service route isolation
  app.use('/api/auth-kyc', authKycRouter);
  app.use('/api/errands', errandFleetRouter);
  app.use('/api/marketplace', marketplaceAiRouter);
  app.use('/api/staffing', managedStaffingRouter);
  app.use('/api/emergency', emergency24x7Router);
  app.use('/api/escrow', paymentEscrowRouter);
  app.use('/api/sdui', remoteConfigSduiRouter);
  app.use('/api/dev-studio', devStudioAiRouter);
  app.use('/api/premium', premiumServicesRouter);
  app.use('/api/media', mediaStorageRouter);

  const resolvePublicMapsApiKey = (): string => {
    const candidates = [
      process.env.GOOGLE_MAPS_API_KEY,
      process.env.VITE_GOOGLE_MAPS_API_KEY,
    ];
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
  };

  // Single-roundtrip mobile app bootstrap endpoint (replaces 7 separate boot requests)
  app.get('/api/bootstrap', (_req, res) => {
    const state = db.get();
    const mapsApiKey = resolvePublicMapsApiKey();
    res.setHeader('Cache-Control', 'no-cache');
    res.json({
      mapsApiKey,
      sdui: {
        config: state.remoteConfig,
        effectiveVisibility: evaluateSduiServiceVisibility(state.remoteConfig),
      },
      partners: state.partners,
      jobs: state.errands,
      products: state.products,
      orders: state.marketplaceOrders,
      userMonthlyReturns: state.userMonthlyReturns,
      workforce: state.workforce,
      bookings: state.staffingBookings,
      leaveRequests: state.staffLeaveRequests,
      attendanceLogs: state.staffAttendanceLogs,
      payrollRecords: state.payrollRecords,
      tickets: state.sosTickets,
      customerWallet: state.customerWallet,
      sumoParcels: state.sumoParcels,
    });
  });

  // Public runtime Maps config (non-secret browser API key if set on server env)
  app.get('/api/config/public', (_req, res) => {
    const mapsApiKey = resolvePublicMapsApiKey();
    res.json({
      mapsApiKey,
      region: 'asia-south1',
    });
  });

  // Server-side Reverse Geocoding proxy (avoids browser CORS trap & keeps Geocoding calls compliant)
  app.get('/api/maps/reverse-geocode', async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      res.status(400).json({ error: 'Valid numeric lat and lng query parameters are required.' });
      return;
    }

    const nearest = findNearestMizoramVeng(lat, lng);
    const coordsLabel = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    const fallbackLandmark = nearest.isWithinMizoramBounds
      ? nearest.distanceMeters <= 350
        ? `${nearest.veng.label} (${nearest.veng.zone} Zone)`
        : `Near ${nearest.veng.label} (~${(nearest.distanceMeters / 1000).toFixed(1)} km)`
      : `GPS Pin (${coordsLabel})`;
    const fallbackAddress = nearest.isWithinMizoramBounds
      ? `${nearest.veng.name}, ${nearest.veng.district}, Mizoram (${coordsLabel})`
      : `Pinned GPS (${coordsLabel}) · Nearest Hub: ${nearest.veng.name}, ${nearest.veng.district}`;

    const apiKey = resolvePublicMapsApiKey();
    if (!apiKey) {
      res.json({
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        district: nearest.veng.district,
        veng: nearest.veng.name,
        zone: nearest.veng.zone,
        elevationM: nearest.veng.elevationM,
        landmark: fallbackLandmark,
        formattedAddress: fallbackAddress,
        isWithinMizoramBounds: nearest.isWithinMizoramBounds,
        distanceToVengMeters: nearest.distanceMeters,
        source: 'mizoram_veng_index',
      });
      return;
    }

    try {
      const url = new URL('https://geocode.googleapis.com/v4/geocode/location');
      url.searchParams.set('location.latitude', String(lat));
      url.searchParams.set('location.longitude', String(lng));
      url.searchParams.set('languageCode', 'en');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const gmRes = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'results.placeId,results.formattedAddress,results.addressComponents,plusCode',
          'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (gmRes.ok) {
        const gmData = (await gmRes.json()) as {
          results?: Array<{
            formattedAddress?: string;
            addressComponents?: Array<{ longText?: string; shortText?: string; types?: string[] }>;
            plusCode?: { compoundCode?: string; globalCode?: string };
          }>;
          plusCode?: { compoundCode?: string; globalCode?: string };
        };
        const top = gmData.results?.[0];
        if (top?.formattedAddress) {
          const components = top.addressComponents || [];
          const sublocality =
            components.find((c) => c.types?.includes('sublocality_level_1'))?.longText ||
            components.find((c) => c.types?.includes('neighborhood'))?.longText ||
            components.find((c) => c.types?.includes('route'))?.longText;
          const plusCode = top.plusCode?.compoundCode || gmData.plusCode?.compoundCode;

          res.json({
            lat: Number(lat.toFixed(6)),
            lng: Number(lng.toFixed(6)),
            district: nearest.veng.district,
            veng: nearest.veng.name,
            zone: nearest.veng.zone,
            elevationM: nearest.veng.elevationM,
            landmark: sublocality || fallbackLandmark,
            formattedAddress: top.formattedAddress,
            plusCode,
            isWithinMizoramBounds: nearest.isWithinMizoramBounds,
            distanceToVengMeters: nearest.distanceMeters,
            source: 'google_geocoding',
          });
          return;
        }
      }
    } catch {
      // Fall through cleanly to local Mizoram Veng index
    }

    res.json({
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      district: nearest.veng.district,
      veng: nearest.veng.name,
      zone: nearest.veng.zone,
      elevationM: nearest.veng.elevationM,
      landmark: fallbackLandmark,
      formattedAddress: fallbackAddress,
      isWithinMizoramBounds: nearest.isWithinMizoramBounds,
      distanceToVengMeters: nearest.distanceMeters,
      source: 'mizoram_veng_index',
    });
  });

  // Server Backend Web App live system telemetry: Firebase, Persistence, Ledger, Google Drive, Maps & Cron SLA
  app.get('/api/system/status', requireAdminAuth, async (req, res) => {
    const state = db.get();
    const driveToken = req.header('x-google-access-token') || undefined;
    const [databaseHealth, driveStorage] = await Promise.all([
      db.checkDatabaseHealth(),
      checkDriveFoldersHealth(driveToken),
    ]);
    const hasMapsKey = Boolean(resolvePublicMapsApiKey());

    res.json({
      status: 'operational',
      region: state.remoteConfig.region || 'asia-south1',
      firebase: getFirebaseAdminStatus(),
      storage: db.getStorageInfo(),
      database: databaseHealth,
      driveStorage,
      workspaceComms: {
        services: ['gmail', 'chat', 'meet', 'drive'],
        tokenActive: Boolean(driveToken),
        oauthConfigured: true,
      },
      ledgerIntegrity: verifyLedgerIntegrity(state),
      mapsPlatform: {
        routesMatrixReady: true,
        geocodingReady: true,
        hasApiKey: hasMapsKey,
      },
      cronWorker: cronWorkerState,
      uptimeSeconds: Math.floor((Date.now() - SERVER_STARTED_AT) / 1000),
      connectedMobileClients: realtimeHub.getClientCount(),
      sundayEmergencyMode: state.remoteConfig.sundayEmergencyMode,
      configUpdatedAt: state.remoteConfig.updatedAt,
      counts: {
        partnersTotal: state.partners.length,
        partnersOnline: state.partners.filter((p) => p.online).length,
        errandsActive: state.errands.filter((e) => e.status !== 'completed' && e.status !== 'cancelled').length,
        errandsTotal: state.errands.length,
        marketplaceProducts: state.products.length,
        marketplaceOrders: state.marketplaceOrders.length,
        workforceTotal: state.workforce.length,
        staffingBookings: state.staffingBookings.length,
        sosOpen: state.sosTickets.filter((s) => s.status !== 'resolved').length,
        kycPending: state.kycQueue.filter((k) => k.status === 'pending').length,
        pluginsEnabled: state.plugins.filter((p) => p.enabled).length,
        pluginsTotal: state.plugins.length,
      },
      auditLogs: state.auditLogs.slice(0, 10),
      endpoints: [
        { key: 'bootstrap', name: 'Unified Mobile Bootstrap', method: 'GET', path: '/api/bootstrap', purpose: 'Single-roundtrip gzipped mobile boot payload (<50ms)' },
        { key: 'media-health', name: 'Google Drive Storage Health', method: 'GET', path: '/api/media/health', purpose: 'Live probe of ZoRun/VoiceNotes, ZoRun/Receipts & private ZoRun/KYC Drive folders' },
        { key: 'sdui', name: 'Remote Config & SDUI', method: 'GET', path: '/api/sdui/config', purpose: 'Zero-install feature flags, surge rates & Sunday Mode' },
        { key: 'errands', name: 'Errands & Corridor Fleet', method: 'GET', path: '/api/errands/partners', purpose: '11-District Runner & fleet live roster' },
        { key: 'jobs', name: 'Active Errand Dispatch', method: 'GET', path: '/api/errands/jobs', purpose: 'Live errands, Routes API v2 distances, Kailawn surcharges & OTP state' },
        { key: 'marketplace', name: 'Marketplace & AI Listing', method: 'GET', path: '/api/marketplace/products', purpose: 'Check-Before-Pay shops, hygiene guard & orders' },
        { key: 'staffing', name: 'Workforce, HR & Payroll', method: 'GET', path: '/api/staffing/directory', purpose: 'Awmpui/Driver CRUD, contracts, leave, replacement & bank payroll' },
        { key: 'emergency', name: '24x7 Rapid SOS', method: 'GET', path: '/api/emergency/tickets', purpose: '12-category 30s SLA emergency dispatch & sliding-window rate guard' },
        { key: 'kyc', name: 'Onboarding & KYC Vetting', method: 'GET', path: '/api/auth-kyc/queue', purpose: 'Public /apply onboarding, private KYC signed URLs & live auto-publish' },
        { key: 'escrow', name: 'Double-Entry & GST Ledger', method: 'GET', path: '/api/escrow/ledger', purpose: 'ACID-style double-entry journals, 18% GST splits & dispute safeguards' },
      ],
    });
  });

  // Realtime SSE stream for zero-install SDUI, dispatch, and SOS updates
  app.get('/api/realtime/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write(`event: connected\ndata: ${JSON.stringify({ region: 'asia-south1' })}\n\n`);
    realtimeHub.addClient(res);

    const keepAlive = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(keepAlive);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
    });
  });

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: hmrDisabled ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    if (hmrDisabled) {
      app.get('/@vite/client', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.send(
          [
            'export function createHotContext(){return {accept(){},dispose(){},decline(){},invalidate(){},on(){},off(){},send(){},prune(){},data:{}};}',
            'export function updateStyle(id,css){let el=document.querySelector(`style[data-vite-dev-id="${id}"]`);if(!el){el=document.createElement("style");el.setAttribute("data-vite-dev-id",id);document.head.appendChild(el);}el.textContent=css;}',
            'export function removeStyle(id){const el=document.querySelector(`style[data-vite-dev-id="${id}"]`);if(el)el.remove();}',
            'export function injectQuery(url){return url;}',
          ].join('\n')
        );
      });
    }
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(
      express.static(distPath, {
        maxAge: '7d',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  await db.initAsync();

  // Automated 60-second node-cron SLA monitor for open 24x7 SOS tickets and stale bidding errands
  cron.schedule(cronWorkerState.schedule, () => {
    const nowMs = Date.now();
    const state = db.get();
    cronWorkerState.runCount += 1;
    cronWorkerState.lastRunAt = new Date(nowMs).toISOString();

    let breachesInPass = 0;

    for (const ticket of state.sosTickets) {
      if (ticket.status !== 'resolved') {
        const elapsedMinutes = (nowMs - new Date(ticket.createdAt).getTime()) / 60_000;
        if (elapsedMinutes > ticket.slaTargetMinutes) {
          breachesInPass += 1;
          realtimeHub.broadcast('sos_alert', {
            slaEscalation: true,
            ticketId: ticket.id,
            district: ticket.district || 'Aizawl',
            elapsedMinutes: Math.round(elapsedMinutes),
          });
        }
      }
    }

    for (const job of state.errands) {
      if (job.status === 'bidding') {
        const elapsedMinutes = (nowMs - new Date(job.createdAt).getTime()) / 60_000;
        if (elapsedMinutes > 15) {
          breachesInPass += 1;
          realtimeHub.broadcast('errand_update', {
            staleBiddingOrderId: job.id,
            district: job.district || 'Aizawl',
            elapsedMinutes: Math.round(elapsedMinutes),
          });
        }
      }
    }

    cronWorkerState.slaBreachesDetected = breachesInPass;
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    const storageInfo = db.getStorageInfo();
    console.log(
      `ZoRun ${storageInfo.region} server listening on http://localhost:${PORT} [${storageInfo.driver}]`
    );
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import zlib from 'zlib';
import { createServer as createViteServer } from 'vite';
import { authKycRouter } from './server/modules/auth-kyc';
import { errandFleetRouter } from './server/modules/errand-fleet';
import { marketplaceAiRouter } from './server/modules/marketplace-ai';
import { managedStaffingRouter } from './server/modules/managed-staffing';
import { emergency24x7Router } from './server/modules/emergency-24x7';
import { paymentEscrowRouter } from './server/modules/payment-escrow';
import { remoteConfigSduiRouter } from './server/modules/remote-config-sdui';
import { devStudioAiRouter } from './server/modules/dev-studio-ai';
import { realtimeHub } from './server/infrastructure/realtimeHub';
import { db } from './server/infrastructure/store';
import { evaluateSduiServiceVisibility } from './server/domain/rules';
import { requireAdminAuth } from './server/infrastructure/adminAuth';

const SERVER_STARTED_AT = Date.now();

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

  // Modular micro-service route isolation
  app.use('/api/auth-kyc', authKycRouter);
  app.use('/api/errands', errandFleetRouter);
  app.use('/api/marketplace', marketplaceAiRouter);
  app.use('/api/staffing', managedStaffingRouter);
  app.use('/api/emergency', emergency24x7Router);
  app.use('/api/escrow', paymentEscrowRouter);
  app.use('/api/sdui', remoteConfigSduiRouter);
  app.use('/api/dev-studio', devStudioAiRouter);

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
    });
  });

  // Public runtime Maps config (non-secret browser API key if set on server env)
  app.get('/api/config/public', (_req, res) => {
    const mapsApiKey = resolvePublicMapsApiKey();
    res.json({
      mapsApiKey,
      region: 'ap-south-1',
    });
  });

  // Server Backend Web App live system telemetry & microservice catalog
  app.get('/api/system/status', requireAdminAuth, (_req, res) => {
    const state = db.get();
    res.json({
      status: 'operational',
      region: state.remoteConfig.region || 'ap-south-1',
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
        { key: 'bootstrap', name: 'Unified Mobile Bootstrap', method: 'GET', path: '/api/bootstrap', purpose: 'Single-roundtrip gzipped mobile boot payload' },
        { key: 'sdui', name: 'Remote Config & SDUI', method: 'GET', path: '/api/sdui/config', purpose: 'Zero-install feature flags, surge rates & Sunday Mode' },
        { key: 'errands', name: 'Errands & Corridor Fleet', method: 'GET', path: '/api/errands/partners', purpose: '11-District Runner & fleet live roster' },
        { key: 'jobs', name: 'Active Errand Dispatch', method: 'GET', path: '/api/errands/jobs', purpose: 'Live errands, bidding & handover OTP state' },
        { key: 'marketplace', name: 'Marketplace & AI Listing', method: 'GET', path: '/api/marketplace/products', purpose: 'Check-Before-Pay shops, hygiene guard & orders' },
        { key: 'staffing', name: 'Workforce, HR & Payroll', method: 'GET', path: '/api/staffing/directory', purpose: 'Awmpui/Driver CRUD, contracts, leave, replacement & bank payroll' },
        { key: 'emergency', name: '24x7 Rapid SOS', method: 'GET', path: '/api/emergency/tickets', purpose: '12-category 30s SLA emergency dispatch & technician updates' },
        { key: 'kyc', name: 'Onboarding & KYC Vetting', method: 'GET', path: '/api/auth-kyc/queue', purpose: 'Public /apply onboarding, PVC/YMA vetting & live auto-publish' },
        { key: 'escrow', name: 'Escrow & GST Ledger', method: 'GET', path: '/api/escrow/ledger', purpose: 'UPI escrow splits, GST & dispute safeguards' },
      ],
    });
  });

  // Realtime SSE stream for zero-install SDUI, dispatch, and SOS updates
  app.get('/api/realtime/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write(`event: connected\ndata: ${JSON.stringify({ region: 'ap-south-1' })}\n\n`);
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

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`ZoRun ap-south-1 server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

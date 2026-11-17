import 'dotenv/config';
import express from 'express';
import path from 'path';
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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '12mb' }));

  // Modular micro-service route isolation
  app.use('/api/auth-kyc', authKycRouter);
  app.use('/api/errands', errandFleetRouter);
  app.use('/api/marketplace', marketplaceAiRouter);
  app.use('/api/staffing', managedStaffingRouter);
  app.use('/api/emergency', emergency24x7Router);
  app.use('/api/escrow', paymentEscrowRouter);
  app.use('/api/sdui', remoteConfigSduiRouter);
  app.use('/api/dev-studio', devStudioAiRouter);

  // Public runtime Maps config (non-secret browser API key if set on server env)
  app.get('/api/config/public', (_req, res) => {
    const mapsApiKey =
      process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
    res.json({
      mapsApiKey,
      region: 'ap-south-1',
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

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ZoRun ap-south-1 server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

import type { Response } from 'express';

export type RealtimeEventType =
  | 'connected'
  | 'sdui_update'
  | 'plugin_update'
  | 'errand_update'
  | 'marketplace_update'
  | 'staffing_update'
  | 'sos_alert'
  | 'escrow_update'
  | 'kyc_update';

class RealtimeHub {
  private readonly clients = new Set<Response>();

  addClient(res: Response): void {
    this.clients.add(res);
    res.on('close', () => {
      this.clients.delete(res);
    });
  }

  broadcast(type: RealtimeEventType, payload: unknown): void {
    const frame = `event: ${type}\ndata: ${JSON.stringify({ type, payload, ts: Date.now() })}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(frame);
      } catch {
        this.clients.delete(client);
      }
    }
  }
}

export const realtimeHub = new RealtimeHub();

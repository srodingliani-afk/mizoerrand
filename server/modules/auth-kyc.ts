import { Router } from 'express';
import { db } from '../infrastructure/store';
import { createSignedPrivateUrl, verifySignedPrivateToken } from '../infrastructure/signedUrls';
import { realtimeHub } from '../infrastructure/realtimeHub';
import type { TrustBadge } from '../../src/shared/types';

export const authKycRouter = Router();

authKycRouter.get('/queue', (_req, res) => {
  const state = db.get();
  const enriched = state.kycQueue.map((item) => {
    const signed = createSignedPrivateUrl(item.id, 'kyc_doc', 60);
    return {
      ...item,
      signedDocumentUrl: signed.url,
      signedExpiresAt: signed.expiresAt,
    };
  });
  res.json({ kycQueue: enriched });
});

authKycRouter.post('/issue-signed-url', (req, res) => {
  const { resourceId, resourceType } = req.body as {
    resourceId?: string;
    resourceType?: 'kyc_doc' | 'voice_note' | 'proof_photo' | 'spare_receipt';
  };
  if (!resourceId || !resourceType) {
    res.status(400).json({ error: 'resourceId and resourceType are required' });
    return;
  }
  const signed = createSignedPrivateUrl(resourceId, resourceType, 60);
  res.json(signed);
});

authKycRouter.get('/signed-media/:token', (req, res) => {
  const verification = verifySignedPrivateToken(req.params.token);
  if (!verification.valid) {
    res.status(403).json({ error: verification.error });
    return;
  }
  res.json({
    verified: true,
    ttlPolicy: '60s private signed URL',
    resourceId: verification.payload.resourceId,
    resourceType: verification.payload.resourceType,
    expiresAt: new Date(verification.payload.exp).toISOString(),
  });
});

authKycRouter.post('/review', (req, res) => {
  const { id, decision, badge } = req.body as {
    id?: string;
    decision?: 'approved' | 'rejected';
    badge?: TrustBadge;
  };
  if (!id || !decision) {
    res.status(400).json({ error: 'id and decision are required' });
    return;
  }
  const state = db.get();
  const item = state.kycQueue.find((k) => k.id === id);
  if (!item) {
    res.status(404).json({ error: 'KYC item not found' });
    return;
  }
  item.status = decision;
  if (decision === 'approved') {
    item.assignedBadge = badge || 'Police Verified - Green Shield';
  }
  db.addAudit('admin', 'KYC_REVIEW', `${item.applicantName} -> ${decision} (${item.assignedBadge || 'none'})`);
  realtimeHub.broadcast('kyc_update', { id: item.id, status: item.status });
  res.json({ item });
});

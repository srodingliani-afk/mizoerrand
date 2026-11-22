import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import {
  checkDriveFoldersHealth,
  createAdminKycSignedUrl,
  uploadMediaToDrive,
  type MediaCategory,
} from '../infrastructure/driveStorage';
import { requireAdminAuth } from '../infrastructure/adminAuth';
import { db } from '../infrastructure/store';

export const mediaStorageRouter = Router();

const VALID_CATEGORIES = new Set<MediaCategory>([
  'voice_note',
  'receipt',
  'proof_photo',
  'kyc_doc',
]);

const signedUrlSchema = z.object({
  objectPath: z.string().trim().min(3).max(220),
  ttlSeconds: z.number().int().min(15).max(300).optional(),
  driveFileId: z.string().trim().min(8).max(128).optional(),
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // Hard ceiling: 5 MB (voice_note further restricted to 2 MB)
    files: 1,
  },
});

function extractGoogleDriveToken(req: Request): string | undefined {
  const explicit = req.header('x-google-access-token')?.trim();
  if (explicit && explicit.length >= 20) {
    return explicit;
  }
  const authHeader = req.header('authorization')?.trim() || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token.startsWith('ya29.')) {
      return token;
    }
  }
  return undefined;
}

function runSingleFileUpload(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'File too large. Maximum allowed size is 5 MB (2 MB for audio).' });
        return;
      }
      res.status(400).json({ error: `Upload rejected: ${err.message}` });
      return;
    }
    if (err) {
      res.status(400).json({ error: 'Failed to parse multipart media upload.' });
      return;
    }
    next();
  });
}

/**
 * POST /api/media/upload
 * Accepts multipart form-data (`file`, `category`, optional `district`, `orderRef`)
 * Validates size (max 2MB audio, max 5MB images/KYC) & file signatures,
 * then uploads to Google Drive folders (`ZoRun/VoiceNotes`, `ZoRun/Receipts`, `ZoRun/KYC`)
 * when an in-memory Google OAuth token is provided, or falls back safely to local dev storage.
 */
mediaStorageRouter.post('/upload', runSingleFileUpload, async (req, res) => {
  const file = req.file;
  if (!file || !file.buffer || file.buffer.length === 0) {
    res.status(400).json({ error: 'Media file is required in multipart field "file".' });
    return;
  }

  const rawCategory = String(req.body?.category || 'receipt').trim() as MediaCategory;
  if (!VALID_CATEGORIES.has(rawCategory)) {
    res.status(400).json({
      error: 'Invalid category. Allowed: voice_note, receipt, proof_photo, kyc_doc.',
    });
    return;
  }

  const district = typeof req.body?.district === 'string' ? req.body.district : 'Aizawl';
  const orderRef = typeof req.body?.orderRef === 'string' ? req.body.orderRef : undefined;
  const driveAccessToken = extractGoogleDriveToken(req);

  try {
    const result = await uploadMediaToDrive({
      buffer: file.buffer,
      mimeType: file.mimetype || 'application/octet-stream',
      category: rawCategory,
      district,
      orderRef,
      driveAccessToken,
    });

    db.addAudit(
      rawCategory === 'kyc_doc' ? 'kyc-applicant' : 'media-upload',
      'MEDIA_UPLOADED',
      `${result.folder} (${Math.round(result.sizeBytes / 1024)}KB, ${result.provider}${result.isPrivate ? ', private' : ''})`
    );

    res.status(201).json({
      ok: true,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Media upload failed.';
    const status = /maximum allowed size/i.test(message) ? 413 : 400;
    res.status(status).json({ error: message });
  }
});

/**
 * POST /api/media/kyc/signed-url
 * Admin 2FA protected endpoint returning a 60-second signed URL or Drive link
 * for private documents stored inside `ZoRun/KYC`.
 */
mediaStorageRouter.post('/kyc/signed-url', requireAdminAuth, async (req, res) => {
  const parsed = signedUrlSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid signed URL request.' });
    return;
  }

  try {
    const signed = await createAdminKycSignedUrl(
      parsed.data.objectPath,
      parsed.data.ttlSeconds ?? 60,
      parsed.data.driveFileId
    );
    db.addAudit('super-admin', 'KYC_SIGNED_URL_ISSUED', `60s signed URL issued for ${parsed.data.objectPath}`);
    res.json(signed);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to issue signed URL.';
    res.status(400).json({ error: message });
  }
});

/**
 * GET /api/media/health
 * Admin 2FA protected live probe of Google Drive folders.
 */
mediaStorageRouter.get('/health', requireAdminAuth, async (req, res) => {
  const report = await checkDriveFoldersHealth(extractGoogleDriveToken(req));
  res.json(report);
});

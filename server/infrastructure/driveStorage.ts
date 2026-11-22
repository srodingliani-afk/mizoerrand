import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createSignedPrivateUrl } from './signedUrls';

export type MediaCategory = 'voice_note' | 'receipt' | 'proof_photo' | 'kyc_doc';

export type DriveFolderId = 'ZoRun/VoiceNotes' | 'ZoRun/Receipts' | 'ZoRun/KYC';

export interface DriveFolderRule {
  folder: DriveFolderId;
  subFolderName: 'VoiceNotes' | 'Receipts' | 'KYC';
  isPrivate: boolean;
  maxBytes: number;
  allowedMimes: ReadonlySet<string>;
}

export const ZORUN_DRIVE_FOLDERS: Record<DriveFolderId, DriveFolderRule> = {
  'ZoRun/VoiceNotes': {
    folder: 'ZoRun/VoiceNotes',
    subFolderName: 'VoiceNotes',
    isPrivate: false,
    maxBytes: 2 * 1024 * 1024, // 2 MB audio cap
    allowedMimes: new Set([
      'audio/webm',
      'audio/ogg',
      'audio/mpeg',
      'audio/mp4',
      'audio/wav',
      'audio/x-m4a',
    ]),
  },
  'ZoRun/Receipts': {
    folder: 'ZoRun/Receipts',
    subFolderName: 'Receipts',
    isPrivate: false,
    maxBytes: 5 * 1024 * 1024, // 5 MB image cap
    allowedMimes: new Set(['image/webp', 'image/jpeg', 'image/png', 'image/avif']),
  },
  'ZoRun/KYC': {
    folder: 'ZoRun/KYC',
    subFolderName: 'KYC',
    isPrivate: true, // Strictly private; Admin 2FA signed URLs only
    maxBytes: 5 * 1024 * 1024, // 5 MB KYC doc cap
    allowedMimes: new Set(['image/webp', 'image/jpeg', 'image/png', 'application/pdf']),
  },
};

export interface MediaUploadResult {
  folder: DriveFolderId;
  bucket: DriveFolderId; // Backwards-compatible alias for UI badges
  objectPath: string;
  driveFileId?: string;
  url: string | null;
  isPrivate: boolean;
  provider: 'google_drive' | 'local_fallback';
  mimeType: string;
  sizeBytes: number;
}

export interface DriveFolderHealthEntry {
  id: DriveFolderId;
  privacy: 'public' | 'private';
  maxSizeMb: number;
  status: 'online' | 'unauthenticated' | 'error';
  detail?: string;
}

export interface DriveStorageHealthReport {
  provider: 'google_drive' | 'local_fallback';
  configured: boolean;
  latencyMs: number | null;
  folders: DriveFolderHealthEntry[];
  error?: string;
}

const LOCAL_MEDIA_ROOT = path.resolve(process.cwd(), '.data', 'media');

export function resolveDriveFolderForCategory(category: MediaCategory): DriveFolderRule {
  switch (category) {
    case 'voice_note':
      return ZORUN_DRIVE_FOLDERS['ZoRun/VoiceNotes'];
    case 'kyc_doc':
      return ZORUN_DRIVE_FOLDERS['ZoRun/KYC'];
    case 'receipt':
    case 'proof_photo':
    default:
      return ZORUN_DRIVE_FOLDERS['ZoRun/Receipts'];
  }
}

function normalizeMimeType(rawMime: string): string {
  return rawMime.split(';')[0].trim().toLowerCase();
}

function extensionForMime(mime: string): string {
  const map: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/wav': 'wav',
    'image/webp': 'webp',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/avif': 'avif',
    'application/pdf': 'pdf',
  };
  return map[mime] || 'bin';
}

/**
 * Verifies binary header signatures so renamed scripts/HTML cannot masquerade
 * as audio, images, or PDFs.
 */
export function hasValidFileSignature(buffer: Buffer, mime: string): boolean {
  if (buffer.length < 4) return false;
  if (mime === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mime === 'image/png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    );
  }
  if (mime === 'image/webp') {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  if (mime === 'image/avif') {
    return buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp';
  }
  if (mime === 'application/pdf') {
    return buffer.subarray(0, 4).toString('ascii') === '%PDF';
  }
  if (mime === 'audio/webm') {
    return (
      buffer[0] === 0x1a &&
      buffer[1] === 0x45 &&
      buffer[2] === 0xdf &&
      buffer[3] === 0xa3
    );
  }
  if (mime === 'audio/ogg') {
    return buffer.subarray(0, 4).toString('ascii') === 'OggS';
  }
  if (mime === 'audio/wav') {
    return buffer.subarray(0, 4).toString('ascii') === 'RIFF';
  }
  if (mime === 'audio/mpeg') {
    const isId3 = buffer.subarray(0, 3).toString('ascii') === 'ID3';
    const isMp3Sync = buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
    return isId3 || isMp3Sync;
  }
  if (mime === 'audio/mp4' || mime === 'audio/x-m4a') {
    return buffer.length >= 8 && buffer.subarray(4, 8).toString('ascii') === 'ftyp';
  }
  return false;
}

function sanitizeSegment(raw: string | undefined, fallback: string): string {
  const cleaned = (raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 32);
  return cleaned || fallback;
}

export function isValidKycObjectPath(objectPath: string): boolean {
  if (!objectPath || objectPath.length > 220) return false;
  if (objectPath.includes('..') || objectPath.startsWith('/') || objectPath.includes('\\')) {
    return false;
  }
  return /^kyc_doc\/[a-z0-9_-]+\/[a-z0-9_.-]+\.(webp|jpg|png|pdf)$/i.test(objectPath);
}

/**
 * Validates media URLs saved into orders (accepts Google Drive HTTPS URLs,
 * trusted local `/api/` or `/src/assets/` paths, or bounded base64 data URLs
 * in local fallback mode; strictly rejects javascript: or unsafe schemes).
 */
export function isTrustedMediaUrl(
  raw: unknown,
  kind: 'audio' | 'image'
): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  if (trimmed.startsWith('https://')) {
    if (trimmed.length > 2048) return undefined;
    try {
      const parsed = new URL(trimmed);
      const host = parsed.hostname.toLowerCase();
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '0.0.0.0' ||
        host.startsWith('10.') ||
        host.startsWith('192.168.') ||
        host === '169.254.169.254'
      ) {
        return undefined;
      }
      return trimmed;
    } catch {
      return undefined;
    }
  }

  if (trimmed.startsWith('/api/') || trimmed.startsWith('/src/assets/')) {
    if (trimmed.length > 512 || trimmed.includes('..')) return undefined;
    return trimmed;
  }

  if (kind === 'audio' && trimmed.startsWith('data:audio/') && trimmed.length <= 2_800_000) {
    return trimmed;
  }
  if (kind === 'image' && trimmed.startsWith('data:image/') && trimmed.length <= 1_400_000) {
    return trimmed;
  }

  return undefined;
}

async function ensureDriveFolder(
  accessToken: string,
  folderName: string,
  parentId?: string
): Promise<string> {
  const safeName = folderName.replace(/'/g, '');
  const qParts = [
    `name = '${safeName}'`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    `trashed = false`,
  ];
  if (parentId) {
    qParts.push(`'${parentId}' in parents`);
  }
  const searchUrl = new URL('https://www.googleapis.com/drive/v3/files');
  searchUrl.searchParams.set('q', qParts.join(' and '));
  searchUrl.searchParams.set('fields', 'files(id, name)');
  searchUrl.searchParams.set('pageSize', '1');

  const searchRes = await fetch(searchUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!searchRes.ok) {
    const errText = await searchRes.text().catch(() => searchRes.statusText);
    throw new Error(`Google Drive folder lookup failed (${searchRes.status}): ${errText.slice(0, 140)}`);
  }
  const searchJson = (await searchRes.json()) as { files?: Array<{ id: string }> };
  if (searchJson.files && searchJson.files[0]?.id) {
    return searchJson.files[0].id;
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: safeName,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  if (!createRes.ok) {
    const errText = await createRes.text().catch(() => createRes.statusText);
    throw new Error(`Google Drive folder creation failed (${createRes.status}): ${errText.slice(0, 140)}`);
  }
  const created = (await createRes.json()) as { id: string };
  return created.id;
}

async function uploadBufferToGoogleDrive(params: {
  accessToken: string;
  folderName: 'VoiceNotes' | 'Receipts' | 'KYC';
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  description: string;
}): Promise<{ id: string; webViewLink?: string }> {
  const rootFolderId = await ensureDriveFolder(params.accessToken, 'ZoRun');
  const subFolderId = await ensureDriveFolder(
    params.accessToken,
    params.folderName,
    rootFolderId
  );

  const boundary = `zorun_drive_${crypto.randomBytes(12).toString('hex')}`;
  const metadataPart = JSON.stringify({
    name: params.fileName,
    parents: [subFolderId],
    description: params.description,
  });

  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataPart}\r\n--${boundary}\r\nContent-Type: ${params.mimeType}\r\n\r\n`,
    'utf8'
  );
  const suffix = Buffer.from(`\r\n--${boundary}--`, 'utf8');
  const multipartBody = Buffer.concat([prefix, params.buffer, suffix]);

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }
  );

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => uploadRes.statusText);
    throw new Error(`Google Drive upload failed (${uploadRes.status}): ${errText.slice(0, 160)}`);
  }

  return (await uploadRes.json()) as { id: string; webViewLink?: string };
}

function saveToLocalMediaDisk(objectPath: string, buffer: Buffer): void {
  const target = path.resolve(LOCAL_MEDIA_ROOT, objectPath);
  if (!target.startsWith(LOCAL_MEDIA_ROOT)) {
    throw new Error('Invalid local media target path.');
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, buffer);
}

export async function uploadMediaToDrive(params: {
  buffer: Buffer;
  mimeType: string;
  category: MediaCategory;
  district?: string;
  orderRef?: string;
  driveAccessToken?: string;
}): Promise<MediaUploadResult> {
  const rule = resolveDriveFolderForCategory(params.category);
  const normalizedMime = normalizeMimeType(params.mimeType);

  if (!rule.allowedMimes.has(normalizedMime)) {
    throw new Error(
      `Unsupported file type "${normalizedMime}" for ${params.category}. Allowed: ${Array.from(rule.allowedMimes).join(', ')}`
    );
  }

  if (params.buffer.length === 0 || params.buffer.length > rule.maxBytes) {
    const maxMb = Math.round((rule.maxBytes / (1024 * 1024)) * 10) / 10;
    throw new Error(`File exceeds maximum allowed size (${maxMb} MB) for ${params.category}.`);
  }

  if (!hasValidFileSignature(params.buffer, normalizedMime)) {
    throw new Error('File content does not match the declared media type.');
  }

  const ext = extensionForMime(normalizedMime);
  const districtSlug = sanitizeSegment(params.district, 'aizawl');
  const refSlug = sanitizeSegment(params.orderRef, 'media');
  const randomSuffix = crypto.randomBytes(6).toString('hex');
  const baseFileName = `${Date.now()}-${refSlug}-${randomSuffix}.${ext}`;
  const objectPath = `${params.category}/${districtSlug}/${baseFileName}`;

  const token = (params.driveAccessToken || '').trim();
  if (token.length >= 20) {
    const uploaded = await uploadBufferToGoogleDrive({
      accessToken: token,
      folderName: rule.subFolderName,
      fileName: `${districtSlug}_${baseFileName}`,
      mimeType: normalizedMime,
      buffer: params.buffer,
      description: `ZoRun ${params.category} (${districtSlug})`,
    });

    if (rule.isPrivate) {
      return {
        folder: rule.folder,
        bucket: rule.folder,
        objectPath,
        driveFileId: uploaded.id,
        url: null,
        isPrivate: true,
        provider: 'google_drive',
        mimeType: normalizedMime,
        sizeBytes: params.buffer.length,
      };
    }

    return {
      folder: rule.folder,
      bucket: rule.folder,
      objectPath,
      driveFileId: uploaded.id,
      url: `https://drive.google.com/uc?export=view&id=${encodeURIComponent(uploaded.id)}`,
      isPrivate: false,
      provider: 'google_drive',
      mimeType: normalizedMime,
      sizeBytes: params.buffer.length,
    };
  }

  // Local dev fallback when user has not signed in with Google Drive OAuth yet
  saveToLocalMediaDisk(objectPath, params.buffer);

  if (rule.isPrivate) {
    return {
      folder: rule.folder,
      bucket: rule.folder,
      objectPath,
      url: null,
      isPrivate: true,
      provider: 'local_fallback',
      mimeType: normalizedMime,
      sizeBytes: params.buffer.length,
    };
  }

  const base64DataUrl = `data:${normalizedMime};base64,${params.buffer.toString('base64')}`;
  return {
    folder: rule.folder,
    bucket: rule.folder,
    objectPath,
    url: base64DataUrl,
    isPrivate: false,
    provider: 'local_fallback',
    mimeType: normalizedMime,
    sizeBytes: params.buffer.length,
  };
}

/**
 * Generates a short-lived (default 60s) Admin-only signed URL for private KYC documents
 * stored inside `ZoRun/KYC`. Callers MUST enforce `requireAdminAuth` (Admin 2FA).
 */
export async function createAdminKycSignedUrl(
  objectPath: string,
  ttlSeconds = 60,
  driveFileId?: string
): Promise<{
  signedUrl: string;
  expiresAt: string;
  folder: 'ZoRun/KYC';
  bucket: 'ZoRun/KYC';
  provider: 'google_drive' | 'local_fallback';
}> {
  if (!isValidKycObjectPath(objectPath)) {
    throw new Error('Invalid KYC document object path.');
  }

  const clampedTtl = Math.max(15, Math.min(300, Math.round(ttlSeconds)));
  const localSigned = createSignedPrivateUrl(objectPath, 'kyc_doc', clampedTtl);

  if (driveFileId && /^[a-zA-Z0-9_-]{8,128}$/.test(driveFileId)) {
    return {
      signedUrl: `https://drive.google.com/file/d/${encodeURIComponent(driveFileId)}/view`,
      expiresAt: localSigned.expiresAt,
      folder: 'ZoRun/KYC',
      bucket: 'ZoRun/KYC',
      provider: 'google_drive',
    };
  }

  return {
    signedUrl: localSigned.url,
    expiresAt: localSigned.expiresAt,
    folder: 'ZoRun/KYC',
    bucket: 'ZoRun/KYC',
    provider: 'local_fallback',
  };
}

export async function checkDriveFoldersHealth(
  driveAccessToken?: string
): Promise<DriveStorageHealthReport> {
  const folderIds: DriveFolderId[] = [
    'ZoRun/VoiceNotes',
    'ZoRun/Receipts',
    'ZoRun/KYC',
  ];

  const token = (driveAccessToken || '').trim();
  if (!token) {
    return {
      provider: 'local_fallback',
      configured: true,
      latencyMs: null,
      folders: folderIds.map((id) => ({
        id,
        privacy: ZORUN_DRIVE_FOLDERS[id].isPrivate ? 'private' : 'public',
        maxSizeMb: Math.round(ZORUN_DRIVE_FOLDERS[id].maxBytes / (1024 * 1024)),
        status: 'unauthenticated',
        detail: 'Sign in with Google OAuth in user app to route media into Google Drive folders',
      })),
    };
  }

  const start = Date.now();
  try {
    const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      return {
        provider: 'google_drive',
        configured: true,
        latencyMs,
        error: `Google Drive API probe returned HTTP ${res.status}`,
        folders: folderIds.map((id) => ({
          id,
          privacy: ZORUN_DRIVE_FOLDERS[id].isPrivate ? 'private' : 'public',
          maxSizeMb: Math.round(ZORUN_DRIVE_FOLDERS[id].maxBytes / (1024 * 1024)),
          status: 'error',
          detail: `HTTP ${res.status}`,
        })),
      };
    }

    return {
      provider: 'google_drive',
      configured: true,
      latencyMs,
      folders: folderIds.map((id) => ({
        id,
        privacy: ZORUN_DRIVE_FOLDERS[id].isPrivate ? 'private' : 'public',
        maxSizeMb: Math.round(ZORUN_DRIVE_FOLDERS[id].maxBytes / (1024 * 1024)),
        status: 'online',
        detail: ZORUN_DRIVE_FOLDERS[id].isPrivate
          ? 'Private Drive Vault (Admin 2FA access)'
          : 'Google Drive API v3 active',
      })),
    };
  } catch (err) {
    return {
      provider: 'google_drive',
      configured: true,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'Google Drive health probe failed',
      folders: folderIds.map((id) => ({
        id,
        privacy: ZORUN_DRIVE_FOLDERS[id].isPrivate ? 'private' : 'public',
        maxSizeMb: Math.round(ZORUN_DRIVE_FOLDERS[id].maxBytes / (1024 * 1024)),
        status: 'error',
      })),
    };
  }
}

import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './store';

export type AdminAuthSource = 'env' | 'claimed' | 'unclaimed';

interface AdminSession {
  createdAt: number;
  expiresAt: number;
}

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const RATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_FAILED_ATTEMPTS = 10;

const activeSessions = new Map<string, AdminSession>();
const failedAttempts = new Map<string, { count: number; resetAt: number }>();

function getEnvPasscode(): string | null {
  const raw = process.env.SUPER_ADMIN_2FA_PIN?.trim();
  return raw && raw.length > 0 ? raw : null;
}

export function getAdminAuthStatus(): { configured: boolean; source: AdminAuthSource } {
  if (getEnvPasscode()) {
    return { configured: true, source: 'env' };
  }
  const stored = db.get().adminAuth;
  if (stored?.passcodeHash && stored?.salt) {
    return { configured: true, source: 'claimed' };
  }
  return { configured: false, source: 'unclaimed' };
}

function createSessionToken(): { token: string; expiresAt: string } {
  const now = Date.now();
  // Prune expired sessions
  for (const [k, s] of activeSessions.entries()) {
    if (s.expiresAt <= now) activeSessions.delete(k);
  }
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = now + SESSION_TTL_MS;
  activeSessions.set(token, { createdAt: now, expiresAt });
  return { token, expiresAt: new Date(expiresAt).toISOString() };
}

function getClientKey(req: Request): string {
  return (req.ip || req.socket.remoteAddress || 'unknown').trim();
}

function isRateLimited(clientKey: string): boolean {
  const entry = failedAttempts.get(clientKey);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    failedAttempts.delete(clientKey);
    return false;
  }
  return entry.count >= MAX_FAILED_ATTEMPTS;
}

function recordFailedAttempt(clientKey: string): void {
  const now = Date.now();
  const entry = failedAttempts.get(clientKey);
  if (!entry || now > entry.resetAt) {
    failedAttempts.set(clientKey, { count: 1, resetAt: now + RATE_WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

function clearFailedAttempts(clientKey: string): void {
  failedAttempts.delete(clientKey);
}

export function claimInitialAdminPasscode(
  passcode: string
):
  | { ok: true; token: string; source: 'claimed'; expiresAt: string }
  | { ok: false; status: number; error: string } {
  const status = getAdminAuthStatus();
  if (status.source !== 'unclaimed') {
    return {
      ok: false,
      status: 409,
      error: 'Super Admin passcode is already configured. Please sign in instead.',
    };
  }

  const trimmed = passcode.trim();
  if (trimmed.length < 6 || trimmed.length > 128) {
    return {
      ok: false,
      status: 400,
      error: 'Passcode must be between 6 and 128 characters.',
    };
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(trimmed, salt, 64).toString('hex');

  db.get().adminAuth = {
    passcodeHash: hash,
    salt,
    claimedAt: new Date().toISOString(),
  };
  db.addAudit('super-admin', 'ADMIN_PASSCODE_CLAIMED', 'Initial Super Admin passcode configured');

  const session = createSessionToken();
  return { ok: true, token: session.token, source: 'claimed', expiresAt: session.expiresAt };
}

export function verifyAdminPasscode(
  req: Request,
  passcode: string
):
  | { ok: true; token: string; source: AdminAuthSource; expiresAt: string }
  | { ok: false; status: number; error: string } {
  const clientKey = getClientKey(req);
  if (isRateLimited(clientKey)) {
    return {
      ok: false,
      status: 429,
      error: 'Too many incorrect attempts. Please wait 5 minutes and try again.',
    };
  }

  const trimmed = passcode.trim();
  if (!trimmed) {
    return { ok: false, status: 400, error: 'Please enter your Super Admin passcode.' };
  }

  const envPin = getEnvPasscode();
  if (envPin) {
    const providedDigest = crypto.createHash('sha256').update(trimmed).digest();
    const expectedDigest = crypto.createHash('sha256').update(envPin).digest();
    const matched = crypto.timingSafeEqual(providedDigest, expectedDigest);
    if (!matched) {
      recordFailedAttempt(clientKey);
      return { ok: false, status: 403, error: 'Incorrect Super Admin passcode.' };
    }
    clearFailedAttempts(clientKey);
    const session = createSessionToken();
    db.addAudit('super-admin', 'ADMIN_LOGIN', 'Super Admin session authenticated');
    return { ok: true, token: session.token, source: 'env', expiresAt: session.expiresAt };
  }

  const stored = db.get().adminAuth;
  if (!stored?.passcodeHash || !stored?.salt) {
    return {
      ok: false,
      status: 409,
      error: 'Super Admin passcode is not set up yet. Please create one first.',
    };
  }

  const derived = crypto.scryptSync(trimmed, stored.salt, 64);
  const storedBuf = Buffer.from(stored.passcodeHash, 'hex');
  const matched =
    derived.length === storedBuf.length && crypto.timingSafeEqual(derived, storedBuf);
  if (!matched) {
    recordFailedAttempt(clientKey);
    return { ok: false, status: 403, error: 'Incorrect Super Admin passcode.' };
  }

  clearFailedAttempts(clientKey);
  const session = createSessionToken();
  db.addAudit('super-admin', 'ADMIN_LOGIN', 'Super Admin session authenticated');
  return { ok: true, token: session.token, source: 'claimed', expiresAt: session.expiresAt };
}

export function extractAdminToken(req: Request): string | null {
  const authHeader = req.header('authorization') || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }
  const legacy = req.header('x-dev-studio-token')?.trim();
  return legacy || null;
}

export function isValidAdminToken(token: string | null): boolean {
  if (!token) return false;
  const session = activeSessions.get(token);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    activeSessions.delete(token);
    return false;
  }
  return true;
}

export function revokeAdminSession(token: string | null): void {
  if (token) {
    activeSessions.delete(token);
  }
}

export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractAdminToken(req);
  if (!isValidAdminToken(token)) {
    res.status(401).json({ error: 'Super Admin sign-in required. Please authenticate first.' });
    return;
  }
  next();
}

import { getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import type { NextFunction, Request, Response } from 'express';
import firebaseConfig from '../../firebase-applet-config.json';

function isValidFirebaseProjectId(id: unknown): id is string {
  return (
    typeof id === 'string' &&
    id.trim().length > 0 &&
    !/remixed-project-id|placeholder|your_/i.test(id)
  );
}

let cachedAdminApp: App | null = null;

export function getFirebaseAdminApp(): App | null {
  if (!isValidFirebaseProjectId(firebaseConfig?.projectId)) {
    return null;
  }
  if (!cachedAdminApp) {
    cachedAdminApp = getApps().length
      ? getApp()
      : initializeApp({
          projectId: firebaseConfig.projectId,
        });
  }
  return cachedAdminApp;
}

export interface VerifiedFirebaseUser {
  uid: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

/**
 * Verifies a client Firebase ID token using firebase-admin/auth (`verifyIdToken(token)`).
 * Note: Does NOT call `checkRevoked=true`, `getUser()`, or `admin.firestore()`, ensuring full
 * compatibility on Google-hosted projects without extra IAM permissions.
 */
export async function verifyFirebaseIdToken(
  idToken: string
): Promise<VerifiedFirebaseUser | null> {
  const trimmed = idToken.trim();
  if (!trimmed) return null;

  const app = getFirebaseAdminApp();
  if (!app) return null;

  try {
    const decoded: DecodedIdToken = await getAuth(app).verifyIdToken(trimmed);
    return {
      uid: decoded.uid,
      email: decoded.email,
      emailVerified: Boolean(decoded.email_verified),
      name: typeof decoded.name === 'string' ? decoded.name : undefined,
      picture: typeof decoded.picture === 'string' ? decoded.picture : undefined,
    };
  } catch {
    return null;
  }
}

export function extractFirebaseIdToken(req: Request): string | null {
  const headerToken = req.header('x-firebase-id-token')?.trim();
  if (headerToken) return headerToken;
  return null;
}

export function optionalFirebaseAuth(
  req: Request & { firebaseUser?: VerifiedFirebaseUser },
  _res: Response,
  next: NextFunction
): void {
  const token = extractFirebaseIdToken(req);
  if (!token) {
    next();
    return;
  }
  void verifyFirebaseIdToken(token)
    .then((user) => {
      if (user) {
        req.firebaseUser = user;
      }
      next();
    })
    .catch(() => next());
}

export function getFirebaseAdminStatus(): {
  projectId: string | null;
  authDomain: string | null;
  configured: boolean;
  verificationMode: 'verifyIdToken_no_iam' | 'unconfigured';
} {
  const configured = isValidFirebaseProjectId(firebaseConfig?.projectId);
  return {
    projectId: configured ? firebaseConfig.projectId : null,
    authDomain: configured ? firebaseConfig.authDomain : null,
    configured,
    verificationMode: configured ? 'verifyIdToken_no_iam' : 'unconfigured',
  };
}

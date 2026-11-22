import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type { MizoramDistrict, UserRole } from '../shared/types';

// Strict module-memory storage for tokens (never persisted in localStorage/sessionStorage)
let inMemoryFirebaseIdToken: string | null = null;
let inMemoryGoogleDriveAccessToken: string | null = null;

export function getFirebaseIdToken(): string | null {
  return inMemoryFirebaseIdToken;
}

export function getGoogleDriveAccessToken(): string | null {
  return inMemoryGoogleDriveAccessToken;
}

export function clearInMemoryAuthTokens(): void {
  inMemoryFirebaseIdToken = null;
  inMemoryGoogleDriveAccessToken = null;
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(app);

const configuredDatabaseId = (firebaseConfig as { firestoreDatabaseId?: string })
  .firestoreDatabaseId;
export const firestoreDb: Firestore =
  configuredDatabaseId && configuredDatabaseId !== '(default)'
    ? getFirestore(app, configuredDatabaseId)
    : getFirestore(app);

export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
} as const;
export type OperationType = (typeof OperationType)[keyof typeof OperationType];

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: Array<{
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }>;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: firebaseAuth.currentUser?.uid,
      email: firebaseAuth.currentUser?.email,
      emailVerified: firebaseAuth.currentUser?.emailVerified,
      isAnonymous: firebaseAuth.currentUser?.isAnonymous,
      tenantId: firebaseAuth.currentUser?.tenantId,
      providerInfo:
        firebaseAuth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class FirestoreErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(err: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: err.message || 'An unexpected application error occurred.',
    };
  }

  componentDidCatch(err: Error): void {
    console.error('FirestoreErrorBoundary caught:', err.message);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-3xl border border-red-200 dark:border-red-900 bg-white dark:bg-slate-900 p-6 shadow-lg space-y-3 text-center">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Connection or Permission Notice
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 break-words">
              {this.state.message.startsWith('{')
                ? 'Could not complete a secure Firestore sync operation. Please verify your sign-in session and try again.'
                : this.state.message}
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="min-h-[40px] rounded-xl bg-emerald-800 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-900"
            >
              Retry App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export interface UserPublicProfile {
  uid: string;
  displayName: string;
  role: UserRole;
  preferredWorkspace?: 'customer' | 'partner' | 'staff' | 'merchant' | 'technician';
  district: MizoramDistrict;
  photoUrl?: string;
}

interface FirebaseAuthContextValue {
  user: User | null;
  profile: UserPublicProfile | null;
  effectiveRole: UserRole;
  driveConnected: boolean;
  firestoreOnline: boolean;
  loading: boolean;
  authError: string | null;
  signInWithGoogle: (activeDistrict?: MizoramDistrict) => Promise<void>;
  disconnectDriveToken: () => void;
  signOutFirebase: () => Promise<void>;
  syncProfileDistrict: (district: MizoramDistrict) => Promise<void>;
  clearAuthError: () => void;
}

const FirebaseAuthContext = createContext<FirebaseAuthContextValue | null>(null);

const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
];

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserPublicProfile | null>(null);
  const [driveConnected, setDriveConnected] = useState(false);
  const [firestoreOnline, setFirestoreOnline] = useState(true);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Test Firestore reachability on boot
  useEffect(() => {
    let active = true;
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(firestoreDb, 'test', 'connection'));
        if (active) setFirestoreOnline(true);
      } catch (err) {
        if (err instanceof Error && err.message.includes('the client is offline')) {
          if (active) setFirestoreOnline(false);
          console.warn('Firestore offline at boot — falling back cleanly until reconnected.');
        }
      }
    };
    void testConnection();
    return () => {
      active = false;
    };
  }, []);

  const ensureUserProfile = useCallback(
    async (u: User, fallbackDistrict: MizoramDistrict = 'Aizawl') => {
      const publicPath = `users/${u.uid}/public/profile`;
      const privatePath = `users/${u.uid}/private/info`;

      try {
        const publicRef = doc(firestoreDb, 'users', u.uid, 'public', 'profile');
        const snap = await getDoc(publicRef);
        if (snap.exists()) {
          const data = snap.data() as UserPublicProfile;
          setProfile(data);
        } else if (u.emailVerified) {
          const defaultRole: UserRole =
            u.email === 'srodingliani@gmail.com' ? 'SUPER_ADMIN' : 'CUSTOMER';
          const safeName = (u.displayName || u.email?.split('@')[0] || 'ZoRûn User').slice(0, 80);
          const nextPublic: Record<string, unknown> = {
            uid: u.uid,
            displayName: safeName,
            role: defaultRole,
            preferredWorkspace: 'customer',
            district: fallbackDistrict,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          if (u.photoURL && u.photoURL.length <= 512) {
            nextPublic.photoUrl = u.photoURL;
          }
          await setDoc(publicRef, nextPublic);
          setProfile({
            uid: u.uid,
            displayName: safeName,
            role: defaultRole,
            preferredWorkspace: 'customer',
            district: fallbackDistrict,
            photoUrl: u.photoURL || undefined,
          });
        }

        if (u.emailVerified) {
          const privateRef = doc(firestoreDb, 'users', u.uid, 'private', 'info');
          const privSnap = await getDoc(privateRef);
          if (!privSnap.exists()) {
            const nextPrivate: Record<string, unknown> = {
              uid: u.uid,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            if (u.email) nextPrivate.email = u.email.slice(0, 160);
            if (u.phoneNumber) nextPrivate.phone = u.phoneNumber.slice(0, 24);
            await setDoc(privateRef, nextPrivate);
          }
        }
      } catch (err) {
        try {
          handleFirestoreError(err, OperationType.WRITE, `${publicPath} | ${privatePath}`);
        } catch {
          // Non-fatal in background observer; local profile remains available
        }
      }
    },
    []
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth, async (nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        clearInMemoryAuthTokens();
        setDriveConnected(false);
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        inMemoryFirebaseIdToken = await nextUser.getIdToken();
      } catch {
        inMemoryFirebaseIdToken = null;
      }
      await ensureUserProfile(nextUser);
      setLoading(false);
    });

    return () => unsub();
  }, [ensureUserProfile]);

  const signInWithGoogle = useCallback(
    async (activeDistrict: MizoramDistrict = 'Aizawl') => {
      setAuthError(null);
      try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        for (const scope of GOOGLE_DRIVE_SCOPES) {
          provider.addScope(scope);
        }
        const result = await signInWithPopup(firebaseAuth, provider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        inMemoryGoogleDriveAccessToken = credential?.accessToken || null;
        setDriveConnected(Boolean(inMemoryGoogleDriveAccessToken));
        inMemoryFirebaseIdToken = await result.user.getIdToken();
        await ensureUserProfile(result.user, activeDistrict);
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message.replace('Firebase: ', '')
            : 'Google Sign-In did not complete.';
        setAuthError(msg);
      }
    },
    [ensureUserProfile]
  );

  const disconnectDriveToken = useCallback(() => {
    inMemoryGoogleDriveAccessToken = null;
    setDriveConnected(false);
  }, []);

  const signOutFirebase = useCallback(async () => {
    clearInMemoryAuthTokens();
    setDriveConnected(false);
    setProfile(null);
    setAuthError(null);
    await signOut(firebaseAuth);
  }, []);

  const syncProfileDistrict = useCallback(
    async (district: MizoramDistrict) => {
      if (!user || !user.emailVerified || !profile) return;
      const publicPath = `users/${user.uid}/public/profile`;
      try {
        await updateDoc(doc(firestoreDb, 'users', user.uid, 'public', 'profile'), {
          district,
          updatedAt: serverTimestamp(),
        });
        setProfile((prev) => (prev ? { ...prev, district } : prev));
      } catch (err) {
        try {
          handleFirestoreError(err, OperationType.UPDATE, publicPath);
        } catch {
          // Keep local district updated even if offline
        }
      }
    },
    [profile, user]
  );

  const effectiveRole: UserRole =
    profile?.role ||
    (user?.email === 'srodingliani@gmail.com' ? 'SUPER_ADMIN' : 'CUSTOMER');

  return (
    <FirebaseAuthContext.Provider
      value={{
        user,
        profile,
        effectiveRole,
        driveConnected,
        firestoreOnline,
        loading,
        authError,
        signInWithGoogle,
        disconnectDriveToken,
        signOutFirebase,
        syncProfileDistrict,
        clearAuthError: () => setAuthError(null),
      }}
    >
      {children}
    </FirebaseAuthContext.Provider>
  );
};

export function useFirebaseAuth(): FirebaseAuthContextValue {
  const ctx = useContext(FirebaseAuthContext);
  if (!ctx) {
    throw new Error('useFirebaseAuth must be used inside FirebaseProvider');
  }
  return ctx;
}

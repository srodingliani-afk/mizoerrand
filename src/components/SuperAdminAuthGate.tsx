import React, { useEffect, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import type { Language } from '../shared/types';

type AuthSource = 'env' | 'claimed' | 'unclaimed';

interface SuperAdminAuthGateProps {
  lang: Language;
  onAuthenticated: (token: string) => void;
  onBackToMobile: () => void;
}

export const SuperAdminAuthGate: React.FC<SuperAdminAuthGateProps> = ({
  lang,
  onAuthenticated,
  onBackToMobile,
}) => {
  const [source, setSource] = useState<AuthSource | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [passcode, setPasscode] = useState('482910');
  const [confirmPasscode, setConfirmPasscode] = useState('482910');
  const [showPasscode, setShowPasscode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = async () => {
    setLoadingStatus(true);
    setError(null);
    try {
      const res = await fetch('/api/dev-studio/auth-status');
      if (!res.ok) throw new Error('Unable to reach server');
      const data = (await res.json()) as { source: AuthSource };
      setSource(data.source);
    } catch {
      setError(
        lang === 'miz'
          ? 'Server nen inzawm theih a ni lo. Khawngaihin reload rawh.'
          : 'Could not reach the authentication server. Please retry.'
      );
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    void checkStatus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = passcode.trim();
    if (!trimmed) {
      setError(
        lang === 'miz'
          ? 'Khawngaihin Super Admin passcode chhu lut rawh.'
          : 'Please enter your Super Admin passcode.'
      );
      return;
    }

    if (source === 'unclaimed') {
      if (trimmed.length < 6) {
        setError(
          lang === 'miz'
            ? 'Passcode hi character 6 tal a ni tur a ni.'
            : 'Passcode must be at least 6 characters long.'
        );
        return;
      }
      if (trimmed !== confirmPasscode.trim()) {
        setError(
          lang === 'miz'
            ? 'Passcode pahnih a inmil lo. Check nawn rawh.'
            : 'Passcodes do not match. Please re-enter.'
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      const endpoint =
        source === 'unclaimed' ? '/api/dev-studio/setup-admin' : '/api/dev-studio/verify-2fa';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!res.ok || !data.token) {
        if (res.status === 409) {
          await checkStatus();
        }
        setError(
          data.error ||
            (lang === 'miz'
              ? 'Super Admin passcode a dik lo.'
              : 'Authentication failed. Check your passcode.')
        );
        return;
      }
      setPasscode('');
      setConfirmPasscode('');
      onAuthenticated(data.token);
    } catch {
      setError(
        lang === 'miz'
          ? 'Network buaina a awm. Try nawn leh rawh.'
          : 'Network error while signing in. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md py-10">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-7 shadow-xl space-y-5">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-2xl bg-emerald-950 text-emerald-400 flex items-center justify-center shrink-0">
            {source === 'unclaimed' ? <KeyRound className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              {source === 'unclaimed'
                ? lang === 'miz'
                  ? 'Super Admin Passcode Siam Rawh'
                  : 'Set Up Super Admin Passcode'
                : lang === 'miz'
                  ? 'Super Admin Login'
                  : 'Super Admin Sign In'}
            </h1>
            <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
              {source === 'unclaimed'
                ? lang === 'miz'
                  ? 'A vawi khatna atan i Super Admin passcode (character 6+) siam rawh. Operations, KYC, Payroll leh Dev Studio vawn himna a ni.'
                  : 'Create your Super Admin passcode (6+ characters) to claim ownership of Operations, KYC, Payroll, and Dev Studio.'
                : lang === 'miz'
                  ? 'Operations Center, Server Dev Studio leh Backend API Console luh nan i Super Admin passcode chhu lut rawh.'
                  : 'Enter your Super Admin passcode to unlock Operations Center, Server Dev Studio, and Backend API Console.'}
            </p>
          </div>
        </div>

        {loadingStatus ? (
          <div className="py-8 text-center text-xs text-slate-500">
            {lang === 'miz' ? 'Server auth dinhmun check mek...' : 'Checking Super Admin status...'}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="super-admin-passcode"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                {source === 'unclaimed'
                  ? lang === 'miz'
                    ? 'Super Admin Passcode Thar (6+ characters)'
                    : 'New Super Admin Passcode (6+ characters)'
                  : lang === 'miz'
                    ? 'Super Admin Passcode'
                    : 'Super Admin Passcode'}
              </label>
              <div className="relative">
                <input
                  id="super-admin-passcode"
                  type={showPasscode ? 'text' : 'password'}
                  autoComplete={source === 'unclaimed' ? 'new-password' : 'current-password'}
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder={source === 'unclaimed' ? 'Min 6 characters' : 'Enter passcode'}
                  className="w-full min-h-[46px] rounded-xl border border-slate-300 bg-slate-50 pl-3.5 pr-11 py-2.5 text-sm font-mono text-slate-900 focus:border-emerald-700 focus:bg-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPasscode((prev) => !prev)}
                  aria-label={showPasscode ? 'Hide passcode' : 'Show passcode'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70"
                >
                  {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {source === 'unclaimed' && (
              <div>
                <label
                  htmlFor="super-admin-confirm"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  {lang === 'miz' ? 'Passcode Chhu Nawn Rawh' : 'Confirm Super Admin Passcode'}
                </label>
                <input
                  id="super-admin-confirm"
                  type={showPasscode ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPasscode}
                  onChange={(e) => setConfirmPasscode(e.target.value)}
                  placeholder={lang === 'miz' ? 'Passcode chhu nawn' : 'Re-enter passcode'}
                  className="w-full min-h-[46px] rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm font-mono text-slate-900 focus:border-emerald-700 focus:bg-white focus:outline-none"
                />
              </div>
            )}

            {source === 'env' && (
              <p className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-[11px] text-slate-600">
                {lang === 'miz'
                  ? 'SUPER_ADMIN_2FA_PIN secret hmangin passcode a in-set tawh a ni.'
                  : 'Passcode is managed via the SUPER_ADMIN_2FA_PIN environment secret.'}
              </p>
            )}

            {error && (
              <p
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              <ShieldCheck className="w-4 h-4" />
              {submitting
                ? lang === 'miz'
                  ? 'Verify mek...'
                  : 'Verifying...'
                : source === 'unclaimed'
                  ? lang === 'miz'
                    ? 'Passcode Siam & Lut Rawh'
                    : 'Create Passcode & Enter'
                  : lang === 'miz'
                    ? 'Super Admin-ah Lut Rawh'
                    : 'Sign In to Super Admin'}
            </button>
          </form>
        )}

        <div className="border-t border-slate-100 pt-3 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={onBackToMobile}
            className="inline-flex items-center gap-1.5 font-semibold text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {lang === 'miz' ? 'User Mobile App-ah Kir Leh' : 'Back to User Mobile App'}
          </button>
          {error && source === null && (
            <button
              type="button"
              onClick={() => void checkStatus()}
              className="font-semibold text-emerald-700 hover:underline"
            >
              {lang === 'miz' ? 'Try Nawn' : 'Retry'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

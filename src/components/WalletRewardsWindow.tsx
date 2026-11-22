import React, { useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Copy,
  Crown,
  Gift,
  Plus,
  Sparkles,
  Wallet,
} from 'lucide-react';
import type { CustomerWalletState, Language } from '../shared/types';
import { triggerHaptic } from '../lib/nativeBridge';
import { LayerWindow } from './LayerWindow';

interface WalletRewardsWindowProps {
  open: boolean;
  onClose: () => void;
  lang: Language;
  wallet: CustomerWalletState;
  onWalletUpdated: () => Promise<void>;
}

const TOPUP_PRESETS = [100, 250, 500];

export const WalletRewardsWindow: React.FC<WalletRewardsWindowProps> = ({
  open,
  onClose,
  lang,
  wallet,
  onWalletUpdated,
}) => {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [referralInput, setReferralInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const handleTopup = async (amountRs: number) => {
    setBusyAction(`topup-${amountRs}`);
    setFeedback(null);
    triggerHaptic('booking');
    try {
      const res = await fetch('/api/premium/wallet/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountRs }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'err', msg: data.error || 'Top-up failed.' });
      } else {
        setFeedback({
          type: 'ok',
          msg:
            lang === 'miz'
              ? `₹${amountRs} ZoRûn Wallet-ah dah luh fel a ni!`
              : `₹${amountRs} added to your ZoRûn Wallet instantly.`,
        });
        await onWalletUpdated();
      }
    } catch {
      setFeedback({ type: 'err', msg: 'Network error during top-up.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleClaimReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!referralInput.trim()) return;
    setBusyAction('referral');
    setFeedback(null);
    triggerHaptic('medium');
    try {
      const res = await fetch('/api/premium/wallet/claim-referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: referralInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'err', msg: data.error || 'Could not claim referral code.' });
      } else {
        setReferralInput('');
        setFeedback({
          type: 'ok',
          msg:
            lang === 'miz'
              ? `Referral hlawhtling! +₹${data.bonusRs} leh +${data.bonusPts} pts i dawng.`
              : `Referral credited! +₹${data.bonusRs} wallet bonus & +${data.bonusPts} loyalty pts.`,
        });
        await onWalletUpdated();
      }
    } catch {
      setFeedback({ type: 'err', msg: 'Network error claiming referral.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleTogglePass = async () => {
    setBusyAction('pass');
    setFeedback(null);
    triggerHaptic('booking');
    try {
      const res = await fetch('/api/premium/wallet/toggle-pass', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'err', msg: data.error || 'Could not update ZoRûn Plus Pass.' });
      } else {
        setFeedback({
          type: 'ok',
          msg: data.customerWallet?.plusPassActive
            ? lang === 'miz'
              ? 'ZoRûn Plus Pass tihnun a ni! Zero surge & 12% Sumo discount.'
              : 'ZoRûn Plus Pass activated! Zero rain surge & 12% Sumo parcel savings.'
            : lang === 'miz'
              ? 'ZoRûn Plus Pass auto-renew titawp rih a ni.'
              : 'ZoRûn Plus Pass paused.',
        });
        await onWalletUpdated();
      }
    } catch {
      setFeedback({ type: 'err', msg: 'Network error updating Plus Pass.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleCopyCode = async () => {
    triggerHaptic('light');
    try {
      await navigator.clipboard.writeText(wallet.referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <LayerWindow
      open={open}
      onClose={onClose}
      title={lang === 'miz' ? 'ZoRûn Wallet & Lawmman' : 'ZoRûn Wallet & Rewards'}
      subtitle={
        lang === 'miz'
          ? 'Instant UPI balance, Referral ₹50 & Plus Pass'
          : 'Instant UPI balance, ₹50 referrals & Plus Pass'
      }
      accent="emerald"
      size="md"
    >
      <div className="space-y-4">
        {/* Hero Balance & Loyalty Card */}
        <div className="rounded-3xl bg-gradient-to-br from-emerald-950 via-teal-900 to-emerald-900 p-5 text-white shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-emerald-200/90">
                {lang === 'miz' ? 'Wallet Pawisa Awm Zat' : 'Available Wallet Balance'}
              </p>
              <p className="text-3xl font-extrabold font-mono tabular-nums tracking-tight mt-1">
                ₹{wallet.balanceRs.toLocaleString()}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-emerald-200/90">
                {lang === 'miz' ? 'Loyalty Points' : 'Loyalty Points'}
              </p>
              <p className="text-lg font-extrabold font-mono tabular-nums text-amber-300 mt-0.5 inline-flex items-center gap-1">
                <Sparkles className="w-4 h-4" />
                {wallet.loyaltyPoints.toLocaleString()} pts
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-white/15">
            {TOPUP_PRESETS.map((amt) => (
              <button
                key={amt}
                type="button"
                disabled={busyAction !== null}
                onClick={() => void handleTopup(amt)}
                className="min-h-[42px] rounded-xl bg-white/15 hover:bg-white/25 active:scale-[0.97] text-xs font-bold text-white transition-all inline-flex items-center justify-center gap-1 font-mono tabular-nums disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />₹{amt}
              </button>
            ))}
          </div>
        </div>

        {feedback && (
          <div
            role="status"
            className={`rounded-2xl px-4 py-2.5 text-xs font-semibold ${
              feedback.type === 'ok'
                ? 'bg-emerald-900 text-white'
                : 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900'
            }`}
          >
            {feedback.msg}
          </div>
        )}

        {/* ZoRûn Plus Pass Card */}
        <section className="rounded-2xl border border-amber-300/70 dark:border-amber-700/50 bg-amber-50/70 dark:bg-amber-950/25 p-4 flex items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
              <Crown className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                ZoRûn Plus Pass · <span className="font-mono tabular-nums">₹99/mo</span>
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-snug">
                {lang === 'miz'
                  ? 'Ruah sur surge awm lo · Sumo parcel 12% discount · Priority Runner'
                  : 'Zero rain surge · 12% off Sumo parcels · Priority Runner matching'}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => void handleTogglePass()}
            className={`min-h-[42px] rounded-xl px-3.5 py-2 text-xs font-bold whitespace-nowrap shrink-0 transition-colors ${
              wallet.plusPassActive
                ? 'bg-emerald-800 text-white hover:bg-emerald-900'
                : 'bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-slate-800'
            }`}
          >
            {wallet.plusPassActive
              ? lang === 'miz'
                ? 'Active ✓'
                : 'Active ✓'
              : lang === 'miz'
                ? 'Activate'
                : 'Activate'}
          </button>
        </section>

        {/* Referral Rewards Section */}
        <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 flex items-center justify-center shrink-0">
                <Gift className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {lang === 'miz' ? 'Thian Sawm la ₹50 Dawng Rawh' : 'Refer a Friend · Earn ₹50'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {lang === 'miz' ? 'I referral code:' : 'Your shareable code:'}{' '}
                  <span className="font-mono font-bold text-emerald-800 dark:text-emerald-400">
                    {wallet.referralCode}
                  </span>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleCopyCode()}
              className="min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? (lang === 'miz' ? 'Copied' : 'Copied') : lang === 'miz' ? 'Copy' : 'Copy'}
            </button>
          </div>

          <form onSubmit={handleClaimReferral} className="flex items-center gap-2">
            <input
              type="text"
              value={referralInput}
              onChange={(e) => setReferralInput(e.target.value)}
              placeholder={
                lang === 'miz'
                  ? 'Thian code chhu lut rawh (e.g. AIZAWL-50)'
                  : 'Enter friend code (e.g. AIZAWL-50)'
              }
              aria-label="Friend referral code"
              className="flex-1 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono uppercase text-slate-900 dark:text-slate-100 focus:border-emerald-700 focus:outline-none"
            />
            <button
              type="submit"
              disabled={busyAction !== null || !referralInput.trim()}
              className="min-h-[44px] rounded-xl bg-emerald-800 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-900 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {lang === 'miz' ? 'Claim +₹50' : 'Claim +₹50'}
            </button>
          </form>
        </section>

        {/* Recent Wallet Ledger */}
        <section className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-0.5 flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5" />
            {lang === 'miz' ? 'Wallet Chhinchhiahna' : 'Recent Transactions'}
          </h3>
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            {wallet.transactions.slice(0, 6).map((tx) => {
              const positive = tx.amountRs >= 0;
              return (
                <div key={tx.id} className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        positive
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {positive ? (
                        <ArrowDownLeft className="w-4 h-4" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {tx.title}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {new Date(tx.createdAt).toLocaleDateString()}
                        {tx.pointsDelta ? ` · +${tx.pointsDelta} pts` : ''}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-extrabold font-mono tabular-nums shrink-0 ${
                      positive
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {positive ? `+₹${tx.amountRs}` : `-₹${Math.abs(tx.amountRs)}`}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </LayerWindow>
  );
};

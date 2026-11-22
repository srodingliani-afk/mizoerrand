import React, { useState } from 'react';
import { Check, Share2, Star, Navigation } from 'lucide-react';
import type { ErrandRequest, Language } from '../shared/types';
import { triggerHaptic } from '../lib/nativeBridge';
import { LayerWindow } from './LayerWindow';

interface LiveTripTrackerBarProps {
  lang: Language;
  errand: ErrandRequest | null;
  onOpenDetails: (errandId: string) => void;
  onRated: () => Promise<void>;
}

const TIP_OPTIONS = [0, 10, 20, 50];

export const LiveTripTrackerBar: React.FC<LiveTripTrackerBarProps> = ({
  lang,
  errand,
  onOpenDetails,
  onRated,
}) => {
  const [sharedCopied, setSharedCopied] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [stars, setStars] = useState(5);
  const [tipAmountRs, setTipAmountRs] = useState(20);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  if (!errand) return null;

  const stepIndex =
    errand.status === 'bidding'
      ? 0
      : errand.status === 'assigned'
        ? 1
        : errand.status === 'in_progress'
          ? 2
          : 3;

  const steps =
    lang === 'miz'
      ? ['Booked', 'Runner Hmuh', 'Kawngah', 'Thleng']
      : ['Booked', 'Accepted', 'On the Way', 'Arrived'];

  const handleShareTrip = async () => {
    triggerHaptic('light');
    const summary = [
      `ZoRûn Live Trip Safety Share (${errand.district || 'Aizawl'})`,
      `Order: ${errand.title}`,
      `Route: ${errand.origin.label || 'Pickup'} → ${errand.destination.label || 'Drop'}`,
      `Handover OTP: ${errand.otpCode} | Fare: ₹${errand.allInclusiveTotal}`,
      `Status: ${steps[stepIndex]}`,
    ].join('\n');

    try {
      if (navigator.share) {
        await navigator.share({ title: 'ZoRûn Live Trip', text: summary });
      } else {
        await navigator.clipboard.writeText(summary);
      }
      setSharedCopied(true);
      setTimeout(() => setSharedCopied(false), 2000);
    } catch {
      try {
        await navigator.clipboard.writeText(summary);
      } catch {
        // ignore clipboard failure
      }
      setSharedCopied(true);
      setTimeout(() => setSharedCopied(false), 2000);
    }
  };

  const handleSubmitRating = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    triggerHaptic('booking');
    try {
      const res = await fetch(`/api/premium/errands/${errand.id}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: stars, tipAmountRs, note }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'err', msg: data.error || 'Could not submit rating.' });
      } else {
        setFeedback({
          type: 'ok',
          msg:
            lang === 'miz'
              ? `Ka lawm e! ${stars}★ rating${tipAmountRs > 0 ? ` leh ₹${tipAmountRs} tip` : ''} thawn fel a ni.`
              : `Thank you! ${stars}★ rating${tipAmountRs > 0 ? ` + ₹${tipAmountRs} Runner tip` : ''} recorded.`,
        });
        await onRated();
        setTimeout(() => {
          setRateOpen(false);
          setFeedback(null);
        }, 900);
      }
    } catch {
      setFeedback({ type: 'err', msg: 'Network error submitting rating.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Compact Live Trip Tracker Strip — Zero Truncation on Mobile Viewports */}
      <section
        aria-label="Live active trip tracker"
        className="rounded-2xl bg-emerald-950 text-white px-3.5 sm:px-4 py-3 shadow-[0_6px_22px_rgba(6,78,59,0.2)] space-y-2.5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onOpenDetails(errand.id);
            }}
            className="flex items-start sm:items-center gap-2.5 min-w-0 text-left group"
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-800/90 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
              <Navigation className="w-4 h-4 text-emerald-200" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <p className="text-[13px] sm:text-xs font-bold text-white leading-snug break-words group-hover:text-emerald-200 transition-colors">
                {errand.origin.label || 'Pickup'} → {errand.destination.label || 'Drop'}
              </p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-emerald-200/95 font-mono tabular-nums">
                <span className="font-sans font-semibold text-emerald-300">
                  {steps[stepIndex]}
                </span>
                <span>·</span>
                <span>OTP {errand.otpCode}</span>
                <span>·</span>
                <span className="font-bold text-white">₹{errand.allInclusiveTotal}</span>
                {errand.kailawnSurchargeRs && errand.kailawnSurchargeRs > 0 ? (
                  <>
                    <span>·</span>
                    <span className="font-sans text-amber-300">Kailawn +₹{errand.kailawnSurchargeRs}</span>
                  </>
                ) : null}
                {errand.customerRating ? (
                  <>
                    <span>·</span>
                    <span>{errand.customerRating}★</span>
                  </>
                ) : null}
              </div>
            </div>
          </button>

          <div className="flex items-center gap-2 shrink-0 sm:justify-end">
            <button
              type="button"
              onClick={() => void handleShareTrip()}
              aria-label={lang === 'miz' ? 'Live Trip Share rawh' : 'Share Live Trip'}
              className="flex-1 sm:flex-none min-h-[38px] rounded-xl bg-white/12 hover:bg-white/20 px-3 py-1.5 text-[11px] font-bold text-white inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              {sharedCopied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Share2 className="w-3.5 h-3.5" />}
              <span>
                {sharedCopied ? (lang === 'miz' ? 'Copied' : 'Shared') : lang === 'miz' ? 'Share Trip' : 'Share'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setRateOpen(true);
              }}
              className="flex-1 sm:flex-none min-h-[38px] rounded-xl bg-amber-400 hover:bg-amber-300 px-3 py-1.5 text-[11px] font-extrabold text-slate-950 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <Star className="w-3.5 h-3.5 fill-slate-950" />
              <span>{errand.customerRating ? `${errand.customerRating}★` : lang === 'miz' ? 'Rate & Tip' : 'Rate & Tip'}</span>
            </button>
          </div>
        </div>

        {/* 4-Step Compact Linear Progress Indicator */}
        <div className="grid grid-cols-4 gap-1.5" aria-hidden="true">
          {steps.map((label, idx) => (
            <div key={label} className="space-y-1">
              <div
                className={`h-1 rounded-full transition-colors ${
                  idx <= stepIndex ? 'bg-emerald-400' : 'bg-white/15'
                }`}
              />
              <p
                className={`text-[10px] leading-tight ${
                  idx === stepIndex ? 'text-emerald-200 font-bold' : 'text-emerald-200/65'
                }`}
              >
                {label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Post-Job Star Rating & Runner Tip LayerWindow */}
      <LayerWindow
        open={rateOpen}
        onClose={() => setRateOpen(false)}
        title={lang === 'miz' ? 'Runner Rate & Tip Pekna' : 'Rate & Tip Your Runner'}
        subtitle={`${errand.origin.label || 'Pickup'} → ${errand.destination.label || 'Drop'}`}
        size="sm"
        footer={
          <button
            type="submit"
            form="zorun-rate-tip-form"
            disabled={submitting}
            className="w-full min-h-[46px] rounded-2xl bg-emerald-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-900 disabled:opacity-50"
          >
            {submitting
              ? '...'
              : tipAmountRs > 0
                ? lang === 'miz'
                  ? `Submit ${stars}★ & ₹${tipAmountRs} Tip`
                  : `Submit ${stars}★ & Send ₹${tipAmountRs} Tip`
                : lang === 'miz'
                  ? `Submit ${stars}★ Rating`
                  : `Submit ${stars}★ Rating`}
          </button>
        }
      >
        <form id="zorun-rate-tip-form" onSubmit={handleSubmitRating} className="space-y-4">
          {feedback && (
            <div
              role="status"
              className={`rounded-2xl px-4 py-2.5 text-xs font-semibold ${
                feedback.type === 'ok'
                  ? 'bg-emerald-900 text-white'
                  : 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300'
              }`}
            >
              {feedback.msg}
            </div>
          )}

          {/* 1-5 Star Selector */}
          <div className="text-center space-y-2 py-2">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
              {lang === 'miz' ? 'Runner hnathawh dan eng nge a an?' : 'How was your Runner experience?'}
            </p>
            <div className="flex items-center justify-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`Rate ${n} stars`}
                  onClick={() => {
                    triggerHaptic('light');
                    setStars(n);
                  }}
                  className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center hover:bg-amber-50 dark:hover:bg-slate-800 transition-transform active:scale-90"
                >
                  <Star
                    className={`w-7 h-7 ${
                      n <= stars
                        ? 'text-amber-500 fill-amber-400'
                        : 'text-slate-300 dark:text-slate-600'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Optional Runner Tip (100% goes to Runner Wallet) */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {lang === 'miz'
                ? 'Lawmman Tip (100% Runner Wallet-ah a lut)'
                : 'Add a Runner Tip (100% credited to Runner)'}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {TIP_OPTIONS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setTipAmountRs(amt);
                  }}
                  className={`min-h-[42px] rounded-xl border text-xs font-bold font-mono tabular-nums transition-colors ${
                    tipAmountRs === amt
                      ? 'border-emerald-700 bg-emerald-800 text-white'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  {amt === 0 ? (lang === 'miz' ? 'Aih' : 'No Tip') : `₹${amt}`}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="rate-note" className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              {lang === 'miz' ? 'Thu Belh (Optional)' : 'Compliment Note (Optional)'}
            </label>
            <input
              id="rate-note"
              type="text"
              maxLength={140}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                lang === 'miz' ? 'A rangin a fel khawp mai!' : 'Fast climb on the steps, very polite!'
              }
              className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-emerald-700 focus:outline-none"
            />
          </div>
        </form>
      </LayerWindow>
    </>
  );
};

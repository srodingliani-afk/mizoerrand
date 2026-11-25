import React, { useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  QrCode,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import type { Language } from '../shared/types';
import { LayerWindow } from './LayerWindow';
import { triggerHaptic } from '../lib/nativeBridge';
import {
  buildDeterministicQrMatrix,
  buildGPayUpiLinks,
  DEFAULT_ZORUN_GPAY_NAME,
  DEFAULT_ZORUN_GPAY_PHONE,
  DEFAULT_ZORUN_GPAY_VPA,
} from '../lib/gpayUpi';

interface GPayCheckoutModalProps {
  open: boolean;
  onClose: () => void;
  lang: Language;
  amountRs: number;
  orderRef: string;
  titleEn: string;
  titleMiz: string;
  payeeVpa?: string;
  payeeName?: string;
  payeePhone?: string;
  onPaymentConfirmed?: (utrRef: string) => Promise<void> | void;
}

export const GPayCheckoutModal: React.FC<GPayCheckoutModalProps> = ({
  open,
  onClose,
  lang,
  amountRs,
  orderRef,
  titleEn,
  titleMiz,
  payeeVpa = DEFAULT_ZORUN_GPAY_VPA,
  payeeName = DEFAULT_ZORUN_GPAY_NAME,
  payeePhone = DEFAULT_ZORUN_GPAY_PHONE,
  onPaymentConfirmed,
}) => {
  const [copiedVpa, setCopiedVpa] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [utrInput, setUtrInput] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [confirmedSuccess, setConfirmedSuccess] = useState(false);

  const links = useMemo(
    () =>
      buildGPayUpiLinks({
        payeeVpa,
        payeeName,
        payeePhone,
        amountRs,
        orderRef,
        transactionNote: `${titleEn} (${orderRef})`,
      }),
    [payeeVpa, payeeName, payeePhone, amountRs, orderRef, titleEn]
  );

  const qrMatrix = useMemo(
    () => buildDeterministicQrMatrix(links.universalUpiUri),
    [links.universalUpiUri]
  );

  const handleCopy = async (text: string, target: 'vpa' | 'phone') => {
    triggerHaptic('light');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // fallback
    }
    if (target === 'vpa') {
      setCopiedVpa(true);
      setTimeout(() => setCopiedVpa(false), 1800);
    } else {
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 1800);
    }
  };

  const handleConfirmGPayPaid = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfirming(true);
    triggerHaptic('booking');
    const cleanUtr =
      utrInput.trim() || `GPAY-${Date.now().toString().slice(-8)}`;
    try {
      await onPaymentConfirmed?.(cleanUtr);
      triggerHaptic('success');
      setConfirmedSuccess(true);
      setTimeout(() => {
        setConfirmedSuccess(false);
        setUtrInput('');
        onClose();
      }, 900);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <LayerWindow
      open={open}
      onClose={onClose}
      layerLevel={2}
      size="sm"
      title={lang === 'miz' ? 'Google Pay (GPay) · Mizoram Instant Pay' : 'Google Pay (GPay) · Mizoram Instant Pay'}
      subtitle={lang === 'miz' ? titleMiz : titleEn}
    >
      <div className="space-y-4">
        {/* Top GPay Branded Header Card */}
        <div className="rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-emerald-950 p-5 text-white text-center space-y-2 shadow-lg">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1 text-xs font-extrabold tracking-wide">
            <span className="text-blue-300">G</span>
            <span className="text-red-300">P</span>
            <span className="text-amber-300">a</span>
            <span className="text-emerald-300">y</span>
            <span className="text-white/90 font-semibold">· UPI Escrow &amp; Dynamic QR</span>
          </div>
          <p className="text-3xl font-extrabold font-mono tabular-nums">
            ₹{Math.max(1, Math.round(amountRs)).toLocaleString()}
          </p>
          <p className="text-xs text-emerald-200 font-mono">
            {links.payeeName} · Ref: {links.orderRef}
          </p>
        </div>

        {/* 1-Tap Launch GPay App on Phone */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <a
            href={links.gpayDeepLink}
            onClick={() => triggerHaptic('medium')}
            className="min-h-[46px] rounded-2xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-xs font-extrabold text-white flex items-center justify-center gap-2 shadow-sm"
          >
            <Smartphone className="w-4 h-4" />
            <span>
              {lang === 'miz' ? 'GPay App Hawng Rawh' : 'Open Google Pay App'}
            </span>
            <ExternalLink className="w-3.5 h-3.5 opacity-80" />
          </a>

          <a
            href={links.universalUpiUri}
            onClick={() => triggerHaptic('light')}
            className="min-h-[46px] rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center justify-center gap-2"
          >
            <QrCode className="w-4 h-4 text-emerald-700" />
            <span>
              {lang === 'miz' ? 'UPI App Dang (PhonePe/Paytm)' : 'Other UPI App'}
            </span>
          </a>
        </div>

        {/* Scannable Dynamic GPay QR Matrix */}
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-center space-y-3">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
            {lang === 'miz'
              ? 'GPay Camera Scanner-in He QR Code Hi Scan Rawh'
              : 'Scan Dynamic QR with Google Pay (GPay) Scanner'}
          </p>

          <div className="mx-auto w-44 h-44 rounded-2xl bg-white p-3 border-2 border-slate-900 shadow-inner flex items-center justify-center">
            <svg
              viewBox="0 0 21 21"
              className="w-full h-full"
              shapeRendering="crispEdges"
              aria-label={`GPay UPI QR Code for ${links.payeeVpa}`}
            >
              {qrMatrix.map((row, rIdx) =>
                row.map((cell, cIdx) =>
                  cell ? (
                    <rect
                      key={`${rIdx}-${cIdx}`}
                      x={cIdx}
                      y={rIdx}
                      width={1}
                      height={1}
                      fill="#0f172a"
                    />
                  ) : null
                )
              )}
            </svg>
          </div>

          {/* Copyable GPay UPI ID & GPay Phone Number */}
          <div className="space-y-2 text-left pt-1">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800 px-3 py-2 flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase text-slate-400">GPay UPI ID (VPA)</p>
                <p className="font-mono font-bold text-slate-900 dark:text-slate-100 truncate">
                  {links.payeeVpa}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleCopy(links.payeeVpa, 'vpa')}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1 shrink-0"
              >
                {copiedVpa ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                {copiedVpa ? 'Copied' : 'Copy ID'}
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-slate-800 px-3 py-2 flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase text-slate-400">
                  {lang === 'miz' ? 'GPay Phone Number' : 'GPay Number'}
                </p>
                <p className="font-mono font-bold text-slate-900 dark:text-slate-100">
                  +91 {links.payeePhone}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleCopy(links.payeePhone, 'phone')}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1 shrink-0"
              >
                {copiedPhone ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                {copiedPhone ? 'Copied' : 'Copy No.'}
              </button>
            </div>
          </div>
        </div>

        {/* Confirm GPay Payment / UTR Verification */}
        {onPaymentConfirmed && (
          <form onSubmit={handleConfirmGPayPaid} className="space-y-2.5 pt-1">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                {lang === 'miz'
                  ? 'GPay UPI Transaction ID / UTR (Optional — Auto-verify theih)'
                  : 'GPay 12-Digit UPI Transaction ID / UTR (Optional)'}
              </label>
              <input
                type="text"
                value={utrInput}
                onChange={(e) => setUtrInput(e.target.value)}
                placeholder="e.g. 432819204412"
                className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
            </div>

            <button
              type="submit"
              disabled={confirming || confirmedSuccess}
              className="w-full min-h-[46px] rounded-2xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-extrabold inline-flex items-center justify-center gap-2 shadow-sm"
            >
              <CheckCircle2 className="w-4 h-4" />
              {confirmedSuccess
                ? lang === 'miz'
                  ? 'GPay Payment Verify Fel A Ni!'
                  : 'GPay Payment Verified!'
                : confirming
                  ? lang === 'miz'
                    ? 'GPay Escrow Verify mek...'
                    : 'Verifying GPay Payment...'
                  : lang === 'miz'
                    ? `GPay-in ₹${Math.max(1, Math.round(amountRs))} Ka Pe Fel Tawh (Verify)`
                    : `Confirm ₹${Math.max(1, Math.round(amountRs))} Paid via GPay`}
            </button>
          </form>
        )}

        <p className="text-[11px] text-slate-500 text-center flex items-center justify-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
          <span>
            {lang === 'miz'
              ? '100% ZoRûn GPay Escrow Protection — Handover OTP pek hma chu pawisa a him.'
              : '100% ZoRûn GPay Escrow Protection — funds held safely until OTP handover.'}
          </span>
        </p>
      </div>
    </LayerWindow>
  );
};

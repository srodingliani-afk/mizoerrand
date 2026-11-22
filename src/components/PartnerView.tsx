import React, { useEffect, useState } from 'react';
import { BellRing, Camera, CheckCircle2, Navigation, Radio, Wallet } from 'lucide-react';
import type { AppRemoteConfig, ErrandRequest, Language, MizoramDistrict, PartnerProfile } from '../shared/types';
import { TRANSLATIONS } from '../i18n/translations';
import { ALL_MIZORAM_DISTRICT_NAMES } from '../data/mizoramDistricts';
import {
  detectPartnerWrapperEnvironment,
  triggerEmergencySirenTone,
  triggerHaptic,
} from '../lib/nativeBridge';
import { compressImageToWebP } from '../lib/offlineCache';
import { dataUrlToBlob, uploadMediaFile } from '../lib/mediaUpload';
import { publishRunnerLocationToFirestore } from '../lib/firestoreSync';
import { CameraCaptureModal } from './CameraCaptureModal';

interface PartnerViewProps {
  lang: Language;
  selectedDistrict: MizoramDistrict;
  remoteConfig: AppRemoteConfig;
  partners: PartnerProfile[];
  onRefresh: () => Promise<void>;
}

export const PartnerView: React.FC<PartnerViewProps> = ({
  lang,
  selectedDistrict,
  remoteConfig,
  partners,
  onRefresh,
}) => {
  const t = TRANSLATIONS[lang];
  const [districtFilter, setDistrictFilter] = useState<MizoramDistrict | 'All'>(selectedDistrict);
  const [selectedPartnerId, setSelectedPartnerId] = useState(partners[0]?.id || 'ptr-walker-1');
  const [filteredJobs, setFilteredJobs] = useState<ErrandRequest[]>([]);
  const [bidDrafts, setBidDrafts] = useState<Record<string, string>>({});
  const [otpDrafts, setOtpDrafts] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [sirenBanner, setSirenBanner] = useState(false);
  const [proofCameraTarget, setProofCameraTarget] = useState<{
    jobId: string;
    stage: 'before' | 'after';
  } | null>(null);

  const scopedPartners =
    districtFilter === 'All'
      ? partners
      : partners.filter((p) => (p.district || 'Aizawl') === districtFilter);

  useEffect(() => {
    setDistrictFilter(selectedDistrict);
  }, [selectedDistrict]);

  useEffect(() => {
    if (scopedPartners.length > 0 && !scopedPartners.some((p) => p.id === selectedPartnerId)) {
      setSelectedPartnerId(scopedPartners[0].id);
    }
  }, [districtFilter, scopedPartners, selectedPartnerId]);

  const activePartner =
    scopedPartners.find((p) => p.id === selectedPartnerId) ||
    partners.find((p) => p.id === selectedPartnerId) ||
    scopedPartners[0] ||
    partners[0];
  const wrapperInfo = detectPartnerWrapperEnvironment();

  const loadStrictJobs = async (partnerId: string) => {
    try {
      const res = await fetch(`/api/errands/jobs?partnerId=${encodeURIComponent(partnerId)}`);
      if (res.ok) {
        const data = await res.json();
        setFilteredJobs(data.jobs || []);
      }
    } catch {
      // ignore offline
    }
  };

  useEffect(() => {
    if (selectedPartnerId) {
      void loadStrictJobs(selectedPartnerId);
    }
  }, [selectedPartnerId, partners]);

  const handleToggleOnline = async () => {
    if (!activePartner) return;
    triggerHaptic('medium');
    try {
      const res = await fetch(`/api/errands/partners/${activePartner.id}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ online: !activePartner.online }),
      });
      if (!res.ok) {
        triggerHaptic('error');
        const data = await res.json().catch(() => ({}));
        setFeedback({ type: 'err', msg: data.error || 'Could not update online status.' });
        return;
      }
      await onRefresh();
    } catch {
      triggerHaptic('error');
      setFeedback({ type: 'err', msg: 'Network error updating online status.' });
    }
  };

  const handleBackgroundGpsPing = async () => {
    if (!activePartner) return;
    triggerHaptic('sync');

    const sendHeartbeat = async (lat: number, lng: number, accuracy?: number) => {
      try {
        const res = await fetch(`/api/errands/partners/${activePartner.id}/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat, lng, online: true }),
        });
        if (!res.ok) {
          triggerHaptic('error');
          setFeedback({ type: 'err', msg: 'Could not sync background GPS.' });
          return;
        }
        void publishRunnerLocationToFirestore({
          partner: activePartner,
          lat,
          lng,
          accuracyMeters: accuracy,
        });
        setFeedback({
          type: 'ok',
          msg: `Live GPS synced (${lat.toFixed(5)}, ${lng.toFixed(5)}${accuracy ? ` · ±${Math.round(accuracy)}m` : ''}).`,
        });
        await onRefresh();
      } catch {
        triggerHaptic('error');
        setFeedback({ type: 'err', msg: 'Network error syncing background GPS.' });
      }
    };

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          void sendHeartbeat(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        },
        () => {
          const jitterLat = activePartner.lat + (Math.random() - 0.5) * 0.0012;
          const jitterLng = activePartner.lng + (Math.random() - 0.5) * 0.0012;
          void sendHeartbeat(jitterLat, jitterLng);
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 6000 }
      );
      return;
    }

    const jitterLat = activePartner.lat + (Math.random() - 0.5) * 0.0012;
    const jitterLng = activePartner.lng + (Math.random() - 0.5) * 0.0012;
    await sendHeartbeat(jitterLat, jitterLng);
  };

  const handleSubmitBid = async (jobId: string, fallbackAmt: number) => {
    if (!activePartner) return;
    triggerHaptic('booking');
    const amt = Number(bidDrafts[jobId] || fallbackAmt);
    try {
      const res = await fetch(`/api/errands/jobs/${jobId}/bids`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId: activePartner.id, bidAmount: amt, etaMinutes: 9 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        triggerHaptic('error');
        setFeedback({ type: 'err', msg: data.error || 'Bid rejected' });
      } else {
        triggerHaptic('success');
        setFeedback({ type: 'ok', msg: `Counter-offer Rs. ${amt} sent to customer.` });
        await loadStrictJobs(activePartner.id);
        await onRefresh();
      }
    } catch {
      triggerHaptic('error');
      setFeedback({ type: 'err', msg: 'Network error submitting bid.' });
    }
  };

  const saveProofUrl = async (jobId: string, stage: 'before' | 'after', proofUrl?: string) => {
    const res = await fetch(`/api/errands/jobs/${jobId}/proof`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage, proofUrl }),
    });
    if (!res.ok) {
      triggerHaptic('error');
      const data = await res.json().catch(() => ({}));
      setFeedback({ type: 'err', msg: data.error || 'Could not upload proof photo.' });
      return;
    }
    triggerHaptic('success');
    setFeedback({ type: 'ok', msg: `Mandatory ${stage.toUpperCase()} proof saved.` });
    if (activePartner) await loadStrictJobs(activePartner.id);
    await onRefresh();
  };

  const handleUploadProof = async (
    jobId: string,
    stage: 'before' | 'after',
    file?: File
  ) => {
    triggerHaptic('light');
    try {
      let proofUrl: string | undefined;
      if (file) {
        const webpDataUrl = await compressImageToWebP(file, 800);
        const blob = await dataUrlToBlob(webpDataUrl);
        const uploaded = await uploadMediaFile({
          file: blob,
          filename: `proof-${jobId}-${stage}.webp`,
          category: 'proof_photo',
          district: activePartner?.district || selectedDistrict,
          orderRef: jobId,
        });
        proofUrl = uploaded.url || webpDataUrl;
      }
      await saveProofUrl(jobId, stage, proofUrl);
    } catch {
      triggerHaptic('error');
      setFeedback({ type: 'err', msg: 'Network error saving proof photo.' });
    }
  };

  const handleCompleteOtp = async (jobId: string) => {
    triggerHaptic('medium');
    const otpCode = otpDrafts[jobId]?.trim();
    try {
      const res = await fetch(`/api/errands/jobs/${jobId}/complete-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otpCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        triggerHaptic('error');
        setFeedback({ type: 'err', msg: data.error || 'OTP failed' });
      } else {
        triggerHaptic('success');
        setFeedback({
          type: 'ok',
          msg: `OTP verified! Escrow settled Rs. ${data.ledger?.partnerPayout ?? 'payout'} to your wallet.`,
        });
        if (activePartner) await loadStrictJobs(activePartner.id);
        await onRefresh();
      }
    } catch {
      triggerHaptic('error');
      setFeedback({ type: 'err', msg: 'Network error verifying OTP.' });
    }
  };

  const handleDepositCod = async () => {
    if (!activePartner) return;
    triggerHaptic('medium');
    try {
      const res = await fetch(`/api/escrow/partners/${activePartner.id}/deposit-cod`, { method: 'POST' });
      if (!res.ok) {
        triggerHaptic('error');
        const data = await res.json().catch(() => ({}));
        setFeedback({ type: 'err', msg: data.error || 'COD deposit failed.' });
        return;
      }
      triggerHaptic('success');
      setFeedback({ type: 'ok', msg: 'COD Cash deposited via UPI. New COD jobs unlocked.' });
      await onRefresh();
    } catch {
      triggerHaptic('error');
      setFeedback({ type: 'err', msg: 'Network error depositing COD.' });
    }
  };

  const handleWithdrawWallet = async () => {
    if (!activePartner) return;
    triggerHaptic('medium');
    try {
      const res = await fetch(`/api/escrow/partners/${activePartner.id}/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 500 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        triggerHaptic('error');
        setFeedback({ type: 'err', msg: data.error || 'Withdrawal failed' });
      } else {
        triggerHaptic('success');
        setFeedback({ type: 'ok', msg: `Withdrew Rs. ${data.withdrawn} via instant UPI/IMPS.` });
        await onRefresh();
      }
    } catch {
      triggerHaptic('error');
      setFeedback({ type: 'err', msg: 'Network error processing withdrawal.' });
    }
  };

  const codBlocked = (activePartner?.codCashHeld ?? 0) >= remoteConfig.codCashLimitRs;

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{t.partnerTitle}</h1>
            <p className="text-xs text-slate-600 mt-0.5">
              Wrapper: {wrapperInfo.environment} · Strict Category Filter · COD Limit Rs. {remoteConfig.codCashLimitRs}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="partner-district-select" className="sr-only">
              Filter Partner Hub District
            </label>
            <select
              id="partner-district-select"
              value={districtFilter}
              onChange={(e) => setDistrictFilter(e.target.value as MizoramDistrict | 'All')}
              className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900"
            >
              <option value="All">{t.allDistrictsLabel}</option>
              {ALL_MIZORAM_DISTRICT_NAMES.map((d) => (
                <option key={d} value={d}>
                  {d} Hub
                </option>
              ))}
            </select>

            <label htmlFor="partner-profile-select" className="sr-only">
              Switch Partner Category Profile
            </label>
            <select
              id="partner-profile-select"
              value={activePartner?.id || selectedPartnerId}
              onChange={(e) => setSelectedPartnerId(e.target.value)}
              className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 max-w-full"
            >
              {scopedPartners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.category.toUpperCase()} · {p.district || 'Aizawl'})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleToggleOnline}
              className={`min-h-[44px] rounded-lg px-4 py-2 text-xs font-semibold text-white transition-colors ${
                activePartner?.online ? 'bg-teal-700 hover:bg-teal-800' : 'bg-slate-600 hover:bg-slate-700'
              }`}
            >
              {activePartner?.online ? 'Online · Receiving Jobs' : 'Offline'}
            </button>
          </div>
        </div>

        {/* Capacitor/TWA Hooks & Earnings Wallet Bar */}
        {activePartner && (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">
                Active Category · {activePartner.district || 'Aizawl'} ({activePartner.veng})
              </p>
              <p className="text-sm font-bold text-slate-900 uppercase font-mono">{activePartner.category}</p>
              <p className="text-[11px] text-slate-600 mt-0.5">{activePartner.badges.join(' · ')}</p>
            </div>

            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">COD Cash Held Limit</p>
              <p className={`text-sm font-bold font-mono ${codBlocked ? 'text-red-700' : 'text-slate-900'}`}>
                Rs. {activePartner.codCashHeld} / Rs. {remoteConfig.codCashLimitRs}
              </p>
              <button
                type="button"
                onClick={handleDepositCod}
                className="mt-1 text-xs font-semibold text-teal-700 hover:underline"
              >
                Deposit COD via UPI
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Earnings Wallet</p>
              <p className="text-sm font-bold font-mono text-slate-900">
                Rs. {activePartner.walletBalance.toLocaleString()}
              </p>
              <button
                type="button"
                onClick={handleWithdrawWallet}
                className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline"
              >
                <Wallet className="w-3 h-3" /> Withdraw Rs. 500
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 p-3 flex flex-col justify-between gap-2">
              <button
                type="button"
                onClick={handleBackgroundGpsPing}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100"
              >
                <Navigation className="w-3.5 h-3.5 text-teal-700" /> Background GPS Sync
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerEmergencySirenTone();
                  setSirenBanner(true);
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
              >
                <BellRing className="w-3.5 h-3.5" /> Test Silent-Override Siren
              </button>
            </div>
          </div>
        )}

        {sirenBanner && (
          <div className="flex items-center justify-between rounded-xl bg-red-600 p-3 text-xs font-semibold text-white">
            <span className="inline-flex items-center gap-2">
              <Radio className="w-4 h-4" /> Silent-Mode-Override Emergency Siren Active (Capacitor Native Hook)
            </span>
            <button type="button" onClick={() => setSirenBanner(false)} className="underline">
              Acknowledge
            </button>
          </div>
        )}

        {codBlocked && (
          <div className="rounded-xl bg-amber-50 border border-amber-300 p-3 text-xs text-amber-900">
            COD cash held reached Rs. {remoteConfig.codCashLimitRs}. New COD jobs are blocked until you deposit via UPI.
          </div>
        )}

        {feedback && (
          <p
            role="status"
            className={`rounded-lg p-3 text-xs font-medium ${
              feedback.type === 'ok' ? 'bg-teal-50 text-teal-900' : 'bg-red-50 text-red-800'
            }`}
          >
            {feedback.msg}
          </p>
        )}
      </div>

      {/* Strictly Filtered Job Feed */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">
          Strictly Filtered Job Feed for {activePartner?.category.toUpperCase()} ({filteredJobs.length})
        </h2>

        {filteredJobs.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            No matching jobs for category <strong>{activePartner?.category}</strong> right now. (Remember: Vehicle tiers never receive walker-exclusive &lt;1.5km or steep-step errands.)
          </div>
        ) : (
          filteredJobs.map((job) => (
            <article key={job.id} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-mono text-slate-500">
                    {job.id} · {job.district || 'Aizawl'}{job.isInterDistrict ? ' (Inter-District)' : ''} · {job.jobType} · {job.accessType} · {job.distanceKm} km · {job.paymentMethod}
                  </p>
                  <h3 className="text-base font-semibold text-slate-900 mt-0.5">{job.title}</h3>
                  <p className="text-xs text-slate-600">
                    {job.origin.label || 'Origin'} → {job.destination.label || 'Destination'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold font-mono text-slate-900">Rs. {job.allInclusiveTotal}</p>
                  <p className="text-xs text-teal-800 font-medium capitalize">{job.status.replace('_', ' ')}</p>
                </div>
              </div>

              {job.status === 'bidding' && (
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  <label htmlFor={`bid-${job.id}`} className="text-xs font-medium text-slate-700">
                    Counter-Offer Rate (Rs.):
                  </label>
                  <input
                    id={`bid-${job.id}`}
                    type="number"
                    value={bidDrafts[job.id] ?? String(job.allInclusiveTotal)}
                    onChange={(e) => setBidDrafts((p) => ({ ...p, [job.id]: e.target.value }))}
                    className="w-28 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => handleSubmitBid(job.id, job.allInclusiveTotal)}
                    className="min-h-[40px] rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    Submit Bid
                  </button>
                </div>
              )}

              {(job.status === 'assigned' || job.status === 'in_progress') && (
                <div className="space-y-3 border-t border-slate-100 pt-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer">
                      <Camera className="w-3.5 h-3.5 text-teal-700" />
                      {job.beforeProofUrl ? 'Before Proof Saved' : 'Upload Before File'}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => handleUploadProof(job.id, 'before', e.target.files?.[0])}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setProofCameraTarget({ jobId: job.id, stage: 'before' })}
                      className="rounded-lg border border-teal-700 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-900 hover:bg-teal-100 inline-flex items-center gap-1.5"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      {job.beforeProofUrl ? 'Retake Before (Camera)' : 'Camera: Before Proof'}
                    </button>

                    <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer">
                      <Camera className="w-3.5 h-3.5 text-teal-700" />
                      {job.afterProofUrl ? 'After Proof Saved' : 'Upload After File'}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => handleUploadProof(job.id, 'after', e.target.files?.[0])}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setProofCameraTarget({ jobId: job.id, stage: 'after' })}
                      className="rounded-lg border border-teal-700 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-900 hover:bg-teal-100 inline-flex items-center gap-1.5"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      {job.afterProofUrl ? 'Retake After (Camera)' : 'Camera: After Proof'}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      placeholder={`Customer OTP (hint: ${job.otpCode})`}
                      value={otpDrafts[job.id] || ''}
                      onChange={(e) => setOtpDrafts((p) => ({ ...p, [job.id]: e.target.value }))}
                      className="w-48 rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => handleCompleteOtp(job.id)}
                      className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Verify OTP &amp; Release Escrow
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))
        )}
      </div>

      <CameraCaptureModal
        open={Boolean(proofCameraTarget)}
        onClose={() => setProofCameraTarget(null)}
        lang={lang}
        category="proof_photo"
        district={activePartner?.district || selectedDistrict}
        orderRef={proofCameraTarget?.jobId}
        titleEn={
          proofCameraTarget?.stage === 'before'
            ? 'Capture Pickup Proof (Camera)'
            : 'Capture Handover Proof (Camera)'
        }
        titleMiz={
          proofCameraTarget?.stage === 'before'
            ? 'Lakna Hmun Proof Thla La Rawh'
            : 'Pek Fel Proof Thla La Rawh'
        }
        onCaptured={async (result) => {
          if (!proofCameraTarget) return;
          await saveProofUrl(proofCameraTarget.jobId, proofCameraTarget.stage, result.url);
        }}
      />
    </div>
  );
};

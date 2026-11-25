import React, { useEffect, useRef, useState } from 'react';
import { BellRing, Bot, Camera, CheckCircle2, Navigation, Radio, Video, Wallet } from 'lucide-react';
import type {
  AppRemoteConfig,
  ErrandRequest,
  KycAiOcrExtraction,
  KycQueueItem,
  Language,
  MizoramDistrict,
  PartnerProfile,
} from '../shared/types';
import { TRANSLATIONS } from '../i18n/translations';
import { ALL_MIZORAM_DISTRICT_NAMES, getVengsForDistrict } from '../data/mizoramDistricts';
import {
  detectPartnerWrapperEnvironment,
  triggerEmergencySirenTone,
  triggerHaptic,
} from '../lib/nativeBridge';
import { compressImageToWebP } from '../lib/offlineCache';
import { dataUrlToBlob, uploadMediaFile } from '../lib/mediaUpload';
import { publishRunnerLocationToFirestore } from '../lib/firestoreSync';
import { startLiveGpsWatch, type LiveGpsFix, type LiveLocationWatcher } from '../lib/geolocation';
import { CameraCaptureModal, type CameraCaptureResult } from './CameraCaptureModal';
import { LiveVideoInterviewModal } from './LiveVideoInterviewModal';
import { GPayCheckoutModal } from './GPayCheckoutModal';

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
  const [autoGpsTracking, setAutoGpsTracking] = useState(true);
  const [liveGpsFix, setLiveGpsFix] = useState<LiveGpsFix | null>(null);
  const [editingPartnerProfile, setEditingPartnerProfile] = useState(false);
  const [partnerDraftName, setPartnerDraftName] = useState('');
  const [partnerDraftPhone, setPartnerDraftPhone] = useState('');
  const [partnerDraftDistrict, setPartnerDraftDistrict] = useState<MizoramDistrict>('Aizawl');
  const [partnerDraftVeng, setPartnerDraftVeng] = useState('Dawrpui');
  const [partnerKycCameraOpen, setPartnerKycCameraOpen] = useState(false);
  const [partnerAiOcr, setPartnerAiOcr] = useState<KycAiOcrExtraction | null>(null);
  const [partnerKycDocPath, setPartnerKycDocPath] = useState<string>('');
  const [queuedPartnerKycItem, setQueuedPartnerKycItem] = useState<KycQueueItem | null>(null);
  const [partnerVideoModalOpen, setPartnerVideoModalOpen] = useState(false);
  const [gpayModalTarget, setGpayModalTarget] = useState<{
    amountRs: number;
    orderRef: string;
    titleEn: string;
    titleMiz: string;
    mode: 'customer_qr' | 'cod_deposit';
  } | null>(null);
  const gpsWatcherRef = useRef<LiveLocationWatcher | null>(null);
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

  useEffect(() => {
    if (!activePartner) return;
    setPartnerDraftName(activePartner.name);
    setPartnerDraftPhone(activePartner.phone);
    setPartnerDraftDistrict(activePartner.district || 'Aizawl');
    setPartnerDraftVeng(activePartner.veng);
    setPartnerAiOcr(null);
    setPartnerKycDocPath('');
    void fetch(`/api/auth-kyc/my-status?targetEntityId=${encodeURIComponent(activePartner.id)}`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.items) && d.items.length > 0) {
          setQueuedPartnerKycItem(d.items[0]);
        }
      })
      .catch(() => {});
  }, [activePartner]);

  const handlePartnerKycCameraCaptured = async (result: CameraCaptureResult) => {
    if (!activePartner) return;
    setPartnerKycDocPath(result.objectPath);
    try {
      const res = await fetch('/api/auth-kyc/ai-ocr-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docType: 'combined_kyc_sheet',
          imageDataUrl: result.previewDataUrl,
          objectPath: result.objectPath,
          applicantHintName: partnerDraftName || activePartner.name,
          roleCategory: activePartner.category,
          district: partnerDraftDistrict,
          captureSource: result.captureSource,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.extraction) {
        setPartnerAiOcr(data.extraction as KycAiOcrExtraction);
        triggerHaptic('success');
      } else {
        setFeedback({ type: 'err', msg: data.error || 'AI KYC OCR scan failed.' });
      }
    } catch {
      setFeedback({ type: 'err', msg: 'Network error running AI OCR Agent.' });
    }
  };

  const handleSavePartnerProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePartner) return;
    if (!partnerAiOcr) {
      triggerHaptic('error');
      setFeedback({
        type: 'err',
        msg:
          lang === 'miz'
            ? 'Partner KYC & Profile update tur chuan Phone Camera hmangin ID/DL thla la phawt rawh (AI Agent OCR).'
            : 'Capture your KYC ID/DL with Phone Camera first so the AI Agent can scan and stage it for Server Staff verification.',
      });
      return;
    }
    triggerHaptic('medium');
    try {
      const res = await fetch(`/api/auth-kyc/partner-profile/${activePartner.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: partnerDraftName,
          phone: partnerDraftPhone,
          district: partnerDraftDistrict,
          veng: partnerDraftVeng,
          kycDocumentPath: partnerKycDocPath,
          cameraCaptureVerified: true,
          aiOcrReport: partnerAiOcr,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        triggerHaptic('error');
        setFeedback({ type: 'err', msg: data.error || 'Could not update partner profile.' });
        return;
      }
      triggerHaptic('success');
      setEditingPartnerProfile(false);
      if (data.kycItem) setQueuedPartnerKycItem(data.kycItem);
      setFeedback({
        type: 'ok',
        msg:
          data.message ||
          `AI Agent-in i KYC document (${partnerAiOcr.aadhaarMasked}) a scan fel a, Server Staff verify turin queue-ah dah luh a ni!`,
      });
      await onRefresh();
    } catch {
      triggerHaptic('error');
      setFeedback({ type: 'err', msg: 'Network error updating partner profile.' });
    }
  };

  // Continuous Automatic GPS Coordinate Detection & 15-Second Heartbeat Sync when Partner is Online
  useEffect(() => {
    gpsWatcherRef.current?.stop();
    if (!activePartner || !activePartner.online || !autoGpsTracking) return;

    const pushPartnerCoords = async (lat: number, lng: number, accuracy?: number) => {
      try {
        const res = await fetch(`/api/errands/partners/${activePartner.id}/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat, lng, online: true }),
        });
        if (res.ok) {
          void publishRunnerLocationToFirestore({
            partner: activePartner,
            lat,
            lng,
            accuracyMeters: accuracy,
          });
        }
      } catch {
        // Ignore transient offline errors
      }
    };

    gpsWatcherRef.current = startLiveGpsWatch(
      (fix) => {
        setLiveGpsFix(fix);
        void pushPartnerCoords(fix.lat, fix.lng, fix.accuracyMeters);
      },
      () => {
        // Fallback when running in desktop browser without GPS permission
      },
      { maxAutoRefineMs: 600000 }
    );

    const heartbeatTimer = setInterval(() => {
      const lat = liveGpsFix?.lat ?? activePartner.lat;
      const lng = liveGpsFix?.lng ?? activePartner.lng;
      void pushPartnerCoords(lat, lng, liveGpsFix?.accuracyMeters);
    }, 15000);

    return () => {
      gpsWatcherRef.current?.stop();
      clearInterval(heartbeatTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePartner?.id, activePartner?.online, autoGpsTracking]);

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
              onClick={() => setEditingPartnerProfile((prev) => !prev)}
              className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              {editingPartnerProfile
                ? lang === 'miz'
                  ? 'Khâr'
                  : 'Close KYC Update'
                : lang === 'miz'
                  ? 'Camera KYC Update'
                  : 'Camera KYC Update'}
            </button>

            {queuedPartnerKycItem && (
              <button
                type="button"
                onClick={() => setPartnerVideoModalOpen(true)}
                className="min-h-[44px] inline-flex items-center gap-1.5 rounded-lg bg-emerald-900 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800"
              >
                <Video className="w-3.5 h-3.5 text-emerald-300" />
                {lang === 'miz' ? 'HR Video Interview' : 'HR Video Call'}
              </button>
            )}

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

        {editingPartnerProfile && activePartner && (
          <form
            onSubmit={handleSavePartnerProfile}
            className="rounded-xl bg-teal-50/70 border border-teal-200 p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-teal-950 flex items-center gap-1.5">
                  <Bot className="w-4 h-4 text-teal-700" />
                  {lang === 'miz'
                    ? 'Partner KYC & Profile Update (Phone Camera AI OCR + Server Staff Verification)'
                    : 'Partner KYC & Profile Update (Phone Camera AI OCR + Server Staff Verification)'}
                </p>
                <p className="text-[11px] text-slate-600">
                  {lang === 'miz'
                    ? 'Document pawimawh mahnia update tlang theih a ni lo. Phone Camera-in thla la la, AI Agent-in a scan hnuah Server Staff ten an verify ang.'
                    : 'Direct unverified edits are blocked. Capture your ID/DL via Phone Camera so the AI Agent scans & stages it for Server Staff approval.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPartnerKycCameraOpen(true)}
                className="min-h-[38px] inline-flex items-center gap-1.5 rounded-lg bg-teal-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-900"
              >
                <Camera className="w-3.5 h-3.5" />
                {partnerAiOcr ? 'Retake Camera KYC' : '1. Scan KYC with Phone Camera'}
              </button>
            </div>

            {partnerAiOcr && (
              <div className="rounded-lg bg-white border border-teal-200 p-2.5 text-xs text-slate-800 space-y-0.5">
                <p className="font-bold text-teal-900">
                  AI OCR Verified ({partnerAiOcr.aiConfidenceScore}%): Aadhaar {partnerAiOcr.aadhaarMasked} · DL {partnerAiOcr.drivingLicenceNumber || 'N/A'} · Permit {partnerAiOcr.commercialPermitNumber || 'N/A'}
                </p>
                <p className="text-[11px] text-slate-600">{partnerAiOcr.aiSummary}</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              <input
                type="text"
                required
                value={partnerDraftName}
                onChange={(e) => setPartnerDraftName(e.target.value)}
                placeholder="Partner Name"
                className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900"
              />
              <input
                type="text"
                required
                value={partnerDraftPhone}
                onChange={(e) => setPartnerDraftPhone(e.target.value)}
                placeholder="Phone Number"
                className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900"
              />
              <select
                value={partnerDraftDistrict}
                onChange={(e) => {
                  const d = e.target.value as MizoramDistrict;
                  setPartnerDraftDistrict(d);
                  setPartnerDraftVeng(getVengsForDistrict(d)[0]?.name || d);
                }}
                className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-900"
              >
                {ALL_MIZORAM_DISTRICT_NAMES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <select
                value={partnerDraftVeng}
                onChange={(e) => setPartnerDraftVeng(e.target.value)}
                className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-900"
              >
                {getVengsForDistrict(partnerDraftDistrict).map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="submit"
                className="min-h-[36px] rounded-lg bg-teal-800 px-4 text-xs font-bold text-white hover:bg-teal-900"
              >
                {lang === 'miz'
                  ? '2. AI KYC Update Server Verification-ah Thawn Rawh'
                  : '2. Submit AI KYC Update for Server Staff Verification'}
              </button>
            </div>
          </form>
        )}

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
                onClick={() => {
                  if (activePartner.codCashHeld > 0) {
                    setGpayModalTarget({
                      amountRs: activePartner.codCashHeld,
                      orderRef: `COD-${activePartner.id}`,
                      titleEn: `Deposit Held COD Cash via GPay (${activePartner.name})`,
                      titleMiz: `GPay-in COD Pawisa Chhung Lut Rawh (${activePartner.name})`,
                      mode: 'cod_deposit',
                    });
                  } else {
                    void handleDepositCod();
                  }
                }}
                className="mt-1 text-xs font-semibold text-teal-700 hover:underline"
              >
                Deposit COD via GPay / UPI
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
              <div className="flex items-center justify-between gap-1.5">
                <button
                  type="button"
                  onClick={() => setAutoGpsTracking((prev) => !prev)}
                  className={`flex-1 inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                    autoGpsTracking
                      ? 'bg-teal-700 text-white'
                      : 'border border-slate-300 bg-white text-slate-700'
                  }`}
                >
                  <Navigation className="w-3 h-3" />
                  {autoGpsTracking ? 'Auto-GPS: ON' : 'Auto-GPS: OFF'}
                </button>
                <button
                  type="button"
                  onClick={handleBackgroundGpsPing}
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-800 hover:bg-slate-100"
                >
                  Sync Now
                </button>
              </div>
              <p className="text-[10px] font-mono text-slate-600 truncate">
                {liveGpsFix
                  ? `Live: ${liveGpsFix.lat.toFixed(4)}, ${liveGpsFix.lng.toFixed(4)} (±${liveGpsFix.accuracyMeters}m)`
                  : `Pin: ${activePartner.lat.toFixed(4)}, ${activePartner.lng.toFixed(4)} · ${activePartner.veng}`}
              </p>
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
                      placeholder="Enter 4-Digit Customer Handover OTP"
                      value={otpDrafts[job.id] || ''}
                      onChange={(e) => setOtpDrafts((p) => ({ ...p, [job.id]: e.target.value }))}
                      className="w-56 rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => handleCompleteOtp(job.id)}
                      className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Verify OTP &amp; Release Escrow
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setGpayModalTarget({
                          amountRs: job.allInclusiveTotal,
                          orderRef: job.id,
                          titleEn: `Customer Doorstep GPay QR · ${job.id}`,
                          titleMiz: `Customer GPay Scan Tur QR · ${job.id}`,
                          mode: 'customer_qr',
                        })
                      }
                      className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-700"
                    >
                      Show Customer GPay QR (₹{job.allInclusiveTotal})
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

      <CameraCaptureModal
        open={partnerKycCameraOpen}
        onClose={() => setPartnerKycCameraOpen(false)}
        lang={lang}
        category="kyc_doc"
        cameraOnly={true}
        district={partnerDraftDistrict}
        titleEn="Phone Camera Partner KYC Scan (AI OCR Agent)"
        titleMiz="Phone Camera-in Partner KYC Thla La Rawh (AI OCR)"
        subtitleEn="Gallery upload is disabled. AI Agent scans 12-digit Aadhaar, DL & Permit for Server Staff verification."
        subtitleMiz="Gallery upload phal a ni lo. AI Agent-in Aadhaar digit 12, DL leh Permit a chhiar nghal ang."
        onCaptured={(result) => void handlePartnerKycCameraCaptured(result)}
      />

      <LiveVideoInterviewModal
        open={partnerVideoModalOpen}
        onClose={() => setPartnerVideoModalOpen(false)}
        lang={lang}
        kycItem={queuedPartnerKycItem}
        isServerStaff={false}
      />

      <GPayCheckoutModal
        open={Boolean(gpayModalTarget)}
        onClose={() => setGpayModalTarget(null)}
        lang={lang}
        amountRs={gpayModalTarget?.amountRs || 100}
        orderRef={gpayModalTarget?.orderRef || 'GPAY'}
        titleEn={gpayModalTarget?.titleEn || 'GPay Payment'}
        titleMiz={gpayModalTarget?.titleMiz || 'GPay Pawisa Pekna'}
        onPaymentConfirmed={
          gpayModalTarget?.mode === 'cod_deposit'
            ? async () => {
                await handleDepositCod();
              }
            : async (utr) => {
                setFeedback({
                  type: 'ok',
                  msg: `Customer GPay payment verified (UTR: ${utr}). Enter 4-digit OTP to complete handover.`,
                });
              }
        }
      />
    </div>
  );
};

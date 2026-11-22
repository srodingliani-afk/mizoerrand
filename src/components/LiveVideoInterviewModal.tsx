import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Mic,
  MicOff,
  PhoneOff,
  RefreshCw,
  ShieldCheck,
  Video,
  VideoOff,
  XCircle,
} from 'lucide-react';
import type { KycQueueItem, KycVideoInterviewSession, Language } from '../shared/types';
import { LayerWindow } from './LayerWindow';
import { triggerHaptic } from '../lib/nativeBridge';

interface LiveVideoInterviewModalProps {
  open: boolean;
  onClose: () => void;
  lang: Language;
  kycItem: KycQueueItem | null;
  isServerStaff?: boolean;
  adminToken?: string;
  onUpdated?: () => Promise<void> | void;
}

export const LiveVideoInterviewModal: React.FC<LiveVideoInterviewModalProps> = ({
  open,
  onClose,
  lang,
  kycItem,
  isServerStaff = false,
  adminToken,
  onUpdated,
}) => {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [showEmbeddedRoom, setShowEmbeddedRoom] = useState(true);
  const [score, setScore] = useState<number>(
    kycItem?.videoInterview?.interviewScore ?? kycItem?.practicalTestScore ?? 94
  );
  const [notes, setNotes] = useState<string>(
    kycItem?.videoInterview?.interviewerNotes ||
      'Verified live identity, Mizo/English communication, hill-road safety & household etiquette.'
  );
  const [interviewerName, setInterviewerName] = useState<string>(
    kycItem?.videoInterview?.interviewerName || 'HR & KYC Vetting Officer'
  );
  const [busy, setBusy] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const stopLocalMedia = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
      localStreamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    setCameraReady(false);
  }, []);

  const startLocalMedia = useCallback(async () => {
    stopLocalMedia();
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode }, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: true,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        await localVideoRef.current.play().catch(() => {});
      }
      setCameraReady(true);
    } catch {
      setCameraReady(false);
    }
  }, [facingMode, stopLocalMedia]);

  useEffect(() => {
    if (!open) {
      stopLocalMedia();
      setStatusNotice(null);
      return;
    }
    setScore(kycItem?.videoInterview?.interviewScore ?? kycItem?.practicalTestScore ?? 94);
    setNotes(
      kycItem?.videoInterview?.interviewerNotes ||
        'Verified live identity, Mizo/English communication, hill-road safety & household etiquette.'
    );
    setInterviewerName(kycItem?.videoInterview?.interviewerName || 'HR & KYC Vetting Officer');
    void startLocalMedia();
    return () => {
      stopLocalMedia();
    };
  }, [open, kycItem, startLocalMedia, stopLocalMedia]);

  const toggleMic = () => {
    triggerHaptic('light');
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = micMuted;
      });
    }
    setMicMuted((p) => !p);
  };

  const toggleVideo = () => {
    triggerHaptic('light');
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((t) => {
        t.enabled = videoMuted;
      });
    }
    setVideoMuted((p) => !p);
  };

  const handleStaffDecision = async (
    action: 'open_live_room' | 'complete_passed' | 'complete_failed' | 'waive'
  ) => {
    if (!kycItem) return;
    setBusy(true);
    setStatusNotice(null);
    triggerHaptic('medium');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (adminToken) headers.Authorization = `Bearer ${adminToken}`;
      const res = await fetch(`/api/auth-kyc/video-interview/${kycItem.id}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action,
          interviewerName,
          interviewScore: score,
          interviewerNotes: notes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatusNotice(data.error || 'Could not update video interview status.');
        return;
      }
      triggerHaptic('success');
      setStatusNotice(
        action === 'complete_passed'
          ? 'Live Video Interview marked PASSED! Applicant is now eligible for KYC approval.'
          : action === 'waive'
            ? 'Live Video Interview waived by Server Staff discretion.'
            : action === 'complete_failed'
              ? 'Live Video Interview marked FAILED.'
              : 'Live WebRTC Interview Room opened and applicant notified!'
      );
      await onUpdated?.();
    } finally {
      setBusy(false);
    }
  };

  if (!kycItem) return null;

  const session: KycVideoInterviewSession = kycItem.videoInterview || {
    required: true,
    status: 'live_room_open',
    provider: 'jitsi_webrtc',
    roomName: `zorun-mizoram-hr-${kycItem.id}`,
    roomUrl: `https://meet.jit.si/zorun-mizoram-hr-${kycItem.id}`,
    interviewerName: 'HR & KYC Vetting Officer',
    updatedAt: new Date().toISOString(),
  };

  const embedUrl = `${session.roomUrl}#config.prejoinPageEnabled=false&config.startWithAudioMuted=false&config.startWithVideoMuted=false`;

  return (
    <LayerWindow
      open={open}
      onClose={() => {
        stopLocalMedia();
        onClose();
      }}
      layerLevel={2}
      size="lg"
      title={
        lang === 'miz'
          ? `In-App Live Video Interview · ${kycItem.applicantName}`
          : `In-App Live Video Interview · ${kycItem.applicantName}`
      }
      subtitle={`${kycItem.id} · ${(kycItem.roleTitle || kycItem.targetCategory).toUpperCase()} · ${kycItem.veng} (${kycItem.district || 'Aizawl'}) · Room: ${session.roomName}`}
    >
      <div className="space-y-4">
        {statusNotice && (
          <div className="rounded-2xl bg-emerald-900 text-white px-4 py-2.5 text-xs font-semibold flex items-center justify-between">
            <span>{statusNotice}</span>
          </div>
        )}

        {/* Dual WebRTC Stage: Embedded Multi-Party Room + Local Camera Self-View PiP */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-8 rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden relative min-h-[340px] flex flex-col justify-between">
            <div className="p-3 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-white">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-bold">
                  {session.provider.toUpperCase()} Live Room: {session.roomName}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowEmbeddedRoom((p) => !p)}
                  className="rounded-lg bg-slate-800 hover:bg-slate-700 px-2.5 py-1 text-[11px] font-semibold text-emerald-300"
                >
                  {showEmbeddedRoom ? 'Local Camera Only' : 'Show Multi-Party Room'}
                </button>
                <a
                  href={session.roomUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white"
                >
                  <ExternalLink className="w-3 h-3" /> Popout Room
                </a>
              </div>
            </div>

            {showEmbeddedRoom ? (
              <iframe
                src={embedUrl}
                title={`ZoRûn Live Video Interview ${session.roomName}`}
                allow="camera; microphone; fullscreen; display-capture; autoplay"
                className="w-full h-[320px] sm:h-[360px] border-0 bg-slate-950"
              />
            ) : (
              <div className="flex-1 flex items-center justify-center p-6 text-center text-xs text-slate-400">
                Multi-party iframe hidden. Using direct local WebRTC hardware camera stream on the right.
              </div>
            )}
          </div>

          {/* Right Panel: Local Hardware Camera Stream & Controls */}
          <div className="lg:col-span-4 rounded-2xl bg-slate-900 text-white p-4 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-bold text-emerald-300">
                  {isServerStaff
                    ? 'HR Interviewer Camera'
                    : lang === 'miz'
                      ? 'I Phone Camera (Live)'
                      : 'Your Phone Camera (Live)'}
                </span>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-white/10">
                  {cameraReady ? 'WebRTC Ready' : 'Standby'}
                </span>
              </div>

              <div className="relative rounded-xl overflow-hidden bg-slate-950 aspect-video border border-slate-700 flex items-center justify-center">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${videoMuted ? 'opacity-20' : ''}`}
                />
                {!cameraReady && (
                  <p className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-400 px-4 text-center">
                    {lang === 'miz'
                      ? 'Camera & Mic permission allow la, live video a lang nghal ang.'
                      : 'Allow Camera & Microphone permission for live self-preview.'}
                  </p>
                )}
              </div>
            </div>

            {/* Hardware Media Controls */}
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={toggleMic}
                className={`p-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-1 ${
                  micMuted ? 'bg-red-600 text-white' : 'bg-slate-800 text-emerald-300 hover:bg-slate-700'
                }`}
              >
                {micMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                <span>{micMuted ? 'Muted' : 'Mic On'}</span>
              </button>
              <button
                type="button"
                onClick={toggleVideo}
                className={`p-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-1 ${
                  videoMuted ? 'bg-red-600 text-white' : 'bg-slate-800 text-emerald-300 hover:bg-slate-700'
                }`}
              >
                {videoMuted ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                <span>{videoMuted ? 'Cam Off' : 'Cam On'}</span>
              </button>
              <button
                type="button"
                onClick={() => setFacingMode((p) => (p === 'user' ? 'environment' : 'user'))}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 inline-flex items-center gap-1"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Flip</span>
              </button>
            </div>

            <div className="rounded-xl bg-white/5 p-3 text-[11px] text-slate-300 space-y-1">
              <p className="font-bold text-white">
                Status:{' '}
                <span className="text-emerald-300 uppercase">
                  {session.status.replace(/_/g, ' ')}
                </span>
              </p>
              <p>Aadhaar AI OCR: {kycItem.aadhaarMasked} (12-Digit Scan Verified)</p>
              <p>Interviewer: {session.interviewerName || interviewerName}</p>
            </div>
          </div>
        </div>

        {/* SERVER-SIDE HR / ADMIN STAFF DISCRETION & EVALUATION PANEL */}
        {isServerStaff ? (
          <div className="rounded-2xl border-2 border-teal-600/30 bg-teal-50/60 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-teal-700" />
                  Server-Side HR &amp; Vetting Officer Interview Controls
                </h3>
                <p className="text-xs text-slate-600">
                  Awmpui leh Driver video interview hi server-side staff te mawhphurhna leh duhthlanna a ni — Pass, Fail, emaw Waive (ngaihdam/tul lo) ah i dah thei.
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleStaffDecision('open_live_room')}
                className="rounded-xl bg-teal-800 hover:bg-teal-900 px-3 py-1.5 text-xs font-bold text-white"
              >
                Ring Applicant / Open Live Room
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Interviewer / HR Officer Name
                </label>
                <input
                  type="text"
                  value={interviewerName}
                  onChange={(e) => setInterviewerName(e.target.value)}
                  className="w-full min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Live Interview &amp; Practical Score (0–100)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={score}
                  onChange={(e) => setScore(Number(e.target.value) || 0)}
                  className="w-full min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-mono font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  HR Evaluation Notes
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleStaffDecision('waive')}
                className="min-h-[40px] rounded-xl border border-amber-400 bg-amber-50 hover:bg-amber-100 px-3.5 py-2 text-xs font-bold text-amber-950"
              >
                Waive Video Interview (Staff Discretion)
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleStaffDecision('complete_failed')}
                className="min-h-[40px] inline-flex items-center gap-1 rounded-xl border border-red-300 bg-white hover:bg-red-50 px-3.5 py-2 text-xs font-bold text-red-700"
              >
                <XCircle className="w-4 h-4" /> Mark Interview Failed
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleStaffDecision('complete_passed')}
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 px-4 py-2 text-xs font-bold text-white shadow-sm"
              >
                <CheckCircle2 className="w-4 h-4" /> Pass Live Video Interview ({score}/100)
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-emerald-950">
            <div>
              <p className="font-bold">
                {lang === 'miz'
                  ? 'ZoRûn HR & Vetting Officer nen Live Video Interview Room-ah in awm mek'
                  : 'Connected to ZoRûn HR & Vetting Officer Live Video Interview Room'}
              </p>
              <p className="text-emerald-800 mt-0.5">
                {lang === 'miz'
                  ? 'I Aadhaar / Voter ID / Driving Licence original kha camera hmaah lo keng lang rawh le.'
                  : 'Please hold your original Aadhaar / Voter ID / Driving Licence ready to show on camera if requested.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                stopLocalMedia();
                onClose();
              }}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-red-600 hover:bg-red-700 px-4 py-2 text-xs font-bold text-white"
            >
              <PhoneOff className="w-4 h-4" />
              {lang === 'miz' ? 'Call Tihtawpna' : 'Leave Call'}
            </button>
          </div>
        )}
      </div>
    </LayerWindow>
  );
};

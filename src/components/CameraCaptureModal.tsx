import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, RefreshCw, RotateCcw, Upload, X } from 'lucide-react';
import type { Language, MizoramDistrict } from '../shared/types';
import { LayerWindow } from './LayerWindow';
import { triggerHaptic } from '../lib/nativeBridge';
import { compressImageToWebP } from '../lib/offlineCache';
import { dataUrlToBlob, uploadMediaFile, type ClientMediaCategory } from '../lib/mediaUpload';

export interface CameraCaptureResult {
  url: string;
  objectPath: string;
  previewDataUrl: string;
  file?: File;
}

interface CameraCaptureModalProps {
  open: boolean;
  onClose: () => void;
  lang: Language;
  category: ClientMediaCategory;
  district?: MizoramDistrict;
  orderRef?: string;
  titleEn?: string;
  titleMiz?: string;
  subtitleEn?: string;
  subtitleMiz?: string;
  onCaptured: (result: CameraCaptureResult) => void | Promise<void>;
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  open,
  onClose,
  lang,
  category,
  district,
  orderRef,
  titleEn = 'Live Camera Capture',
  titleMiz = 'Camera-in Thla La Rawh',
  subtitleEn = 'Take a clear live photo or upload from gallery',
  subtitleMiz = 'Tunah thla la nghal la, a nih loh leh gallery atangin thlang rawh',
  onCaptured,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraState, setCameraState] = useState<'starting' | 'ready' | 'unavailable'>('starting');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore cleanup errors
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCameraStream = useCallback(async () => {
    stopCameraStream();
    setCameraError(null);
    setCameraState('starting');

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraState('unavailable');
      setCameraError(
        lang === 'miz'
          ? 'He browser-ah live camera a hman theih loh. A hnuaia "Upload / Device Camera" hmang rawh.'
          : 'Live camera API unavailable in this browser. Use "Upload / Device Camera" below.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraState('ready');
    } catch (err) {
      setCameraState('unavailable');
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setCameraError(
          lang === 'miz'
            ? 'Camera permission phalna pek a ni lo. Browser setting-ah allow la, emaw file upload hmang rawh.'
            : 'Camera permission was denied. Allow camera access or choose a file below.'
        );
      } else {
        setCameraError(
          lang === 'miz'
            ? 'Camera hmuh a ni lo. File / Device Camera hmangin thlalak dah rawh.'
            : 'No live camera detected on this device. Use "Upload File" below.'
        );
      }
    }
  }, [facingMode, lang, stopCameraStream]);

  useEffect(() => {
    if (!open) {
      stopCameraStream();
      setCapturedDataUrl(null);
      setCapturedFile(null);
      setCameraError(null);
      return;
    }

    if (!capturedDataUrl) {
      void startCameraStream();
    }

    return () => {
      stopCameraStream();
    };
  }, [open, capturedDataUrl, startCameraStream, stopCameraStream]);

  const handleSnapPhoto = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;
    triggerHaptic('medium');

    const maxDim = 960;
    const ratio = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
    const targetW = Math.max(1, Math.round(video.videoWidth * ratio));
    const targetH = Math.max(1, Math.round(video.videoHeight * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, targetW, targetH);
    const dataUrl = canvas.toDataURL('image/webp', 0.85);
    setCapturedDataUrl(dataUrl);
    setCapturedFile(null);
    stopCameraStream();
  };

  const handleFallbackFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCameraError(null);
    try {
      const webpDataUrl = await compressImageToWebP(file, 960);
      setCapturedDataUrl(webpDataUrl);
      setCapturedFile(file);
      stopCameraStream();
      triggerHaptic('success');
    } catch {
      setCameraError(
        lang === 'miz' ? 'Thlalak open theih a ni lo.' : 'Could not read selected image file.'
      );
    }
  };

  const handleConfirmUpload = async () => {
    if (!capturedDataUrl) return;
    setUploading(true);
    setCameraError(null);
    triggerHaptic('booking');
    try {
      const blob = await dataUrlToBlob(capturedDataUrl);
      const filename = `${category}-${Date.now()}.webp`;
      const uploaded = await uploadMediaFile({
        file: blob,
        filename,
        category,
        district,
        orderRef,
      });

      const finalFile =
        capturedFile ||
        new File([blob], filename, { type: blob.type || 'image/webp' });

      await onCaptured({
        url: uploaded.url || capturedDataUrl,
        objectPath: uploaded.objectPath,
        previewDataUrl: capturedDataUrl,
        file: finalFile,
      });
      triggerHaptic('success');
      onClose();
    } catch (err) {
      triggerHaptic('error');
      setCameraError(
        err instanceof Error
          ? err.message
          : lang === 'miz'
            ? 'Thlalak upload a hlawhchham.'
            : 'Could not upload photo.'
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <LayerWindow
      open={open}
      onClose={onClose}
      layerLevel={2}
      size="md"
      title={lang === 'miz' ? titleMiz : titleEn}
      subtitle={lang === 'miz' ? subtitleMiz : subtitleEn}
      headerAction={
        !capturedDataUrl && cameraState === 'ready' ? (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
            }}
            className="min-h-[36px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{facingMode === 'environment' ? 'Rear' : 'Front'}</span>
          </button>
        ) : undefined
      }
      footer={
        capturedDataUrl ? (
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={uploading}
              onClick={() => {
                triggerHaptic('light');
                setCapturedDataUrl(null);
                setCapturedFile(null);
              }}
              className="min-h-[46px] rounded-2xl border border-slate-300 dark:border-slate-700 px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{lang === 'miz' ? 'La Nawn' : 'Retake'}</span>
            </button>
            <button
              type="button"
              disabled={uploading}
              onClick={() => void handleConfirmUpload()}
              className="flex-1 min-h-[46px] rounded-2xl bg-emerald-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-900 disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>
                {uploading
                  ? lang === 'miz'
                    ? 'Upload mek...'
                    : 'Uploading...'
                  : lang === 'miz'
                    ? 'Hemi Thlalak Hi Hmang Rawh'
                    : 'Use & Upload Photo'}
              </span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <label className="min-h-[46px] rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer">
              <Upload className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              <span>{lang === 'miz' ? 'File / Gallery' : 'Upload File'}</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => void handleFallbackFile(e)}
                className="hidden"
              />
            </label>
            <button
              type="button"
              disabled={cameraState !== 'ready'}
              onClick={handleSnapPhoto}
              className="flex-1 min-h-[46px] rounded-2xl bg-emerald-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-900 disabled:opacity-40 inline-flex items-center justify-center gap-2"
            >
              <Camera className="w-4 h-4" />
              <span>{lang === 'miz' ? 'Thla La Rawh' : 'Capture Photo'}</span>
            </button>
          </div>
        )
      }
    >
      <div className="space-y-3">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-center">
          {capturedDataUrl ? (
            <img
              src={capturedDataUrl}
              alt="Captured preview"
              className="h-full w-full object-contain bg-slate-950"
            />
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`h-full w-full object-cover ${cameraState === 'ready' ? 'opacity-100' : 'opacity-0'}`}
              />
              {cameraState === 'starting' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white/80 text-xs gap-2 p-4 text-center">
                  <Camera className="w-8 h-8 animate-pulse text-emerald-400" />
                  <span>
                    {lang === 'miz'
                      ? 'Camera a in hawng mek...'
                      : 'Requesting live camera access...'}
                  </span>
                </div>
              )}
              {cameraState === 'unavailable' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 text-xs gap-3 p-6 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center">
                    <X className="w-6 h-6 text-amber-400" />
                  </div>
                  <p className="max-w-xs leading-relaxed">
                    {cameraError ||
                      (lang === 'miz'
                        ? 'Camera hmuh a ni lo. "File / Gallery" hmet la thlalak thlang rawh.'
                        : 'Camera stream unavailable. Tap "Upload File" below to snap or choose a photo.')}
                  </p>
                </div>
              )}
              {cameraState === 'ready' && (
                <div className="pointer-events-none absolute inset-4 rounded-2xl border-2 border-dashed border-white/40" />
              )}
            </>
          )}
        </div>

        {cameraError && capturedDataUrl && (
          <p className="rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 px-3 py-2 text-xs font-medium text-red-700 dark:text-red-300">
            {cameraError}
          </p>
        )}
      </div>
    </LayerWindow>
  );
};

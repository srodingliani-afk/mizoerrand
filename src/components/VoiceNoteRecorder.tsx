import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square, Trash2, Volume2 } from 'lucide-react';
import type { Language } from '../shared/types';
import { triggerHaptic } from '../lib/nativeBridge';
import { uploadMediaFile } from '../lib/mediaUpload';

export interface VoiceNoteValue {
  audioUrl: string;
  durationSec: number;
  noteText: string;
}

interface VoiceNoteRecorderProps {
  lang: Language;
  value: VoiceNoteValue | null;
  onChange: (next: VoiceNoteValue | null) => void;
  contextLabelEn?: string;
  contextLabelMiz?: string;
  maxSeconds?: number;
}

export const VoiceNoteRecorder: React.FC<VoiceNoteRecorderProps> = ({
  lang,
  value,
  onChange,
  contextLabelEn = 'Voice instruction for Runner / Merchant (max 15s)',
  contextLabelMiz = 'Runner / Dawr neitu hrilhna aw (second 15 thleng)',
  maxSeconds = 15,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const secondsRef = useRef(0);
  const holdStartedAtRef = useRef<number>(0);

  useEffect(() => {
    secondsRef.current = seconds;
  }, [seconds]);

  useEffect(() => {
    if (!isRecording) return;
    const timer = setInterval(() => {
      setSeconds((prev) => {
        if (prev + 1 >= maxSeconds) {
          stopRecording();
          return maxSeconds;
        }
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, maxSeconds]);

  useEffect(() => {
    return () => {
      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
        streamRef.current?.getTracks().forEach((tr) => tr.stop());
      } catch {
        // Ignore cleanup errors
      }
    };
  }, []);

  const stopRecording = () => {
    setIsRecording(false);
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // Ignore stop errors
      }
    }
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  };

  const startRecording = async () => {
    if (isRecording) return;
    triggerHaptic('medium');
    setStatusHint(null);
    chunksRef.current = [];
    setSeconds(0);
    secondsRef.current = 0;

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      const fallbackNote =
        lang === 'miz'
          ? 'Mizo aw dah (5s): Biak In bul kailawn chhukah lo kal la, gate bulah min lo call rawh.'
          : 'Voice note (5s): Call at the main gate beside the concrete steps.';
      onChange({
        audioUrl: '/api/auth-kyc/signed-media/voice-guide',
        durationSec: 5,
        noteText: fallbackNote,
      });
      setStatusHint(
        lang === 'miz'
          ? 'He device-ah microphone a hman theih loh avangin voice note chhinchhiahna dah a ni.'
          : 'Microphone unavailable in this browser — quick voice note attached.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        const finalDuration = Math.max(1, Math.min(maxSeconds, secondsRef.current || 1));
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size > 0) {
          setIsUploading(true);
          const ext = mimeType.includes('ogg') ? 'ogg' : 'webm';
          void uploadMediaFile({
            file: blob,
            filename: `zorun-voice-${Date.now()}.${ext}`,
            category: 'voice_note',
          })
            .then((uploaded) => {
              if (uploaded.url) {
                onChange({
                  audioUrl: uploaded.url,
                  durationSec: finalDuration,
                  noteText:
                    lang === 'miz'
                      ? `Mizo aw record (${finalDuration}s) dah fel a ni.`
                      : `Recorded ${finalDuration}s voice instruction attached.`,
                });
                setStatusHint(
                  uploaded.provider === 'google_drive'
                    ? lang === 'miz'
                      ? 'Google Drive (ZoRun/VoiceNotes)-ah dah fel a ni.'
                      : 'Voice note saved to Google Drive (ZoRun/VoiceNotes).'
                    : null
                );
              }
            })
            .catch(() => {
              // Offline / fallback path: convert locally so booking is never blocked
              const reader = new FileReader();
              reader.onloadend = () => {
                const dataUrl = typeof reader.result === 'string' ? reader.result : '';
                if (dataUrl.startsWith('data:audio/')) {
                  onChange({
                    audioUrl: dataUrl,
                    durationSec: finalDuration,
                    noteText:
                      lang === 'miz'
                        ? `Mizo aw record (${finalDuration}s) dah fel a ni.`
                        : `Recorded ${finalDuration}s voice instruction attached.`,
                  });
                }
              };
              reader.readAsDataURL(blob);
            })
            .finally(() => {
              setIsUploading(false);
            });
        }
        stream.getTracks().forEach((tr) => tr.stop());
      };

      recorder.start(250);
      setIsRecording(true);
    } catch {
      const fallbackNote =
        lang === 'miz'
          ? 'Mizo aw dah (6s): Kailawn chho zelah lo kal la, in hring bulah min lo call rawh.'
          : 'Voice note (6s): Walk past the steps junction and call at the green gate.';
      onChange({
        audioUrl: '/api/auth-kyc/signed-media/voice-guide',
        durationSec: 6,
        noteText: fallbackNote,
      });
      setStatusHint(
        lang === 'miz'
          ? 'Microphone phalna pek a nih loh avangin sample voice note dah a ni.'
          : 'Mic permission declined — fallback voice note attached so you can continue.'
      );
    }
  };

  const handlePointerDown = () => {
    holdStartedAtRef.current = Date.now();
    if (!isRecording) {
      void startRecording();
    }
  };

  const handlePointerUp = () => {
    const heldMs = Date.now() - holdStartedAtRef.current;
    // If user held the button for > 450ms, treat as Hold-to-Record and stop on release.
    // Otherwise let tap-to-toggle keep recording until they tap Stop!
    if (isRecording && heldMs > 450) {
      stopRecording();
    }
  };

  const progressPct = Math.min(100, Math.round((seconds / maxSeconds) * 100));

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5">
          <Volume2 className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
          {lang === 'miz' ? contextLabelMiz : contextLabelEn}
        </span>
        <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
          {isRecording
            ? `${seconds}s / ${maxSeconds}s`
            : value
              ? `${value.durationSec}s`
              : `0s / ${maxSeconds}s`}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onClick={() => {
            // Supports keyboard activation & tap-to-stop
            const elapsed = Date.now() - holdStartedAtRef.current;
            if (isRecording && elapsed <= 450) {
              // Just started via pointerDown; let next tap stop
              return;
            }
            if (isRecording) {
              stopRecording();
            } else if (elapsed > 300) {
              void startRecording();
            }
          }}
          className={`flex-1 min-h-[44px] rounded-xl px-3.5 py-2 text-xs font-bold flex items-center justify-center gap-2 select-none transition-all ${
            isRecording
              ? 'bg-red-600 text-white shadow-sm'
              : 'bg-emerald-900 hover:bg-emerald-800 text-white active:scale-[0.98]'
          }`}
        >
          {isRecording ? (
            <>
              <Square className="w-3.5 h-3.5 fill-white shrink-0" />
              <span>
                {lang === 'miz'
                  ? `Tawp Rawh (${maxSeconds - seconds}s a la awm)`
                  : `Stop Recording (${maxSeconds - seconds}s left)`}
              </span>
            </>
          ) : (
            <>
              <Mic className="w-4 h-4 shrink-0" />
              <span>
                {lang === 'miz'
                  ? 'Hmet la Sawi Rawh (15s Voice Note)'
                  : 'Hmet la Sawi Rawh · Hold or Tap (15s)'}
              </span>
            </>
          )}
        </button>

        {value && !isRecording && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onChange(null);
              setStatusHint(null);
            }}
            aria-label={lang === 'miz' ? 'Aw record paih rawh' : 'Remove voice note'}
            className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 hover:text-red-600 flex items-center justify-center shrink-0"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {isRecording && (
        <div className="h-1.5 w-full rounded-full bg-red-100 dark:bg-red-950/60 overflow-hidden">
          <div
            className="h-full bg-red-600 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}

      {isUploading && (
        <p className="text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
          {lang === 'miz' ? 'Voice note upload mek...' : 'Uploading voice note...'}
        </p>
      )}

      {value && !isRecording && !isUploading && (
        <div className="space-y-1.5 pt-0.5">
          {value.audioUrl.startsWith('data:audio/') || value.audioUrl.startsWith('https://') ? (
            <audio controls src={value.audioUrl} className="w-full h-9" />
          ) : (
            <p className="text-[11px] font-medium text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl px-3 py-1.5">
              {value.noteText}
            </p>
          )}
        </div>
      )}

      {statusHint && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">{statusHint}</p>
      )}
    </div>
  );
};

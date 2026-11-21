import React, { useEffect, useState } from 'react';
import { Check, Copy, Download, Share, Smartphone, WifiOff, X } from 'lucide-react';
import type { Language } from '../shared/types';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    const checkStandalone = () =>
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    setIsInstalled(checkStandalone());

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));
    setIsAndroid(/android/.test(ua));

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const onDisplayModeChange = () => setIsInstalled(checkStandalone());

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    mediaQuery.addEventListener?.('change', onDisplayModeChange);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      mediaQuery.removeEventListener?.('change', onDisplayModeChange);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    isAndroid,
    install,
  };
}

interface InstallModalProps {
  open: boolean;
  onClose: () => void;
  lang: Language;
  isIOS: boolean;
  isAndroid: boolean;
  isInstallable: boolean;
  onTriggerNativeInstall: () => Promise<boolean>;
}

const MobileInstallSheet: React.FC<InstallModalProps> = ({
  open,
  onClose,
  lang,
  isIOS,
  isAndroid,
  isInstallable,
  onTriggerNativeInstall,
}) => {
  const [copied, setCopied] = useState(false);
  if (!open) return null;

  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(appUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard blocked in iframe
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/50 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Install ZoRun Mobile App"
    >
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-white p-5 sm:p-6 shadow-xl space-y-4 pb-safe">
        <div className="w-10 h-1.5 bg-slate-200 rounded-full mx-auto sm:hidden" />

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/pwa-192x192.png"
              alt="ZoRun App Icon"
              className="w-12 h-12 rounded-2xl border border-slate-200 object-cover shrink-0"
            />
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {lang === 'miz' ? 'ZoRun Mobile Standalone App' : 'Install ZoRun Mobile App'}
              </h3>
              <p className="text-xs text-slate-600">
                {lang === 'miz'
                  ? 'Browser bar awm lo, offline cache leh quick launch'
                  : 'Full-screen standalone app · Offline cache · Home screen shortcuts'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close install dialog"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isInstallable ? (
          <button
            type="button"
            onClick={async () => {
              const ok = await onTriggerNativeInstall();
              if (ok) onClose();
            }}
            className="w-full min-h-[48px] rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-800 transition-colors flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            {lang === 'miz' ? 'Phone-ah Install Nghal Rawh' : 'Install Standalone App Now'}
          </button>
        ) : (
          <div className="space-y-3 text-xs text-slate-700">
            {isIOS ? (
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-1.5">
                <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <Share className="w-3.5 h-3.5 text-teal-700" />
                  {lang === 'miz' ? 'iPhone / iPad (Safari)' : 'iPhone / iPad (Safari)'}
                </p>
                <p>
                  {lang === 'miz'
                    ? '1. Safari hnuai lama Share button hmet rawh.'
                    : '1. Tap the Share button in the Safari toolbar.'}
                </p>
                <p>
                  {lang === 'miz'
                    ? '2. "Add to Home Screen" thlang la, "Add" hmet rawh.'
                    : '2. Scroll down and tap "Add to Home Screen", then tap "Add".'}
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-1.5">
                  <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-teal-700" />
                    {lang === 'miz' ? 'Android Phone (Chrome)' : 'Android Phone (Chrome)'}
                  </p>
                  <p>
                    {lang === 'miz'
                      ? '1. He app link hi Chrome browser-ah hawng rawh.'
                      : '1. Open this app URL in Chrome on your Android phone.'}
                  </p>
                  <p>
                    {lang === 'miz'
                      ? '2. Menu (⋮) hmet la "Install App" emaw "Add to Home screen" thlang rawh.'
                      : '2. Tap Menu (⋮) → "Install app" or "Add to Home screen".'}
                  </p>
                </div>

                {!isAndroid && (
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-1.5">
                    <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                      <Share className="w-3.5 h-3.5 text-teal-700" />
                      {lang === 'miz' ? 'iPhone (Safari)' : 'iPhone (Safari)'}
                    </p>
                    <p>
                      {lang === 'miz'
                        ? 'Safari-ah hawng la, Share → "Add to Home Screen" hmet rawh.'
                        : 'Open in Safari, tap Share → "Add to Home Screen".'}
                    </p>
                  </div>
                )}
              </>
            )}

            <div className="rounded-xl border border-slate-200 p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-500">
                  {lang === 'miz' ? 'Mobile App Link' : 'Mobile App URL'}
                </p>
                <p className="text-xs font-mono text-slate-800 truncate">{appUrl}</p>
              </div>
              <button
                type="button"
                onClick={handleCopyUrl}
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-teal-700" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? (lang === 'miz' ? 'Copy tawh' : 'Copied') : lang === 'miz' ? 'Copy' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-[44px] rounded-xl bg-slate-100 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-200 transition-colors"
        >
          {lang === 'miz' ? 'Khar Rawh' : 'Close'}
        </button>
      </div>
    </div>
  );
};

export const PWAInstallButton: React.FC<{ lang?: Language }> = ({ lang = 'en' }) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showSheet, setShowSheet] = useState(false);

  // Automatically suppress when already running as an installed standalone PWA
  if (isInstalled) return null;

  const handleClick = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    setShowSheet(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 min-h-[36px] rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap shrink-0 transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
        <span>{lang === 'miz' ? 'App Install' : 'Install App'}</span>
      </button>

      <MobileInstallSheet
        open={showSheet}
        onClose={() => setShowSheet(false)}
        lang={lang}
        isIOS={isIOS}
        isAndroid={isAndroid}
        isInstallable={isInstallable}
        onTriggerNativeInstall={install}
      />
    </>
  );
};

export const StandaloneInstallCard: React.FC<{ lang: Language }> = ({ lang }) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const isOnline = useOnlineStatus();
  const [showSheet, setShowSheet] = useState(false);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <img
            src="/pwa-192x192.png"
            alt="ZoRun Mobile App Icon"
            className="w-12 h-12 rounded-2xl border border-slate-200 object-cover shrink-0"
          />
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {isInstalled
                ? lang === 'miz'
                  ? 'Standalone Mobile App a nung mek'
                  : 'Standalone Mobile App Active'
                : lang === 'miz'
                  ? 'Phone Home Screen-ah Dah Rawh'
                  : 'Install as Standalone Mobile App'}
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              {isInstalled
                ? lang === 'miz'
                  ? 'Browser bar tel loin ZoRun app i hmang mek. Offline cache a inpeih.'
                  : 'Running in full-screen standalone mode with offline IndexedDB sync.'
                : lang === 'miz'
                  ? 'Browser bar awm lo, hawn rang, offline-ah pawh rate leh contact en theih.'
                  : 'Launch full-screen from your home screen with offline rates and SOS shortcuts.'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-slate-500">{lang === 'miz' ? 'App Din Hmun' : 'Display Mode'}</p>
          <p className="font-semibold text-slate-900 mt-0.5">
            {isInstalled ? 'Standalone PWA' : 'Mobile Browser'}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-slate-500">{lang === 'miz' ? 'Network & Cache' : 'Network & Offline'}</p>
          <p className="font-semibold text-slate-900 mt-0.5">
            {isOnline ? 'Online · Synced' : 'Offline · Cached'}
          </p>
        </div>
      </div>

      {!isInstalled && (
        <button
          type="button"
          onClick={async () => {
            if (isInstallable) {
              await install();
            } else {
              setShowSheet(true);
            }
          }}
          className="w-full min-h-[48px] rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-800 transition-colors flex items-center justify-center gap-2"
        >
          <Download className="w-4 h-4" />
          {isInstallable
            ? lang === 'miz'
              ? 'Phone-ah Install Nghal Rawh'
              : 'Install ZoRun Mobile App'
            : lang === 'miz'
              ? 'Phone-a Dah Dan En Rawh'
              : 'How to Install on Android / iOS'}
        </button>
      )}

      <MobileInstallSheet
        open={showSheet}
        onClose={() => setShowSheet(false)}
        lang={lang}
        isIOS={isIOS}
        isAndroid={isAndroid}
        isInstallable={isInstallable}
        onTriggerNativeInstall={install}
      />
    </div>
  );
};

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return isOnline;
}

export const OfflineIndicator: React.FC<{ lang?: Language }> = ({ lang = 'en' }) => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 sm:right-auto z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2.5 text-xs font-medium text-white shadow-lg">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>
        {lang === 'miz'
          ? 'Offline Mode — IndexedDB rate cache leh SMS/Call fallback hman mek a ni.'
          : 'Offline Mode — Using cached IndexedDB rates & SMS/Call fallback ready.'}
      </span>
    </div>
  );
};

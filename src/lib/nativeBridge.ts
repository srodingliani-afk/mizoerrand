export interface CapacitorBridgeStatus {
  environment: 'capacitor-android' | 'twa-pwa' | 'web-browser';
  backgroundGpsSupported: boolean;
  wakeLockSupported: boolean;
}

export function detectPartnerWrapperEnvironment(): CapacitorBridgeStatus {
  const win = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  const isCapacitor = Boolean(win.Capacitor?.isNativePlatform?.());
  const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches;

  return {
    environment: isCapacitor ? 'capacitor-android' : isStandalone ? 'twa-pwa' : 'web-browser',
    backgroundGpsSupported: 'geolocation' in navigator,
    wakeLockSupported: 'wakeLock' in navigator,
  };
}

/**
 * Plays a distinct dual-tone emergency siren alert simulating Silent-Mode-Override
 * hardware dispatch alerts for Capacitor/TWA Partner APK mode.
 */
export function triggerEmergencySirenTone(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      const start = now + i * 0.28;
      osc.frequency.setValueAtTime(760, start);
      osc.frequency.linearRampToValueAtTime(1140, start + 0.14);
      osc.frequency.linearRampToValueAtTime(760, start + 0.26);

      gain.gain.setValueAtTime(0.08, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.26);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.27);
    }
  } catch {
    // Audio playback blocked before user gesture
  }
}

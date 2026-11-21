export interface CapacitorBridgeStatus {
  environment: 'capacitor-android' | 'twa-pwa' | 'web-browser';
  backgroundGpsSupported: boolean;
  wakeLockSupported: boolean;
  hapticsSupported: boolean;
}

export type HapticPattern =
  | 'light'
  | 'medium'
  | 'heavy'
  | 'sync'
  | 'booking'
  | 'success'
  | 'warning'
  | 'error'
  | 'sos';

const HAPTIC_PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 12,
  medium: 24,
  heavy: 45,
  sync: [16, 40, 22],
  booking: [20, 35, 32],
  success: [18, 45, 28],
  warning: [35, 45, 35],
  error: [55, 40, 55],
  sos: [95, 50, 95, 50, 145],
};

let hapticsEnabledState = true;

export function setHapticsEnabled(enabled: boolean): void {
  hapticsEnabledState = enabled;
}

export function isHapticsEnabled(): boolean {
  return hapticsEnabledState;
}

export function isHapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/**
 * Triggers native-like tactile vibration via the Vibration API (navigator.vibrate).
 * Gracefully no-ops when disabled in user settings, on devices without vibration hardware,
 * or before a user gesture.
 */
export function triggerHaptic(pattern: HapticPattern = 'light'): boolean {
  if (!hapticsEnabledState || !isHapticsSupported()) return false;
  try {
    return navigator.vibrate(HAPTIC_PATTERNS[pattern]);
  } catch {
    return false;
  }
}

export function detectPartnerWrapperEnvironment(): CapacitorBridgeStatus {
  const win = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  const isCapacitor = Boolean(win.Capacitor?.isNativePlatform?.());
  const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches;

  return {
    environment: isCapacitor ? 'capacitor-android' : isStandalone ? 'twa-pwa' : 'web-browser',
    backgroundGpsSupported: 'geolocation' in navigator,
    wakeLockSupported: 'wakeLock' in navigator,
    hapticsSupported: isHapticsSupported(),
  };
}

/**
 * Plays a distinct dual-tone emergency siren alert simulating Silent-Mode-Override
 * hardware dispatch alerts for Capacitor/TWA Partner APK mode, paired with SOS haptics.
 */
export function triggerEmergencySirenTone(): void {
  triggerHaptic('sos');
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

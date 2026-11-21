export interface UserAppSettings {
  hapticsEnabled: boolean;
  defaultPaymentMethod: 'upi_escrow' | 'dynamic_qr_cod';
  defaultMicroInsurance: boolean;
  textSize: 'normal' | 'large';
  reducedMotion: boolean;
  lowDataMode: boolean;
  confirmBeforeSos: boolean;
}

const SETTINGS_STORAGE_KEY = 'zorun_user_settings_v1';

export const DEFAULT_USER_SETTINGS: UserAppSettings = {
  hapticsEnabled: true,
  defaultPaymentMethod: 'upi_escrow',
  defaultMicroInsurance: true,
  textSize: 'normal',
  reducedMotion: false,
  lowDataMode: false,
  confirmBeforeSos: false,
};

export function loadUserSettings(): UserAppSettings {
  if (typeof window === 'undefined') return DEFAULT_USER_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_USER_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<UserAppSettings>;
    return {
      hapticsEnabled:
        typeof parsed.hapticsEnabled === 'boolean'
          ? parsed.hapticsEnabled
          : DEFAULT_USER_SETTINGS.hapticsEnabled,
      defaultPaymentMethod:
        parsed.defaultPaymentMethod === 'dynamic_qr_cod' ? 'dynamic_qr_cod' : 'upi_escrow',
      defaultMicroInsurance:
        typeof parsed.defaultMicroInsurance === 'boolean'
          ? parsed.defaultMicroInsurance
          : DEFAULT_USER_SETTINGS.defaultMicroInsurance,
      textSize: parsed.textSize === 'large' ? 'large' : 'normal',
      reducedMotion:
        typeof parsed.reducedMotion === 'boolean'
          ? parsed.reducedMotion
          : DEFAULT_USER_SETTINGS.reducedMotion,
      lowDataMode:
        typeof parsed.lowDataMode === 'boolean'
          ? parsed.lowDataMode
          : DEFAULT_USER_SETTINGS.lowDataMode,
      confirmBeforeSos:
        typeof parsed.confirmBeforeSos === 'boolean'
          ? parsed.confirmBeforeSos
          : DEFAULT_USER_SETTINGS.confirmBeforeSos,
    };
  } catch {
    return DEFAULT_USER_SETTINGS;
  }
}

export function saveUserSettings(settings: UserAppSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}

export function applyUserSettingsToDom(settings: UserAppSettings): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('reduce-motion', settings.reducedMotion);
  root.classList.toggle('text-scale-large', settings.textSize === 'large');
}

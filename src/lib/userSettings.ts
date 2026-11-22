import type { MizoramDistrict, SavedPlace } from '../shared/types';
import { getDistrictInfo } from '../data/mizoramDistricts';

export interface UserAppSettings {
  theme: 'light' | 'dark';
  hapticsEnabled: boolean;
  defaultPaymentMethod: 'upi_escrow' | 'dynamic_qr_cod';
  defaultMicroInsurance: boolean;
  textSize: 'normal' | 'large';
  reducedMotion: boolean;
  lowDataMode: boolean;
  confirmBeforeSos: boolean;
  savedPlaces: SavedPlace[];
}

const SETTINGS_STORAGE_KEY = 'zorun_user_settings_v1';

export const DEFAULT_SAVED_PLACES: SavedPlace[] = [
  {
    id: 'plc-home',
    label: 'In (Home)',
    district: 'Aizawl',
    veng: 'Khatla',
    landmark: 'Near Khatla Presbyterian Church',
  },
  {
    id: 'plc-office',
    label: 'Office',
    district: 'Aizawl',
    veng: 'Zarkawt',
    landmark: 'Main Road Junction',
  },
  {
    id: 'plc-hospital',
    label: 'Civil Hospital',
    district: 'Aizawl',
    veng: 'Dawrpui',
    landmark: 'OPD Main Gate',
  },
  {
    id: 'plc-bazar',
    label: 'Bara Bazar',
    district: 'Aizawl',
    veng: 'Dawrpui',
    landmark: 'New Market Steps',
  },
];

/**
 * Returns Saved Places synchronized to the currently active Mizoram district:
 * - User-created custom places for that district come first.
 * - For districts outside Aizawl (e.g., Lunglei, Champhai, Lawngtlai), dynamically
 *   derives realistic district-local Saved Places from the district's Veng catalog
 *   so Aizawl places never leak onto outer-district dashboards.
 */
export function getDistrictSavedPlaces(
  district: MizoramDistrict,
  allSavedPlaces: SavedPlace[]
): SavedPlace[] {
  const matched = allSavedPlaces.filter((p) => p.district === district);
  if (matched.length >= 2) {
    return matched;
  }

  const info = getDistrictInfo(district);
  const veng0 = info.vengs[0]?.name || district;
  const veng1 = info.vengs[1]?.name || veng0;
  const veng2 = info.vengs[2]?.name || veng1;
  const veng3 = info.vengs[3]?.name || veng0;

  const districtDefaults: SavedPlace[] = [
    {
      id: `plc-def-${district}-home`,
      label: 'In (Home)',
      district,
      veng: veng0,
      landmark: `${veng0} Presbyterian Biak In bul`,
    },
    {
      id: `plc-def-${district}-bazar`,
      label: `${district} Bazar`,
      district,
      veng: veng1,
      landmark: 'Main Market Kawn',
    },
    {
      id: `plc-def-${district}-hosp`,
      label: 'District Hospital',
      district,
      veng: veng2,
      landmark: 'Hospital Main Gate',
    },
    {
      id: `plc-def-${district}-sumo`,
      label: 'Sumo Counter',
      district,
      veng: veng3,
      landmark: `${district} Maxicab Stand`,
    },
  ];

  const existingIds = new Set(matched.map((m) => m.label.toLowerCase()));
  return [
    ...matched,
    ...districtDefaults.filter((d) => !existingIds.has(d.label.toLowerCase())),
  ].slice(0, 5);
}

export const DEFAULT_USER_SETTINGS: UserAppSettings = {
  theme: 'light',
  hapticsEnabled: true,
  defaultPaymentMethod: 'upi_escrow',
  defaultMicroInsurance: true,
  textSize: 'normal',
  reducedMotion: false,
  lowDataMode: false,
  confirmBeforeSos: false,
  savedPlaces: DEFAULT_SAVED_PLACES,
};

export function loadUserSettings(): UserAppSettings {
  if (typeof window === 'undefined') return DEFAULT_USER_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_USER_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<UserAppSettings>;
    const savedPlaces =
      Array.isArray(parsed.savedPlaces) && parsed.savedPlaces.length > 0
        ? parsed.savedPlaces
            .filter((p) => p && typeof p.id === 'string' && typeof p.label === 'string' && typeof p.veng === 'string')
            .slice(0, 10)
        : DEFAULT_SAVED_PLACES;
    return {
      theme: parsed.theme === 'dark' ? 'dark' : 'light',
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
      savedPlaces,
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
  root.classList.toggle('dark', settings.theme === 'dark');
  root.classList.toggle('reduce-motion', settings.reducedMotion);
  root.classList.toggle('text-scale-large', settings.textSize === 'large');
}

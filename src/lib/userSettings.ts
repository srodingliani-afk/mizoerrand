import type { MizoramDistrict, SavedPlace } from '../shared/types';
import { getDistrictInfo } from '../data/mizoramDistricts';

export interface UserProfileIdentity {
  fullName: string;
  phone: string;
  email: string;
  upiId: string;
  homeDistrict: MizoramDistrict;
  homeVeng: string;
  ymaSection: string;
  houseLandmark: string;
  bioNote: string;
  lat?: number;
  lng?: number;
  emergencyContactName: string;
  emergencyContactPhone: string;
  avatarUrl?: string;
  updatedAt: string;
}

export interface UserAppSettings {
  profile: UserProfileIdentity;
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

export const DEFAULT_USER_PROFILE: UserProfileIdentity = {
  fullName: 'Lalhriatpuii Chhangte',
  phone: '+91-9862411022',
  email: 'hriatpuii.azl@zorun.mz',
  upiId: 'hriatpuii@oksbi',
  homeDistrict: 'Aizawl',
  homeVeng: 'Dawrpui',
  ymaSection: 'Section-II YMA',
  houseLandmark: 'Near Dawrpui Presbyterian Church Concrete Steps, Blue Gate',
  bioNote: 'Gate bulah bell hmet rawh / Ring doorbell beside concrete steps.',
  lat: 23.7307,
  lng: 92.7173,
  emergencyContactName: 'Pu Zoramthanga (Chhungte)',
  emergencyContactPhone: '+91-9436140099',
  avatarUrl: '',
  updatedAt: '2026-11-23T00:00:00.000Z',
};

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
  profile: DEFAULT_USER_PROFILE,
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
    const rawProfile = (parsed.profile || {}) as Partial<UserProfileIdentity>;
    const profile: UserProfileIdentity = {
      fullName:
        typeof rawProfile.fullName === 'string' && rawProfile.fullName.trim()
          ? rawProfile.fullName.trim().slice(0, 80)
          : DEFAULT_USER_PROFILE.fullName,
      phone:
        typeof rawProfile.phone === 'string' && rawProfile.phone.trim()
          ? rawProfile.phone.trim().slice(0, 24)
          : DEFAULT_USER_PROFILE.phone,
      email:
        typeof rawProfile.email === 'string'
          ? rawProfile.email.trim().slice(0, 120)
          : DEFAULT_USER_PROFILE.email,
      upiId:
        typeof rawProfile.upiId === 'string'
          ? rawProfile.upiId.trim().slice(0, 80)
          : DEFAULT_USER_PROFILE.upiId,
      homeDistrict:
        typeof rawProfile.homeDistrict === 'string'
          ? (rawProfile.homeDistrict as MizoramDistrict)
          : DEFAULT_USER_PROFILE.homeDistrict,
      homeVeng:
        typeof rawProfile.homeVeng === 'string' && rawProfile.homeVeng.trim()
          ? rawProfile.homeVeng.trim().slice(0, 80)
          : DEFAULT_USER_PROFILE.homeVeng,
      ymaSection:
        typeof rawProfile.ymaSection === 'string'
          ? rawProfile.ymaSection.trim().slice(0, 80)
          : DEFAULT_USER_PROFILE.ymaSection,
      houseLandmark:
        typeof rawProfile.houseLandmark === 'string'
          ? rawProfile.houseLandmark.trim().slice(0, 180)
          : DEFAULT_USER_PROFILE.houseLandmark,
      bioNote:
        typeof rawProfile.bioNote === 'string'
          ? rawProfile.bioNote.trim().slice(0, 200)
          : DEFAULT_USER_PROFILE.bioNote,
      lat:
        typeof rawProfile.lat === 'number' && Number.isFinite(rawProfile.lat)
          ? rawProfile.lat
          : DEFAULT_USER_PROFILE.lat,
      lng:
        typeof rawProfile.lng === 'number' && Number.isFinite(rawProfile.lng)
          ? rawProfile.lng
          : DEFAULT_USER_PROFILE.lng,
      emergencyContactName:
        typeof rawProfile.emergencyContactName === 'string'
          ? rawProfile.emergencyContactName.trim().slice(0, 80)
          : DEFAULT_USER_PROFILE.emergencyContactName,
      emergencyContactPhone:
        typeof rawProfile.emergencyContactPhone === 'string'
          ? rawProfile.emergencyContactPhone.trim().slice(0, 24)
          : DEFAULT_USER_PROFILE.emergencyContactPhone,
      avatarUrl:
        typeof rawProfile.avatarUrl === 'string' ? rawProfile.avatarUrl : DEFAULT_USER_PROFILE.avatarUrl,
      updatedAt:
        typeof rawProfile.updatedAt === 'string'
          ? rawProfile.updatedAt
          : DEFAULT_USER_PROFILE.updatedAt,
    };
    return {
      profile,
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

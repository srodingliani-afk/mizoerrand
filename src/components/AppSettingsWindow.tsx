import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  Database,
  Gauge,
  Globe,
  MapPin,
  Moon,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Sun,
  Type,
  Wallet,
  Zap,
} from 'lucide-react';
import type { Language, MizoramDistrict } from '../shared/types';
import { ALL_MIZORAM_DISTRICT_NAMES, getDistrictInfo } from '../data/mizoramDistricts';
import { isHapticsSupported, triggerHaptic } from '../lib/nativeBridge';
import type { UserAppSettings } from '../lib/userSettings';
import { LayerWindow } from './LayerWindow';

interface AppSettingsWindowProps {
  open: boolean;
  onClose: () => void;
  lang: Language;
  onChangeLang: (next: Language) => void;
  selectedDistrict: MizoramDistrict;
  onChangeDistrict: (d: MizoramDistrict) => void;
  settings: UserAppSettings;
  onUpdateSettings: (patch: Partial<UserAppSettings>) => void;
  onResetSettings: () => void;
  onClearOfflineCache: () => Promise<void>;
}

const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}> = ({ checked, onChange, ariaLabel }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
      checked ? 'bg-emerald-700' : 'bg-slate-300 dark:bg-slate-700'
    }`}
  >
    <span
      className={`inline-block h-5 w-5 rounded-full bg-white shadow-xs transition-transform ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
);

export const AppSettingsWindow: React.FC<AppSettingsWindowProps> = ({
  open,
  onClose,
  lang,
  onChangeLang,
  selectedDistrict,
  onChangeDistrict,
  settings,
  onUpdateSettings,
  onResetSettings,
  onClearOfflineCache,
}) => {
  const [cacheNotice, setCacheNotice] = useState<string | null>(null);
  const [clearingCache, setClearingCache] = useState(false);
  const hapticsSupported = isHapticsSupported();

  const handleClearCache = async () => {
    setClearingCache(true);
    setCacheNotice(null);
    triggerHaptic('sync');
    try {
      await onClearOfflineCache();
      setCacheNotice(
        lang === 'miz'
          ? 'Offline cache thian fai a, data thar lak thar a ni.'
          : 'Offline cache cleared and live data refreshed.'
      );
    } finally {
      setClearingCache(false);
    }
  };

  return (
    <LayerWindow
      open={open}
      onClose={onClose}
      title={lang === 'miz' ? 'App Settings' : 'App Settings'}
      subtitle={
        lang === 'miz'
          ? 'I duh dan angin ZoRûn mobile app siam rem rawh'
          : 'Customize your ZoRûn mobile app experience'
      }
      size="md"
      footer={
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              onResetSettings();
              setCacheNotice(
                lang === 'miz' ? 'Settings default-ah dah let a ni.' : 'Settings reset to defaults.'
              );
            }}
            className="min-h-[44px] rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {lang === 'miz' ? 'Reset' : 'Reset Defaults'}
          </button>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            className="flex-1 min-h-[44px] rounded-2xl bg-emerald-900 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-800 inline-flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            {lang === 'miz' ? 'Dah Fel (Done)' : 'Done'}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {cacheNotice && (
          <div
            role="status"
            className="rounded-2xl bg-emerald-900 text-white px-4 py-2.5 text-xs font-semibold"
          >
            {cacheNotice}
          </div>
        )}

        {/* Section 1: Theme, Language & Region */}
        <section className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1">
            {lang === 'miz' ? 'Theme, Tawng & District' : 'Appearance, Language & Location'}
          </h3>
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-slate-800 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  {settings.theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {lang === 'miz' ? 'App Rawng (Light / Dark)' : 'App Appearance'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {settings.theme === 'dark'
                      ? lang === 'miz'
                        ? 'Zan lama mit hahdam nan Dark Mode'
                        : 'Dark Mode active for low-light comfort'
                      : lang === 'miz'
                        ? 'Chhun lama fiah tak Light Mode'
                        : 'Crisp Daylight Mode active'}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 p-1 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onUpdateSettings({ theme: 'light' });
                  }}
                  className={`min-h-[34px] px-3 rounded-lg text-xs font-bold transition-colors ${
                    settings.theme === 'light'
                      ? 'bg-white text-emerald-900 shadow-xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Light
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onUpdateSettings({ theme: 'dark' });
                  }}
                  className={`min-h-[34px] px-3 rounded-lg text-xs font-bold transition-colors ${
                    settings.theme === 'dark'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Dark
                </button>
              </div>
            </div>

            <div className="p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0">
                  <Globe className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {lang === 'miz' ? 'App Tawng' : 'App Language'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Mizo / English</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 p-1 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onChangeLang('miz');
                  }}
                  className={`min-h-[34px] px-3 rounded-lg text-xs font-bold transition-colors ${
                    lang === 'miz'
                      ? 'bg-white dark:bg-slate-700 text-emerald-900 dark:text-emerald-200 shadow-xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Mizo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onChangeLang('en');
                  }}
                  className={`min-h-[34px] px-3 rounded-lg text-xs font-bold transition-colors ${
                    lang === 'en'
                      ? 'bg-white dark:bg-slate-700 text-emerald-900 dark:text-emerald-200 shadow-xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  English
                </button>
              </div>
            </div>

            <div className="p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <label htmlFor="settings-district" className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {lang === 'miz' ? 'District Khawpui' : 'Active District'}
                  </label>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Mizoram District 11</p>
                </div>
              </div>
              <select
                id="settings-district"
                value={selectedDistrict}
                onChange={(e) => {
                  triggerHaptic('light');
                  onChangeDistrict(e.target.value as MizoramDistrict);
                }}
                className="min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100 focus:border-emerald-700 focus:outline-none"
              >
                {ALL_MIZORAM_DISTRICT_NAMES.map((d) => {
                  const info = getDistrictInfo(d);
                  return (
                    <option key={d} value={d}>
                      {d} ({info.rtoCode})
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        </section>

        {/* Section 2: Booking & Safety Defaults */}
        <section className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1">
            {lang === 'miz' ? 'Booking & Himna Defaults' : 'Booking & Safety Defaults'}
          </h3>
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 flex items-center justify-center shrink-0">
                  <Wallet className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <label htmlFor="settings-payment" className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {lang === 'miz' ? 'Pawisa Pek Dan Default' : 'Default Payment'}
                  </label>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {lang === 'miz' ? 'Order thar siam apiangah' : 'Pre-selected on new bookings'}
                  </p>
                </div>
              </div>
              <select
                id="settings-payment"
                value={settings.defaultPaymentMethod}
                onChange={(e) => {
                  triggerHaptic('light');
                  onUpdateSettings({
                    defaultPaymentMethod: e.target.value as 'upi_escrow' | 'dynamic_qr_cod',
                  });
                }}
                className="min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100 focus:border-emerald-700 focus:outline-none"
              >
                <option value="upi_escrow">UPI Escrow</option>
                <option value="dynamic_qr_cod">Dynamic QR COD</option>
              </select>
            </div>

            <div className="p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {lang === 'miz' ? 'Auto ₹3 Micro-Insurance' : 'Auto ₹3 Micro-Insurance'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {lang === 'miz'
                      ? 'Runner leh Bazar order-ah telh nghal'
                      : 'Protect errands & marketplace orders automatically'}
                  </p>
                </div>
              </div>
              <ToggleSwitch
                checked={settings.defaultMicroInsurance}
                onChange={(v) => {
                  triggerHaptic('light');
                  onUpdateSettings({ defaultMicroInsurance: v });
                }}
                ariaLabel="Toggle auto micro-insurance"
              />
            </div>

            <div className="p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {lang === 'miz' ? 'SOS Thawn Hma Confirmation' : 'Confirm Before SOS Dispatch'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {lang === 'miz'
                      ? 'Hmeh sual venna (tap 2-naah chauh thawn)'
                      : 'Require second tap to prevent accidental SOS'}
                  </p>
                </div>
              </div>
              <ToggleSwitch
                checked={settings.confirmBeforeSos}
                onChange={(v) => {
                  triggerHaptic('light');
                  onUpdateSettings({ confirmBeforeSos: v });
                }}
                ariaLabel="Toggle confirm before SOS dispatch"
              />
            </div>
          </div>
        </section>

        {/* Section 3: Tactile Feel, Display & Speed */}
        <section className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1">
            {lang === 'miz' ? 'Vibration, Hawrawp & Chakna' : 'Tactile, Display & Speed'}
          </h3>
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {lang === 'miz' ? 'Haptic Vibration Feedback' : 'Haptic Vibration'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {hapticsSupported
                      ? lang === 'miz'
                        ? 'Button hmeh leh SOS-ah a nghawr ang'
                        : 'Tactile feedback on taps, bookings & SOS'
                      : lang === 'miz'
                        ? 'He device/browser-ah vibration a awm lo'
                        : 'Device browser does not expose vibration'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {settings.hapticsEnabled && hapticsSupported && (
                  <button
                    type="button"
                    onClick={() => triggerHaptic('booking')}
                    className="min-h-[34px] rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
                  >
                    Test
                  </button>
                )}
                <ToggleSwitch
                  checked={settings.hapticsEnabled}
                  onChange={(v) => {
                    onUpdateSettings({ hapticsEnabled: v });
                    if (v) {
                      setTimeout(() => triggerHaptic('medium'), 20);
                    }
                  }}
                  ariaLabel="Toggle haptic feedback"
                />
              </div>
            </div>

            <div className="p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
                  <Type className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {lang === 'miz' ? 'Hawrawp Len Zawng' : 'Text Readability'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {lang === 'miz' ? 'Chhiar awlsam zawk nan' : 'Standard or comfortable larger text'}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 p-1 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onUpdateSettings({ textSize: 'normal' });
                  }}
                  className={`min-h-[34px] px-2.5 rounded-lg text-xs font-bold transition-colors ${
                    settings.textSize === 'normal'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Normal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onUpdateSettings({ textSize: 'large' });
                  }}
                  className={`min-h-[34px] px-2.5 rounded-lg text-xs font-bold transition-colors ${
                    settings.textSize === 'large'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Large
                </button>
              </div>
            </div>

            <div className="p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                  <Zap className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {lang === 'miz' ? 'Reduced Motion (Instant UI)' : 'Reduced Motion'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {lang === 'miz'
                      ? 'Popup animation titawp la, hawn chak zual'
                      : 'Open popups instantly with zero slide animation'}
                  </p>
                </div>
              </div>
              <ToggleSwitch
                checked={settings.reducedMotion}
                onChange={(v) => {
                  triggerHaptic('light');
                  onUpdateSettings({ reducedMotion: v });
                }}
                ariaLabel="Toggle reduced motion"
              />
            </div>

            <div className="p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
                  <Gauge className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {lang === 'miz' ? 'Low-Data / Hill Signal Mode' : 'Low-Data / Hill Signal Mode'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {lang === 'miz'
                      ? 'Signal muan laiin map & image tlem zawk hman'
                      : 'Save mobile data on weak hill connections'}
                  </p>
                </div>
              </div>
              <ToggleSwitch
                checked={settings.lowDataMode}
                onChange={(v) => {
                  triggerHaptic('light');
                  onUpdateSettings({ lowDataMode: v });
                }}
                ariaLabel="Toggle low data mode"
              />
            </div>
          </div>
        </section>

        {/* Section 4: Offline Storage */}
        <section className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1">
            {lang === 'miz' ? 'Storage & Offline Cache' : 'Storage & Offline Cache'}
          </h3>
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
                <Database className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {lang === 'miz' ? 'Offline Cache Thian Fai' : 'Clear Offline Cache'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {lang === 'miz'
                    ? 'Cache paih la server atangin data thar la nghal'
                    : 'Clear local snapshot and sync fresh live data'}
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={clearingCache}
              onClick={handleClearCache}
              className="min-h-[40px] rounded-xl bg-slate-900 dark:bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-slate-800 dark:hover:bg-emerald-600 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {clearingCache ? '...' : lang === 'miz' ? 'Thian Fai' : 'Clear & Sync'}
            </button>
          </div>
        </section>
      </div>
    </LayerWindow>
  );
};

import React from 'react';
import {
  ChevronRight,
  Globe,
  MapPin,
  Server,
  Settings,
  ShieldCheck,
  Store,
  Truck,
  User,
  UserCheck,
  UserPlus,
  Wrench,
} from 'lucide-react';
import type {
  AppMode,
  AppRemoteConfig,
  Language,
  MizoramDistrict,
} from '../shared/types';
import { TRANSLATIONS } from '../i18n/translations';
import { ALL_MIZORAM_DISTRICT_NAMES, getDistrictInfo } from '../data/mizoramDistricts';
import { StandaloneInstallCard } from '../lib/pwa';
import { triggerHaptic } from '../lib/nativeBridge';
import type { UserAppSettings } from '../lib/userSettings';

interface MobileProfileViewProps {
  lang: Language;
  onToggleLang: () => void;
  selectedDistrict: MizoramDistrict;
  onChangeDistrict: (d: MizoramDistrict) => void;
  activeUserMode: 'customer' | 'partner' | 'staff' | 'merchant' | 'technician' | 'apply';
  onSelectMode: (mode: AppMode) => void;
  remoteConfig: AppRemoteConfig;
  userSettings: UserAppSettings;
  onOpenSettings: () => void;
}

export const MobileProfileView: React.FC<MobileProfileViewProps> = ({
  lang,
  onToggleLang,
  selectedDistrict,
  onChangeDistrict,
  activeUserMode,
  onSelectMode,
  remoteConfig,
  userSettings,
  onOpenSettings,
}) => {
  const t = TRANSLATIONS[lang];
  const districtInfo = getDistrictInfo(selectedDistrict);

  const workspaces: Array<{
    mode: 'customer' | 'partner' | 'staff' | 'merchant' | 'technician' | 'apply';
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    tint: string;
  }> = [
    {
      mode: 'customer',
      title: lang === 'miz' ? 'Customer Super-App' : 'Customer Super-App',
      subtitle:
        lang === 'miz'
          ? 'Runner, En Hmasak Bazar, Awmpui & 24×7 SOS'
          : 'Book Runner, shop En Hmasak, Awmpui & SOS',
      icon: <User className="w-5 h-5 text-emerald-700" />,
      tint: 'bg-emerald-50',
    },
    {
      mode: 'partner',
      title: lang === 'miz' ? 'Runner & Fleet Driver Portal' : 'Runner & Fleet Driver Portal',
      subtitle:
        lang === 'miz'
          ? 'Runner, Bike, Taxi & Pickup job hmuhna + GPS & OTP'
          : 'Runner, Bike, Taxi & Pickup jobs, live GPS & OTP',
      icon: <Truck className="w-5 h-5 text-teal-700" />,
      tint: 'bg-teal-50',
    },
    {
      mode: 'staff',
      title: lang === 'miz' ? 'Awmpui & Family Driver Portal' : 'Awmpui & Family Driver Portal',
      subtitle:
        lang === 'miz'
          ? 'Ka Contract, Attendance, Chawlh Dilna, Payslip & Worker SOS'
          : 'Active contract, daily check-in, leave, payslips & SOS',
      icon: <UserCheck className="w-5 h-5 text-indigo-700" />,
      tint: 'bg-indigo-50',
    },
    {
      mode: 'merchant',
      title: lang === 'miz' ? 'Dawr Neitu (Merchant Portal)' : 'Merchant Shop Portal',
      subtitle:
        lang === 'miz'
          ? 'AI Magic Listing & En Hmasak Phawt orders'
          : 'AI Magic Listing & Check-Before-Pay orders',
      icon: <Store className="w-5 h-5 text-amber-700" />,
      tint: 'bg-amber-50',
    },
    {
      mode: 'technician',
      title: lang === 'miz' ? '24×7 SOS Technician Portal' : '24×7 SOS Responder Portal',
      subtitle:
        lang === 'miz'
          ? '3-Shift Emergency alert dawnna, spare parts & chinfelna'
          : '3-Shift emergency dispatch queue, parts & resolution',
      icon: <Wrench className="w-5 h-5 text-red-700" />,
      tint: 'bg-red-50',
    },
    {
      mode: 'apply',
      title: lang === 'miz' ? 'Hnathawk / Driver Dilna (Join ZoRun)' : 'Apply as Awmpui / Driver / Runner',
      subtitle:
        lang === 'miz'
          ? 'Awmpui, Family Driver, Runner & Taxi KYC thehluhna'
          : 'Submit KYC & YMA/VC reference straight to HR Vetting',
      icon: <UserPlus className="w-5 h-5 text-emerald-800" />,
      tint: 'bg-emerald-100/80',
    },
  ];

  return (
    <div className="space-y-5 pb-24 md:pb-8">
      {/* Native Profile Hero Card */}
      <section className="rounded-3xl bg-gradient-to-br from-emerald-950 via-teal-900 to-emerald-900 p-5 sm:p-6 text-white shadow-[0_8px_28px_rgba(6,78,59,0.18)]">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center text-lg font-extrabold font-display tracking-tight shrink-0">
            ZR
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight truncate">
              {lang === 'miz' ? 'ZoRun Account' : 'Your ZoRun Profile'}
            </h1>
            <p className="text-xs text-emerald-100/90 mt-0.5">
              {selectedDistrict} ({districtInfo.rtoCode}) · {districtInfo.vengs.length} Vengs ·{' '}
              {lang === 'miz' ? 'Mizo' : 'English'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5 mt-5 pt-4 border-t border-white/15 text-xs">
          <div>
            <p className="text-emerald-200/80 text-[11px]">Walker Base</p>
            <p className="font-mono font-bold text-base tabular-nums mt-0.5">₹{remoteConfig.baseWalkerRate}</p>
          </div>
          <div>
            <p className="text-emerald-200/80 text-[11px]">Rain Surge</p>
            <p className="font-mono font-bold text-base tabular-nums mt-0.5">{remoteConfig.rainSurgeMultiplier}x</p>
          </div>
          <div>
            <p className="text-emerald-200/80 text-[11px]">Return Fee</p>
            <p className="font-mono font-bold text-base tabular-nums mt-0.5">₹{remoteConfig.returnDeliveryFee}</p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column on Desktop (Second on Mobile): Standalone Install & App Settings */}
        <div className="lg:col-span-6 order-2 lg:order-1 space-y-5">
          <StandaloneInstallCard lang={lang} />

          {/* Native Grouped Settings List */}
          <div className="rounded-3xl bg-white shadow-[0_2px_12px_rgba(15,23,42,0.04)] overflow-hidden divide-y divide-slate-100">
            <div className="p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5 text-emerald-700" />
                </div>
                <div className="min-w-0">
                  <label htmlFor="profile-district-select" className="block text-sm font-semibold text-slate-900">
                    {t.districtLabel}
                  </label>
                  <p className="text-xs text-slate-500">
                    {lang === 'miz' ? 'Mizoram District 11 thlanna' : 'Active Mizoram District'}
                  </p>
                </div>
              </div>
              <select
                id="profile-district-select"
                value={selectedDistrict}
                onChange={(e) => onChangeDistrict(e.target.value as MizoramDistrict)}
                className="min-h-[40px] rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
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

            <button
              type="button"
              onClick={onToggleLang}
              className="w-full p-4 min-h-[64px] flex items-center justify-between gap-3 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 flex items-center justify-center shrink-0">
                  <Globe className="w-5 h-5 text-teal-700" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {lang === 'miz' ? 'Tawng Thlanna (Language)' : 'App Language'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {lang === 'miz' ? 'Mizo Tawng hman mek' : 'Currently English · Tap for Mizo'}
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold text-emerald-700 shrink-0">
                {lang === 'miz' ? 'MIZ → EN' : 'EN → MIZ'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onOpenSettings();
              }}
              className="w-full p-4 min-h-[68px] flex items-center justify-between gap-3 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                  <Settings className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {lang === 'miz' ? 'App Settings Khawihna' : 'App Settings'}
                  </p>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {userSettings.hapticsEnabled ? 'Haptics On' : 'Haptics Off'} ·{' '}
                    {userSettings.defaultPaymentMethod === 'upi_escrow' ? 'UPI Escrow' : 'QR COD'} ·{' '}
                    {userSettings.textSize === 'large' ? 'Large Text' : 'Standard Text'}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            </button>

            <div className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-slate-700" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {lang === 'miz' ? 'Man Inthup Awm Lo Guarantee' : 'Zero Hidden Fees Guarantee'}
                </p>
                <p className="text-xs text-slate-500">
                  {lang === 'miz'
                    ? '100% UPI Escrow & Rs. 3 Sachet Micro-Insurance'
                    : '100% UPI Escrow & ₹3 Sachet Micro-Insurance'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column on Desktop (First on Mobile): All Role Portals & Server Backend Web Portal */}
        <div className="lg:col-span-6 order-1 lg:order-2 space-y-5">
          <div className="rounded-3xl bg-white shadow-[0_2px_12px_rgba(15,23,42,0.04)] overflow-hidden">
            <div className="px-5 pt-5 pb-3">
              <h2 className="text-base font-bold text-slate-900">{t.switchWorkspaceTitle}</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {lang === 'miz'
                  ? 'Customer, Runner emaw Dawr Neitu mode-ah thlak rawh'
                  : 'Switch between Customer, Partner, and Merchant apps'}
              </p>
            </div>
            <div className="divide-y divide-slate-100">
              {workspaces.map((ws) => {
                const isActive = activeUserMode === ws.mode;
                return (
                  <button
                    key={ws.mode}
                    type="button"
                    onClick={() => onSelectMode(ws.mode)}
                    className="w-full min-h-[68px] px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className={`w-11 h-11 rounded-2xl ${ws.tint} flex items-center justify-center shrink-0`}>
                        {ws.icon}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {ws.title}
                          {isActive && (
                            <span className="ml-2 text-xs font-semibold text-emerald-700">
                              · {lang === 'miz' ? 'Hman mek' : 'Active'}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500 truncate mt-0.5">{ws.subtitle}</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Separate Server Backend Web App Access */}
          <div className="rounded-3xl bg-slate-900 text-white p-5 space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
                <Server className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">
                  {lang === 'miz'
                    ? 'Server Backend Web App'
                    : 'Server Backend Web App'}
                </h2>
                <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                  {lang === 'miz'
                    ? 'Admin Operations, KYC, Payroll, Dev Studio & Express API enkawlna web app hrang.'
                    : 'Dedicated desktop web app for Operations, KYC, Payroll, SDUI Dev Studio & API Console.'}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => onSelectMode('admin')}
                className="min-h-[44px] rounded-2xl bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 active:scale-[0.98] transition-all"
              >
                Operations &amp; HR (/admin)
              </button>
              <button
                type="button"
                onClick={() => onSelectMode('dev_studio')}
                className="min-h-[44px] rounded-2xl bg-white/10 px-3 py-2.5 text-xs font-semibold text-white hover:bg-white/15 active:scale-[0.98] transition-all"
              >
                Dev Studio
              </button>
              <button
                type="button"
                onClick={() => onSelectMode('backend')}
                className="min-h-[44px] rounded-2xl bg-white/10 px-3 py-2.5 text-xs font-semibold text-white hover:bg-white/15 active:scale-[0.98] transition-all"
              >
                API Console (/backend)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

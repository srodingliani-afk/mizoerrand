import React, { useState } from 'react';
import {
  ChevronRight,
  Globe,
  HardDrive,
  LogIn,
  LogOut,
  MapPin,
  Phone,
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
import { useFirebaseAuth } from '../lib/firebase';
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
  const {
    user,
    profile,
    effectiveRole,
    driveConnected,
    firestoreOnline,
    loading: authLoading,
    authError,
    signInWithGoogle,
    disconnectDriveToken,
    signOutFirebase,
    syncProfileDistrict,
  } = useFirebaseAuth();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [showPhoneInfo, setShowPhoneInfo] = useState(false);

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
      title: lang === 'miz' ? 'Hnathawk / Driver Dilna (Join ZoRûn)' : 'Apply as Awmpui / Driver / Runner',
      subtitle:
        lang === 'miz'
          ? 'Awmpui, Family Driver, Runner & Taxi KYC thehluhna'
          : 'Submit KYC & YMA/VC reference straight to HR Vetting',
      icon: <UserPlus className="w-5 h-5 text-emerald-800" />,
      tint: 'bg-emerald-100/80',
    },
  ];

  const handleDistrictChange = (next: MizoramDistrict) => {
    onChangeDistrict(next);
    void syncProfileDistrict(next);
  };

  return (
    <div className="space-y-5 pb-24 md:pb-8">
      {/* Native Profile & Firebase Auth / Drive Hero Card */}
      <section className="rounded-3xl bg-gradient-to-br from-emerald-950 via-teal-900 to-emerald-900 p-5 sm:p-6 text-white shadow-[0_8px_28px_rgba(6,78,59,0.18)] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={profile?.displayName || user.displayName || 'ZoRûn User'}
                className="w-14 h-14 rounded-2xl object-cover border-2 border-white/25 shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center text-lg font-extrabold font-display tracking-tight shrink-0">
                {user ? (user.displayName?.[0] || 'Z').toUpperCase() : 'ZR'}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold tracking-tight truncate">
                  {user
                    ? profile?.displayName || user.displayName || 'ZoRûn Member'
                    : lang === 'miz'
                      ? 'ZoRûn Account'
                      : 'Your ZoRûn Profile'}
                </h1>
                <span className="rounded-md bg-white/15 px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-100">
                  {user ? effectiveRole : 'GUEST'}
                </span>
              </div>
              <p className="text-xs text-emerald-100/90 mt-0.5 truncate">
                {user?.email ? `${user.email} · ` : ''}
                {selectedDistrict} ({districtInfo.rtoCode}) · {firestoreOnline ? 'Firestore Live' : 'Offline Cache'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!user ? (
              <button
                type="button"
                disabled={authLoading}
                onClick={() => {
                  triggerHaptic('medium');
                  void signInWithGoogle(selectedDistrict);
                }}
                className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-bold text-emerald-950 hover:bg-emerald-50 active:scale-[0.98] transition-all"
              >
                <LogIn className="w-4 h-4 text-emerald-800" />
                {lang === 'miz' ? 'Google & Drive-in Lut Rawh' : 'Sign in with Google & Drive'}
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-semibold ${
                    driveConnected ? 'bg-emerald-500/20 text-emerald-100' : 'bg-white/10 text-emerald-200'
                  }`}
                >
                  <HardDrive className="w-3.5 h-3.5" />
                  {driveConnected ? 'Google Drive Synced' : 'Drive Local Fallback'}
                </span>

                {!confirmSignOut ? (
                  <button
                    type="button"
                    onClick={() => setConfirmSignOut(true)}
                    className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl bg-white/15 hover:bg-white/25 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    {lang === 'miz' ? 'Chhuak' : 'Sign Out'}
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 bg-slate-950/50 rounded-xl p-1">
                    {driveConnected && (
                      <button
                        type="button"
                        onClick={() => {
                          disconnectDriveToken();
                          setConfirmSignOut(false);
                        }}
                        className="rounded-lg bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-slate-950"
                      >
                        Unlink Drive Only
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmSignOut(false);
                        void signOutFirebase();
                      }}
                      className="rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white"
                    >
                      Confirm Sign Out
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmSignOut(false)}
                      className="rounded-lg px-2 py-1 text-[11px] text-emerald-100"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {authError && (
          <div className="rounded-xl bg-red-950/60 border border-red-400/40 px-3.5 py-2 text-xs text-red-100">
            {authError}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 text-[11px] text-emerald-100/80">
          <button
            type="button"
            onClick={() => setShowPhoneInfo((v) => !v)}
            className="inline-flex items-center gap-1.5 underline decoration-emerald-300/50 hover:text-white"
          >
            <Phone className="w-3 h-3" />
            {lang === 'miz' ? 'Phone OTP Login chungchang' : 'Phone OTP Sign-In setup note'}
          </button>
          <span>{user ? 'Real-time District Firestore Enabled' : 'Guest Mode · Sign in to sync live GPS'}</span>
        </div>

        {showPhoneInfo && (
          <p className="rounded-xl bg-white/10 px-3.5 py-2.5 text-[11px] text-emerald-50 leading-relaxed">
            {lang === 'miz'
              ? 'Google Sign-In & Drive Storage chu hman nghal theih a ni. Phone number OTP login hman duh chuan Firebase Console (Authentication → Sign-in method → Phone) ah enable a ngai.'
              : 'Google Sign-In and Google Drive backup work immediately. To also allow Phone OTP login for Mizo phone numbers, enable the Phone provider in Firebase Console (Authentication → Sign-in method).'}
          </p>
        )}

        <div className="grid grid-cols-3 gap-2.5 pt-4 border-t border-white/15 text-xs">
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
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-transparent dark:border-slate-800 shadow-[0_2px_12px_rgba(15,23,42,0.04)] overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
            <div className="p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <label htmlFor="profile-district-select" className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {t.districtLabel}
                  </label>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {lang === 'miz' ? 'Mizoram District 11 thlanna' : 'Active Mizoram District'}
                  </p>
                </div>
              </div>
              <select
                id="profile-district-select"
                value={selectedDistrict}
                onChange={(e) => handleDistrictChange(e.target.value as MizoramDistrict)}
                className="min-h-[40px] rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
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
              className="w-full p-4 min-h-[64px] flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/70 active:bg-slate-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950/60 flex items-center justify-center shrink-0">
                  <Globe className="w-5 h-5 text-teal-700 dark:text-teal-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {lang === 'miz' ? 'Tawng Thlanna (Language)' : 'App Language'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {lang === 'miz' ? 'Mizo Tawng hman mek' : 'Currently English · Tap for Mizo'}
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 shrink-0">
                {lang === 'miz' ? 'MIZ → EN' : 'EN → MIZ'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onOpenSettings();
              }}
              className="w-full p-4 min-h-[68px] flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/70 active:bg-slate-100 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-slate-900 dark:bg-emerald-700 text-white flex items-center justify-center shrink-0">
                  <Settings className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {lang === 'miz' ? 'App Settings Khawihna' : 'App Settings'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {userSettings.theme === 'dark' ? 'Dark Mode' : 'Light Mode'} ·{' '}
                    {userSettings.defaultPaymentMethod === 'upi_escrow' ? 'UPI Escrow' : 'QR COD'} ·{' '}
                    {userSettings.textSize === 'large' ? 'Large Text' : 'Standard Text'}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            </button>

            <div className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-slate-700 dark:text-slate-300" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {lang === 'miz' ? 'Man Inthup Awm Lo Guarantee' : 'Zero Hidden Fees Guarantee'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
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
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-transparent dark:border-slate-800 shadow-[0_2px_12px_rgba(15,23,42,0.04)] overflow-hidden">
            <div className="px-5 pt-5 pb-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{t.switchWorkspaceTitle}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {lang === 'miz'
                  ? 'Customer, Runner emaw Dawr Neitu mode-ah thlak rawh'
                  : 'Switch between Customer, Partner, and Merchant apps'}
              </p>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {workspaces.map((ws) => {
                const isActive = activeUserMode === ws.mode;
                return (
                  <button
                    key={ws.mode}
                    type="button"
                    onClick={() => onSelectMode(ws.mode)}
                    className="w-full min-h-[68px] px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/70 active:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className={`w-11 h-11 rounded-2xl ${ws.tint} dark:bg-slate-800 flex items-center justify-center shrink-0`}>
                        {ws.icon}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {ws.title}
                          {isActive && (
                            <span className="ml-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                              · {lang === 'miz' ? 'Hman mek' : 'Active'}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{ws.subtitle}</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

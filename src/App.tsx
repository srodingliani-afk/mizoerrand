import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  Globe,
  Home,
  LogOut,
  MapPin,
  RefreshCw,
  Server,
  Settings,
  Shield,
  ShoppingBag,
  Smartphone,
  Terminal,
  UserCircle2,
  Users,
} from 'lucide-react';
import type {
  AppMode,
  AppRemoteConfig,
  EmergencySosTicket,
  ErrandRequest,
  Language,
  MarketplaceOrder,
  MarketplaceProduct,
  MizoramDistrict,
  PartnerProfile,
  PayrollRecord,
  StaffAttendanceLog,
  StaffLeaveRequest,
  StaffingBooking,
  WorkforceMember,
} from './shared/types';
import { TRANSLATIONS } from './i18n/translations';
import { ALL_MIZORAM_DISTRICT_NAMES, getDistrictInfo } from './data/mizoramDistricts';
import { idbClear, idbGet, idbPut } from './lib/offlineCache';
import { setHapticsEnabled, triggerHaptic } from './lib/nativeBridge';
import {
  DEFAULT_USER_SETTINGS,
  applyUserSettingsToDom,
  loadUserSettings,
  saveUserSettings,
  type UserAppSettings,
} from './lib/userSettings';
import { OfflineIndicator, PWAInstallButton } from './lib/pwa';
import { CustomerView, type CustomerTab } from './components/CustomerView';
import { LayerWindow } from './components/LayerWindow';
import { AppSettingsWindow } from './components/AppSettingsWindow';

// Lazy-load secondary & heavy backend modules so initial Mobile User App boot stays tiny & instant
const PartnerView = lazy(() =>
  import('./components/PartnerView').then((m) => ({ default: m.PartnerView }))
);
const StaffPortalView = lazy(() =>
  import('./components/StaffPortalView').then((m) => ({ default: m.StaffPortalView }))
);
const MerchantView = lazy(() =>
  import('./components/MerchantView').then((m) => ({ default: m.MerchantView }))
);
const TechnicianPortalView = lazy(() =>
  import('./components/TechnicianPortalView').then((m) => ({ default: m.TechnicianPortalView }))
);
const OnboardingApplyView = lazy(() =>
  import('./components/OnboardingApplyView').then((m) => ({ default: m.OnboardingApplyView }))
);
const MobileProfileView = lazy(() =>
  import('./components/MobileProfileView').then((m) => ({ default: m.MobileProfileView }))
);
const AdminDashboard = lazy(() =>
  import('./components/AdminDashboard').then((m) => ({ default: m.AdminDashboard }))
);
const DevStudioView = lazy(() =>
  import('./components/DevStudioView').then((m) => ({ default: m.DevStudioView }))
);
const BackendConsoleView = lazy(() =>
  import('./components/BackendConsoleView').then((m) => ({ default: m.BackendConsoleView }))
);
const SuperAdminAuthGate = lazy(() =>
  import('./components/SuperAdminAuthGate').then((m) => ({ default: m.SuperAdminAuthGate }))
);

interface BootstrapSnapshot {
  mapsApiKey?: string;
  sdui: {
    config: AppRemoteConfig;
    effectiveVisibility: {
      errands: boolean;
      marketplace: boolean;
      workforce: boolean;
      managedStaffing: boolean;
      emergency24x7: boolean;
      sundayRestrictionActive: boolean;
    };
  };
  partners: PartnerProfile[];
  jobs: ErrandRequest[];
  products: MarketplaceProduct[];
  orders: MarketplaceOrder[];
  userMonthlyReturns: Record<string, number>;
  workforce: WorkforceMember[];
  bookings: StaffingBooking[];
  leaveRequests?: StaffLeaveRequest[];
  attendanceLogs?: StaffAttendanceLog[];
  payrollRecords: PayrollRecord[];
  tickets: EmergencySosTicket[];
}

const DEFAULT_CONFIG: AppRemoteConfig = {
  appName: 'ZoRun Mizoram',
  region: 'ap-south-1',
  sundayEmergencyMode: false,
  rainSurgeMultiplier: 1.0,
  trafficSurgeMultiplier: 1.0,
  baseWalkerRate: 40,
  baseBikeRate: 50,
  baseAutoTaxiRate: 90,
  basePickupRate: 350,
  returnDeliveryFee: 45,
  monthlyReturnLimit: 3,
  codCashLimitRs: 2500,
  microInsuranceSachetRs: 3,
  visibleServices: {
    errands: true,
    marketplace: true,
    workforce: true,
    managedStaffing: true,
    emergency24x7: true,
  },
  announcementEn: 'All-inclusive transparent fares across Aizawl Vengs. Zero hidden fees.',
  announcementMiz: 'Aizawl Veng tinah man inthup awm lo, hman theih reng a ni.',
  updatedAt: new Date().toISOString(),
};

type MobileUserTab = CustomerTab | 'profile';

function resolveInitialModeFromUrl(): AppMode {
  if (typeof window === 'undefined') return 'customer';
  const p = window.location.pathname;
  if (p.startsWith('/admin/dev-studio')) return 'dev_studio';
  if (p.startsWith('/admin')) return 'admin';
  if (p.startsWith('/backend')) return 'backend';
  if (p.startsWith('/partner')) return 'partner';
  if (p.startsWith('/staff')) return 'staff';
  if (p.startsWith('/merchant')) return 'merchant';
  if (p.startsWith('/technician')) return 'technician';
  if (p.startsWith('/apply')) return 'apply';
  return 'customer';
}

function resolveInitialTabFromUrl(): MobileUserTab {
  if (typeof window === 'undefined') return 'errands';
  const tab = new URLSearchParams(window.location.search).get('tab');
  if (tab === 'marketplace' || tab === 'workforce' || tab === 'sos' || tab === 'profile') {
    return tab;
  }
  return 'errands';
}

function isBackendWebMode(mode: AppMode): boolean {
  return mode === 'admin' || mode === 'dev_studio' || mode === 'backend';
}

const ViewFallback: React.FC = () => (
  <div className="space-y-4 py-4 animate-pulse">
    <div className="h-36 rounded-3xl bg-slate-200/80" />
    <div className="grid grid-cols-2 gap-3">
      <div className="h-28 rounded-3xl bg-slate-200/70" />
      <div className="h-28 rounded-3xl bg-slate-200/70" />
    </div>
  </div>
);

export default function App() {
  const [mode, setMode] = useState<AppMode>(resolveInitialModeFromUrl);
  const [mobileTab, setMobileTab] = useState<MobileUserTab>(resolveInitialTabFromUrl);
  const [lang, setLang] = useState<Language>('en');
  const [selectedDistrict, setSelectedDistrict] = useState<MizoramDistrict>('Aizawl');
  const [districtSheetOpen, setDistrictSheetOpen] = useState(false);
  const [settingsSheetOpen, setSettingsSheetOpen] = useState(false);
  const [userSettings, setUserSettings] = useState<UserAppSettings>(loadUserSettings);
  const [mapsApiKey, setMapsApiKey] = useState<string>(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  );
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [adminToken, setAdminToken] = useState<string | null>(null);

  const [remoteConfig, setRemoteConfig] = useState<AppRemoteConfig>(DEFAULT_CONFIG);
  const [effectiveVisibility, setEffectiveVisibility] = useState({
    errands: true,
    marketplace: true,
    workforce: true,
    managedStaffing: true,
    emergency24x7: true,
    sundayRestrictionActive: false,
  });
  const [partners, setPartners] = useState<PartnerProfile[]>([]);
  const [errands, setErrands] = useState<ErrandRequest[]>([]);
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [userMonthlyReturns, setUserMonthlyReturns] = useState<Record<string, number>>({});
  const [workforce, setWorkforce] = useState<WorkforceMember[]>([]);
  const [staffingBookings, setStaffingBookings] = useState<StaffingBooking[]>([]);
  const [staffLeaveRequests, setStaffLeaveRequests] = useState<StaffLeaveRequest[]>([]);
  const [staffAttendanceLogs, setStaffAttendanceLogs] = useState<StaffAttendanceLog[]>([]);
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
  const [sosTickets, setSosTickets] = useState<EmergencySosTicket[]>([]);

  const inFlightRef = useRef(false);
  const t = TRANSLATIONS[lang];
  const isBackendShell = isBackendWebMode(mode);

  useEffect(() => {
    setHapticsEnabled(userSettings.hapticsEnabled);
    applyUserSettingsToDom(userSettings);
    saveUserSettings(userSettings);
  }, [userSettings]);

  const handleUpdateUserSettings = useCallback((patch: Partial<UserAppSettings>) => {
    setUserSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleResetUserSettings = useCallback(() => {
    setUserSettings(DEFAULT_USER_SETTINGS);
  }, []);

  const applyBootstrap = useCallback((data: BootstrapSnapshot, isLiveNetwork = false) => {
    if (isLiveNetwork && typeof data.mapsApiKey === 'string') {
      setMapsApiKey(data.mapsApiKey.trim());
    }
    if (data.sdui?.config) {
      setRemoteConfig(data.sdui.config);
      setEffectiveVisibility(data.sdui.effectiveVisibility);
    }
    if (Array.isArray(data.partners)) setPartners(data.partners);
    if (Array.isArray(data.jobs)) setErrands(data.jobs);
    if (Array.isArray(data.products)) setProducts(data.products);
    if (Array.isArray(data.orders)) setOrders(data.orders);
    if (data.userMonthlyReturns) setUserMonthlyReturns(data.userMonthlyReturns);
    if (Array.isArray(data.workforce)) setWorkforce(data.workforce);
    if (Array.isArray(data.bookings)) setStaffingBookings(data.bookings);
    if (Array.isArray(data.leaveRequests)) setStaffLeaveRequests(data.leaveRequests);
    if (Array.isArray(data.attendanceLogs)) setStaffAttendanceLogs(data.attendanceLogs);
    if (Array.isArray(data.payrollRecords)) setPayrollRecords(data.payrollRecords);
    if (Array.isArray(data.tickets)) setSosTickets(data.tickets);
  }, []);

  // Single-roundtrip gzipped bootstrap replaces 7 parallel fetches
  const fetchAllState = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setSyncing(true);
    try {
      const res = await fetch('/api/bootstrap');
      if (res.ok) {
        const data = (await res.json()) as BootstrapSnapshot;
        applyBootstrap(data, true);
        // Never persist runtime API keys in IndexedDB so newly provisioned keys apply immediately
        const { mapsApiKey: _omitKey, ...cacheableSnapshot } = data;
        void _omitKey;
        void idbPut('zorun_bootstrap_v1', cacheableSnapshot);
      }
    } catch {
      const cached = await idbGet<BootstrapSnapshot>('zorun_bootstrap_v1');
      if (cached) applyBootstrap(cached, false);
    } finally {
      inFlightRef.current = false;
      setSyncing(false);
    }
  }, [applyBootstrap]);

  useEffect(() => {
    // 1. Instant zero-wait hydration from IndexedDB (<20ms perceived load)
    void idbGet<BootstrapSnapshot>('zorun_bootstrap_v1').then((cached) => {
      if (cached) applyBootstrap(cached, false);
    });

    // 2. Single gzipped network refresh
    void fetchAllState();

    // 3. Defer SSE slightly so initial paint & hero image get full bandwidth
    let sse: EventSource | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void fetchAllState();
      }, 300);
    };

    const sseInitTimer = setTimeout(() => {
      sse = new EventSource('/api/realtime/stream');
      sse.addEventListener('sdui_update', scheduleRefresh);
      sse.addEventListener('plugin_update', scheduleRefresh);
      sse.addEventListener('errand_update', scheduleRefresh);
      sse.addEventListener('marketplace_update', scheduleRefresh);
      sse.addEventListener('staffing_update', scheduleRefresh);
      sse.addEventListener('sos_alert', scheduleRefresh);
      sse.addEventListener('escrow_update', scheduleRefresh);
      sse.addEventListener('kyc_update', scheduleRefresh);
    }, 350);

    const onQuotaExceeded = () => setQuotaExceeded(true);
    const onPopState = () => {
      setMode(resolveInitialModeFromUrl());
      setMobileTab(resolveInitialTabFromUrl());
    };
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    window.addEventListener('popstate', onPopState);

    return () => {
      clearTimeout(sseInitTimer);
      if (debounceTimer) clearTimeout(debounceTimer);
      sse?.close();
      window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
      window.removeEventListener('popstate', onPopState);
    };
  }, [applyBootstrap, fetchAllState]);

  const navigateMode = (nextMode: AppMode, nextTab?: MobileUserTab) => {
    setMode(nextMode);
    if (nextTab) {
      setMobileTab(nextTab);
    }
    if (typeof window !== 'undefined') {
      const nextPath =
        nextMode === 'dev_studio'
          ? '/admin/dev-studio'
          : nextMode === 'admin'
            ? '/admin'
            : nextMode === 'backend'
              ? '/backend'
              : nextMode === 'partner'
                ? '/partner'
                : nextMode === 'staff'
                  ? '/staff'
                  : nextMode === 'merchant'
                    ? '/merchant'
                    : nextMode === 'technician'
                      ? '/technician'
                      : nextMode === 'apply'
                        ? '/apply'
                        : nextTab && nextTab !== 'errands'
                          ? `/?tab=${nextTab}`
                          : '/';
      window.history.pushState({}, '', nextPath);
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  };

  const selectCustomerTab = (tab: MobileUserTab) => {
    triggerHaptic(tab === 'sos' ? 'sos' : 'light');
    navigateMode('customer', tab);
  };

  const handleAdminLogout = useCallback(async () => {
    const token = adminToken;
    setAdminToken(null);
    if (token) {
      try {
        await fetch('/api/dev-studio/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // ignore network errors on sign out
      }
    }
  }, [adminToken]);

  const handleAdminAuthExpired = useCallback(() => {
    setAdminToken(null);
  }, []);

  // =========================================================================
  // SHELL 2: SERVER BACKEND WEB APP (/admin, /admin/dev-studio, /backend)
  // =========================================================================
  if (isBackendShell) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col overflow-x-hidden">
        {quotaExceeded && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
            <span>
              Google Maps Platform quota reached. If you are the app owner, visit{' '}
              <a
                href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold text-amber-950 hover:text-amber-800"
              >
                maps developer site
              </a>{' '}
              for instructions to update your account.
            </span>
          </div>
        )}

        <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950 text-white">
          <div className="mx-auto max-w-7xl flex items-center justify-between gap-8 px-4 sm:px-6 h-14">
            <a
              href="/admin"
              onClick={(e) => {
                e.preventDefault();
                navigateMode('admin');
              }}
              className="text-lg font-extrabold tracking-tight text-white whitespace-nowrap shrink-0 font-display"
            >
              {t.backendBrand}
            </a>

            <nav aria-label="Backend web navigation" className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
              <button
                type="button"
                onClick={() => navigateMode('admin')}
                className={`whitespace-nowrap shrink-0 transition-colors hover:text-white pb-0.5 ${
                  mode === 'admin' ? 'text-emerald-400 font-semibold border-b-2 border-emerald-400' : ''
                }`}
              >
                {t.navAdmin}
              </button>
              <button
                type="button"
                onClick={() => navigateMode('dev_studio')}
                className={`whitespace-nowrap shrink-0 transition-colors hover:text-white pb-0.5 ${
                  mode === 'dev_studio' ? 'text-emerald-400 font-semibold border-b-2 border-emerald-400' : ''
                }`}
              >
                {t.navDevStudio}
              </button>
              <button
                type="button"
                onClick={() => navigateMode('backend')}
                className={`whitespace-nowrap shrink-0 transition-colors hover:text-white pb-0.5 ${
                  mode === 'backend' ? 'text-emerald-400 font-semibold border-b-2 border-emerald-400' : ''
                }`}
              >
                {t.navBackendApi}
              </button>
              <button
                type="button"
                onClick={() => navigateMode('customer', 'errands')}
                className="whitespace-nowrap shrink-0 transition-colors hover:text-white pb-0.5"
              >
                {t.navMobileApp}
              </button>
            </nav>

            <div className="flex items-center gap-2 shrink-0">
              {adminToken && (
                <button
                  type="button"
                  onClick={() => void handleAdminLogout()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5 text-slate-400" />
                  {lang === 'miz' ? 'Chhuak' : 'Lock'}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('sync');
                  void fetchAllState();
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                Sync Live
              </button>
            </div>
          </div>
        </header>

        <div className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-slate-600">
              <span className="font-semibold text-slate-900">Server Web App</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{remoteConfig.region}</span>
              <span aria-hidden="true">·</span>
              <select
                aria-label="District Capital"
                value={selectedDistrict}
                onChange={(e) => setSelectedDistrict(e.target.value as MizoramDistrict)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-emerald-900 focus:border-emerald-700 focus:outline-none"
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
              onClick={() => setLang((prev) => (prev === 'en' ? 'miz' : 'en'))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
            >
              <Globe className="w-3.5 h-3.5 text-emerald-700" />
              {lang === 'en' ? 'MIZ' : 'EN'}
            </button>
          </div>
        </div>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 py-6">
          <Suspense fallback={<ViewFallback />}>
            {!adminToken ? (
              <SuperAdminAuthGate
                lang={lang}
                onAuthenticated={(token) => setAdminToken(token)}
                onBackToMobile={() => navigateMode('customer', 'errands')}
              />
            ) : (
              <>
                {mode === 'admin' && (
                  <AdminDashboard
                    lang={lang}
                    adminToken={adminToken}
                    onAuthExpired={handleAdminAuthExpired}
                    selectedDistrict={selectedDistrict}
                    mapsApiKey={mapsApiKey}
                    remoteConfig={remoteConfig}
                    partners={partners}
                    errands={errands}
                    sosTickets={sosTickets}
                    workforce={workforce}
                    staffingBookings={staffingBookings}
                    leaveRequests={staffLeaveRequests}
                    attendanceLogs={staffAttendanceLogs}
                    payrollRecords={payrollRecords}
                    onRefresh={fetchAllState}
                    onOpenDevStudio={() => navigateMode('dev_studio')}
                  />
                )}

                {mode === 'dev_studio' && (
                  <DevStudioView
                    adminToken={adminToken}
                    onAuthExpired={handleAdminAuthExpired}
                    onLiveUpdated={fetchAllState}
                  />
                )}

                {mode === 'backend' && (
                  <BackendConsoleView
                    lang={lang}
                    adminToken={adminToken}
                    onAuthExpired={handleAdminAuthExpired}
                    onOpenMobileApp={() => navigateMode('customer', 'errands')}
                    onOpenOperations={() => navigateMode('admin')}
                    onOpenDevStudio={() => navigateMode('dev_studio')}
                  />
                )}
              </>
            )}
          </Suspense>
        </main>

        <nav
          aria-label="Backend mobile navigation"
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800 bg-slate-950 text-slate-300 grid grid-cols-4 h-16 pb-safe"
        >
          <button
            type="button"
            onClick={() => navigateMode('admin')}
            className={`flex flex-col items-center justify-center text-[10px] font-medium ${
              mode === 'admin' ? 'text-emerald-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Shield className="w-5 h-5 mb-0.5" />
            {t.navAdmin}
          </button>
          <button
            type="button"
            onClick={() => navigateMode('dev_studio')}
            className={`flex flex-col items-center justify-center text-[10px] font-medium ${
              mode === 'dev_studio' ? 'text-emerald-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Terminal className="w-5 h-5 mb-0.5" />
            {t.navDevStudio}
          </button>
          <button
            type="button"
            onClick={() => navigateMode('backend')}
            className={`flex flex-col items-center justify-center text-[10px] font-medium ${
              mode === 'backend' ? 'text-emerald-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Server className="w-5 h-5 mb-0.5" />
            API
          </button>
          <button
            type="button"
            onClick={() => navigateMode('customer', 'errands')}
            className="flex flex-col items-center justify-center text-[10px] font-medium text-slate-300"
          >
            <Smartphone className="w-5 h-5 mb-0.5" />
            User App
          </button>
        </nav>

        <OfflineIndicator lang={lang} />
      </div>
    );
  }

  // =========================================================================
  // SHELL 1: USER & PROVIDER PORTALS (/, /partner, /staff, /merchant, /technician, /apply)
  // =========================================================================
  const activeUserRole: 'customer' | 'partner' | 'staff' | 'merchant' | 'technician' | 'apply' =
    mode === 'partner'
      ? 'partner'
      : mode === 'staff'
        ? 'staff'
        : mode === 'merchant'
          ? 'merchant'
          : mode === 'technician'
            ? 'technician'
            : mode === 'apply'
              ? 'apply'
              : 'customer';

  return (
    <div className="min-h-dvh bg-[#f4f6f5] text-slate-900 flex flex-col overflow-x-hidden">
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Single Lightweight Mobile App Top Bar (fast GPU-friendly solid translucent bg) */}
      <header className="sticky top-0 z-40 bg-white/96 border-b border-slate-200/70 pt-safe">
        <div className="mx-auto max-w-6xl flex items-center justify-between gap-4 px-4 sm:px-6 h-14">
          <div className="flex items-center gap-3 min-w-0">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                navigateMode('customer', 'errands');
              }}
              className="text-xl font-extrabold tracking-tight text-emerald-900 whitespace-nowrap shrink-0 font-display"
            >
              {t.brand}
            </a>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setDistrictSheetOpen(true);
              }}
              aria-label="Choose Mizoram District"
              className="inline-flex items-center gap-1 min-h-[36px] rounded-xl bg-slate-100 hover:bg-slate-200/80 active:scale-[0.98] px-2.5 py-1 text-xs font-semibold text-slate-800 transition-transform truncate max-w-[140px] sm:max-w-none"
            >
              <MapPin className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <span className="truncate">{selectedDistrict}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            </button>
          </div>

          <nav aria-label="User app navigation" className="hidden md:flex items-center gap-5 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => navigateMode('customer', 'errands')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 pb-0.5 ${
                mode === 'customer' && mobileTab !== 'profile'
                  ? 'text-emerald-800 font-semibold border-b-2 border-emerald-700'
                  : ''
              }`}
            >
              Home
            </button>
            <button
              type="button"
              onClick={() => navigateMode('partner')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 pb-0.5 ${
                mode === 'partner' ? 'text-emerald-800 font-semibold border-b-2 border-emerald-700' : ''
              }`}
            >
              {t.navPartner}
            </button>
            <button
              type="button"
              onClick={() => navigateMode('staff')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 pb-0.5 ${
                mode === 'staff' ? 'text-emerald-800 font-semibold border-b-2 border-emerald-700' : ''
              }`}
            >
              {t.navStaff}
            </button>
            <button
              type="button"
              onClick={() => navigateMode('merchant')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 pb-0.5 ${
                mode === 'merchant' ? 'text-emerald-800 font-semibold border-b-2 border-emerald-700' : ''
              }`}
            >
              {t.navMerchant}
            </button>
            <button
              type="button"
              onClick={() => navigateMode('customer', 'profile')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 pb-0.5 ${
                (mode === 'customer' && mobileTab === 'profile') ||
                mode === 'technician' ||
                mode === 'apply'
                  ? 'text-emerald-800 font-semibold border-b-2 border-emerald-700'
                  : ''
              }`}
            >
              {lang === 'miz' ? 'Portals' : 'All Portals'}
            </button>
            <button
              type="button"
              onClick={() => navigateMode('admin')}
              className="whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 pb-0.5"
            >
              {t.openBackendWebLabel}
            </button>
          </nav>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setLang((prev) => (prev === 'en' ? 'miz' : 'en'));
              }}
              aria-label="Toggle language between Mizo and English"
              className="inline-flex items-center justify-center min-h-[40px] min-w-[40px] rounded-xl bg-slate-100 hover:bg-slate-200/80 active:scale-[0.97] px-2.5 text-xs font-bold text-slate-800 transition-transform whitespace-nowrap"
            >
              {lang === 'en' ? 'MIZ' : 'EN'}
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setSettingsSheetOpen(true);
              }}
              aria-label={lang === 'miz' ? 'App Settings hawng rawh' : 'Open App Settings'}
              className="inline-flex items-center justify-center min-h-[40px] min-w-[40px] rounded-xl bg-slate-100 hover:bg-slate-200/80 active:scale-[0.97] text-slate-700 transition-transform"
            >
              <Settings className="w-[18px] h-[18px]" />
            </button>
            <PWAInstallButton lang={lang} />
          </div>
        </div>
      </header>

      {remoteConfig.sundayEmergencyMode && (
        <div className="bg-amber-100 border-b border-amber-200 px-4 py-2 text-center text-xs font-medium text-amber-950">
          {t.sundayBanner}
        </div>
      )}

      {(mode === 'partner' ||
        mode === 'staff' ||
        mode === 'merchant' ||
        mode === 'technician' ||
        mode === 'apply') && (
        <div className="bg-emerald-950 text-white">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-2.5 flex items-center justify-between gap-2 text-xs">
            <button
              type="button"
              onClick={() => navigateMode('customer', 'errands')}
              className="inline-flex items-center gap-1.5 font-semibold text-emerald-100 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4" />
              {t.backToCustomerLabel}
            </button>
            <span className="font-semibold text-emerald-300">
              {mode === 'partner'
                ? t.navPartner
                : mode === 'staff'
                  ? t.navStaff
                  : mode === 'merchant'
                    ? t.navMerchant
                    : mode === 'technician'
                      ? t.navTechnician
                      : t.navApply}
            </span>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6 pt-4 pb-6">
        {mode === 'customer' && mobileTab !== 'profile' && (
          <CustomerView
            lang={lang}
            selectedDistrict={selectedDistrict}
            onChangeDistrict={setSelectedDistrict}
            onOpenDistrictPicker={() => setDistrictSheetOpen(true)}
            activeTab={mobileTab}
            onChangeTab={(next) => selectCustomerTab(next)}
            mapsApiKey={mapsApiKey}
            remoteConfig={remoteConfig}
            effectiveVisibility={effectiveVisibility}
            partners={partners}
            errands={errands}
            products={products}
            orders={orders}
            userMonthlyReturns={userMonthlyReturns}
            workforce={workforce}
            staffingBookings={staffingBookings}
            sosTickets={sosTickets}
            userSettings={userSettings}
            onOpenSettings={() => setSettingsSheetOpen(true)}
            onOpenApply={() => navigateMode('apply')}
            onOpenStaffPortal={() => navigateMode('staff')}
            onRefresh={fetchAllState}
          />
        )}

        <Suspense fallback={<ViewFallback />}>
          {mode === 'customer' && mobileTab === 'profile' && (
            <MobileProfileView
              lang={lang}
              onToggleLang={() => setLang((prev) => (prev === 'en' ? 'miz' : 'en'))}
              selectedDistrict={selectedDistrict}
              onChangeDistrict={setSelectedDistrict}
              activeUserMode={activeUserRole}
              onSelectMode={(next) => {
                if (next === 'customer') {
                  navigateMode('customer', 'errands');
                } else {
                  navigateMode(next);
                }
              }}
              remoteConfig={remoteConfig}
              userSettings={userSettings}
              onOpenSettings={() => setSettingsSheetOpen(true)}
            />
          )}

          {mode === 'partner' && (
            <PartnerView
              lang={lang}
              selectedDistrict={selectedDistrict}
              remoteConfig={remoteConfig}
              partners={partners}
              onRefresh={fetchAllState}
            />
          )}

          {mode === 'staff' && (
            <StaffPortalView
              lang={lang}
              selectedDistrict={selectedDistrict}
              workforce={workforce}
              staffingBookings={staffingBookings}
              leaveRequests={staffLeaveRequests}
              attendanceLogs={staffAttendanceLogs}
              payrollRecords={payrollRecords}
              onRefresh={fetchAllState}
              onOpenApply={() => navigateMode('apply')}
            />
          )}

          {mode === 'merchant' && (
            <MerchantView
              lang={lang}
              selectedDistrict={selectedDistrict}
              products={products}
              orders={orders}
              onRefresh={fetchAllState}
            />
          )}

          {mode === 'technician' && (
            <TechnicianPortalView
              lang={lang}
              selectedDistrict={selectedDistrict}
              sosTickets={sosTickets}
              onRefresh={fetchAllState}
            />
          )}

          {mode === 'apply' && (
            <OnboardingApplyView
              lang={lang}
              selectedDistrict={selectedDistrict}
              onSubmitted={fetchAllState}
              onBackHome={() => navigateMode('customer', 'errands')}
            />
          )}
        </Suspense>
      </main>

      <LayerWindow
        open={districtSheetOpen}
        onClose={() => setDistrictSheetOpen(false)}
        title={lang === 'miz' ? 'District Khawpui Thlang Rawh' : 'Choose Your District'}
        subtitle={lang === 'miz' ? 'Mizoram District 11 zawng zawng' : 'All 11 Mizoram District Capitals'}
        size="sm"
      >
        <div className="grid grid-cols-1 gap-1.5">
          {ALL_MIZORAM_DISTRICT_NAMES.map((d) => {
            const info = getDistrictInfo(d);
            const active = d === selectedDistrict;
            return (
              <button
                key={d}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setSelectedDistrict(d);
                  setDistrictSheetOpen(false);
                }}
                className={`w-full min-h-[54px] px-4 py-3 rounded-2xl flex items-center justify-between text-left transition-colors ${
                  active
                    ? 'bg-emerald-900 text-white shadow-sm'
                    : 'bg-slate-50 text-slate-900 hover:bg-slate-100'
                }`}
              >
                <div>
                  <p className="text-sm font-bold">{d}</p>
                  <p className={`text-xs ${active ? 'text-emerald-200' : 'text-slate-500'}`}>
                    {info.rtoCode} · {info.vengs.length} Vengs · {info.elevationM}m
                  </p>
                </div>
                {active && <span className="text-xs font-semibold text-emerald-200">Selected</span>}
              </button>
            );
          })}
        </div>
      </LayerWindow>

      <AppSettingsWindow
        open={settingsSheetOpen}
        onClose={() => setSettingsSheetOpen(false)}
        lang={lang}
        onChangeLang={setLang}
        selectedDistrict={selectedDistrict}
        onChangeDistrict={setSelectedDistrict}
        settings={userSettings}
        onUpdateSettings={handleUpdateUserSettings}
        onResetSettings={handleResetUserSettings}
        onClearOfflineCache={async () => {
          await idbClear();
          await fetchAllState();
        }}
      />

      {/* Fast GPU-composited Mobile Bottom Tab Bar */}
      <nav
        aria-label="Mobile standalone app navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200/80 bg-white shadow-[0_-4px_20px_rgba(15,23,42,0.06)] grid grid-cols-5 h-16 pb-safe"
      >
        <button
          type="button"
          onClick={() => selectCustomerTab('errands')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[10px] active:scale-95 transition-transform ${
            mode === 'customer' && mobileTab === 'errands'
              ? 'text-emerald-800 font-bold'
              : 'text-slate-500 font-medium'
          }`}
        >
          <Home className="w-[21px] h-[21px]" strokeWidth={mode === 'customer' && mobileTab === 'errands' ? 2.4 : 1.9} />
          <span>Home</span>
        </button>

        <button
          type="button"
          onClick={() => selectCustomerTab('marketplace')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[10px] active:scale-95 transition-transform ${
            mode === 'customer' && mobileTab === 'marketplace'
              ? 'text-emerald-800 font-bold'
              : 'text-slate-500 font-medium'
          }`}
        >
          <ShoppingBag className="w-[21px] h-[21px]" strokeWidth={mode === 'customer' && mobileTab === 'marketplace' ? 2.4 : 1.9} />
          <span>{t.mobileTabMarket}</span>
        </button>

        <button
          type="button"
          onClick={() => selectCustomerTab('workforce')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[10px] active:scale-95 transition-transform ${
            mode === 'customer' && mobileTab === 'workforce'
              ? 'text-emerald-800 font-bold'
              : 'text-slate-500 font-medium'
          }`}
        >
          <Users className="w-[21px] h-[21px]" strokeWidth={mode === 'customer' && mobileTab === 'workforce' ? 2.4 : 1.9} />
          <span>{t.mobileTabStaff}</span>
        </button>

        <button
          type="button"
          onClick={() => selectCustomerTab('sos')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[10px] active:scale-95 transition-transform ${
            mode === 'customer' && mobileTab === 'sos'
              ? 'text-red-600 font-bold'
              : 'text-red-600/80 font-semibold'
          }`}
        >
          <AlertTriangle className="w-[21px] h-[21px]" strokeWidth={mode === 'customer' && mobileTab === 'sos' ? 2.4 : 2} />
          <span>{t.mobileTabSos}</span>
        </button>

        <button
          type="button"
          onClick={() => selectCustomerTab('profile')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[10px] active:scale-95 transition-transform ${
            (mode === 'customer' && mobileTab === 'profile') ||
            mode === 'partner' ||
            mode === 'staff' ||
            mode === 'merchant' ||
            mode === 'technician' ||
            mode === 'apply'
              ? 'text-emerald-800 font-bold'
              : 'text-slate-500 font-medium'
          }`}
        >
          <UserCircle2
            className="w-[21px] h-[21px]"
            strokeWidth={
              (mode === 'customer' && mobileTab === 'profile') ||
              mode === 'partner' ||
              mode === 'staff' ||
              mode === 'merchant' ||
              mode === 'technician' ||
              mode === 'apply'
                ? 2.4
                : 1.9
            }
          />
          <span>{lang === 'miz' ? 'Kei' : 'Me'}</span>
        </button>
      </nav>

      <OfflineIndicator lang={lang} />
    </div>
  );
}

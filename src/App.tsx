import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Globe,
  Shield,
  Store,
  Terminal,
  Truck,
  User,
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
  StaffingBooking,
  WorkforceMember,
} from './shared/types';
import { TRANSLATIONS } from './i18n/translations';
import { ALL_MIZORAM_DISTRICT_NAMES, getDistrictInfo } from './data/mizoramDistricts';
import { idbGet, idbPut } from './lib/offlineCache';
import { OfflineIndicator, PWAInstallButton } from './lib/pwa';
import { CustomerView, type CustomerTab } from './components/CustomerView';
import { PartnerView } from './components/PartnerView';
import { MerchantView } from './components/MerchantView';
import { AdminDashboard } from './components/AdminDashboard';
import { DevStudioView } from './components/DevStudioView';

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

function resolveInitialModeFromUrl(): AppMode {
  if (typeof window === 'undefined') return 'customer';
  const p = window.location.pathname;
  if (p.startsWith('/admin/dev-studio')) return 'dev_studio';
  if (p.startsWith('/admin')) return 'admin';
  return 'customer';
}

export default function App() {
  const [mode, setMode] = useState<AppMode>(resolveInitialModeFromUrl);
  const [customerTab, setCustomerTab] = useState<CustomerTab>('errands');
  const [lang, setLang] = useState<Language>('en');
  const [selectedDistrict, setSelectedDistrict] = useState<MizoramDistrict>('Aizawl');
  const [mapsApiKey, setMapsApiKey] = useState<string>(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  );
  const [quotaExceeded, setQuotaExceeded] = useState(false);

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
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
  const [sosTickets, setSosTickets] = useState<EmergencySosTicket[]>([]);

  const t = TRANSLATIONS[lang];

  const fetchAllState = useCallback(async () => {
    try {
      const [sduiRes, partnersRes, jobsRes, mktRes, staffRes, sosRes] = await Promise.all([
        fetch('/api/sdui/config'),
        fetch('/api/errands/partners'),
        fetch('/api/errands/jobs'),
        fetch('/api/marketplace/products'),
        fetch('/api/staffing/directory'),
        fetch('/api/emergency/tickets'),
      ]);

      if (sduiRes.ok) {
        const sdui = await sduiRes.json();
        setRemoteConfig(sdui.config);
        setEffectiveVisibility(sdui.effectiveVisibility);
        void idbPut('sdui_config', sdui);
      }
      if (partnersRes.ok) {
        const p = await partnersRes.json();
        setPartners(p.partners || []);
      }
      if (jobsRes.ok) {
        const j = await jobsRes.json();
        setErrands(j.jobs || []);
      }
      if (mktRes.ok) {
        const m = await mktRes.json();
        setProducts(m.products || []);
        setOrders(m.orders || []);
        setUserMonthlyReturns(m.userMonthlyReturns || {});
      }
      if (staffRes.ok) {
        const s = await staffRes.json();
        setWorkforce(s.workforce || []);
        setStaffingBookings(s.bookings || []);
        setPayrollRecords(s.payrollRecords || []);
      }
      if (sosRes.ok) {
        const sos = await sosRes.json();
        setSosTickets(sos.tickets || []);
      }
    } catch {
      const cached = await idbGet<{
        config: AppRemoteConfig;
        effectiveVisibility: typeof effectiveVisibility;
      }>('sdui_config');
      if (cached) {
        setRemoteConfig(cached.config);
        setEffectiveVisibility(cached.effectiveVisibility);
      }
    }
  }, []);

  useEffect(() => {
    // Hydrate from IndexedDB immediately for <1.2s perceived boot, then refresh live
    void idbGet<{
      config: AppRemoteConfig;
      effectiveVisibility: typeof effectiveVisibility;
    }>('sdui_config').then((cached) => {
      if (cached) {
        setRemoteConfig(cached.config);
        setEffectiveVisibility(cached.effectiveVisibility);
      }
    });

    fetch('/api/config/public')
      .then((r) => r.json())
      .then((d) => {
        if (d.mapsApiKey && !mapsApiKey) {
          setMapsApiKey(d.mapsApiKey);
        }
      })
      .catch(() => {});

    void fetchAllState();

    // Realtime SSE connection for instant zero-install SDUI & Dispatch updates
    const sse = new EventSource('/api/realtime/stream');
    const refreshListener = () => {
      void fetchAllState();
    };
    sse.addEventListener('sdui_update', refreshListener);
    sse.addEventListener('plugin_update', refreshListener);
    sse.addEventListener('errand_update', refreshListener);
    sse.addEventListener('marketplace_update', refreshListener);
    sse.addEventListener('staffing_update', refreshListener);
    sse.addEventListener('sos_alert', refreshListener);
    sse.addEventListener('escrow_update', refreshListener);
    sse.addEventListener('kyc_update', refreshListener);

    const onQuotaExceeded = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);

    return () => {
      sse.close();
      window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
    };
  }, [fetchAllState, mapsApiKey]);

  const navigateMode = (nextMode: AppMode) => {
    setMode(nextMode);
    if (typeof window !== 'undefined') {
      const nextPath =
        nextMode === 'dev_studio'
          ? '/admin/dev-studio'
          : nextMode === 'admin'
            ? '/admin'
            : '/';
      window.history.replaceState({}, '', nextPath);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col overflow-x-hidden">
      {/* Case A Google Maps Quota Warning Banner */}
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2 text-xs md:text-sm text-center sticky top-0 z-50">
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

      {/* Top Bar Contract: Zone 1 (Wordmark) — Zone 2 (4–5 concise single-line links) — Zone 3 (1 primary CTA) */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto max-w-7xl flex items-center justify-between gap-4 sm:gap-8 px-4 sm:px-6 h-14">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigateMode('customer');
            }}
            className="text-xl font-extrabold tracking-tight text-teal-800 whitespace-nowrap shrink-0 font-display"
          >
            {t.brand}
          </a>

          <nav aria-label="Role switcher" className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => navigateMode('customer')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 pb-0.5 ${
                mode === 'customer' ? 'text-teal-800 font-semibold border-b-2 border-teal-700' : ''
              }`}
            >
              {t.navCustomer}
            </button>
            <button
              type="button"
              onClick={() => navigateMode('partner')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 pb-0.5 ${
                mode === 'partner' ? 'text-teal-800 font-semibold border-b-2 border-teal-700' : ''
              }`}
            >
              {t.navPartner}
            </button>
            <button
              type="button"
              onClick={() => navigateMode('merchant')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 pb-0.5 ${
                mode === 'merchant' ? 'text-teal-800 font-semibold border-b-2 border-teal-700' : ''
              }`}
            >
              {t.navMerchant}
            </button>
            <button
              type="button"
              onClick={() => navigateMode('admin')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 pb-0.5 ${
                mode === 'admin' ? 'text-teal-800 font-semibold border-b-2 border-teal-700' : ''
              }`}
            >
              {t.navAdmin}
            </button>
            <button
              type="button"
              onClick={() => navigateMode('dev_studio')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 pb-0.5 ${
                mode === 'dev_studio' ? 'text-teal-800 font-semibold border-b-2 border-teal-700' : ''
              }`}
            >
              {t.navDevStudio}
            </button>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => {
                navigateMode('customer');
                setCustomerTab('sos');
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-red-700 transition-colors whitespace-nowrap shrink-0"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              {t.sosCta}
            </button>
          </div>
        </div>
      </header>

      {/* Workspace Utility Strip (District Capital, Language, PWA Install) */}
      <div className="border-b border-slate-200 bg-slate-100/70">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-1.5 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-600 truncate min-w-0">
            <span className="font-medium text-slate-800 truncate hidden md:inline">
              {remoteConfig.appName} · {remoteConfig.region}
            </span>
            <span className="hidden lg:inline" aria-hidden="true">·</span>
            <span className="hidden lg:inline">Base Walker Rs. {remoteConfig.baseWalkerRate}</span>
            <span className="hidden lg:inline" aria-hidden="true">·</span>
            <span className="hidden lg:inline">Rain Surge {remoteConfig.rainSurgeMultiplier}x</span>
            <label htmlFor="district-capital-select" className="sr-only">
              {t.districtLabel}
            </label>
            <select
              id="district-capital-select"
              aria-label="District Capital"
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value as MizoramDistrict)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-teal-900 max-w-[140px] sm:max-w-none truncate focus:border-teal-700 focus:outline-none"
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

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setLang((prev) => (prev === 'en' ? 'miz' : 'en'))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
            >
              <Globe className="w-3.5 h-3.5 text-teal-700" />
              <span className="sm:hidden">{lang === 'en' ? 'MIZ' : 'EN'}</span>
              <span className="hidden sm:inline">
                {lang === 'en' ? 'Switch to Mizo (MIZ)' : 'Switch to English (EN)'}
              </span>
            </button>
            <PWAInstallButton />
          </div>
        </div>
      </div>

      {/* Live Sunday Emergency Mode Notice */}
      {remoteConfig.sundayEmergencyMode && (
        <div className="bg-amber-100 border-b border-amber-300 px-4 py-2.5 text-center text-xs font-medium text-amber-950">
          {t.sundayBanner}
        </div>
      )}

      {/* Main Content Container */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 py-6">
        {mode === 'customer' && (
          <CustomerView
            lang={lang}
            selectedDistrict={selectedDistrict}
            onChangeDistrict={setSelectedDistrict}
            activeTab={customerTab}
            onChangeTab={setCustomerTab}
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
            onRefresh={fetchAllState}
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

        {mode === 'merchant' && (
          <MerchantView
            lang={lang}
            selectedDistrict={selectedDistrict}
            products={products}
            orders={orders}
            onRefresh={fetchAllState}
          />
        )}

        {mode === 'admin' && (
          <AdminDashboard
            lang={lang}
            selectedDistrict={selectedDistrict}
            mapsApiKey={mapsApiKey}
            remoteConfig={remoteConfig}
            partners={partners}
            errands={errands}
            sosTickets={sosTickets}
            staffingBookings={staffingBookings}
            payrollRecords={payrollRecords}
            onRefresh={fetchAllState}
            onOpenDevStudio={() => navigateMode('dev_studio')}
          />
        )}

        {mode === 'dev_studio' && <DevStudioView onLiveUpdated={fetchAllState} />}
      </main>

      {/* Mobile Bottom Navigation Bar (15% Sticky Cap respected: 56px top + 58px bottom = 114px < 126px on 844px) */}
      <nav
        aria-label="Mobile role navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md grid grid-cols-5 h-14 pb-safe"
      >
        <button
          type="button"
          onClick={() => navigateMode('customer')}
          className={`flex flex-col items-center justify-center text-[10px] font-medium ${
            mode === 'customer' ? 'text-teal-800 font-bold' : 'text-slate-600'
          }`}
        >
          <User className="w-4 h-4 mb-0.5" />
          Customer
        </button>
        <button
          type="button"
          onClick={() => navigateMode('partner')}
          className={`flex flex-col items-center justify-center text-[10px] font-medium ${
            mode === 'partner' ? 'text-teal-800 font-bold' : 'text-slate-600'
          }`}
        >
          <Truck className="w-4 h-4 mb-0.5" />
          Partner
        </button>
        <button
          type="button"
          onClick={() => navigateMode('merchant')}
          className={`flex flex-col items-center justify-center text-[10px] font-medium ${
            mode === 'merchant' ? 'text-teal-800 font-bold' : 'text-slate-600'
          }`}
        >
          <Store className="w-4 h-4 mb-0.5" />
          Merchant
        </button>
        <button
          type="button"
          onClick={() => navigateMode('admin')}
          className={`flex flex-col items-center justify-center text-[10px] font-medium ${
            mode === 'admin' ? 'text-teal-800 font-bold' : 'text-slate-600'
          }`}
        >
          <Shield className="w-4 h-4 mb-0.5" />
          Admin
        </button>
        <button
          type="button"
          onClick={() => navigateMode('dev_studio')}
          className={`flex flex-col items-center justify-center text-[10px] font-medium ${
            mode === 'dev_studio' ? 'text-teal-800 font-bold' : 'text-slate-600'
          }`}
        >
          <Terminal className="w-4 h-4 mb-0.5" />
          Studio
        </button>
      </nav>

      <OfflineIndicator />
    </div>
  );
}

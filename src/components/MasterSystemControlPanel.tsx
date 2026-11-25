import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  KeyRound,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  Sliders,
  Store,
  Trash2,
  Truck,
  Users,
  Video,
  Wallet,
} from 'lucide-react';
import type {
  AppRemoteConfig,
  CustomerWalletState,
  ErrandRequest,
  MarketplaceOrder,
  MarketplaceProduct,
  MizoramDistrict,
  PartnerCategory,
  PartnerProfile,
  SumoParcelBooking,
  SystemIntegrationConfig,
} from '../shared/types';
import { ALL_MIZORAM_DISTRICT_NAMES, getDistrictInfo } from '../data/mizoramDistricts';

type ControlSection =
  | 'sdui_rates'
  | 'partners_techs'
  | 'errands_sumo'
  | 'marketplace'
  | 'wallet_blacklist'
  | 'integrations_kyc_video'
  | 'security';

interface MasterSystemControlPanelProps {
  adminToken: string;
  onAuthExpired: () => void;
  onLiveUpdated: () => Promise<void>;
}

interface PendingConfirmAction {
  title: string;
  warningDetail: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
}

export const MasterSystemControlPanel: React.FC<MasterSystemControlPanelProps> = ({
  adminToken,
  onAuthExpired,
  onLiveUpdated,
}) => {
  const [section, setSection] = useState<ControlSection>('sdui_rates');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'warn' | 'err'; msg: string } | null>(null);
  const [confirmModal, setConfirmModal] = useState<PendingConfirmAction | null>(null);

  // Loaded Master State
  const [configDraft, setConfigDraft] = useState<AppRemoteConfig | null>(null);
  const [partners, setPartners] = useState<PartnerProfile[]>([]);
  const [errands, setErrands] = useState<ErrandRequest[]>([]);
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [marketplaceOrders, setMarketplaceOrders] = useState<MarketplaceOrder[]>([]);
  const [sumoParcels, setSumoParcels] = useState<SumoParcelBooking[]>([]);
  const [blacklistedCustomers, setBlacklistedCustomers] = useState<string[]>([]);
  const [userMonthlyReturns, setUserMonthlyReturns] = useState<Record<string, number>>({});
  const [walletDraft, setWalletDraft] = useState<CustomerWalletState | null>(null);
  const [integrationDraft, setIntegrationDraft] = useState<SystemIntegrationConfig | null>(null);

  // New Partner Form
  const [newPartnerName, setNewPartnerName] = useState('');
  const [newPartnerPhone, setNewPartnerPhone] = useState('+91 94361 ');
  const [newPartnerDistrict, setNewPartnerDistrict] = useState<MizoramDistrict>('Aizawl');
  const [newPartnerVeng, setNewPartnerVeng] = useState('Dawrpui');
  const [newPartnerCat, setNewPartnerCat] = useState<PartnerCategory>('walker');
  const [newPartnerIsTech, setNewPartnerIsTech] = useState(false);
  const [newPartnerShift, setNewPartnerShift] = useState<'Morning (06-14)' | 'Evening (14-22)' | 'Night (22-06)'>('Morning (06-14)');

  // Blacklist Input & Passcode Rotation
  const [newBlacklistTarget, setNewBlacklistTarget] = useState('');
  const [newPasscode, setNewPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');

  const authHeaders = useCallback(
    (withJson = false): Record<string, string> =>
      withJson
        ? { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }
        : { Authorization: `Bearer ${adminToken}` },
    [adminToken]
  );

  const loadMasterState = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dev-studio/master-state', {
        headers: authHeaders(),
      });
      if (res.status === 401) {
        onAuthExpired();
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      setConfigDraft(data.remoteConfig);
      setPartners(data.partners || []);
      setErrands(data.errands || []);
      setProducts(data.products || []);
      setMarketplaceOrders(data.marketplaceOrders || []);
      setSumoParcels(data.sumoParcels || []);
      setBlacklistedCustomers(data.blacklistedCustomers || []);
      setUserMonthlyReturns(data.userMonthlyReturns || {});
      setWalletDraft(data.customerWallet || null);
      setIntegrationDraft(data.integrationConfig || null);
    } catch {
      setFeedback({ type: 'err', msg: 'Could not load master system state.' });
    } finally {
      setLoading(false);
    }
  }, [authHeaders, onAuthExpired]);

  useEffect(() => {
    void loadMasterState();
  }, [loadMasterState]);

  const handleSaveMasterConfig = async () => {
    if (!configDraft) return;
    const res = await fetch('/api/dev-studio/config-direct', {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify(configDraft),
    });
    if (res.status === 401) {
      onAuthExpired();
      return;
    }
    if (res.ok) {
      setFeedback({
        type: 'ok',
        msg: 'Master SDUI Configuration & Pricing saved and broadcast live to all connected devices.',
      });
      await loadMasterState();
      await onLiveUpdated();
    } else {
      setFeedback({ type: 'err', msg: 'Failed to save master configuration.' });
    }
  };

  const handleCreatePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPartnerName.trim().length < 2) {
      setFeedback({ type: 'err', msg: 'Partner name is required (min 2 chars).' });
      return;
    }
    const res = await fetch('/api/dev-studio/partners', {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify({
        name: newPartnerName.trim(),
        phone: newPartnerPhone.trim(),
        district: newPartnerDistrict,
        veng: newPartnerVeng,
        category: newPartnerCat,
        isSalariedTechnician: newPartnerIsTech,
        shift: newPartnerIsTech ? newPartnerShift : undefined,
        online: true,
      }),
    });
    if (res.ok) {
      setNewPartnerName('');
      setFeedback({ type: 'ok', msg: `Added new partner/technician: ${newPartnerName}` });
      await loadMasterState();
      await onLiveUpdated();
    }
  };

  const handlePatchPartner = async (id: string, patch: Partial<PartnerProfile>, note?: string) => {
    const res = await fetch(`/api/dev-studio/partners/${id}`, {
      method: 'PATCH',
      headers: authHeaders(true),
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      setFeedback({ type: 'ok', msg: note || `Updated partner ${id}` });
      await loadMasterState();
      await onLiveUpdated();
    }
  };

  const handleDeletePartner = (partner: PartnerProfile) => {
    setConfirmModal({
      title: `Delete Partner "${partner.name}"?`,
      warningDetail: `WARNING: Removing ${partner.name} (${partner.category.toUpperCase()} · ${partner.district || 'Aizawl'}) permanently deletes their fleet profile, GPS cache, and ₹${partner.walletBalance} wallet record.`,
      confirmLabel: 'Permanently Delete Partner',
      onConfirm: async () => {
        await fetch(`/api/dev-studio/partners/${partner.id}`, {
          method: 'DELETE',
          headers: authHeaders(),
        });
        setFeedback({ type: 'warn', msg: `Deleted partner ${partner.name}` });
        await loadMasterState();
        await onLiveUpdated();
      },
    });
  };

  const handlePatchErrand = async (id: string, patch: Partial<ErrandRequest>) => {
    const res = await fetch(`/api/dev-studio/errands/${id}`, {
      method: 'PATCH',
      headers: authHeaders(true),
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      setFeedback({ type: 'ok', msg: `Updated errand ${id}` });
      await loadMasterState();
      await onLiveUpdated();
    }
  };

  const handleDeleteErrand = (job: ErrandRequest) => {
    setConfirmModal({
      title: `Delete Errand ${job.id}?`,
      warningDetail: `WARNING: Deleting "${job.title}" (${job.status}) removes this errand and all associated bids permanently.`,
      confirmLabel: 'Delete Errand',
      onConfirm: async () => {
        await fetch(`/api/dev-studio/errands/${job.id}`, {
          method: 'DELETE',
          headers: authHeaders(),
        });
        setFeedback({ type: 'warn', msg: `Deleted errand ${job.id}` });
        await loadMasterState();
        await onLiveUpdated();
      },
    });
  };

  const handlePatchSumo = async (id: string, patch: Partial<SumoParcelBooking>) => {
    const res = await fetch(`/api/dev-studio/sumo-parcels/${id}`, {
      method: 'PATCH',
      headers: authHeaders(true),
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      setFeedback({ type: 'ok', msg: `Updated Sumo parcel ${id}` });
      await loadMasterState();
      await onLiveUpdated();
    }
  };

  const handleDeleteSumo = (parcel: SumoParcelBooking) => {
    setConfirmModal({
      title: `Delete Sumo Booking ${parcel.trackingCode}?`,
      warningDetail: `WARNING: Permanently removes ${parcel.trackingCode} (${parcel.originDistrict} → ${parcel.destinationDistrict}, ₹${parcel.allInclusiveTotal}).`,
      confirmLabel: 'Delete Sumo Booking',
      onConfirm: async () => {
        await fetch(`/api/dev-studio/sumo-parcels/${parcel.id}`, {
          method: 'DELETE',
          headers: authHeaders(),
        });
        setFeedback({ type: 'warn', msg: `Deleted Sumo booking ${parcel.trackingCode}` });
        await loadMasterState();
        await onLiveUpdated();
      },
    });
  };

  const handlePatchProduct = async (id: string, patch: Partial<MarketplaceProduct>) => {
    const res = await fetch(`/api/marketplace/products/${id}`, {
      method: 'PATCH',
      headers: authHeaders(true),
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      setFeedback({ type: 'ok', msg: `Updated product ${id}` });
      await loadMasterState();
      await onLiveUpdated();
    }
  };

  const handleDeleteProduct = (product: MarketplaceProduct) => {
    setConfirmModal({
      title: `Delete Product "${product.titleEn}"?`,
      warningDetail: `WARNING: Removing "${product.titleEn}" (${product.shopName}) deletes it from the live marketplace catalog immediately.`,
      confirmLabel: 'Delete Product',
      onConfirm: async () => {
        await fetch(`/api/marketplace/products/${product.id}`, {
          method: 'DELETE',
          headers: authHeaders(),
        });
        setFeedback({ type: 'warn', msg: `Deleted product ${product.titleEn}` });
        await loadMasterState();
        await onLiveUpdated();
      },
    });
  };

  const handlePatchMarketplaceOrder = async (id: string, patch: Partial<MarketplaceOrder>) => {
    const res = await fetch(`/api/dev-studio/marketplace-orders/${id}`, {
      method: 'PATCH',
      headers: authHeaders(true),
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      setFeedback({ type: 'ok', msg: `Updated marketplace order ${id}` });
      await loadMasterState();
      await onLiveUpdated();
    }
  };

  const handleBlacklistAction = async (
    action: 'add' | 'remove' | 'clear_all' | 'reset_returns',
    target?: string
  ) => {
    const res = await fetch('/api/dev-studio/blacklist', {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify({ action, target }),
    });
    if (res.ok) {
      setNewBlacklistTarget('');
      setFeedback({ type: 'ok', msg: `Blacklist action (${action}) executed.` });
      await loadMasterState();
      await onLiveUpdated();
    }
  };

  const handleSaveCustomerWallet = async () => {
    if (!walletDraft) return;
    const res = await fetch('/api/dev-studio/customer-wallet', {
      method: 'PATCH',
      headers: authHeaders(true),
      body: JSON.stringify({
        balanceRs: walletDraft.balanceRs,
        loyaltyPoints: walletDraft.loyaltyPoints,
        plusPassActive: walletDraft.plusPassActive,
        referralCode: walletDraft.referralCode,
      }),
    });
    if (res.ok) {
      setFeedback({ type: 'ok', msg: 'Customer Wallet & Plus Pass state updated.' });
      await loadMasterState();
      await onLiveUpdated();
    }
  };

  const handleSaveIntegrationConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!integrationDraft) return;
    const res = await fetch('/api/dev-studio/integrations', {
      method: 'PUT',
      headers: authHeaders(true),
      body: JSON.stringify(integrationDraft),
    });
    if (res.status === 401) {
      onAuthExpired();
      return;
    }
    if (res.ok) {
      setFeedback({
        type: 'ok',
        msg: 'AI KYC Vision OCR Agent & Live Video Interview WebRTC configuration saved live!',
      });
      await loadMasterState();
      await onLiveUpdated();
    } else {
      setFeedback({ type: 'err', msg: 'Could not save integration configuration.' });
    }
  };

  const handleRotatePasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPasscode.trim().length < 6) {
      setFeedback({ type: 'err', msg: 'New Super Admin passcode must be at least 6 characters.' });
      return;
    }
    if (newPasscode.trim() !== confirmPasscode.trim()) {
      setFeedback({ type: 'err', msg: 'Passcodes do not match.' });
      return;
    }
    setConfirmModal({
      title: 'Rotate Super Admin 2FA Passcode?',
      warningDetail:
        'SECURITY WARNING: Rotating the Super Admin passcode immediately updates the required login credentials for /admin, /admin/dev-studio, and /backend.',
      confirmLabel: 'Confirm Passcode Rotation',
      onConfirm: async () => {
        const res = await fetch('/api/dev-studio/change-passcode', {
          method: 'POST',
          headers: authHeaders(true),
          body: JSON.stringify({ newPasscode: newPasscode.trim() }),
        });
        if (res.ok) {
          setNewPasscode('');
          setConfirmPasscode('');
          setFeedback({ type: 'ok', msg: 'Super Admin 2FA passcode rotated successfully.' });
        }
      },
    });
  };

  // Compute active warnings for SDUI config
  const configWarnings: string[] = [];
  if (configDraft) {
    if (configDraft.sundayEmergencyMode) {
      configWarnings.push(
        'SUNDAY EMERGENCY MODE ACTIVE: Non-essential retail marketplace and general workforce bookings are currently paused across all 11 Mizoram districts.'
      );
    }
    if (!configDraft.visibleServices.emergency24x7) {
      configWarnings.push(
        'CRITICAL SAFETY WARNING: 24×7 Emergency SOS service visibility is turned OFF! Customers will not see emergency SOS tabs.'
      );
    }
    const disabledServices = Object.entries(configDraft.visibleServices)
      .filter(([, enabled]) => !enabled)
      .map(([k]) => k);
    if (disabledServices.length > 0) {
      configWarnings.push(
        `HIDDEN SERVICES WARNING: [${disabledServices.join(', ')}] are currently disabled on Customer PWAs.`
      );
    }
    const combinedSurge = Number(
      (configDraft.rainSurgeMultiplier * configDraft.trafficSurgeMultiplier).toFixed(2)
    );
    if (combinedSurge > 1.5) {
      configWarnings.push(
        `HIGH SURGE WARNING: Combined Rain × Traffic surge is ${combinedSurge}x (>1.5x). Customer fares are elevated.`
      );
    }
    if (configDraft.returnDeliveryFee < 40 || configDraft.returnDeliveryFee > 50) {
      configWarnings.push(
        `RETURN FEE GUARD WARNING: Return delivery fee (₹${configDraft.returnDeliveryFee}) is outside the standard ₹40–₹50 En Hmasak Phawt merchant safeguard band.`
      );
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Sliders className="w-5 h-5 text-teal-700" />
            Master System Control &amp; Entity Override Center
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            100% Granular Control — Edit every rate, service flag, partner, 24×7 shift technician, errand, Sumo parcel, shop product, wallet, blacklist &amp; passcode with real-time impact warnings.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadMasterState()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Sync Master State
        </button>
      </div>

      {/* Section Navigation */}
      <div className="flex flex-wrap gap-1.5 rounded-xl bg-slate-100 p-1.5">
        {(
          [
            ['sdui_rates', '1. Rates, Surge & Services', Sliders],
            ['partners_techs', `2. Fleet & 24x7 Techs (${partners.length})`, Truck],
            ['errands_sumo', `3. Errands (${errands.length}) & Sumo (${sumoParcels.length})`, Users],
            ['marketplace', `4. Products (${products.length}) & Orders (${marketplaceOrders.length})`, Store],
            ['wallet_blacklist', `5. Wallet & Blacklist (${blacklistedCustomers.length})`, Wallet],
            ['integrations_kyc_video', '6. AI KYC & Live Video API Keys', Video],
            ['security', '7. Admin Security & Passcode', KeyRound],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSection(key)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
              section === key
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-700 hover:bg-white/80'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Global Feedback Banner */}
      {feedback && (
        <div
          role="status"
          className={`flex items-center justify-between gap-2 rounded-xl border px-4 py-3 text-xs font-semibold ${
            feedback.type === 'ok'
              ? 'border-teal-200 bg-teal-50 text-teal-900'
              : feedback.type === 'warn'
                ? 'border-amber-300 bg-amber-50 text-amber-950'
                : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          <span className="inline-flex items-center gap-2">
            {feedback.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            {feedback.msg}
          </span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="underline text-[11px]"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* SECTION 1: RATES, SURGE & SERVICE VISIBILITY */}
      {section === 'sdui_rates' && configDraft && (
        <div className="space-y-4">
          {configWarnings.length > 0 && (
            <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 space-y-1.5">
              <p className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                Active Configuration &amp; Operational Warnings ({configWarnings.length})
              </p>
              <ul className="list-disc pl-5 text-xs text-amber-900 space-y-1">
                {configWarnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">App Name</label>
              <input
                type="text"
                value={configDraft.appName}
                onChange={(e) => setConfigDraft({ ...configDraft, appName: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Cloud Region</label>
              <input
                type="text"
                value={configDraft.region}
                onChange={(e) => setConfigDraft({ ...configDraft, region: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Rain Surge Multiplier (1.0x – 3.0x)
              </label>
              <input
                type="number"
                step="0.05"
                min={1}
                max={3}
                value={configDraft.rainSurgeMultiplier}
                onChange={(e) =>
                  setConfigDraft({ ...configDraft, rainSurgeMultiplier: Number(e.target.value) || 1 })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Traffic Surge Multiplier (1.0x – 3.0x)
              </label>
              <input
                type="number"
                step="0.05"
                min={1}
                max={3}
                value={configDraft.trafficSurgeMultiplier}
                onChange={(e) =>
                  setConfigDraft({ ...configDraft, trafficSurgeMultiplier: Number(e.target.value) || 1 })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Cat A: Base Walker Rate (₹)
              </label>
              <input
                type="number"
                value={configDraft.baseWalkerRate}
                onChange={(e) =>
                  setConfigDraft({ ...configDraft, baseWalkerRate: Number(e.target.value) || 40 })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Cat B: Base 2-Wheeler Rate (₹)
              </label>
              <input
                type="number"
                value={configDraft.baseBikeRate}
                onChange={(e) =>
                  setConfigDraft({ ...configDraft, baseBikeRate: Number(e.target.value) || 50 })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Cat C: Base Auto/Taxi Rate (₹)
              </label>
              <input
                type="number"
                value={configDraft.baseAutoTaxiRate}
                onChange={(e) =>
                  setConfigDraft({ ...configDraft, baseAutoTaxiRate: Number(e.target.value) || 90 })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Cat D: Base Pickup Truck Rate (₹)
              </label>
              <input
                type="number"
                value={configDraft.basePickupRate}
                onChange={(e) =>
                  setConfigDraft({ ...configDraft, basePickupRate: Number(e.target.value) || 350 })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                En Hmasak Return Fee (₹)
              </label>
              <input
                type="number"
                value={configDraft.returnDeliveryFee}
                onChange={(e) =>
                  setConfigDraft({ ...configDraft, returnDeliveryFee: Number(e.target.value) || 45 })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Monthly Return Cap (Per User)
              </label>
              <input
                type="number"
                value={configDraft.monthlyReturnLimit}
                onChange={(e) =>
                  setConfigDraft({ ...configDraft, monthlyReturnLimit: Number(e.target.value) || 3 })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Partner COD Cash Limit (₹)
              </label>
              <input
                type="number"
                value={configDraft.codCashLimitRs}
                onChange={(e) =>
                  setConfigDraft({ ...configDraft, codCashLimitRs: Number(e.target.value) || 2500 })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Micro-Insurance Sachet (₹)
              </label>
              <input
                type="number"
                value={configDraft.microInsuranceSachetRs}
                onChange={(e) =>
                  setConfigDraft({ ...configDraft, microInsuranceSachetRs: Number(e.target.value) || 3 })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Live Banner Announcement (English)
              </label>
              <input
                type="text"
                value={configDraft.announcementEn}
                onChange={(e) => setConfigDraft({ ...configDraft, announcementEn: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Live Banner Announcement (Mizo)
              </label>
              <input
                type="text"
                value={configDraft.announcementMiz}
                onChange={(e) => setConfigDraft({ ...configDraft, announcementMiz: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
          </div>

          {/* Service Visibility & Sunday Mode Checkboxes */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
            <p className="text-xs font-bold text-slate-900">
              Global Service Visibility Flags &amp; Mizoram Sunday Emergency Mode
            </p>
            <div className="flex flex-wrap gap-4 text-xs">
              <label className="inline-flex items-center gap-2 font-semibold text-amber-900 bg-amber-100/80 px-3 py-1.5 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={configDraft.sundayEmergencyMode}
                  onChange={(e) =>
                    setConfigDraft({ ...configDraft, sundayEmergencyMode: e.target.checked })
                  }
                />
                Sunday Emergency Mode (Pauses Retail &amp; Workforce)
              </label>

              {(
                [
                  ['errands', 'Errands & Fleet'],
                  ['marketplace', 'Check-Before-Pay Marketplace'],
                  ['workforce', 'On-Demand Workforce'],
                  ['managedStaffing', 'Managed Awmpui & Drivers'],
                  ['emergency24x7', '24×7 Emergency SOS'],
                ] as const
              ).map(([svcKey, svcLabel]) => (
                <label
                  key={svcKey}
                  className="inline-flex items-center gap-2 font-medium text-slate-800 bg-white border border-slate-200 px-3 py-1.5 rounded-lg cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={configDraft.visibleServices[svcKey]}
                    onChange={(e) =>
                      setConfigDraft({
                        ...configDraft,
                        visibleServices: {
                          ...configDraft.visibleServices,
                          [svcKey]: e.target.checked,
                        },
                      })
                    }
                  />
                  {svcLabel}
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void handleSaveMasterConfig()}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-xs font-bold text-white hover:bg-teal-800"
            >
              <Save className="w-4 h-4" />
              Apply &amp; Broadcast Master Configuration Live
            </button>
          </div>
        </div>
      )}

      {/* SECTION 2: FLEET PARTNERS & 24x7 SHIFT TECHNICIANS */}
      {section === 'partners_techs' && (
        <div className="space-y-5">
          <form
            onSubmit={handleCreatePartner}
            className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3"
          >
            <p className="text-xs font-bold text-slate-900">
              Add New Fleet Partner or 24×7 Salaried Shift Technician
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              <input
                type="text"
                placeholder="Full Name"
                value={newPartnerName}
                onChange={(e) => setNewPartnerName(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              />
              <input
                type="text"
                placeholder="Phone"
                value={newPartnerPhone}
                onChange={(e) => setNewPartnerPhone(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono"
              />
              <select
                value={newPartnerDistrict}
                onChange={(e) => {
                  const d = e.target.value as MizoramDistrict;
                  setNewPartnerDistrict(d);
                  setNewPartnerVeng(getDistrictInfo(d).vengs[0]?.name || 'Dawrpui');
                }}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              >
                {ALL_MIZORAM_DISTRICT_NAMES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <select
                value={newPartnerVeng}
                onChange={(e) => setNewPartnerVeng(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              >
                {getDistrictInfo(newPartnerDistrict).vengs.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name}
                  </option>
                ))}
              </select>
              <select
                value={newPartnerCat}
                onChange={(e) => setNewPartnerCat(e.target.value as PartnerCategory)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              >
                <option value="walker">Walker (Runner)</option>
                <option value="bike">Bike (2-Wheeler)</option>
                <option value="auto_taxi">Auto / Taxi Cab</option>
                <option value="pickup_truck">Pickup Truck</option>
              </select>
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
              >
                <Plus className="w-3.5 h-3.5" /> Add Partner
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs pt-1">
              <label className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={newPartnerIsTech}
                  onChange={(e) => setNewPartnerIsTech(e.target.checked)}
                />
                Assign as 24×7 Salaried Emergency Shift Technician
              </label>
              {newPartnerIsTech && (
                <select
                  value={newPartnerShift}
                  onChange={(e) =>
                    setNewPartnerShift(
                      e.target.value as 'Morning (06-14)' | 'Evening (14-22)' | 'Night (22-06)'
                    )
                  }
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs"
                >
                  <option value="Morning (06-14)">Morning (06-14)</option>
                  <option value="Evening (14-22)">Evening (14-22)</option>
                  <option value="Night (22-06)">Night (22-06)</option>
                </select>
              )}
            </div>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3">Partner / Tech</th>
                  <th className="py-2 pr-3">District &amp; Veng</th>
                  <th className="py-2 pr-3">Tier &amp; Shift</th>
                  <th className="py-2 pr-3">Verifications</th>
                  <th className="py-2 pr-3">Wallet / COD (₹)</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {partners.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2.5 pr-3">
                      <p className="font-semibold text-slate-900">{p.name}</p>
                      <p className="font-mono text-[11px] text-slate-500">
                        {p.id} · {p.phone} · ★ {p.rating}
                      </p>
                    </td>
                    <td className="py-2.5 pr-3">
                      <select
                        aria-label={`District for ${p.name}`}
                        value={p.district || 'Aizawl'}
                        onChange={(e) =>
                          void handlePatchPartner(p.id, {
                            district: e.target.value as MizoramDistrict,
                          })
                        }
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                      >
                        {ALL_MIZORAM_DISTRICT_NAMES.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-slate-500 mt-0.5">{p.veng}</p>
                    </td>
                    <td className="py-2.5 pr-3 space-y-1">
                      <select
                        aria-label={`Category for ${p.name}`}
                        value={p.category}
                        onChange={(e) =>
                          void handlePatchPartner(p.id, {
                            category: e.target.value as PartnerCategory,
                          })
                        }
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-mono"
                      >
                        <option value="walker">walker</option>
                        <option value="bike">bike</option>
                        <option value="auto_taxi">auto_taxi</option>
                        <option value="pickup_truck">pickup_truck</option>
                      </select>
                      <div>
                        <select
                          aria-label={`24x7 Shift for ${p.name}`}
                          value={p.isSalariedTechnician ? p.shift || 'Morning (06-14)' : 'none'}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === 'none') {
                              void handlePatchPartner(p.id, {
                                isSalariedTechnician: false,
                                shift: undefined,
                              });
                            } else {
                              void handlePatchPartner(p.id, {
                                isSalariedTechnician: true,
                                shift: val as PartnerProfile['shift'],
                              });
                            }
                          }}
                          className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px]"
                        >
                          <option value="none">Standard Fleet</option>
                          <option value="Morning (06-14)">24x7 Tech: Morning (06-14)</option>
                          <option value="Evening (14-22)">24x7 Tech: Evening (14-22)</option>
                          <option value="Night (22-06)">24x7 Tech: Night (22-06)</option>
                        </select>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 space-y-1">
                      <label className="flex items-center gap-1 text-[11px]">
                        <input
                          type="checkbox"
                          checked={p.policeVerified}
                          onChange={(e) =>
                            void handlePatchPartner(p.id, { policeVerified: e.target.checked })
                          }
                        />
                        Police Verified
                      </label>
                      <label className="flex items-center gap-1 text-[11px]">
                        <input
                          type="checkbox"
                          checked={p.commercialPermitVerified}
                          onChange={(e) =>
                            void handlePatchPartner(p.id, {
                              commercialPermitVerified: e.target.checked,
                            })
                          }
                        />
                        Commercial Permit
                      </label>
                    </td>
                    <td className="py-2.5 pr-3 font-mono">
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-slate-500">W:</span>
                        <input
                          type="number"
                          aria-label={`Wallet balance for ${p.name}`}
                          defaultValue={p.walletBalance}
                          onBlur={(e) =>
                            void handlePatchPartner(
                              p.id,
                              { walletBalance: Number(e.target.value) || 0 },
                              `Updated ${p.name} wallet balance`
                            )
                          }
                          className="w-20 rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                        />
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[11px] text-slate-500">COD: ₹{p.codCashHeld}</span>
                        {p.codCashHeld > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              void handlePatchPartner(
                                p.id,
                                { codCashHeld: 0 },
                                `Cleared COD balance for ${p.name}`
                              )
                            }
                            className="text-[10px] text-teal-700 underline ml-1"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            void handlePatchPartner(p.id, { online: !p.online })
                          }
                          className={`rounded px-2 py-1 text-[11px] font-semibold ${
                            p.online
                              ? 'bg-teal-700 text-white'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {p.online ? 'Online' : 'Offline'}
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete partner ${p.name}`}
                          onClick={() => handleDeletePartner(p)}
                          className="rounded border border-red-200 p-1 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 3: ERRANDS & INTER-DISTRICT SUMO PARCELS */}
      {section === 'errands_sumo' && (
        <div className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900">
              All Errands &amp; Fleet Jobs — Status, Partner Assignment &amp; Fare Override ({errands.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3">ID &amp; Title</th>
                    <th className="py-2 pr-3">District / Tier</th>
                    <th className="py-2 pr-3">Status Override</th>
                    <th className="py-2 pr-3">Assigned Partner</th>
                    <th className="py-2 pr-3">Fare (₹)</th>
                    <th className="py-2">Delete</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {errands.map((job) => (
                    <tr key={job.id}>
                      <td className="py-2.5 pr-3">
                        <p className="font-semibold text-slate-900">{job.title}</p>
                        <p className="font-mono text-[11px] text-slate-500">
                          {job.id} · Customer: {job.customerName} · OTP: {job.otpCode}
                        </p>
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-[11px]">
                        {job.district || 'Aizawl'} · {job.jobType}
                      </td>
                      <td className="py-2.5 pr-3">
                        <select
                          aria-label={`Status for ${job.id}`}
                          value={job.status}
                          onChange={(e) =>
                            void handlePatchErrand(job.id, {
                              status: e.target.value as ErrandRequest['status'],
                            })
                          }
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        >
                          <option value="bidding">bidding</option>
                          <option value="assigned">assigned</option>
                          <option value="in_progress">in_progress</option>
                          <option value="completed">completed</option>
                          <option value="cancelled">cancelled</option>
                        </select>
                      </td>
                      <td className="py-2.5 pr-3">
                        <select
                          aria-label={`Partner for ${job.id}`}
                          value={job.assignedPartnerId || ''}
                          onChange={(e) =>
                            void handlePatchErrand(job.id, {
                              assignedPartnerId: e.target.value || undefined,
                            })
                          }
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        >
                          <option value="">Unassigned</option>
                          {partners.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.category})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 pr-3">
                        <input
                          type="number"
                          aria-label={`Fare for ${job.id}`}
                          defaultValue={job.allInclusiveTotal}
                          onBlur={(e) =>
                            void handlePatchErrand(job.id, {
                              allInclusiveTotal: Number(e.target.value) || job.allInclusiveTotal,
                            })
                          }
                          className="w-20 rounded border border-slate-300 px-2 py-1 text-xs font-mono"
                        />
                      </td>
                      <td className="py-2.5">
                        <button
                          type="button"
                          aria-label={`Delete errand ${job.id}`}
                          onClick={() => handleDeleteErrand(job)}
                          className="rounded border border-red-200 p-1 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-200 pt-4">
            <h3 className="text-sm font-bold text-slate-900">
              Inter-District Sumo Parcels &amp; Proxy Shopping Override ({sumoParcels.length})
            </h3>
            {sumoParcels.length === 0 ? (
              <p className="text-xs text-slate-500">No Sumo parcel bookings currently stored.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-3">Tracking &amp; Route</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Sumo Vehicle No.</th>
                      <th className="py-2 pr-3">Total (₹)</th>
                      <th className="py-2">Delete</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sumoParcels.map((sp) => (
                      <tr key={sp.id}>
                        <td className="py-2.5 pr-3">
                          <p className="font-mono font-semibold text-slate-900">{sp.trackingCode}</p>
                          <p className="text-[11px] text-slate-600">
                            {sp.originDistrict} → {sp.destinationDistrict} · {sp.parcelDescription}
                          </p>
                        </td>
                        <td className="py-2.5 pr-3">
                          <select
                            value={sp.status}
                            onChange={(e) =>
                              void handlePatchSumo(sp.id, {
                                status: e.target.value as SumoParcelBooking['status'],
                              })
                            }
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                          >
                            <option value="pickup_scheduled">pickup_scheduled</option>
                            <option value="at_sumo_counter">at_sumo_counter</option>
                            <option value="in_transit">in_transit</option>
                            <option value="delivered">delivered</option>
                          </select>
                        </td>
                        <td className="py-2.5 pr-3">
                          <input
                            type="text"
                            defaultValue={sp.sumoVehicleNumber || 'MZ-01-C-1001'}
                            onBlur={(e) =>
                              void handlePatchSumo(sp.id, { sumoVehicleNumber: e.target.value })
                            }
                            className="w-32 rounded border border-slate-300 px-2 py-1 text-xs font-mono"
                          />
                        </td>
                        <td className="py-2.5 pr-3">
                          <input
                            type="number"
                            defaultValue={sp.allInclusiveTotal}
                            onBlur={(e) =>
                              void handlePatchSumo(sp.id, {
                                allInclusiveTotal: Number(e.target.value) || sp.allInclusiveTotal,
                              })
                            }
                            className="w-20 rounded border border-slate-300 px-2 py-1 text-xs font-mono"
                          />
                        </td>
                        <td className="py-2.5">
                          <button
                            type="button"
                            onClick={() => handleDeleteSumo(sp)}
                            className="rounded border border-red-200 p-1 text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 4: MARKETPLACE PRODUCTS & ORDERS */}
      {section === 'marketplace' && (
        <div className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900">
              Marketplace Catalog — Price, Stock &amp; Check-Before-Pay Override ({products.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3">Product &amp; Shop</th>
                    <th className="py-2 pr-3">Price (₹)</th>
                    <th className="py-2 pr-3">Stock</th>
                    <th className="py-2 pr-3">Check-Before-Pay</th>
                    <th className="py-2">Delete</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {products.map((prd) => (
                    <tr key={prd.id}>
                      <td className="py-2.5 pr-3">
                        <p className="font-semibold text-slate-900">{prd.titleEn}</p>
                        <p className="text-[11px] text-slate-500">
                          {prd.titleMiz} · {prd.shopName} ({prd.veng}, {prd.district || 'Aizawl'})
                        </p>
                      </td>
                      <td className="py-2.5 pr-3">
                        <input
                          type="number"
                          defaultValue={prd.price}
                          onBlur={(e) =>
                            void handlePatchProduct(prd.id, { price: Number(e.target.value) || prd.price })
                          }
                          className="w-20 rounded border border-slate-300 px-2 py-1 text-xs font-mono"
                        />
                      </td>
                      <td className="py-2.5 pr-3">
                        <input
                          type="number"
                          defaultValue={prd.stock}
                          onBlur={(e) =>
                            void handlePatchProduct(prd.id, { stock: Number(e.target.value) || 0 })
                          }
                          className="w-16 rounded border border-slate-300 px-2 py-1 text-xs font-mono"
                        />
                      </td>
                      <td className="py-2.5 pr-3">
                        <input
                          type="checkbox"
                          disabled={prd.hygieneCategory !== 'standard'}
                          checked={prd.checkBeforePayEligible}
                          onChange={(e) =>
                            void handlePatchProduct(prd.id, {
                              checkBeforePayEligible: e.target.checked,
                            })
                          }
                        />
                        <span className="ml-1.5 text-[11px] text-slate-600">
                          {prd.hygieneCategory}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <button
                          type="button"
                          onClick={() => handleDeleteProduct(prd)}
                          className="rounded border border-red-200 p-1 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-200 pt-4">
            <h3 className="text-sm font-bold text-slate-900">
              Marketplace Orders Override ({marketplaceOrders.length})
            </h3>
            {marketplaceOrders.length === 0 ? (
              <p className="text-xs text-slate-500">No marketplace orders placed yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-3">Order &amp; Product</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Assigned Runner</th>
                      <th className="py-2">Total (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {marketplaceOrders.map((ord) => (
                      <tr key={ord.id}>
                        <td className="py-2.5 pr-3">
                          <p className="font-mono font-semibold text-slate-900">{ord.id}</p>
                          <p className="text-[11px] text-slate-600">
                            {ord.productTitle} · {ord.shopName}
                          </p>
                        </td>
                        <td className="py-2.5 pr-3">
                          <select
                            value={ord.status}
                            onChange={(e) =>
                              void handlePatchMarketplaceOrder(ord.id, {
                                status: e.target.value as MarketplaceOrder['status'],
                              })
                            }
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                          >
                            <option value="awaiting_inspection">awaiting_inspection</option>
                            <option value="accepted_paid">accepted_paid</option>
                            <option value="rejected_return_fee_charged">
                              rejected_return_fee_charged
                            </option>
                          </select>
                        </td>
                        <td className="py-2.5 pr-3">
                          <select
                            value={ord.assignedPartnerId || ''}
                            onChange={(e) =>
                              void handlePatchMarketplaceOrder(ord.id, {
                                assignedPartnerId: e.target.value || undefined,
                              })
                            }
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                          >
                            <option value="">Unassigned</option>
                            {partners.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.category})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2.5 font-mono">₹{ord.allInclusiveTotal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 5: CUSTOMER WALLET, BLACKLIST & RETURN COUNTERS */}
      {section === 'wallet_blacklist' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {walletDraft && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <h3 className="text-sm font-bold text-slate-900">
                Customer Wallet, Loyalty Points &amp; Plus Pass Override
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Wallet Balance (₹)
                  </label>
                  <input
                    type="number"
                    value={walletDraft.balanceRs}
                    onChange={(e) =>
                      setWalletDraft({ ...walletDraft, balanceRs: Number(e.target.value) || 0 })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Loyalty Points
                  </label>
                  <input
                    type="number"
                    value={walletDraft.loyaltyPoints}
                    onChange={(e) =>
                      setWalletDraft({ ...walletDraft, loyaltyPoints: Number(e.target.value) || 0 })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Referral Code
                  </label>
                  <input
                    type="text"
                    value={walletDraft.referralCode}
                    onChange={(e) =>
                      setWalletDraft({ ...walletDraft, referralCode: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono"
                  />
                </div>
                <div className="flex items-end pb-1">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={walletDraft.plusPassActive}
                      onChange={(e) =>
                        setWalletDraft({ ...walletDraft, plusPassActive: e.target.checked })
                      }
                    />
                    ZoRûn Plus Pass Active
                  </label>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleSaveCustomerWallet()}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Save Customer Wallet State
              </button>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-900">
              Blacklisted Accounts &amp; Monthly Return Counter Controls
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Customer ID or Name to blacklist..."
                value={newBlacklistTarget}
                onChange={(e) => setNewBlacklistTarget(e.target.value)}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
              />
              <button
                type="button"
                onClick={() => void handleBlacklistAction('add', newBlacklistTarget)}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
              >
                Add to Blacklist
              </button>
            </div>

            {blacklistedCustomers.length === 0 ? (
              <p className="text-xs text-slate-500">No blacklisted accounts currently active.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {blacklistedCustomers.map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-100 px-2.5 py-1 text-xs font-mono text-red-900"
                  >
                    {item}
                    <button
                      type="button"
                      onClick={() => void handleBlacklistAction('remove', item)}
                      className="font-sans font-bold text-red-700 hover:underline"
                    >
                      × Unblock
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
              <span className="text-xs text-slate-600 font-mono">
                Monthly Returns Used: {JSON.stringify(userMonthlyReturns)}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleBlacklistAction('reset_returns')}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-100"
                >
                  Reset Return Counters
                </button>
                <button
                  type="button"
                  onClick={() => void handleBlacklistAction('clear_all')}
                  className="rounded-lg border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                >
                  Clear All Blacklists
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 6: AI KYC VISION OCR AGENT & LIVE VIDEO INTERVIEW WEBRTC CONFIG */}
      {section === 'integrations_kyc_video' && integrationDraft && (
        <form onSubmit={handleSaveIntegrationConfig} className="space-y-5">
          <div className="rounded-xl border border-teal-300 bg-teal-50/80 p-4 text-xs text-teal-950 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <Bot className="w-4 h-4 text-teal-700" />
              AI Camera KYC OCR Agent &amp; In-App Live Video Interview Extension Manager
            </p>
            <p>
              Manage Gemini Vision API keys, enforce strict Phone-Camera-Only KYC document capture, require full 12-digit UIDAI Aadhaar AI scan (auto-masked to <code>XXXX-XXXX-1234</code>), and configure the embedded WebRTC Live Video Interview module (Jitsi Meet, Daily.co, LiveKit Cloud, or Agora RTC) for Awmpui &amp; Drivers.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Left Card: AI KYC Vision & Camera-Only Policy */}
            <div className="rounded-2xl border border-slate-200 p-4 space-y-3.5">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Bot className="w-4 h-4 text-emerald-700" />
                1. AI KYC Vision OCR Agent &amp; Camera-Only Policy
              </h3>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Gemini Vision API Key (GEMINI_API_KEY Override)
                </label>
                <input
                  type="password"
                  value={integrationDraft.geminiApiKey}
                  onChange={(e) =>
                    setIntegrationDraft({ ...integrationDraft, geminiApiKey: e.target.value })
                  }
                  placeholder="AIzaSy... (Leave blank to use server env or built-in deterministic AI OCR)"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    AI Vision Model
                  </label>
                  <input
                    type="text"
                    value={integrationDraft.geminiModel}
                    onChange={(e) =>
                      setIntegrationDraft({ ...integrationDraft, geminiModel: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Min AI OCR Confidence (%)
                  </label>
                  <input
                    type="number"
                    min={50}
                    max={99}
                    value={integrationDraft.aiOcrMinConfidence}
                    onChange={(e) =>
                      setIntegrationDraft({
                        ...integrationDraft,
                        aiOcrMinConfidence: Number(e.target.value) || 82,
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-1 text-xs">
                <label className="flex items-center gap-2 font-medium text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={integrationDraft.enforceCameraOnlyKyc}
                    onChange={(e) =>
                      setIntegrationDraft({
                        ...integrationDraft,
                        enforceCameraOnlyKyc: e.target.checked,
                      })
                    }
                  />
                  Enforce Strict Phone-Camera-Only KYC Capture (Block Gallery Upload &amp; Manual Typing)
                </label>

                <label className="flex items-center gap-2 font-medium text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={integrationDraft.requireFull12DigitAadhaarScan}
                    onChange={(e) =>
                      setIntegrationDraft({
                        ...integrationDraft,
                        requireFull12DigitAadhaarScan: e.target.checked,
                      })
                    }
                  />
                  Require Full 12-Digit UIDAI Aadhaar AI Scan + SHA-256 Hash + Auto-Mask (XXXX-XXXX-1234)
                </label>

                <label className="flex items-center gap-2 font-medium text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={integrationDraft.requireServerStaffVerificationForUpdates}
                    onChange={(e) =>
                      setIntegrationDraft({
                        ...integrationDraft,
                        requireServerStaffVerificationForUpdates: e.target.checked,
                      })
                    }
                  />
                  Route All Partner &amp; Staff Profile/Document Updates to Server-Side Staff Verification Queue
                </label>
              </div>
            </div>

            {/* Right Card: In-App Live Video Interview WebRTC Module */}
            <div className="rounded-2xl border border-slate-200 p-4 space-y-3.5">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Video className="w-4 h-4 text-teal-700" />
                2. In-App Live Video Interview WebRTC Extension &amp; API Keys
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Video WebRTC Provider
                  </label>
                  <select
                    value={integrationDraft.videoProvider}
                    onChange={(e) =>
                      setIntegrationDraft({
                        ...integrationDraft,
                        videoProvider: e.target.value as SystemIntegrationConfig['videoProvider'],
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold"
                  >
                    <option value="jitsi_webrtc">Jitsi Meet WebRTC (Zero-Key Out-of-Box)</option>
                    <option value="google_meet_v2">Google Meet API v2 (Workspace Comms Hub)</option>
                    <option value="daily_co">Daily.co WebRTC Cloud</option>
                    <option value="livekit_cloud">LiveKit Cloud SFU</option>
                    <option value="agora_rtc">Agora SD-RTN</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Video Server Domain / Endpoint
                  </label>
                  <input
                    type="text"
                    value={integrationDraft.videoServerDomain}
                    onChange={(e) =>
                      setIntegrationDraft({
                        ...integrationDraft,
                        videoServerDomain: e.target.value,
                      })
                    }
                    placeholder="https://meet.jit.si"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Video API Key / App ID (Daily / LiveKit / Agora)
                  </label>
                  <input
                    type="password"
                    value={integrationDraft.videoApiKey}
                    onChange={(e) =>
                      setIntegrationDraft({ ...integrationDraft, videoApiKey: e.target.value })
                    }
                    placeholder="Optional for Jitsi; required for Daily/LiveKit/Agora"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Video API Secret / Signing Token
                  </label>
                  <input
                    type="password"
                    value={integrationDraft.videoApiSecret}
                    onChange={(e) =>
                      setIntegrationDraft({ ...integrationDraft, videoApiSecret: e.target.value })
                    }
                    placeholder="Room token signing secret"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Encrypted Room Prefix
                </label>
                <input
                  type="text"
                  value={integrationDraft.roomPrefix}
                  onChange={(e) =>
                    setIntegrationDraft({ ...integrationDraft, roomPrefix: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                />
              </div>

              <label className="flex items-center gap-2 pt-1 text-xs font-medium text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={integrationDraft.defaultRequireVideoForAwmpuiAndDrivers}
                  onChange={(e) =>
                    setIntegrationDraft({
                      ...integrationDraft,
                      defaultRequireVideoForAwmpuiAndDrivers: e.target.checked,
                    })
                  }
                />
                Default Require Live Video Interview for Awmpui &amp; Drivers (Server Staff Can Still Waive or Schedule at Their Discretion)
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Wallet className="w-4 h-4 text-blue-700" />
              3. Mizoram Google Pay (GPay) Merchant VPA &amp; Dynamic QR Config
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Official GPay UPI ID (Merchant VPA)
                </label>
                <input
                  type="text"
                  value={integrationDraft.gpayMerchantVpa || 'zorun.mizoram@oksbi'}
                  onChange={(e) =>
                    setIntegrationDraft({
                      ...integrationDraft,
                      gpayMerchantVpa: e.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  GPay Business Phone Number
                </label>
                <input
                  type="text"
                  value={integrationDraft.gpayBusinessPhone || '9862009900'}
                  onChange={(e) =>
                    setIntegrationDraft({
                      ...integrationDraft,
                      gpayBusinessPhone: e.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  GPay Payee Display Name
                </label>
                <input
                  type="text"
                  value={integrationDraft.gpayMerchantName || 'ZoRûn Mizoram Escrow'}
                  onChange={(e) =>
                    setIntegrationDraft({
                      ...integrationDraft,
                      gpayMerchantName: e.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-800 hover:bg-teal-900 px-5 py-2.5 text-xs font-bold text-white shadow-sm"
            >
              <Save className="w-4 h-4" />
              Save GPay, AI KYC &amp; Live Video Interview Config
            </button>
          </div>
        </form>
      )}

      {/* SECTION 7: SUPER ADMIN SECURITY & PASSCODE ROTATION */}
      {section === 'security' && (
        <div className="max-w-lg space-y-4">
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-amber-700" />
              Super Admin 2FA Passcode Rotation Warning
            </p>
            <p>
              Changing the Super Admin passcode immediately updates the PBKDF2/scrypt hash used to unlock <code>/admin</code>, <code>/admin/dev-studio</code>, and <code>/backend</code>.
            </p>
          </div>

          <form onSubmit={handleRotatePasscode} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                New Super Admin Passcode (Min 6 chars)
              </label>
              <input
                type="password"
                value={newPasscode}
                onChange={(e) => setNewPasscode(e.target.value)}
                placeholder="Enter new passcode"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Confirm New Super Admin Passcode
              </label>
              <input
                type="password"
                value={confirmPasscode}
                onChange={(e) => setConfirmPasscode(e.target.value)}
                placeholder="Confirm new passcode"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800"
            >
              Rotate Super Admin Passcode
            </button>
          </form>
        </div>
      )}

      {/* Destructive / High-Impact Action Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border-2 border-red-500 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3 text-red-700">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <div>
                <h3 className="text-base font-bold text-slate-900">{confirmModal.title}</h3>
                <p className="text-xs text-slate-700 mt-1 leading-relaxed">
                  {confirmModal.warningDetail}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const fn = confirmModal.onConfirm;
                  setConfirmModal(null);
                  await fn();
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700"
              >
                {confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  MapPin,
  Mic,
  PhoneCall,
  Plus,
  Send,
  ShieldCheck,
  Square,
  Trash2,
} from 'lucide-react';
import type {
  AccessType,
  AppRemoteConfig,
  EmergencyCategory,
  EmergencySosTicket,
  ErrandJobType,
  ErrandRequest,
  Language,
  LatLng,
  MarketplaceOrder,
  MarketplaceProduct,
  MizoramDistrict,
  PartnerProfile,
  StaffingBooking,
  WorkforceMember,
} from '../shared/types';
import { TRANSLATIONS } from '../i18n/translations';
import {
  MIZORAM_DISTRICTS,
  findAnyMizoramVeng,
  getDistrictInfo,
  getVengsForDistrict,
} from '../data/mizoramDistricts';
import { MizoramMap, PlacesSearchInput } from './MizoramMap';
import { compressImageToWebP } from '../lib/offlineCache';

export type CustomerTab = 'errands' | 'marketplace' | 'workforce' | 'sos';

interface CustomerViewProps {
  lang: Language;
  selectedDistrict: MizoramDistrict;
  onChangeDistrict: (d: MizoramDistrict) => void;
  activeTab: CustomerTab;
  onChangeTab: (tab: CustomerTab) => void;
  mapsApiKey: string;
  remoteConfig: AppRemoteConfig;
  effectiveVisibility: {
    errands: boolean;
    marketplace: boolean;
    workforce: boolean;
    managedStaffing: boolean;
    emergency24x7: boolean;
    sundayRestrictionActive: boolean;
  };
  partners: PartnerProfile[];
  errands: ErrandRequest[];
  products: MarketplaceProduct[];
  orders: MarketplaceOrder[];
  userMonthlyReturns: Record<string, number>;
  workforce: WorkforceMember[];
  staffingBookings: StaffingBooking[];
  sosTickets: EmergencySosTicket[];
  onRefresh: () => Promise<void>;
}

export const CustomerView: React.FC<CustomerViewProps> = ({
  lang,
  selectedDistrict,
  onChangeDistrict,
  activeTab,
  onChangeTab,
  mapsApiKey,
  remoteConfig,
  effectiveVisibility,
  partners,
  errands,
  products,
  orders,
  userMonthlyReturns,
  workforce,
  staffingBookings,
  sosTickets,
  onRefresh,
}) => {
  const t = TRANSLATIONS[lang];
  const districtInfo = useMemo(() => getDistrictInfo(selectedDistrict), [selectedDistrict]);
  const districtVengs = districtInfo.vengs;

  // Errand Form State
  const [title, setTitle] = useState('');
  const [jobType, setJobType] = useState<ErrandJobType>('step_delivery');
  const [isInterDistrict, setIsInterDistrict] = useState(false);
  const [originName, setOriginName] = useState('Dawrpui');
  const [destName, setDestName] = useState('Mission Veng');
  const [customOrigin, setCustomOrigin] = useState<LatLng | null>(null);
  const [customDest, setCustomDest] = useState<LatLng | null>(null);
  const [stops, setStops] = useState<LatLng[]>([]);
  const [accessType, setAccessType] = useState<AccessType>('long_steps_walk');
  const [needsWalkerHelper, setNeedsWalkerHelper] = useState(false);
  const [declaredValue, setDeclaredValue] = useState('650');
  const [paymentMethod, setPaymentMethod] = useState<'upi_escrow' | 'dynamic_qr_cod'>('upi_escrow');
  const [microInsuranceOptIn, setMicroInsuranceOptIn] = useState(true);
  const [buildingPhotoUrl, setBuildingPhotoUrl] = useState<string>('');
  const [voiceNoteTranscript, setVoiceNoteTranscript] = useState(
    'Gate beside concrete steps, blue railing on right.'
  );
  const [isRecording, setIsRecording] = useState(false);
  const [recordedSeconds, setRecordedSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [estimate, setEstimate] = useState<{
    distanceKm: number;
    allInclusiveTotal: number;
    microInsuranceFee: number;
    corridorMatches: Array<{ partnerId: string; name: string; corridorMeters: number; within500m: boolean }>;
  } | null>(null);
  const [submittingErrand, setSubmittingErrand] = useState(false);
  const [errandFeedback, setErrandFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Marketplace State
  const [mktDistrictFilter, setMktDistrictFilter] = useState<'all' | 'selected'>('all');
  const [selectedVengFilter, setSelectedVengFilter] = useState('All');
  const [mktInsurance, setMktInsurance] = useState(true);
  const [mktFeedback, setMktFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [chatDrafts, setChatDrafts] = useState<Record<string, string>>({});

  // Workforce & Staffing State
  const [staffFilter, setStaffFilter] = useState<'all' | 'on_demand_workforce' | 'company_managed_staffing'>('all');
  const [outstationMode, setOutstationMode] = useState(false);
  const [accChecked, setAccChecked] = useState(false);
  const [foodChecked, setFoodChecked] = useState(false);
  const [travelChecked, setTravelChecked] = useState(false);
  const [staffFeedback, setStaffFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // 24x7 SOS State
  const [sosCategory, setSosCategory] = useState<EmergencyCategory>('plumber_water');
  const [sosVeng, setSosVeng] = useState('Kulikawn');
  const [sosVoiceNote, setSosVoiceNote] = useState('Burst main pipe near hillside tank, urgent shutdown needed.');
  const [sosFeedback, setSosFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Sync Veng defaults whenever the active Mizoram District Capital changes
  useEffect(() => {
    const vengs = getVengsForDistrict(selectedDistrict);
    if (vengs.length > 0) {
      setOriginName(vengs[0].name);
      if (!isInterDistrict) {
        setDestName(vengs[1]?.name || vengs[0].name);
      }
      setCustomOrigin(null);
      setCustomDest(null);
      setStops([]);
      setSosVeng(vengs[0].name);
      setSelectedVengFilter('All');
    }
  }, [selectedDistrict, isInterDistrict]);

  const originPoint = useMemo(() => customOrigin || findAnyMizoramVeng(originName), [customOrigin, originName]);
  const destPoint = useMemo(() => customDest || findAnyMizoramVeng(destName), [customDest, destName]);

  // Auto-calculate upfront all-inclusive price whenever route/options change
  useEffect(() => {
    let active = true;
    fetch('/api/errands/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        district: selectedDistrict,
        isInterDistrict,
        jobType,
        origin: originPoint,
        stops,
        destination: destPoint,
        needsWalkerHelper,
        microInsuranceOptIn,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (active && typeof data.allInclusiveTotal === 'number') {
          setEstimate(data);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [selectedDistrict, isInterDistrict, jobType, originPoint, stops, destPoint, needsWalkerHelper, microInsuranceOptIn, remoteConfig]);

  // Recording timer capped at 15 seconds
  useEffect(() => {
    if (!isRecording) return;
    const timer = setInterval(() => {
      setRecordedSeconds((prev) => {
        if (prev >= 14) {
          mediaRecorderRef.current?.stop();
          setIsRecording(false);
          return 15;
        }
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isRecording]);

  const toggleVoiceRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
      };
      setRecordedSeconds(0);
      setIsRecording(true);
      recorder.start();
    } catch {
      // Headless / mic-denied fallback: keep 15s voice landmark guide editable
      setRecordedSeconds(6);
      setVoiceNoteTranscript(
        'Voice landmark note (6s): Walk past Chanmari transformer, descend 40 steps to tin-roofed house.'
      );
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const webp = await compressImageToWebP(file, 800);
      setBuildingPhotoUrl(webp);
    } catch {
      setErrandFeedback({ type: 'err', msg: 'Could not process image file.' });
    }
  };

  const handleCreateErrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrandFeedback({ type: 'err', msg: 'Please describe the errand or cargo task.' });
      return;
    }
    setSubmittingErrand(true);
    setErrandFeedback(null);
    try {
      const res = await fetch('/api/errands/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          district: selectedDistrict,
          isInterDistrict,
          jobType,
          origin: originPoint,
          stops,
          destination: destPoint,
          accessType,
          needsWalkerHelper,
          buildingPhotoUrl: buildingPhotoUrl || undefined,
          voiceNoteTranscript,
          declaredValue: Number(declaredValue) || 0,
          paymentMethod,
          microInsuranceOptIn,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrandFeedback({ type: 'err', msg: data.error || 'Failed to create errand' });
      } else {
        setTitle('');
        setErrandFeedback({
          type: 'ok',
          msg: `Errand ${data.job.id} posted! Customer Handover OTP: ${data.job.otpCode}`,
        });
        await onRefresh();
      }
    } catch {
      setErrandFeedback({ type: 'err', msg: 'Network error posting errand.' });
    } finally {
      setSubmittingErrand(false);
    }
  };

  const handleSelectBid = async (jobId: string, bidId: string) => {
    const res = await fetch(`/api/errands/jobs/${jobId}/select-bid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bidId }),
    });
    if (res.ok) {
      setErrandFeedback({ type: 'ok', msg: 'Partner selected and funds locked in escrow until OTP.' });
      await onRefresh();
    }
  };

  const handlePlaceMarketplaceOrder = async (productId: string) => {
    setMktFeedback(null);
    const res = await fetch('/api/marketplace/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, microInsuranceOptIn: mktInsurance }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMktFeedback({ type: 'err', msg: data.error || 'Order blocked' });
      return;
    }
    setMktFeedback({
      type: 'ok',
      msg: `Order ${data.order.id} placed. ${data.order.checkBeforePay ? 'Ready for Check-Before-Pay at doorstep.' : 'Sealed hygiene pack — direct handover.'}`,
    });
    await onRefresh();
  };

  const handleInspectOrder = async (orderId: string, action: 'accept' | 'reject') => {
    setMktFeedback(null);
    const res = await fetch(`/api/marketplace/orders/${orderId}/inspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMktFeedback({ type: 'err', msg: data.error || 'Inspection action rejected' });
      return;
    }
    setMktFeedback({
      type: 'ok',
      msg:
        action === 'accept'
          ? `Order ${orderId} accepted & settled from escrow.`
          : `Order ${orderId} returned. Return delivery fee Rs. ${data.verification.returnFeeCharged} applied (Returns used: ${data.returnsUsedThisMonth}/${remoteConfig.monthlyReturnLimit}).`,
    });
    await onRefresh();
  };

  const handleSendMerchantChat = async (orderId: string) => {
    const text = chatDrafts[orderId]?.trim();
    if (!text) return;
    const res = await fetch(`/api/marketplace/orders/${orderId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: 'customer', text }),
    });
    if (res.ok) {
      setChatDrafts((prev) => ({ ...prev, [orderId]: '' }));
      await onRefresh();
    }
  };

  const handleBookWorker = async (worker: WorkforceMember) => {
    setStaffFeedback(null);
    const isLiveInOrOutstation = outstationMode || worker.mode === 'company_managed_staffing';
    const res = await fetch('/api/staffing/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workerId: worker.id,
        isOutstationOrLiveIn: isLiveInOrOutstation,
        accommodationProvided: accChecked,
        foodProvided: foodChecked,
        travelCovered: travelChecked,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStaffFeedback({ type: 'err', msg: data.error || 'Booking failed' });
      return;
    }
    setStaffFeedback({
      type: 'ok',
      msg: `Digital contract ${data.booking.contractId} active for ${worker.name}.`,
    });
    await onRefresh();
  };

  const handleTriggerWorkerSos = async (bookingId: string) => {
    const res = await fetch(`/api/staffing/bookings/${bookingId}/worker-sos`, { method: 'POST' });
    if (res.ok) {
      setStaffFeedback({ type: 'err', msg: 'Worker SOS Alert transmitted to Operations Command Center!' });
      await onRefresh();
    }
  };

  const handleDispatchSos = async (e: React.FormEvent) => {
    e.preventDefault();
    const vengPt = findAnyMizoramVeng(sosVeng);
    const res = await fetch('/api/emergency/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        district: selectedDistrict,
        veng: sosVeng,
        lat: vengPt.lat,
        lng: vengPt.lng,
        category: sosCategory,
        voiceNoteTranscript: sosVoiceNote,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setSosFeedback({
        type: 'ok',
        msg: `SOS ${data.ticket.id} dispatched in ${selectedDistrict}! ${data.ticket.assignedTechName} assigned (SLA ${data.ticket.slaTargetMinutes}m).`,
      });
      await onRefresh();
    }
  };

  const districtProducts = useMemo(
    () =>
      mktDistrictFilter === 'selected'
        ? products.filter((p) => (p.district || 'Aizawl') === selectedDistrict)
        : products,
    [products, mktDistrictFilter, selectedDistrict]
  );

  const vailableVengs = useMemo(
    () => ['All', ...new Set(districtProducts.map((p) => p.veng))],
    [districtProducts]
  );
  const filteredProducts = useMemo(
    () =>
      selectedVengFilter === 'All'
        ? districtProducts
        : districtProducts.filter((p) => p.veng === selectedVengFilter),
    [districtProducts, selectedVengFilter]
  );

  const filteredWorkforce = useMemo(
    () => (staffFilter === 'all' ? workforce : workforce.filter((w) => w.mode === staffFilter)),
    [workforce, staffFilter]
  );

  const districtPartners = useMemo(
    () =>
      isInterDistrict
        ? partners
        : partners.filter((p) => !p.district || p.district === selectedDistrict),
    [partners, selectedDistrict, isInterDistrict]
  );

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* Compact Hero with Generated Mizoram Backdrop (16:9 ratio balanced split) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-stretch rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="lg:col-span-7 p-4 sm:p-6 lg:p-8 flex flex-col justify-between gap-4 min-w-0">
          <div className="space-y-2.5">
            <p className="text-xs font-medium text-teal-800">
              {selectedDistrict} ({districtInfo.rtoCode}, {districtVengs.length} Vengs) · All 11 District Capitals · {t.allInclusiveNote}
            </p>
            <h1 className="text-xl sm:text-2xl lg:text-4xl font-bold tracking-tight text-slate-900 [text-wrap:balance]">
              {t.heroTitle}
            </h1>
            <p className="text-sm lg:text-base text-slate-600 max-w-2xl leading-relaxed">
              {t.heroSubtitle}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onChangeTab('errands')}
              className="min-h-[44px] rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 transition-colors whitespace-nowrap"
            >
              {t.heroAction}
            </button>
            <span className="text-xs text-slate-500">
              Rain Surge: <strong className="font-mono text-slate-800">{remoteConfig.rainSurgeMultiplier}x</strong> ·{' '}
              Return Fee: <strong className="font-mono text-slate-800">Rs. {remoteConfig.returnDeliveryFee}</strong>
            </span>
          </div>
        </div>
        <div className="lg:col-span-5 relative h-40 sm:h-52 lg:h-auto lg:min-h-[200px] bg-slate-200">
          <img
            src="/src/assets/images/mizoram_hero_hills_1794891319409.jpg"
            alt="Aizawl terraced hillside ridges and mountain roads in Mizoram"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent flex items-end p-4">
            <p className="text-xs text-white/90 font-medium">
              {lang === 'miz' ? remoteConfig.announcementMiz : remoteConfig.announcementEn}
            </p>
          </div>
        </div>
      </section>

      {/* Segmented Customer Module Switcher */}
      <nav aria-label="Customer services" className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-200/70 p-1.5">
        <button
          type="button"
          onClick={() => onChangeTab('errands')}
          className={`min-h-[44px] flex-1 sm:flex-none rounded-lg px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'errands' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t.tabErrands}
        </button>
        <button
          type="button"
          onClick={() => onChangeTab('marketplace')}
          className={`min-h-[44px] flex-1 sm:flex-none rounded-lg px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'marketplace' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t.tabMarketplace}
        </button>
        <button
          type="button"
          onClick={() => onChangeTab('workforce')}
          className={`min-h-[44px] flex-1 sm:flex-none rounded-lg px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'workforce' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t.tabWorkforce}
        </button>
        <button
          type="button"
          onClick={() => onChangeTab('sos')}
          className={`min-h-[44px] flex-1 sm:flex-none rounded-lg px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'sos' ? 'bg-red-600 text-white shadow-sm' : 'text-red-700 hover:bg-red-50'
          }`}
        >
          {t.tabSos}
        </button>
      </nav>

      {/* TAB 1: SMART ERRAND & MULTI-TIER FLEET */}
      {activeTab === 'errands' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Booking Form */}
          <form
            onSubmit={handleCreateErrand}
            className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-5 space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">Smart Errand &amp; Fleet Dispatch</h2>
              <span className="text-xs font-mono text-teal-800">ST_DWithin 500m</span>
            </div>

            <div>
              <label htmlFor="errand-title" className="block text-xs font-medium text-slate-700 mb-1">
                Errand / Delivery Description
              </label>
              <input
                id="errand-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Pick up medicine & climb 90 steps in Mission Veng"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="job-tier" className="block text-xs font-medium text-slate-700 mb-1">
                  Vehicle / Tirhkah Tier
                </label>
                <select
                  id="job-tier"
                  value={jobType}
                  onChange={(e) => {
                    const next = e.target.value as ErrandJobType;
                    setJobType(next);
                    if (
                      next === 'step_delivery' ||
                      next === 'hyperlocal_errand' ||
                      next === 'queue_standing' ||
                      next === 'truck_helper'
                    ) {
                      setAccessType('long_steps_walk');
                    } else {
                      setAccessType('vehicle_accessible');
                    }
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="step_delivery">Cat A: On-Foot Tirhkah (Steps Walk)</option>
                  <option value="hyperlocal_errand">Cat A: On-Foot Tirhkah (&lt;1.5km)</option>
                  <option value="queue_standing">Cat A: Bank / Office Queue Standing</option>
                  <option value="truck_helper">Cat A: Pickup / Truck Helper</option>
                  <option value="bike_express">Cat B: Two-Wheeler Express</option>
                  <option value="auto_cab_ride">Cat C: Commercial Permit Auto / Cab</option>
                  <option value="heavy_cargo_shift">Cat D: Pickup Truck (Heavy Cargo)</option>
                </select>
              </div>

              <div>
                <label htmlFor="terrain-access" className="block text-xs font-medium text-slate-700 mb-1">
                  Terrain &amp; Access Tag
                </label>
                <select
                  id="terrain-access"
                  value={accessType}
                  onChange={(e) => setAccessType(e.target.value as AccessType)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="long_steps_walk">{t.terrainSteps}</option>
                  <option value="vehicle_accessible">{t.terrainVehicle}</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-2.5 border border-slate-200">
              <div className="flex items-center gap-2 min-w-0">
                <label htmlFor="errand-district-pick" className="text-xs font-semibold text-slate-800 shrink-0">
                  Hub:
                </label>
                <select
                  id="errand-district-pick"
                  value={selectedDistrict}
                  onChange={(e) => onChangeDistrict(e.target.value as MizoramDistrict)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-teal-900"
                >
                  {MIZORAM_DISTRICTS.map((d) => (
                    <option key={d.district} value={d.district}>
                      {d.district} ({d.rtoCode})
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isInterDistrict}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIsInterDistrict(checked);
                    if (checked) {
                      const otherDistrict = MIZORAM_DISTRICTS.find((d) => d.district !== selectedDistrict);
                      if (otherDistrict?.vengs[0]) {
                        setDestName(otherDistrict.vengs[0].name);
                        setCustomDest(null);
                      }
                      if (
                        jobType === 'step_delivery' ||
                        jobType === 'hyperlocal_errand' ||
                        jobType === 'queue_standing'
                      ) {
                        setJobType('heavy_cargo_shift');
                        setAccessType('vehicle_accessible');
                      }
                    }
                  }}
                />
                Inter-District Highway Route
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="origin-veng" className="block text-xs font-medium text-slate-700 mb-1">
                  Origin Veng ({isInterDistrict ? 'All 11 Districts' : `${districtVengs.length} Vengs`})
                </label>
                <select
                  id="origin-veng"
                  value={originName}
                  onChange={(e) => {
                    setOriginName(e.target.value);
                    setCustomOrigin(null);
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  {isInterDistrict
                    ? MIZORAM_DISTRICTS.map((d) => (
                        <optgroup key={d.district} label={`${d.district} (${d.vengs.length} Vengs)`}>
                          {d.vengs.map((v) => (
                            <option key={v.name} value={v.name}>
                              {v.name} · {v.zone} ({v.elevationM}m)
                            </option>
                          ))}
                        </optgroup>
                      ))
                    : districtVengs.map((v) => (
                        <option key={v.name} value={v.name}>
                          {v.name} · {v.zone} ({v.elevationM}m)
                        </option>
                      ))}
                </select>
              </div>

              <div>
                <label htmlFor="dest-veng" className="block text-xs font-medium text-slate-700 mb-1">
                  Destination Veng ({isInterDistrict ? 'All 11 Districts' : `${districtVengs.length} Vengs`})
                </label>
                <select
                  id="dest-veng"
                  value={destName}
                  onChange={(e) => {
                    setDestName(e.target.value);
                    setCustomDest(null);
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  {isInterDistrict
                    ? MIZORAM_DISTRICTS.map((d) => (
                        <optgroup key={d.district} label={`${d.district} (${d.vengs.length} Vengs)`}>
                          {d.vengs.map((v) => (
                            <option key={v.name} value={v.name}>
                              {v.name} · {v.zone} ({v.elevationM}m)
                            </option>
                          ))}
                        </optgroup>
                      ))
                    : districtVengs.map((v) => (
                        <option key={v.name} value={v.name}>
                          {v.name} · {v.zone} ({v.elevationM}m)
                        </option>
                      ))}
                </select>
              </div>
            </div>

            {/* Places Search for precise landmark */}
            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-700">
                Or Search Specific {selectedDistrict} / Mizoram Landmark (Places API)
              </span>
              <PlacesSearchInput
                apiKey={mapsApiKey}
                district={selectedDistrict}
                placeholder={`Search ${districtVengs[0]?.name || selectedDistrict}, ${districtVengs[1]?.name || 'Bazar'}...`}
                onSelect={(pl) => setCustomDest({ lat: pl.lat, lng: pl.lng, label: pl.label })}
              />
            </div>

            {/* Multi-stop support */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700">
                  Intermediate Stops ({stops.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const nextVeng = districtVengs[(stops.length + 2) % districtVengs.length];
                    setStops((prev) => [...prev, { lat: nextVeng.lat, lng: nextVeng.lng, label: nextVeng.name }]);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t.addStop}
                </button>
              </div>
              {stops.map((st, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
                  <span>
                    Stop {idx + 1}: {st.label || 'Waypoint'}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove stop ${idx + 1}`}
                    onClick={() => setStops((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-slate-500 hover:text-red-600 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {jobType === 'heavy_cargo_shift' && (
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={needsWalkerHelper}
                  onChange={(e) => setNeedsWalkerHelper(e.target.checked)}
                  className="rounded border-slate-300 text-teal-700"
                />
                Pair with Category A On-Foot Tirhkah Helper (+Rs. 120 all-inclusive)
              </label>
            )}

            {/* Building Photo + 15s Voice Note Landmark Guide */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <label className="flex items-center justify-center gap-2 min-h-[44px] rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
                <Camera className="w-4 h-4 text-teal-700" />
                {buildingPhotoUrl ? 'Photo Attached (WebP)' : 'Attach Building / Turning Photo'}
                <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              </label>

              <button
                type="button"
                onClick={toggleVoiceRecording}
                className={`flex items-center justify-center gap-2 min-h-[44px] rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  isRecording
                    ? 'border-red-500 bg-red-50 text-red-700'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {isRecording ? <Square className="w-3.5 h-3.5" /> : <Mic className="w-4 h-4 text-teal-700" />}
                {isRecording ? `Recording ${recordedSeconds}s / 15s` : 'Record 15s Voice Landmark'}
              </button>
            </div>

            <div>
              <label htmlFor="voice-transcript" className="block text-xs font-medium text-slate-700 mb-1">
                Voice Note Landmark Guide
              </label>
              <input
                id="voice-transcript"
                type="text"
                value={voiceNoteTranscript}
                onChange={(e) => setVoiceNoteTranscript(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-800"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="declared-val" className="block text-xs font-medium text-slate-700 mb-1">
                  Item Value (Rs.)
                </label>
                <input
                  id="declared-val"
                  type="number"
                  min={0}
                  value={declaredValue}
                  onChange={(e) => setDeclaredValue(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900"
                />
              </div>
              <div>
                <label htmlFor="pay-mode" className="block text-xs font-medium text-slate-700 mb-1">
                  Payment Mode
                </label>
                <select
                  id="pay-mode"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as 'upi_escrow' | 'dynamic_qr_cod')}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="upi_escrow">100% In-App UPI Escrow</option>
                  <option value="dynamic_qr_cod">Dynamic QR COD</option>
                </select>
              </div>
            </div>

            <label className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={microInsuranceOptIn}
                onChange={(e) => setMicroInsuranceOptIn(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-teal-700"
              />
              <span>
                <strong>Embedded Micro-Insurance (Rs. {remoteConfig.microInsuranceSachetRs})</strong> — Sachet transit damage &amp; worker accident cover.
              </span>
            </label>

            {Number(declaredValue) > 5000 && (
              <p className="text-xs text-amber-800 bg-amber-50 rounded-lg p-2.5">
                High-value safeguard (&gt;Rs. 5,000): Strictly matched to Police Verified + Security Deposit partners.
              </p>
            )}

            <div className="flex items-center justify-between border-t border-slate-200 pt-3">
              <div>
                <p className="text-xs text-slate-500">All-Inclusive Final Price (Zero Hidden Fees)</p>
                <p className="text-xl font-bold font-mono text-slate-900">
                  Rs. {estimate?.allInclusiveTotal ?? 65}
                </p>
              </div>
              <button
                type="submit"
                disabled={submittingErrand}
                className="min-h-[44px] rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                {submittingErrand ? 'Posting...' : t.postErrand}
              </button>
            </div>

            {errandFeedback && (
              <p
                role="status"
                className={`rounded-lg p-2.5 text-xs font-medium ${
                  errandFeedback.type === 'ok' ? 'bg-teal-50 text-teal-900' : 'bg-red-50 text-red-800'
                }`}
              >
                {errandFeedback.msg}
              </p>
            )}
          </form>

          {/* Live Map + Incoming Transparent Partner Bids */}
          <div className="lg:col-span-7 space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-900">
                  Live Corridor Map &amp; Active Fleet · {isInterDistrict ? 'All 11 Districts' : selectedDistrict}
                </h2>
                <span className="text-xs font-mono text-slate-600">
                  Est. {estimate?.distanceKm ?? 1.2} km · {districtPartners.filter((p) => p.online).length} Online
                </span>
              </div>
              <MizoramMap
                apiKey={mapsApiKey}
                district={selectedDistrict}
                districtCenter={districtInfo.center}
                districtVengs={districtVengs}
                origin={originPoint}
                stops={stops}
                destination={destPoint}
                partners={districtPartners}
                sosTickets={sosTickets}
              />
            </div>

            {/* Active Errands & Partner Bids */}
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-slate-900">
                Active Errands &amp; Transparent Partner Bids ({errands.length})
              </h3>
              {errands.map((job) => (
                <article
                  key={job.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-slate-500 font-mono">
                        {job.id} · {job.district || 'Aizawl'}{job.isInterDistrict ? ' (Inter-District)' : ''} · {job.jobType} · {job.accessType} · {job.distanceKm} km · OTP {job.otpCode}
                      </p>
                      <h4 className="text-sm font-semibold text-slate-900 mt-0.5">{job.title}</h4>
                      <p className="text-xs text-slate-600 mt-0.5">
                        {job.origin.label || 'Origin'} → {job.destination.label || 'Drop'}
                        {job.stops.length > 0 ? ` (${job.stops.length} stops)` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold font-mono text-slate-900">
                        Rs. {job.allInclusiveTotal}
                      </p>
                      <p className="text-xs text-teal-800 font-medium capitalize">
                        {job.status.replace('_', ' ')}
                      </p>
                    </div>
                  </div>

                  {job.voiceNoteTranscript && (
                    <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
                      Voice Landmark: “{job.voiceNoteTranscript}”
                    </p>
                  )}

                  {job.bids.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      Waiting for eligible category partners to submit bids...
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 border-t border-slate-100 pt-2">
                      {job.bids.map((bid) => (
                        <div
                          key={bid.id}
                          className="flex flex-wrap items-center justify-between gap-3 py-2"
                        >
                          <div>
                            <p className="text-sm font-medium text-slate-900">
                              {bid.partnerName} · <span className="font-mono text-xs">{bid.partnerCategory}</span>
                            </p>
                            <p className="text-xs text-slate-600">
                              ★ {bid.partnerRating} · ETA {bid.etaMinutes} min ·{' '}
                              {bid.partnerBadges.join(' · ')}
                              {bid.corridorMatchMeters !== null ? ` · ${bid.corridorMatchMeters}m corridor` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-bold font-mono text-slate-900">
                              Rs. {bid.bidAmount}
                            </span>
                            {job.status === 'bidding' ? (
                              <button
                                type="button"
                                onClick={() => handleSelectBid(job.id, bid.id)}
                                className="min-h-[40px] rounded-lg bg-teal-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
                              >
                                Choose Partner
                              </button>
                            ) : (
                              job.selectedBidId === bid.id && (
                                <span className="text-xs font-semibold text-teal-700">Selected</span>
                              )
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: HYPERLOCAL MARKETPLACE + CHECK-BEFORE-PAY */}
      {activeTab === 'marketplace' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{t.checkBeforePayTitle}</h2>
              <p className="text-xs text-slate-600 mt-1">{t.checkBeforePayDesc}</p>
              <p className="text-xs font-mono text-slate-700 mt-1">
                Monthly returns used: {userMonthlyReturns['cust-1'] ?? 0}/{remoteConfig.monthlyReturnLimit} · Return Fee: Rs. {remoteConfig.returnDeliveryFee}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={mktInsurance}
                  onChange={(e) => setMktInsurance(e.target.checked)}
                />
                +Rs. {remoteConfig.microInsuranceSachetRs} Micro-Insurance
              </label>
              <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 max-w-full">
                <button
                  type="button"
                  onClick={() => {
                    setMktDistrictFilter('all');
                    setSelectedVengFilter('All');
                  }}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                    mktDistrictFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  {t.allDistrictsLabel}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMktDistrictFilter('selected');
                    setSelectedVengFilter('All');
                  }}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                    mktDistrictFilter === 'selected' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  {selectedDistrict} Only
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 max-w-full">
                {vailableVengs.map((veng) => (
                  <button
                    key={veng}
                    type="button"
                    onClick={() => setSelectedVengFilter(veng)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                      selectedVengFilter === veng ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    {veng}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {!effectiveVisibility.marketplace && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
              {t.sundayBanner}
            </div>
          )}

          {mktFeedback && (
            <p
              role="status"
              className={`rounded-xl p-3 text-xs font-medium ${
                mktFeedback.type === 'ok' ? 'bg-teal-50 text-teal-900' : 'bg-red-50 text-red-800'
              }`}
            >
              {mktFeedback.msg}
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredProducts.map((product) => (
              <article
                key={product.id}
                className="rounded-2xl border border-slate-200 bg-white overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="aspect-[4/3] bg-slate-100 overflow-hidden">
                    <img
                      src={product.imageUrl}
                      alt={product.titleEn}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="p-4 space-y-2">
                    <p className="text-xs text-slate-500">
                      {product.shopName} · {product.veng} ({product.district || 'Aizawl'}) · {product.category}
                    </p>
                    <h3 className="text-base font-semibold text-slate-900">
                      {lang === 'miz' ? product.titleMiz : product.titleEn}
                    </h3>
                    <p className="text-xs text-slate-600">
                      {lang === 'miz' ? product.titleEn : product.titleMiz} · {product.color} · {product.size}
                    </p>
                    <p className="text-xs font-medium text-slate-700">
                      {product.checkBeforePayEligible
                        ? 'Eligible for En Hmasak Phawt (Open-Box Check)'
                        : `Hygiene Exclusion (${product.hygieneCategory.replace('_', ' ')}): Sealed delivery only`}
                    </p>
                  </div>
                </div>
                <div className="border-t border-slate-100 p-4 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-slate-500">All-Inclusive (+Rs. 55 delivery)</p>
                    <p className="text-lg font-bold font-mono text-slate-900">
                      Rs. {product.price + 55 + (mktInsurance ? remoteConfig.microInsuranceSachetRs : 0)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!effectiveVisibility.marketplace}
                    onClick={() => handlePlaceMarketplaceOrder(product.id)}
                    className="min-h-[44px] rounded-xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-40"
                  >
                    Order Now
                  </button>
                </div>
              </article>
            ))}
          </div>

          {orders.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-slate-900">
                Doorstep Inspection &amp; Direct Merchant Chat ({orders.length})
              </h3>
              {orders.map((ord) => (
                <div key={ord.id} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-mono text-slate-500">
                        {ord.id} · {ord.shopName} ({ord.veng}) · Status: {ord.status.replace(/_/g, ' ')}
                      </p>
                      <h4 className="text-sm font-semibold text-slate-900">{ord.productTitle}</h4>
                    </div>
                    {ord.status === 'awaiting_inspection' && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleInspectOrder(ord.id, 'accept')}
                          className="min-h-[40px] rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          Accept &amp; Pay Rs. {ord.allInclusiveTotal}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleInspectOrder(ord.id, 'reject')}
                          className="min-h-[40px] rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                        >
                          Reject (Charge Rs. {ord.returnFeeOnReject} Return Fee)
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Direct Customer-to-Merchant In-App Chat */}
                  <div className="rounded-xl bg-slate-50 p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span className="font-medium">Direct Merchant Chat</span>
                      <span className="inline-flex items-center gap-1 font-mono text-teal-800">
                        <PhoneCall className="w-3 h-3" /> In-App Call Ready
                      </span>
                    </div>
                    <div className="space-y-1 max-h-28 overflow-auto">
                      {ord.chatMessages.map((m, i) => (
                        <p key={i} className="text-xs text-slate-800">
                          <strong className="capitalize">{m.sender}:</strong> {m.text}
                        </p>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={chatDrafts[ord.id] || ''}
                        onChange={(e) => setChatDrafts((p) => ({ ...p, [ord.id]: e.target.value }))}
                        placeholder="Message shop owner..."
                        className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => handleSendMerchantChat(ord.id)}
                        className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white inline-flex items-center gap-1"
                      >
                        <Send className="w-3 h-3" /> Send
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: HOME WORKFORCE & COMPANY-MANAGED STAFFING */}
      {activeTab === 'workforce' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{t.workforceTitle}</h2>
                <p className="text-xs text-slate-600">
                  Practical skill test scores, grooming certification, Outstation/Live-In safety checks &amp; instant replacement guarantee.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 max-w-full">
                {(
                  [
                    ['all', 'All Tiers'],
                    ['on_demand_workforce', 'On-Demand Workforce'],
                    ['company_managed_staffing', 'Company-Managed Awmpui & Driver'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setStaffFilter(key)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium text-left ${
                      staffFilter === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Mandatory Outstation / Live-In Protocol Checkboxes */}
            <div className="rounded-xl bg-slate-50 p-4 space-y-2 border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                  <input
                    type="checkbox"
                    checked={outstationMode}
                    onChange={(e) => setOutstationMode(e.target.checked)}
                  />
                  Booking for Outstation / Live-In (Stay-Over) Placement
                </label>
                <span className="text-xs text-slate-500">Mandatory digital contract safeguards</span>
              </div>
              <div className="flex flex-wrap gap-4 pt-1 text-xs text-slate-700">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={accChecked} onChange={(e) => setAccChecked(e.target.checked)} />
                  Safe Accommodation Provided
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={foodChecked} onChange={(e) => setFoodChecked(e.target.checked)} />
                  Daily Meals / Food Provided
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={travelChecked} onChange={(e) => setTravelChecked(e.target.checked)} />
                  Outstation Travel Covered
                </label>
              </div>
            </div>

            {staffFeedback && (
              <p
                role="status"
                className={`rounded-lg p-3 text-xs font-medium ${
                  staffFeedback.type === 'ok' ? 'bg-teal-50 text-teal-900' : 'bg-red-50 text-red-800'
                }`}
              >
                {staffFeedback.msg}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {filteredWorkforce.map((worker) => (
              <article key={worker.id} className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={worker.avatarUrl}
                      alt={worker.name}
                      referrerPolicy="no-referrer"
                      className="h-14 w-14 rounded-xl object-cover shrink-0 bg-slate-100"
                    />
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">{worker.name}</h3>
                      <p className="text-xs text-slate-600">
                        {worker.veng}{worker.district ? `, ${worker.district}` : ''} · ★ {worker.rating} · Skill {worker.practicalSkillScore}/100
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-medium text-slate-800">
                    {lang === 'miz' ? worker.roleTitleMiz : worker.roleTitle}
                  </p>
                  <p className="text-xs text-slate-600">{worker.skills.join(' · ')}</p>
                  <p className="text-xs text-teal-800 font-medium">
                    {worker.groomingTrainingStatus}
                    {worker.replacementGuarantee ? ' · Instant Replacement Guarantee' : ''}
                  </p>
                </div>

                <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500">
                      {worker.monthlyPackageRate ? 'Monthly All-Inclusive' : 'Daily Rate'}
                    </p>
                    <p className="text-base font-bold font-mono text-slate-900">
                      Rs. {(worker.monthlyPackageRate || worker.dailyRate || 1100).toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleBookWorker(worker)}
                    className="min-h-[44px] rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    Generate Contract &amp; Book
                  </button>
                </div>
              </article>
            ))}
          </div>

          {staffingBookings.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
              <h3 className="text-base font-semibold text-slate-900">Active Digital Contracts &amp; Worker Safety</h3>
              {staffingBookings.map((b) => (
                <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {b.workerName} · Contract <span className="font-mono">{b.contractId}</span>
                    </p>
                    <p className="text-xs text-slate-600">
                      {b.tripartiteAgreement ? 'Tripartite Managed Payroll Agreement' : 'Outstation / Daily Contract'} · Rs. {b.allInclusiveAmount.toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTriggerWorkerSos(b.id)}
                    className={`min-h-[40px] rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      b.workerSosActive
                        ? 'bg-red-600 text-white'
                        : 'border border-red-300 text-red-700 hover:bg-red-50'
                    }`}
                  >
                    {b.workerSosActive ? 'Worker SOS Active' : 'Worker Safety SOS'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: 24x7 RAPID EMERGENCY RESPONSE CENTER */}
      {activeTab === 'sos' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleDispatchSos}
            className="lg:col-span-5 rounded-2xl border border-red-200 bg-white p-5 space-y-4"
          >
            <div className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5" />
              <h2 className="text-lg font-bold text-slate-900">{t.sosTitle}</h2>
            </div>
            <p className="text-xs text-slate-600">
              Salaried 24×7 Company-Verified shift technicians stationed across all 11 District Capitals · 15–30 min arrival SLA.
            </p>

            <div>
              <label htmlFor="sos-category" className="block text-xs font-medium text-slate-700 mb-1">
                Emergency Service Type
              </label>
              <select
                id="sos-category"
                value={sosCategory}
                onChange={(e) => setSosCategory(e.target.value as EmergencyCategory)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="plumber_water">Plumber &amp; Water Emergency (Rs. 450 · 20m SLA)</option>
                <option value="electrician_power">Electrician &amp; Power Short-Circuit (Rs. 500 · 20m SLA)</option>
                <option value="roadside_mechanic_towing">Roadside Mechanic &amp; Towing (Rs. 650 · 25m SLA)</option>
                <option value="locksmith">Locksmith Home/Vehicle Lockout (Rs. 550 · 20m SLA)</option>
                <option value="medical_urgent_cab">Medical &amp; Urgent Night Cab / Oxygen (Rs. 400 · 15m SLA)</option>
              </select>
            </div>

            <div>
              <label htmlFor="sos-veng" className="block text-xs font-medium text-slate-700 mb-1">
                GPS Auto-Location / Veng ({selectedDistrict} · {districtVengs.length} Vengs)
              </label>
              <select
                id="sos-veng"
                value={sosVeng}
                onChange={(e) => setSosVeng(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                {districtVengs.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name} ({v.lat.toFixed(4)}, {v.lng.toFixed(4)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="sos-voice" className="block text-xs font-medium text-slate-700 mb-1">
                Emergency Voice Note / Situation Details
              </label>
              <textarea
                id="sos-voice"
                rows={3}
                value={sosVoiceNote}
                onChange={(e) => setSosVoiceNote(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <button
              type="submit"
              className="w-full min-h-[48px] rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white hover:bg-red-700 transition-colors"
            >
              One-Tap Red SOS Dispatch ({selectedDistrict})
            </button>

            {sosFeedback && (
              <p role="status" className="rounded-lg bg-red-50 p-3 text-xs font-medium text-red-900">
                {sosFeedback.msg}
              </p>
            )}
          </form>

          <div className="lg:col-span-7 space-y-4">
            <h3 className="text-base font-semibold text-slate-900">
              Live 24×7 Emergency Dispatches ({sosTickets.length})
            </h3>
            {sosTickets.map((ticket) => (
              <article key={ticket.id} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-mono text-red-700 font-semibold">
                      {ticket.id} · {ticket.category.replace(/_/g, ' ')} · {ticket.veng} ({ticket.district || 'Aizawl'})
                    </p>
                    <h4 className="text-sm font-semibold text-slate-900 mt-0.5">
                      Technician: {ticket.assignedTechName} ({ticket.assignedTechShift})
                    </h4>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold font-mono text-slate-900">
                      Rs. {ticket.standardizedRate + ticket.sparePartsAmount}
                    </p>
                    <p className="text-xs text-slate-500">
                      Target SLA: {ticket.slaTargetMinutes} min · Status: {ticket.status.replace('_', ' ')}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-600">Voice Note: “{ticket.voiceNoteTranscript}”</p>
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
                  <span className="inline-flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-teal-700" /> Salaried Company Technician
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-red-600" /> {ticket.lat.toFixed(4)}, {ticket.lng.toFixed(4)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-slate-600" /> Spare Parts: Rs. {ticket.sparePartsAmount}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

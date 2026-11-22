import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Ambulance,
  Bike,
  Briefcase,
  Camera,
  Car,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Crosshair,
  Droplets,
  Flame,
  Footprints,
  Fuel,
  KeyRound,
  Map as MapIcon,
  MapPin,
  MessageCircle,
  Mic,
  Mountain,
  Package,
  PhoneCall,
  Pill,
  Plus,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Square,
  Star,
  Stethoscope,
  Trash2,
  Truck,
  Wallet,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import type {
  AccessType,
  AppRemoteConfig,
  CustomerWalletState,
  EmergencyCategory,
  EmergencySosTicket,
  ErrandJobType,
  ErrandRequest,
  KailawnStepTier,
  Language,
  LatLng,
  MarketplaceOrder,
  MarketplaceProduct,
  MizoramDistrict,
  MizoramLandmarkAddress,
  PartnerProfile,
  SavedPlace,
  StaffingBooking,
  SumoParcelBooking,
  WorkforceMember,
} from '../shared/types';
import { TRANSLATIONS } from '../i18n/translations';
import {
  MIZORAM_DISTRICTS,
  findAnyMizoramVeng,
  getDistrictInfo,
  getVengsForDistrict,
} from '../data/mizoramDistricts';
import { compressImageToWebP } from '../lib/offlineCache';
import { dataUrlToBlob, uploadMediaFile } from '../lib/mediaUpload';
import {
  resolveAddressFromCoords,
  startLiveGpsWatch,
  type LiveGpsFix,
  type LiveLocationWatcher,
  type ResolvedLocationAddress,
} from '../lib/geolocation';
import { triggerHaptic } from '../lib/nativeBridge';
import { getFirebaseIdToken, useFirebaseAuth } from '../lib/firebase';
import {
  publishLiveOrderToFirestore,
  publishSosAlertToFirestore,
  subscribeDistrictOrders,
  subscribeDistrictRunners,
  subscribeDistrictSos,
} from '../lib/firestoreSync';
import type { UserAppSettings } from '../lib/userSettings';
import { LayerWindow } from './LayerWindow';
import { CustomerDetailLayers } from './CustomerDetailLayers';
import { UniversalSearchBar } from './UniversalSearchBar';
import { WalletRewardsWindow } from './WalletRewardsWindow';
import { SumoParcelWindow } from './SumoParcelWindow';
import { LiveTripTrackerBar } from './LiveTripTrackerBar';
import { VoiceNoteRecorder, type VoiceNoteValue } from './VoiceNoteRecorder';
import { CameraCaptureModal } from './CameraCaptureModal';
import { MapPinPickerWindow, type PinPickerMode } from './MapPinPickerWindow';

const LazyMizoramMap = lazy(() =>
  import('./MizoramMap').then((m) => ({ default: m.MizoramMap }))
);
const LazyPlacesSearchInput = lazy(() =>
  import('./MizoramMap').then((m) => ({ default: m.PlacesSearchInput }))
);

export type CustomerTab = 'errands' | 'marketplace' | 'workforce' | 'sos';

interface CustomerViewProps {
  lang: Language;
  selectedDistrict: MizoramDistrict;
  onChangeDistrict: (d: MizoramDistrict) => void;
  onOpenDistrictPicker?: () => void;
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
  customerWallet: CustomerWalletState;
  sumoParcels: SumoParcelBooking[];
  userSettings: UserAppSettings;
  onUpdateUserSettings: (patch: Partial<UserAppSettings>) => void;
  onOpenSettings?: () => void;
  onOpenApply?: () => void;
  onOpenStaffPortal?: () => void;
  onRefresh: () => Promise<void>;
}

const HERO_IMG = '/src/assets/images/zorun_hero_aizawl_twilight_1795274240109.jpg';

const VOICE_ORDER_PRESETS: Array<{
  labelMiz: string;
  labelEn: string;
  jobType: ErrandJobType;
  title: string;
  note: string;
}> = [
  {
    labelMiz: 'Gas cylinder lak',
    labelEn: 'Gas Cylinder Run',
    jobType: 'step_delivery',
    title: 'LPG Gas cylinder lak leh in chhung thleng dah',
    note: 'Empty cylinder ready at main gate steps.',
  },
  {
    labelMiz: 'Damdawi lei',
    labelEn: 'Urgent Pharmacy',
    jobType: 'bike_express',
    title: 'Pharmacy atanga damdawi lei leh thlen nghal',
    note: 'Prescription photo ready on chat.',
  },
  {
    labelMiz: 'Bazar thil lak',
    labelEn: 'Bara Bazar Run',
    jobType: 'step_delivery',
    title: 'Bara Bazar chawhmeh leh thil mamawh lak',
    note: 'Call before leaving market steps.',
  },
  {
    labelMiz: 'Sumo counter-ah thil dah',
    labelEn: 'Sumo Counter Drop',
    jobType: 'bike_express',
    title: 'Zarkawt / Thuampui Sumo Counter-ah parcel dah',
    note: 'Hand over to driver and send counter receipt.',
  },
];

export const CustomerView: React.FC<CustomerViewProps> = ({
  lang,
  selectedDistrict,
  onChangeDistrict,
  onOpenDistrictPicker,
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
  customerWallet,
  sumoParcels,
  userSettings,
  onUpdateUserSettings,
  onOpenApply,
  onOpenStaffPortal,
  onRefresh,
}) => {
  const t = TRANSLATIONS[lang];
  const districtInfo = useMemo(() => getDistrictInfo(selectedDistrict), [selectedDistrict]);
  const districtVengs = districtInfo.vengs;

  // =========================================================================
  // LAYERED WINDOW / POPUP SYSTEM STATE (Zero Endless Scrolling)
  // =========================================================================
  const [bookingSheetOpen, setBookingSheetOpen] = useState(false);
  const [mapLayerOpen, setMapLayerOpen] = useState(false);
  const [activityLayerOpen, setActivityLayerOpen] = useState(false);
  const [quickSosLayerOpen, setQuickSosLayerOpen] = useState(false);
  const [sosTicketsLayerOpen, setSosTicketsLayerOpen] = useState(false);
  const [walletLayerOpen, setWalletLayerOpen] = useState(false);
  const [sumoLayerOpen, setSumoLayerOpen] = useState(false);

  // Marketplace Layered Popups (Layer 1: Product Detail / Orders -> Layer 2: Shop Chat)
  const [selectedProduct, setSelectedProduct] = useState<MarketplaceProduct | null>(null);
  const [ordersLayerOpen, setOrdersLayerOpen] = useState(false);
  const [activeChatOrderId, setActiveChatOrderId] = useState<string | null>(null);

  // Workforce Layered Popups (Worker Profile & Safeguards Booking / Active Contracts)
  const [selectedWorker, setSelectedWorker] = useState<WorkforceMember | null>(null);
  const [contractsLayerOpen, setContractsLayerOpen] = useState(false);

  // Layer 2 Comprehensive Full-Detail Inspection IDs (live-synced against latest props)
  const [detailErrandId, setDetailErrandId] = useState<string | null>(null);
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [detailContractId, setDetailContractId] = useState<string | null>(null);
  const [detailSosId, setDetailSosId] = useState<string | null>(null);

  // Low-Data Map opt-in & SOS 2-step confirmation state
  const [forceLoadMapInLowData, setForceLoadMapInLowData] = useState(false);
  const [sosConfirmArmed, setSosConfirmArmed] = useState(false);

  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

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
  const [kailawnNeeded, setKailawnNeeded] = useState(false);
  const [kailawnStepTier, setKailawnStepTier] = useState<KailawnStepTier>('steps_15_40');
  const [pickupYmaSection, setPickupYmaSection] = useState('');
  const [pickupNearestLandmark, setPickupNearestLandmark] = useState('');
  const [dropYmaSection, setDropYmaSection] = useState('');
  const [dropNearestLandmark, setDropNearestLandmark] = useState('');
  const [locatingOriginGps, setLocatingOriginGps] = useState(false);
  const [locatingDropGps, setLocatingDropGps] = useState(false);
  const [liveUserGps, setLiveUserGps] = useState<LiveGpsFix | null>(null);
  const [gpsStatusBanner, setGpsStatusBanner] = useState<string | null>(null);
  const [pinPickerState, setPinPickerState] = useState<{ open: boolean; mode: PinPickerMode }>({
    open: false,
    mode: 'pickup',
  });
  const [gateCameraOpen, setGateCameraOpen] = useState(false);
  const activeGpsWatcherRef = useRef<LiveLocationWatcher | null>(null);
  const lastDistrictRef = useRef<MizoramDistrict>(selectedDistrict);
  const skipNextDistrictResetRef = useRef(false);

  const [needsWalkerHelper, setNeedsWalkerHelper] = useState(false);
  const [declaredValue, setDeclaredValue] = useState('650');
  const [paymentMethod, setPaymentMethod] = useState<'upi_escrow' | 'dynamic_qr_cod'>(
    userSettings.defaultPaymentMethod
  );
  const [microInsuranceOptIn, setMicroInsuranceOptIn] = useState(userSettings.defaultMicroInsurance);
  const [buildingPhotoUrl, setBuildingPhotoUrl] = useState<string>('');
  const [voiceNoteTranscript, setVoiceNoteTranscript] = useState(
    'Gate beside concrete steps, blue railing on right.'
  );
  const [errandVoiceNote, setErrandVoiceNote] = useState<VoiceNoteValue | null>(null);
  const { user, effectiveRole } = useFirebaseAuth();
  const [liveFirestoreRunnersCount, setLiveFirestoreRunnersCount] = useState<number | null>(null);
  const [liveFirestoreOrdersCount, setLiveFirestoreOrdersCount] = useState<number | null>(null);
  const [liveFirestoreSosCount, setLiveFirestoreSosCount] = useState<number | null>(null);
  const [estimate, setEstimate] = useState<{
    distanceKm: number;
    durationMinutes?: number;
    distanceSource?: 'google_routes_v2' | 'mizoram_terrain_estimate';
    allInclusiveTotal: number;
    microInsuranceFee: number;
    kailawnSurchargeRs?: number;
    corridorMatches: Array<{ partnerId: string; name: string; corridorMeters: number; within500m: boolean }>;
  } | null>(null);
  const [submittingErrand, setSubmittingErrand] = useState(false);
  const [errandFeedback, setErrandFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Marketplace State
  const [mktDistrictFilter, setMktDistrictFilter] = useState<'all' | 'selected'>('selected');
  const [selectedVengFilter, setSelectedVengFilter] = useState('All');
  const [mktInsurance, setMktInsurance] = useState(userSettings.defaultMicroInsurance);
  const [mktVoiceNote, setMktVoiceNote] = useState<VoiceNoteValue | null>(null);
  const [mktFeedback, setMktFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [chatDrafts, setChatDrafts] = useState<Record<string, string>>({});
  const [placingOrder, setPlacingOrder] = useState(false);

  // Workforce & Staffing State
  const [staffFilter, setStaffFilter] = useState<'all' | 'on_demand_workforce' | 'company_managed_staffing'>('all');
  const [outstationMode, setOutstationMode] = useState(false);
  const [accChecked, setAccChecked] = useState(false);
  const [foodChecked, setFoodChecked] = useState(false);
  const [travelChecked, setTravelChecked] = useState(false);
  const [staffFeedback, setStaffFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [bookingWorker, setBookingWorker] = useState(false);

  // 24x7 SOS State
  const [sosGroupFilter, setSosGroupFilter] = useState<'all' | 'medical_safety' | 'home_utility' | 'road_monsoon'>('all');
  const [sosCategory, setSosCategory] = useState<EmergencyCategory>('plumber_water');
  const [sosVeng, setSosVeng] = useState('Kulikawn');
  const [sosLiveGps, setSosLiveGps] = useState<{ lat: number; lng: number } | null>(null);
  const [locatingSosGps, setLocatingSosGps] = useState(false);
  const [sosVoiceNote, setSosVoiceNote] = useState('Burst main pipe near hillside tank, urgent shutdown needed.');
  const [sosFeedback, setSosFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [dispatchingSos, setDispatchingSos] = useState(false);

  useEffect(() => {
    setPaymentMethod(userSettings.defaultPaymentMethod);
    setMicroInsuranceOptIn(userSettings.defaultMicroInsurance);
    setMktInsurance(userSettings.defaultMicroInsurance);
  }, [userSettings.defaultPaymentMethod, userSettings.defaultMicroInsurance]);

  useEffect(() => {
    if (!mapLayerOpen) {
      setForceLoadMapInLowData(false);
    }
  }, [mapLayerOpen]);

  useEffect(() => {
    if (!sosConfirmArmed) return;
    const timer = setTimeout(() => setSosConfirmArmed(false), 6000);
    return () => clearTimeout(timer);
  }, [sosConfirmArmed]);

  useEffect(() => {
    return () => {
      activeGpsWatcherRef.current?.stop();
    };
  }, []);

  // Subscribe to district-scoped Firestore live collections when signed in with a verified account
  useEffect(() => {
    if (!user) {
      setLiveFirestoreRunnersCount(null);
      setLiveFirestoreOrdersCount(null);
      setLiveFirestoreSosCount(null);
      return;
    }
    const isAdmin = effectiveRole === 'SUPER_ADMIN';
    const unsubRunners = subscribeDistrictRunners(selectedDistrict, isAdmin, (rows) => {
      setLiveFirestoreRunnersCount(rows.length);
    });
    const unsubOrders = subscribeDistrictOrders(selectedDistrict, user.uid, isAdmin, (rows) => {
      setLiveFirestoreOrdersCount(rows.length);
    });
    const unsubSos = subscribeDistrictSos(selectedDistrict, user.uid, isAdmin, (rows) => {
      setLiveFirestoreSosCount(rows.length);
    });
    return () => {
      unsubRunners();
      unsubOrders();
      unsubSos();
    };
  }, [user, effectiveRole, selectedDistrict]);

  useEffect(() => {
    if (lastDistrictRef.current === selectedDistrict) return;
    lastDistrictRef.current = selectedDistrict;

    if (skipNextDistrictResetRef.current) {
      skipNextDistrictResetRef.current = false;
      return;
    }

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

  useEffect(() => {
    const hasLocalProducts = products.some(
      (p) => (p.district || 'Aizawl') === selectedDistrict
    );
    setMktDistrictFilter(hasLocalProducts ? 'selected' : 'all');
  }, [selectedDistrict, products]);

  const originPoint = useMemo(() => customOrigin || findAnyMizoramVeng(originName), [customOrigin, originName]);
  const destPoint = useMemo(() => customDest || findAnyMizoramVeng(destName), [customDest, destName]);

  const kailawnSurchargePreview = useMemo(() => {
    if (!kailawnNeeded) return 0;
    if (kailawnStepTier === 'steps_0_15') return 15;
    if (kailawnStepTier === 'steps_15_40') return 35;
    if (kailawnStepTier === 'steps_40_plus') return 65;
    return 0;
  }, [kailawnNeeded, kailawnStepTier]);

  // Instant client-side fare preview (0ms), plus debounced server verification when Booking or Map Layer is open
  const instantFarePreview = useMemo(() => {
    const base =
      jobType === 'bike_express'
        ? remoteConfig.baseBikeRate
        : jobType === 'auto_cab_ride'
          ? remoteConfig.baseAutoTaxiRate
          : jobType === 'heavy_cargo_shift'
            ? remoteConfig.basePickupRate
            : remoteConfig.baseWalkerRate;
    const helper = needsWalkerHelper ? 120 : 0;
    const ins = microInsuranceOptIn ? remoteConfig.microInsuranceSachetRs : 0;
    return Math.round(
      base * remoteConfig.rainSurgeMultiplier +
        stops.length * 15 +
        helper +
        kailawnSurchargePreview +
        ins
    );
  }, [
    jobType,
    remoteConfig,
    stops.length,
    needsWalkerHelper,
    kailawnSurchargePreview,
    microInsuranceOptIn,
  ]);

  useEffect(() => {
    if (!bookingSheetOpen && !mapLayerOpen) return;
    let active = true;
    const timer = setTimeout(() => {
      fetch('/api/errands/fare', {
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
          kailawnNeeded,
          kailawnStepTier: kailawnNeeded ? kailawnStepTier : 'none',
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
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    bookingSheetOpen,
    mapLayerOpen,
    selectedDistrict,
    isInterDistrict,
    jobType,
    originPoint,
    stops,
    destPoint,
    needsWalkerHelper,
    kailawnNeeded,
    kailawnStepTier,
    microInsuranceOptIn,
    remoteConfig,
  ]);

  const openBookingForTier = (nextType: ErrandJobType) => {
    triggerHaptic('light');
    setJobType(nextType);
    if (
      nextType === 'step_delivery' ||
      nextType === 'hyperlocal_errand' ||
      nextType === 'queue_standing' ||
      nextType === 'truck_helper'
    ) {
      setAccessType('long_steps_walk');
    } else {
      setAccessType('vehicle_accessible');
    }
    setBookingSheetOpen(true);
  };

  const applyResolvedLocation = (mode: PinPickerMode, resolved: ResolvedLocationAddress) => {
    if (!resolved.isOutsideMizoram && resolved.district !== selectedDistrict) {
      if (mode === 'pickup' || mode === 'sos') {
        skipNextDistrictResetRef.current = true;
        onChangeDistrict(resolved.district);
      } else {
        setIsInterDistrict(true);
      }
    }

    const coordLabel = `${resolved.veng} (${resolved.lat.toFixed(4)}, ${resolved.lng.toFixed(4)})`;

    if (mode === 'pickup') {
      setOriginName(resolved.veng);
      setCustomOrigin({
        lat: resolved.lat,
        lng: resolved.lng,
        label: coordLabel,
      });
      setPickupNearestLandmark(resolved.landmark);
      setPickupYmaSection((prev) => prev || `${resolved.zone} Zone`);
      setGpsStatusBanner(
        lang === 'miz'
          ? `Pickup auto-filled: ${resolved.veng} (${resolved.district})${resolved.accuracyMeters ? ` · ±${resolved.accuracyMeters}m` : ''}`
          : `Pickup auto-filled: ${resolved.veng} (${resolved.district})${resolved.accuracyMeters ? ` · ±${resolved.accuracyMeters}m` : ''}`
      );
    } else if (mode === 'drop') {
      setDestName(resolved.veng);
      setCustomDest({
        lat: resolved.lat,
        lng: resolved.lng,
        label: coordLabel,
      });
      setDropNearestLandmark(resolved.landmark);
      setDropYmaSection((prev) => prev || `${resolved.zone} Zone`);
      setGpsStatusBanner(
        lang === 'miz'
          ? `Drop auto-filled: ${resolved.veng} (${resolved.district})${resolved.accuracyMeters ? ` · ±${resolved.accuracyMeters}m` : ''}`
          : `Drop auto-filled: ${resolved.veng} (${resolved.district})${resolved.accuracyMeters ? ` · ±${resolved.accuracyMeters}m` : ''}`
      );
    } else {
      setSosVeng(resolved.veng);
      setSosLiveGps({ lat: resolved.lat, lng: resolved.lng });
      setSosFeedback({
        type: 'ok',
        msg:
          lang === 'miz'
            ? `SOS GPS Lock: ${resolved.veng} (${resolved.district}) · ${resolved.landmark}`
            : `SOS GPS Locked: ${resolved.veng} (${resolved.district}) · ${resolved.landmark}`,
      });
    }
  };

  const runLiveGpsAutoFill = (target: 'pickup' | 'drop') => {
    triggerHaptic('medium');
    activeGpsWatcherRef.current?.stop();

    if (target === 'pickup') {
      setLocatingOriginGps(true);
    } else {
      setLocatingDropGps(true);
    }

    activeGpsWatcherRef.current = startLiveGpsWatch(
      (fix) => {
        setLiveUserGps(fix);
        void resolveAddressFromCoords(fix.lat, fix.lng, selectedDistrict, fix.accuracyMeters).then(
          (resolved) => {
            applyResolvedLocation(target, resolved);
            if (fix.quality === 'high' || fix.quality === 'medium') {
              if (target === 'pickup') setLocatingOriginGps(false);
              else setLocatingDropGps(false);
              triggerHaptic('success');
            }
          }
        );
      },
      (errMsg) => {
        setLocatingOriginGps(false);
        setLocatingDropGps(false);
        setGpsStatusBanner(errMsg);
      },
      { maxAutoRefineMs: 9000 }
    );

    setTimeout(() => {
      setLocatingOriginGps(false);
      setLocatingDropGps(false);
    }, 9200);
  };

  const handlePinOriginGps = () => runLiveGpsAutoFill('pickup');
  const handlePinDropGps = () => runLiveGpsAutoFill('drop');

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const webp = await compressImageToWebP(file, 800);
      const blob = await dataUrlToBlob(webp);
      const uploaded = await uploadMediaFile({
        file: blob,
        filename: `gate-${Date.now()}.webp`,
        category: 'proof_photo',
        district: selectedDistrict,
      });
      setBuildingPhotoUrl(uploaded.url || webp);
      triggerHaptic('success');
    } catch {
      setErrandFeedback({ type: 'err', msg: 'Could not process image file.' });
    }
  };

  const handleCreateErrand = async (e: React.FormEvent) => {
    e.preventDefault();
    triggerHaptic('booking');
    const taskTitle =
      title.trim() ||
      (jobType === 'step_delivery'
        ? `Runner step delivery: ${originName} → ${destName}`
        : jobType === 'bike_express'
          ? `Bike express parcel: ${originName} → ${destName}`
          : jobType === 'auto_cab_ride'
            ? `Cab / Auto ride: ${originName} → ${destName}`
            : `Pickup cargo shift: ${originName} → ${destName}`);

    setSubmittingErrand(true);
    setErrandFeedback(null);
    const pickupLandmark: MizoramLandmarkAddress = {
      veng: originName,
      ymaSection: pickupYmaSection.trim() || undefined,
      nearestLandmark: pickupNearestLandmark.trim() || undefined,
      gpsPinned: Boolean(customOrigin),
    };
    const dropLandmark: MizoramLandmarkAddress = {
      veng: destName,
      ymaSection: dropYmaSection.trim() || undefined,
      nearestLandmark: dropNearestLandmark.trim() || undefined,
      gpsPinned: Boolean(customDest),
    };
    const combinedTranscript = [
      errandVoiceNote?.noteText || voiceNoteTranscript,
      dropNearestLandmark.trim() ? `Landmark: ${dropNearestLandmark.trim()}` : '',
      dropYmaSection.trim() ? `YMA ${dropYmaSection.trim()}` : '',
    ]
      .filter(Boolean)
      .join(' · ');

    try {
      const idToken = getFirebaseIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (idToken) headers['X-Firebase-Id-Token'] = idToken;

      const res = await fetch('/api/errands/jobs', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: taskTitle,
          district: selectedDistrict,
          isInterDistrict,
          jobType,
          origin: originPoint,
          stops,
          destination: destPoint,
          accessType,
          kailawnNeeded,
          kailawnStepTier: kailawnNeeded ? kailawnStepTier : 'none',
          pickupLandmark,
          dropLandmark,
          needsWalkerHelper,
          buildingPhotoUrl: buildingPhotoUrl || undefined,
          voiceNoteUrl: errandVoiceNote?.audioUrl || undefined,
          voiceNoteDurationSec: errandVoiceNote?.durationSec || undefined,
          voiceNoteTranscript: combinedTranscript,
          declaredValue: Number(declaredValue) || 0,
          paymentMethod,
          microInsuranceOptIn,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        triggerHaptic('error');
        setErrandFeedback({ type: 'err', msg: data.error || 'Failed to create errand' });
      } else {
        triggerHaptic('success');
        void publishLiveOrderToFirestore(data.job);
        setTitle('');
        setErrandVoiceNote(null);
        setBookingSheetOpen(false);
        setErrandFeedback({
          type: 'ok',
          msg:
            lang === 'miz'
              ? `Order ${data.job.id} dah fel a ni! Handover OTP: ${data.job.otpCode}`
              : `Request ${data.job.id} is live! Your Handover OTP: ${data.job.otpCode}`,
        });
        await onRefresh();
        setActivityLayerOpen(true);
      }
    } catch {
      triggerHaptic('error');
      setErrandFeedback({ type: 'err', msg: 'Network error posting request.' });
    } finally {
      setSubmittingErrand(false);
    }
  };

  const handleSelectBid = async (jobId: string, bidId: string) => {
    triggerHaptic('booking');
    try {
      const res = await fetch(`/api/errands/jobs/${jobId}/select-bid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bidId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        triggerHaptic('error');
        setErrandFeedback({ type: 'err', msg: data.error || 'Could not confirm partner.' });
        return;
      }
      triggerHaptic('success');
      setErrandFeedback({
        type: 'ok',
        msg:
          lang === 'miz'
            ? 'Partner thlan fel a ni! Escrow-ah him taka dah a ni.'
            : 'Partner confirmed! Fare locked safely in UPI Escrow until OTP.',
      });
      await onRefresh();
    } catch {
      triggerHaptic('error');
      setErrandFeedback({ type: 'err', msg: 'Network error confirming partner.' });
    }
  };

  const handlePlaceMarketplaceOrder = async (productId: string) => {
    triggerHaptic('booking');
    setMktFeedback(null);
    setPlacingOrder(true);
    try {
      const res = await fetch('/api/marketplace/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          microInsuranceOptIn: mktInsurance,
          voiceNoteUrl: mktVoiceNote?.audioUrl || undefined,
          voiceNoteDurationSec: mktVoiceNote?.durationSec || undefined,
          voiceNoteTranscript: mktVoiceNote?.noteText || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        triggerHaptic('error');
        setMktFeedback({ type: 'err', msg: data.error || 'Order blocked' });
        return;
      }
      triggerHaptic('success');
      setMktFeedback({
        type: 'ok',
        msg: `Order ${data.order.id} placed. ${data.order.checkBeforePay ? 'Ready for En Hmasak Phawt check at your gate.' : 'Sealed hygiene pack — direct handover.'}`,
      });
      setMktVoiceNote(null);
      setSelectedProduct(null);
      await onRefresh();
      setOrdersLayerOpen(true);
    } catch {
      triggerHaptic('error');
      setMktFeedback({ type: 'err', msg: 'Network error placing order.' });
    } finally {
      setPlacingOrder(false);
    }
  };

  const handleInspectOrder = async (orderId: string, action: 'accept' | 'reject') => {
    triggerHaptic(action === 'accept' ? 'medium' : 'warning');
    setMktFeedback(null);
    try {
      const res = await fetch(`/api/marketplace/orders/${orderId}/inspect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        triggerHaptic('error');
        setMktFeedback({ type: 'err', msg: data.error || 'Inspection action rejected' });
        return;
      }
      triggerHaptic('success');
      setMktFeedback({
        type: 'ok',
        msg:
          action === 'accept'
            ? `Order ${orderId} accepted & settled from escrow.`
            : `Order ${orderId} returned. Return delivery fee ₹${data.verification.returnFeeCharged} applied (${data.returnsUsedThisMonth}/${remoteConfig.monthlyReturnLimit} this month).`,
      });
      await onRefresh();
    } catch {
      triggerHaptic('error');
      setMktFeedback({ type: 'err', msg: 'Network error updating order inspection.' });
    }
  };

  const handleSendMerchantChat = async (orderId: string) => {
    const text = chatDrafts[orderId]?.trim();
    if (!text) return;
    triggerHaptic('light');
    try {
      const res = await fetch(`/api/marketplace/orders/${orderId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: 'customer', text }),
      });
      if (res.ok) {
        setChatDrafts((prev) => ({ ...prev, [orderId]: '' }));
        await onRefresh();
      } else {
        triggerHaptic('error');
        setMktFeedback({ type: 'err', msg: 'Could not send message to shop.' });
      }
    } catch {
      triggerHaptic('error');
      setMktFeedback({ type: 'err', msg: 'Network error sending message.' });
    }
  };

  const handleBookWorker = async (worker: WorkforceMember) => {
    triggerHaptic('booking');
    setStaffFeedback(null);
    setBookingWorker(true);
    const isLiveInOrOutstation = outstationMode || worker.mode === 'company_managed_staffing';
    try {
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        triggerHaptic('error');
        setStaffFeedback({ type: 'err', msg: data.error || 'Booking failed' });
        return;
      }
      triggerHaptic('success');
      setStaffFeedback({
        type: 'ok',
        msg: `Digital contract ${data.booking.contractId} active for ${worker.name}.`,
      });
      setSelectedWorker(null);
      await onRefresh();
      setContractsLayerOpen(true);
    } catch {
      triggerHaptic('error');
      setStaffFeedback({ type: 'err', msg: 'Network error creating staffing contract.' });
    } finally {
      setBookingWorker(false);
    }
  };

  const handleTriggerWorkerSos = async (bookingId: string) => {
    triggerHaptic('sos');
    try {
      const res = await fetch(`/api/staffing/bookings/${bookingId}/worker-sos`, { method: 'POST' });
      if (res.ok) {
        setStaffFeedback({ type: 'err', msg: 'Worker SOS Alert transmitted to Operations Command Center!' });
        await onRefresh();
      } else {
        triggerHaptic('error');
        setStaffFeedback({ type: 'err', msg: 'Could not transmit Worker SOS alert.' });
      }
    } catch {
      triggerHaptic('error');
      setStaffFeedback({ type: 'err', msg: 'Network error sending Worker SOS alert.' });
    }
  };

  const handleDispatchSos = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userSettings.confirmBeforeSos && !sosConfirmArmed) {
      triggerHaptic('warning');
      setSosConfirmArmed(true);
      return;
    }
    setSosConfirmArmed(false);
    triggerHaptic('sos');
    setDispatchingSos(true);
    const vengPt = findAnyMizoramVeng(sosVeng);
    const dispatchLat = sosLiveGps?.lat ?? vengPt.lat;
    const dispatchLng = sosLiveGps?.lng ?? vengPt.lng;
    try {
      const idToken = getFirebaseIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (idToken) headers['X-Firebase-Id-Token'] = idToken;

      const res = await fetch('/api/emergency/dispatch', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          district: selectedDistrict,
          veng: sosVeng,
          lat: dispatchLat,
          lng: dispatchLng,
          category: sosCategory,
          voiceNoteTranscript: sosVoiceNote,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        triggerHaptic('error');
        setSosFeedback({ type: 'err', msg: data.error || 'Could not dispatch SOS.' });
        return;
      }
      triggerHaptic('success');
      void publishSosAlertToFirestore(data.ticket);
      setSosFeedback({
        type: 'ok',
        msg: `SOS ${data.ticket.id} dispatched in ${selectedDistrict}! ${data.ticket.assignedTechName} assigned (SLA ${data.ticket.slaTargetMinutes}m).`,
      });
      setQuickSosLayerOpen(false);
      await onRefresh();
      setSosTicketsLayerOpen(true);
    } catch {
      triggerHaptic('error');
      setSosFeedback({ type: 'err', msg: 'Network error dispatching 24x7 SOS.' });
    } finally {
      setDispatchingSos(false);
    }
  };

  const districtProducts = useMemo(
    () =>
      mktDistrictFilter === 'selected'
        ? products.filter((p) => (p.district || 'Aizawl') === selectedDistrict)
        : products,
    [products, mktDistrictFilter, selectedDistrict]
  );

  const availableVengs = useMemo(
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
    () =>
      workforce.filter(
        (w) =>
          w.availabilityStatus !== 'suspended' &&
          (staffFilter === 'all' || w.mode === staffFilter)
      ),
    [workforce, staffFilter]
  );

  const districtPartners = useMemo(
    () =>
      isInterDistrict
        ? partners
        : partners.filter((p) => !p.district || p.district === selectedDistrict),
    [partners, selectedDistrict, isInterDistrict]
  );

  const onlinePartnerCount =
    liveFirestoreRunnersCount !== null
      ? Math.max(liveFirestoreRunnersCount, districtPartners.filter((p) => p.online).length)
      : districtPartners.filter((p) => p.online).length;
  const districtErrands = useMemo(
    () => errands.filter((j) => (j.district || 'Aizawl') === selectedDistrict),
    [errands, selectedDistrict]
  );
  void liveFirestoreOrdersCount;
  void liveFirestoreSosCount;
  const homeQuickProducts = useMemo(() => {
    const local = products.filter((p) => (p.district || 'Aizawl') === selectedDistrict);
    return local.length > 0 ? local.slice(0, 5) : products.slice(0, 5);
  }, [products, selectedDistrict]);
  const hasLocalQuickProducts = useMemo(
    () => products.some((p) => (p.district || 'Aizawl') === selectedDistrict),
    [products, selectedDistrict]
  );
  const pendingBidsCount = useMemo(
    () => districtErrands.reduce((sum, j) => sum + (j.status === 'bidding' ? j.bids.length : 0), 0),
    [districtErrands]
  );
  const latestErrand = districtErrands[0] || null;
  const activeChatOrder = useMemo(
    () => orders.find((o) => o.id === activeChatOrderId) || null,
    [orders, activeChatOrderId]
  );
  const detailErrand = useMemo(
    () => errands.find((j) => j.id === detailErrandId) || null,
    [errands, detailErrandId]
  );
  const detailOrder = useMemo(
    () => orders.find((o) => o.id === detailOrderId) || null,
    [orders, detailOrderId]
  );
  const detailContract = useMemo(
    () => staffingBookings.find((b) => b.id === detailContractId) || null,
    [staffingBookings, detailContractId]
  );
  const detailSosTicket = useMemo(
    () => sosTickets.find((tk) => tk.id === detailSosId) || null,
    [sosTickets, detailSosId]
  );

  const serviceTiles: Array<{
    id: ErrandJobType;
    label: string;
    sub: string;
    price: number;
    icon: React.ReactNode;
    tint: string;
  }> = [
    {
      id: 'step_delivery',
      label: 'Runner',
      sub: lang === 'miz' ? 'Ke-a kal' : 'Steps walk',
      price: remoteConfig.baseWalkerRate,
      icon: <Footprints className="w-5 h-5 text-emerald-700" />,
      tint: 'bg-emerald-50',
    },
    {
      id: 'bike_express',
      label: lang === 'miz' ? 'Bike Rang' : 'Express',
      sub: '2-Wheeler',
      price: remoteConfig.baseBikeRate,
      icon: <Bike className="w-5 h-5 text-teal-700" />,
      tint: 'bg-teal-50',
    },
    {
      id: 'auto_cab_ride',
      label: lang === 'miz' ? 'Cab / Auto' : 'Auto / Cab',
      sub: lang === 'miz' ? 'Chuanna' : 'City ride',
      price: remoteConfig.baseAutoTaxiRate,
      icon: <Car className="w-5 h-5 text-sky-700" />,
      tint: 'bg-sky-50',
    },
    {
      id: 'heavy_cargo_shift',
      label: 'Pickup',
      sub: lang === 'miz' ? 'Bungraw phur' : 'Heavy cargo',
      price: remoteConfig.basePickupRate,
      icon: <Truck className="w-5 h-5 text-amber-700" />,
      tint: 'bg-amber-50',
    },
  ];

  const sosCategories: Array<{
    id: EmergencyCategory;
    group: 'medical_safety' | 'home_utility' | 'road_monsoon';
    title: string;
    titleMiz: string;
    rate: number;
    sla: string;
    defaultNote: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'ambulance_oxygen',
      group: 'medical_safety',
      title: 'Ambulance / O₂',
      titleMiz: 'Ambulance / Oxygen',
      rate: 850,
      sla: '12m SLA',
      defaultNote: 'Urgent medical transport & oxygen support needed immediately.',
      icon: <Ambulance className="w-5 h-5 text-red-600" />,
    },
    {
      id: 'medical_urgent_cab',
      group: 'medical_safety',
      title: 'Medical Night Cab',
      titleMiz: 'Damdawi In Cab',
      rate: 400,
      sla: '15m SLA',
      defaultNote: 'Urgent night cab needed to Civil / Ebenezer / Synod hospital.',
      icon: <Stethoscope className="w-5 h-5 text-red-600" />,
    },
    {
      id: 'night_pharmacy_run',
      group: 'medical_safety',
      title: '24×7 Night Meds',
      titleMiz: 'Zan Damdawi Lam',
      rate: 180,
      sla: '15m SLA',
      defaultNote: 'Urgent prescription medicine pickup from 24x7 pharmacy.',
      icon: <Pill className="w-5 h-5 text-red-600" />,
    },
    {
      id: 'women_night_escort',
      group: 'medical_safety',
      title: 'Safe Night Escort',
      titleMiz: 'Zan Kal Himna',
      rate: 350,
      sla: '15m SLA',
      defaultNote: 'Police-verified safe pickup & escort requested right away.',
      icon: <ShieldAlert className="w-5 h-5 text-red-600" />,
    },
    {
      id: 'lpg_gas_leak',
      group: 'home_utility',
      title: 'LPG Gas Leak',
      titleMiz: 'LPG Gas Put',
      rate: 400,
      sla: '15m SLA',
      defaultNote: 'Strong LPG gas smell near kitchen regulator, urgent safety check.',
      icon: <Flame className="w-5 h-5 text-red-600" />,
    },
    {
      id: 'plumber_water',
      group: 'home_utility',
      title: 'Water & Pipe',
      titleMiz: 'Tui Pipe Chhia',
      rate: 450,
      sla: '20m SLA',
      defaultNote: 'Burst main pipe near hillside tank, urgent shutdown needed.',
      icon: <Wrench className="w-5 h-5 text-red-600" />,
    },
    {
      id: 'electrician_power',
      group: 'home_utility',
      title: 'Power / Electric',
      titleMiz: 'Current Chhia',
      rate: 500,
      sla: '20m SLA',
      defaultNote: 'Main MCB tripping / short circuit spark, urgent electrician needed.',
      icon: <Zap className="w-5 h-5 text-red-600" />,
    },
    {
      id: 'locksmith',
      group: 'home_utility',
      title: 'Locksmith',
      titleMiz: 'Chabi Tla',
      rate: 550,
      sla: '20m SLA',
      defaultNote: 'Locked out of house / broken main door latch.',
      icon: <KeyRound className="w-5 h-5 text-red-600" />,
    },
    {
      id: 'water_tanker_urgent',
      group: 'home_utility',
      title: 'Water Tanker',
      titleMiz: 'Tui Tanker',
      rate: 900,
      sla: '30m SLA',
      defaultNote: 'Emergency household water tanker supply needed urgently.',
      icon: <Droplets className="w-5 h-5 text-red-600" />,
    },
    {
      id: 'roadside_mechanic_towing',
      group: 'road_monsoon',
      title: 'Roadside Tow',
      titleMiz: 'Motor Chhia',
      rate: 650,
      sla: '25m SLA',
      defaultNote: 'Vehicle breakdown on steep slope, mechanic or tow needed.',
      icon: <Truck className="w-5 h-5 text-red-600" />,
    },
    {
      id: 'tyre_puncture_fuel',
      group: 'road_monsoon',
      title: 'Tyre & Fuel Drop',
      titleMiz: 'Ke Thep / Petrol',
      rate: 300,
      sla: '20m SLA',
      defaultNote: 'Flat tyre / out of petrol on hill road, roadside help needed.',
      icon: <Fuel className="w-5 h-5 text-red-600" />,
    },
    {
      id: 'landslide_drain_clear',
      group: 'road_monsoon',
      title: 'Landslide / Drain',
      titleMiz: 'Leimin / Tui Haw',
      rate: 750,
      sla: '25m SLA',
      defaultNote: 'Heavy rain drain blockage / minor hillside slip near house steps.',
      icon: <Mountain className="w-5 h-5 text-red-600" />,
    },
  ];

  const visibleSosCategories = useMemo(
    () =>
      sosGroupFilter === 'all'
        ? sosCategories
        : sosCategories.filter((c) => c.group === sosGroupFilter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sosGroupFilter]
  );

  const selectedSosMeta = useMemo(
    () => sosCategories.find((c) => c.id === sosCategory) || sosCategories[0],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sosCategory]
  );

  const officialHelplines = [
    { num: '112', label: lang === 'miz' ? 'Police / Emergency' : 'Police & All' },
    { num: '108', label: 'Ambulance' },
    { num: '101', label: lang === 'miz' ? 'Kangmei' : 'Fire' },
    { num: '181', label: lang === 'miz' ? 'Hmeichhe Himna' : 'Women' },
  ];

  const handleCaptureSosGps = () => {
    triggerHaptic('medium');
    activeGpsWatcherRef.current?.stop();
    setLocatingSosGps(true);
    activeGpsWatcherRef.current = startLiveGpsWatch(
      (fix) => {
        setLiveUserGps(fix);
        void resolveAddressFromCoords(fix.lat, fix.lng, selectedDistrict, fix.accuracyMeters).then(
          (resolved) => {
            applyResolvedLocation('sos', resolved);
            if (fix.quality === 'high') {
              setLocatingSosGps(false);
              triggerHaptic('success');
            }
          }
        );
      },
      (errMsg) => {
        setLocatingSosGps(false);
        setSosFeedback({ type: 'err', msg: errMsg });
      },
      { maxAutoRefineMs: 9000 }
    );
    setTimeout(() => setLocatingSosGps(false), 9200);
  };

  const selectSosCategory = (catId: EmergencyCategory, defaultNote: string) => {
    triggerHaptic('light');
    setSosCategory(catId);
    setSosVoiceNote(defaultNote);
  };

  const openWorkerModal = (worker: WorkforceMember) => {
    triggerHaptic('light');
    setStaffFeedback(null);
    setOutstationMode(worker.mode === 'company_managed_staffing');
    setSelectedWorker(worker);
  };

  return (
    <div className="space-y-4 pb-20 md:pb-8">
      {/* Desktop Segmented Service Bar (Mobile uses native bottom tab bar) */}
      <nav
        aria-label="Customer services"
        className="hidden md:flex items-center justify-between gap-4 rounded-2xl bg-white dark:bg-slate-900 border border-transparent dark:border-slate-800 p-1.5 shadow-[0_2px_12px_rgba(15,23,42,0.04)]"
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChangeTab('errands')}
            className={`min-h-[42px] rounded-xl px-4 py-2 text-sm font-semibold transition-all whitespace-nowrap ${
              activeTab === 'errands'
                ? 'bg-emerald-900 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {lang === 'miz' ? 'Home & Runner' : 'Home & Errands'}
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('marketplace')}
            className={`min-h-[42px] rounded-xl px-4 py-2 text-sm font-semibold transition-all whitespace-nowrap ${
              activeTab === 'marketplace'
                ? 'bg-emerald-900 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {t.tabMarketplace}
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('workforce')}
            className={`min-h-[42px] rounded-xl px-4 py-2 text-sm font-semibold transition-all whitespace-nowrap ${
              activeTab === 'workforce'
                ? 'bg-emerald-900 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {t.tabWorkforce}
          </button>
        </div>

        <button
          type="button"
          onClick={() => onChangeTab('sos')}
          className={`min-h-[42px] inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === 'sos'
              ? 'bg-red-600 text-white shadow-sm'
              : 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          {t.tabSos}
        </button>
      </nav>

      {/* ===================================================================== */}
      {/* TAB 1: COMPACT HOME HUB (LAYERED WINDOWS — NO ENDLESS SCROLLING)      */}
      {/* ===================================================================== */}
      {activeTab === 'errands' && (
        <div className="space-y-4">
          {/* Universal Bilingual Search + 1-Tap Saved Favourite Places */}
          <UniversalSearchBar
            lang={lang}
            selectedDistrict={selectedDistrict}
            products={products}
            workforce={workforce}
            savedPlaces={userSettings.savedPlaces}
            onAddSavedPlace={(place: SavedPlace) => {
              onUpdateUserSettings({
                savedPlaces: [...userSettings.savedPlaces, place],
              });
            }}
            onSelectSavedPlace={(place: SavedPlace) => {
              if (place.district !== selectedDistrict) {
                onChangeDistrict(place.district);
              }
              setDestName(place.veng);
              setCustomDest(null);
              if (place.landmark) {
                setVoiceNoteTranscript(`${place.label}: ${place.landmark}`);
              }
              setBookingSheetOpen(true);
            }}
            onSelectProduct={(product) => {
              setMktFeedback(null);
              setSelectedProduct(product);
            }}
            onSelectWorker={(worker) => openWorkerModal(worker)}
            onSelectQuickErrand={(jt, presetTitle) => {
              openBookingForTier(jt);
              if (presetTitle) setTitle(presetTitle);
            }}
            onSelectSosCategory={(cat) => {
              setSosCategory(cat);
              setQuickSosLayerOpen(true);
            }}
          />

          {/* Compact Live Active Trip Tracker (4-Step Progress + 1-Tap Share + Rate & Tip) */}
          <LiveTripTrackerBar
            lang={lang}
            errand={latestErrand || null}
            onOpenDetails={(errandId) => setDetailErrandId(errandId)}
            onRated={onRefresh}
          />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* LEFT COLUMN: Compact Hero + 4-Up Services + Quick Shops Strip */}
          <div className="lg:col-span-7 space-y-4">
            {/* Compact Visual Super-App Hero Card */}
            <section className="relative rounded-3xl overflow-hidden bg-emerald-950 shadow-[0_10px_28px_rgba(6,78,59,0.16)]">
              <div className="relative min-h-[228px] sm:min-h-[236px]">
                <img
                  src={HERO_IMG}
                  alt="Golden hour view over Aizawl Mizoram mountain ridges"
                  referrerPolicy="no-referrer"
                  fetchPriority="high"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-emerald-950 via-emerald-950/60 to-emerald-950/20" />

                <div className="absolute inset-0 p-4 sm:p-5 flex flex-col justify-between">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        onOpenDistrictPicker?.();
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-100 hover:text-white transition-colors min-h-[32px]"
                    >
                      <MapPin className="w-3.5 h-3.5 text-emerald-300" />
                      <span>
                        Chibai · {selectedDistrict} · {onlinePartnerCount}{' '}
                        {lang === 'miz' ? 'Runner online' : 'Runners online'}
                      </span>
                    </button>
                    <span className="text-xs font-mono text-emerald-200/90 tabular-nums">
                      {districtInfo.rtoCode}
                      {remoteConfig.rainSurgeMultiplier > 1
                        ? ` · ${remoteConfig.rainSurgeMultiplier}x`
                        : ''}
                    </span>
                  </div>

                  <div className="space-y-3">
                    <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white leading-tight [text-wrap:balance]">
                      {lang === 'miz'
                        ? 'Chibai! Eng nge kan tihsak ang che?'
                        : 'Where to, or what can we run for you?'}
                    </h1>

                    {/* Floating Action Search Bar -> Opens Booking Layer Window */}
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setBookingSheetOpen(true);
                        }}
                        className="w-full min-h-[48px] rounded-2xl bg-white dark:bg-slate-900 px-3.5 py-2 flex items-center justify-between gap-3 text-left shadow-lg active:scale-[0.99] transition-transform"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Search className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                          <span className="text-[13px] sm:text-sm font-medium text-slate-600 dark:text-slate-300 truncate">
                            {lang === 'miz'
                              ? `${originName.replace(/\s*\([^)]*\)$/, '')} → ${destName.replace(/\s*\([^)]*\)$/, '')} · Runner / Motor`
                              : `${originName.replace(/\s*\([^)]*\)$/, '')} → ${destName.replace(/\s*\([^)]*\)$/, '')} · Book now`}
                          </span>
                        </div>
                        <span className="rounded-xl bg-emerald-800 px-3 py-1.5 text-xs font-bold text-white whitespace-nowrap shrink-0">
                          {lang === 'miz' ? 'Ko Rawh' : 'Book'}
                        </span>
                      </button>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handlePinOriginGps}
                          className="min-h-[34px] rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur-xs px-3 py-1 text-[11px] font-bold text-white inline-flex items-center gap-1.5 transition-colors"
                        >
                          <Crosshair className="w-3.5 h-3.5 text-emerald-300" />
                          <span>
                            {locatingOriginGps
                              ? lang === 'miz'
                                ? 'Live GPS Lock mek...'
                                : 'Updating Live GPS...'
                              : liveUserGps
                                ? `Live GPS ±${liveUserGps.accuracyMeters}m`
                                : lang === 'miz'
                                  ? 'Live GPS Auto-Fill'
                                  : 'Live GPS Auto-Fill'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            setPinPickerState({ open: true, mode: 'pickup' });
                          }}
                          className="min-h-[34px] rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur-xs px-3 py-1 text-[11px] font-bold text-white inline-flex items-center gap-1.5 transition-colors"
                        >
                          <MapPin className="w-3.5 h-3.5 text-emerald-300" />
                          <span>{lang === 'miz' ? 'Map-ah Pin Rawh' : 'Pin Location on Map'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* 4-Up Tactile Super-App Service Grid -> Opens Pre-Selected Booking Layer */}
            <section aria-label="Quick services" className="grid grid-cols-4 gap-2 sm:gap-3">
              {serviceTiles.map((tile) => (
                <button
                  key={tile.id}
                  type="button"
                  onClick={() => openBookingForTier(tile.id)}
                  className="rounded-2xl bg-white dark:bg-slate-900 border border-transparent dark:border-slate-800 p-2.5 sm:p-3.5 flex flex-col items-center text-center shadow-[0_2px_10px_rgba(15,23,42,0.04)] hover:shadow-[0_6px_18px_rgba(15,23,42,0.07)] active:scale-[0.96] transition-all"
                >
                  <div className={`w-11 h-11 rounded-2xl ${tile.tint} dark:bg-slate-800 flex items-center justify-center mb-1.5`}>
                    {tile.icon}
                  </div>
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-tight whitespace-nowrap">
                    {tile.label}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
                    ₹{tile.price}+
                  </span>
                </button>
              ))}
            </section>

            {errandFeedback && (
              <div
                role="status"
                className={`rounded-2xl px-4 py-3 text-xs font-semibold flex items-center justify-between gap-3 ${
                  errandFeedback.type === 'ok'
                    ? 'bg-emerald-900 text-white'
                    : 'bg-red-50 dark:bg-red-950/60 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-900'
                }`}
              >
                <span>{errandFeedback.msg}</span>
                <button
                  type="button"
                  onClick={() => setErrandFeedback(null)}
                  aria-label="Dismiss notification"
                  className="min-h-[32px] min-w-[32px] flex items-center justify-center opacity-80 hover:opacity-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Single-Row Horizontal Quick Shops Strip (Synchronized to active District) */}
            {homeQuickProducts.length > 0 && (
              <section className="space-y-2">
                <div className="flex items-center justify-between px-0.5">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {hasLocalQuickProducts
                      ? lang === 'miz'
                        ? `${selectedDistrict} Dawr & Bazar`
                        : `${selectedDistrict} Local Shops`
                      : lang === 'miz'
                        ? 'Mizoram Bazar (Sumo Deliver)'
                        : 'Mizoram Shops (Sumo Delivery)'}
                  </h2>
                  <button
                    type="button"
                    onClick={() => onChangeTab('marketplace')}
                    className="text-xs font-semibold text-emerald-800 dark:text-emerald-400 inline-flex items-center gap-0.5 min-h-[32px]"
                  >
                    {lang === 'miz' ? 'En vek' : 'All shops'}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
                  {homeQuickProducts.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setMktFeedback(null);
                        setSelectedProduct(item);
                      }}
                      className="min-w-[152px] max-w-[152px] sm:min-w-[168px] rounded-2xl bg-white dark:bg-slate-900 border border-transparent dark:border-slate-800 overflow-hidden shadow-[0_2px_10px_rgba(15,23,42,0.04)] text-left flex flex-col justify-between shrink-0 active:scale-[0.97] transition-transform"
                    >
                      <div className="aspect-[16/10] bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <img
                          src={item.imageUrl}
                          alt={item.titleEn}
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="p-2.5 space-y-0.5">
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {item.veng} · {item.district || 'Aizawl'}
                        </p>
                        <p className="text-xs font-bold text-slate-900 dark:text-slate-100 line-clamp-1">
                          {lang === 'miz' ? item.titleMiz : item.titleEn}
                        </p>
                        <p className="text-xs font-extrabold font-mono tabular-nums text-emerald-800 dark:text-emerald-400 pt-0.5">
                          ₹{item.price}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* RIGHT COLUMN: Tactile Layer Window Dock (Instant Popup Triggers — Zero Scrolling) */}
          <div className="lg:col-span-5 space-y-4">
            <section
              aria-label="Quick Layer Windows"
              className="rounded-3xl bg-white dark:bg-slate-900 border border-transparent dark:border-slate-800 shadow-[0_2px_14px_rgba(15,23,42,0.05)] divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden"
            >
              {/* Row 0A: ZoRûn Wallet & Referral Rewards */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setWalletLayerOpen(true);
                }}
                className="w-full min-h-[68px] px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50/80 dark:hover:bg-slate-800/60 active:bg-slate-100/70 transition-colors"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-900 text-emerald-200 flex items-center justify-center shrink-0">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                      {lang === 'miz' ? 'ZoRûn Wallet & Referral ₹50' : 'ZoRûn Wallet & Rewards'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {customerWallet.loyaltyPoints} pts ·{' '}
                      {customerWallet.plusPassActive
                        ? 'Plus Pass Active'
                        : lang === 'miz'
                          ? 'Top-up · Thian sawm +₹50'
                          : 'Top-up · Refer +₹50'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs font-extrabold font-mono tabular-nums text-emerald-800 dark:text-emerald-400">
                    ₹{customerWallet.balanceRs.toLocaleString()}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
              </button>

              {/* Row 0B: Inter-District Sumo / Counter Parcel Bridge */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setSumoLayerOpen(true);
                }}
                className="w-full min-h-[68px] px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50/80 dark:hover:bg-slate-800/60 active:bg-slate-100/70 transition-colors"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <Package className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                      {lang === 'miz' ? 'Sumo Counter Parcel Bridge' : 'Inter-District Sumo Parcel'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {lang === 'miz'
                        ? 'Aizawl ↔ District 11 Sumo thil thawnna'
                        : 'Home pickup → Sumo counter → 11 Districts'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400">
                    {sumoParcels.length}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
              </button>

              {/* Row 1: Live Map Layer Window */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setMapLayerOpen(true);
                }}
                className="w-full min-h-[68px] px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50/80 dark:hover:bg-slate-800/60 active:bg-slate-100/70 transition-colors"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <MapIcon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                      {lang === 'miz' ? `${selectedDistrict} Live Map` : `${selectedDistrict} Live Map`}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {originName} → {destName} · {onlinePartnerCount} online
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs font-extrabold font-mono tabular-nums text-emerald-800 dark:text-emerald-400">
                    ₹{estimate?.allInclusiveTotal ?? instantFarePreview}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
              </button>

              {/* Row 2: Live Activity & Partner Bids Layer Window */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setActivityLayerOpen(true);
                }}
                className="w-full min-h-[68px] px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50/80 dark:hover:bg-slate-800/60 active:bg-slate-100/70 transition-colors"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-400 flex items-center justify-center shrink-0">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                      {lang === 'miz' ? 'Order & Partner Bid-te' : 'Live Activity & Bids'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {districtErrands.length} {lang === 'miz' ? `${selectedDistrict}-ah kal mek` : `in ${selectedDistrict}`}
                      {pendingBidsCount > 0
                        ? ` · ${pendingBidsCount} ${lang === 'miz' ? 'bid thar' : 'partner offers'}`
                        : latestErrand
                          ? ` · OTP ${latestErrand.otpCode}`
                          : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs font-bold font-mono tabular-nums text-slate-700 dark:text-slate-300">
                    {districtErrands.length}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
              </button>

              {/* Row 3: Quick 24x7 Emergency SOS Popup Layer */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('sos');
                  setQuickSosLayerOpen(true);
                }}
                className="w-full min-h-[68px] px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-red-50/60 dark:hover:bg-red-950/30 active:bg-red-50 transition-colors"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-red-600 text-white flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-red-700 dark:text-red-400 truncate">
                      {lang === 'miz' ? '24×7 Emergency SOS Popup' : '24×7 Rapid Emergency SOS'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {lang === 'miz'
                        ? 'Ambulance · Gas Put · Leimin · Plumber · 12 Services'
                        : 'Ambulance · Gas Leak · Landslide · Tow · 12 Services'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {sosTickets.length > 0 && (
                    <span className="text-xs font-bold font-mono tabular-nums text-red-600 dark:text-red-400">
                      {sosTickets.length}
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-red-400" />
                </div>
              </button>
            </section>

            {/* Quick Shortcuts to Bazar Orders & Awmpui Contracts Popups */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setOrdersLayerOpen(true);
                }}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-transparent dark:border-slate-800 p-3.5 text-left shadow-[0_2px_10px_rgba(15,23,42,0.04)] hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-[0.98] transition-all flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-400">
                    <ShoppingBag className="w-4 h-4 shrink-0" />
                    <span className="text-xs font-bold truncate">
                      {lang === 'miz' ? 'Bazar Orders' : 'Shop Orders'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                    {orders.length} {lang === 'miz' ? 'order · Chat' : 'orders · Chat'}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setContractsLayerOpen(true);
                }}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-transparent dark:border-slate-800 p-3.5 text-left shadow-[0_2px_10px_rgba(15,23,42,0.04)] hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-[0.98] transition-all flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-slate-900 dark:text-slate-100">
                    <Briefcase className="w-4 h-4 shrink-0 text-emerald-800 dark:text-emerald-400" />
                    <span className="text-xs font-bold truncate">
                      {lang === 'miz' ? 'Awmpui Contract' : 'Staff Contracts'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                    {staffingBookings.length} {lang === 'miz' ? 'kal mek' : 'active'}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
              </button>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: EN HMASAK BAZAR (COMPACT GRID + LAYERED PRODUCT & CHAT POPUPS) */}
      {/* ===================================================================== */}
      {activeTab === 'marketplace' && (
        <div className="space-y-4">
          {/* Compact Top Action Bar (Replaces Tall Banner & Bottom Order Scroll) */}
          <section className="rounded-3xl bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.04)] flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-extrabold text-slate-900 leading-tight">
                {lang === 'miz' ? 'Mizoram Dawr & Bazar' : 'En Hmasak Bazar'}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {lang === 'miz' ? 'Kawtah en hmasak phawt' : 'Check-Before-Pay at gate'} · Returns{' '}
                {userMonthlyReturns['cust-1'] ?? 0}/{remoteConfig.monthlyReturnLimit}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setOrdersLayerOpen(true);
              }}
              className="min-h-[44px] rounded-2xl bg-emerald-900 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 active:scale-[0.98] transition-all inline-flex items-center gap-2 shrink-0"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>
                {lang === 'miz' ? 'Orders & Chat' : 'Orders & Chat'} ({orders.length})
              </span>
            </button>
          </section>

          {/* Horizontal Scroll Filter Row */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5 -mx-4 px-4 sm:mx-0 sm:px-0">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setMktDistrictFilter('all');
                setSelectedVengFilter('All');
              }}
              className={`min-h-[40px] rounded-xl px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                mktDistrictFilter === 'all' ? 'bg-emerald-900 text-white' : 'bg-white text-slate-700'
              }`}
            >
              {t.allDistrictsLabel}
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setMktDistrictFilter('selected');
                setSelectedVengFilter('All');
              }}
              className={`min-h-[40px] rounded-xl px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                mktDistrictFilter === 'selected' ? 'bg-emerald-900 text-white' : 'bg-white text-slate-700'
              }`}
            >
              {selectedDistrict}
            </button>
            {availableVengs
              .filter((v) => v !== 'All')
              .map((veng) => (
                <button
                  key={veng}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setSelectedVengFilter(selectedVengFilter === veng ? 'All' : veng);
                  }}
                  className={`min-h-[40px] rounded-xl px-3.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                    selectedVengFilter === veng ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'
                  }`}
                >
                  {veng}
                </button>
              ))}
          </div>

          {!effectiveVisibility.marketplace && (
            <div className="rounded-2xl bg-amber-100 p-3.5 text-xs font-semibold text-amber-950">
              {t.sundayBanner}
            </div>
          )}

          {mktFeedback && (
            <div
              role="status"
              className={`rounded-2xl px-4 py-3 text-xs font-semibold flex items-center justify-between gap-3 ${
                mktFeedback.type === 'ok' ? 'bg-emerald-900 text-white' : 'bg-red-50 text-red-800'
              }`}
            >
              <span>{mktFeedback.msg}</span>
              <button
                type="button"
                onClick={() => setMktFeedback(null)}
                aria-label="Dismiss marketplace notice"
                className="min-h-[32px] min-w-[32px] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Compact 2-Col Mobile / 3-Col Desktop Cards -> Tap opens Product Detail Popup */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setSelectedProduct(product);
                }}
                className="rounded-3xl bg-white overflow-hidden shadow-[0_2px_12px_rgba(15,23,42,0.04)] hover:shadow-[0_6px_20px_rgba(15,23,42,0.08)] active:scale-[0.98] transition-all text-left flex flex-col justify-between"
              >
                <div>
                  <div className="aspect-[4/3] bg-slate-100 overflow-hidden">
                    <img
                      src={product.imageUrl}
                      alt={product.titleEn}
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="p-3 space-y-1">
                    <p className="text-[11px] text-slate-500 truncate">
                      {product.veng} · {product.shopName}
                    </p>
                    <h2 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">
                      {lang === 'miz' ? product.titleMiz : product.titleEn}
                    </h2>
                    <p className="text-[11px] text-emerald-800 font-medium">
                      {product.checkBeforePayEligible
                        ? lang === 'miz'
                          ? 'En Hmasak Phawt'
                          : 'Check-Before-Pay'
                        : 'Sealed hygiene'}
                    </p>
                  </div>
                </div>

                <div className="px-3 pb-3 pt-1 flex items-center justify-between gap-2">
                  <span className="text-base font-extrabold font-mono tabular-nums text-slate-900">
                    ₹{product.price + 55 + (mktInsurance ? remoteConfig.microInsuranceSachetRs : 0)}
                  </span>
                  <span className="text-xs font-bold text-emerald-800 inline-flex items-center gap-0.5">
                    {lang === 'miz' ? 'En' : 'View'}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: WORKFORCE & VERIFIED AWMPUI (COMPACT + LAYERED POPUPS)         */}
      {/* ===================================================================== */}
      {activeTab === 'workforce' && (
        <div className="space-y-4">
          {/* Compact Header + Segmented Filter + Active Contracts Popup Trigger */}
          <div className="rounded-3xl bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.04)] space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-lg font-extrabold text-slate-900 leading-tight">{t.workforceTitle}</h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Police-vetted · Skill-tested · Replacement guarantee
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {onOpenApply && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onOpenApply();
                    }}
                    className="min-h-[44px] rounded-2xl border border-emerald-700 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-900 hover:bg-emerald-100 whitespace-nowrap"
                  >
                    {lang === 'miz' ? '+ Awmpui / Driver Dil' : '+ Apply / Join'}
                  </button>
                )}
                {onOpenStaffPortal && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onOpenStaffPortal();
                    }}
                    className="min-h-[44px] rounded-2xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                  >
                    {lang === 'miz' ? 'Staff Portal' : 'Staff Portal'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setContractsLayerOpen(true);
                  }}
                  className="min-h-[44px] rounded-2xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 active:scale-[0.98] transition-all inline-flex items-center gap-2 shrink-0"
                >
                  <Briefcase className="w-4 h-4 text-emerald-300" />
                  <span>
                    {lang === 'miz' ? 'Contracts' : 'Contracts'} ({staffingBookings.length})
                  </span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1">
              {(
                [
                  ['all', lang === 'miz' ? 'Zawng zawng' : 'All'],
                  ['on_demand_workforce', lang === 'miz' ? 'Ni khat / Daily' : 'On-Demand'],
                  ['company_managed_staffing', lang === 'miz' ? 'Awmpui' : 'Managed Staff'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setStaffFilter(key);
                  }}
                  className={`min-h-[40px] rounded-xl px-2 py-1.5 text-xs font-bold transition-all ${
                    staffFilter === key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {staffFeedback && (
              <div
                role="status"
                className={`rounded-2xl px-4 py-3 text-xs font-semibold flex items-center justify-between gap-3 ${
                  staffFeedback.type === 'ok' ? 'bg-emerald-900 text-white' : 'bg-red-50 text-red-800'
                }`}
              >
                <span>{staffFeedback.msg}</span>
                <button
                  type="button"
                  onClick={() => setStaffFeedback(null)}
                  aria-label="Dismiss staffing notice"
                  className="min-h-[32px] min-w-[32px] flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Compact Worker Directory Cards -> Tap opens Profile & Safeguards Booking Layer */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {filteredWorkforce.map((worker) => (
              <button
                key={worker.id}
                type="button"
                onClick={() => openWorkerModal(worker)}
                className="rounded-3xl bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.04)] hover:shadow-[0_6px_20px_rgba(15,23,42,0.08)] active:scale-[0.98] transition-all text-left flex flex-col justify-between gap-3.5"
              >
                <div className="flex items-center gap-3.5">
                  <img
                    src={worker.avatarUrl}
                    alt={worker.name}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    decoding="async"
                    className="h-14 w-14 rounded-2xl object-cover shrink-0 bg-slate-100"
                  />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-bold text-slate-900 truncate">{worker.name}</h2>
                    <p className="text-xs font-semibold text-emerald-800 truncate mt-0.5">
                      {lang === 'miz' ? worker.roleTitleMiz : worker.roleTitle}
                    </p>
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                      <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
                      <span className="font-semibold text-slate-800">{worker.rating}</span>
                      <span className="truncate">· {worker.veng}</span>
                    </p>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-base font-extrabold font-mono tabular-nums text-slate-900">
                      ₹{(worker.monthlyPackageRate || worker.dailyRate || 1100).toLocaleString()}
                    </span>
                    <span className="text-[11px] text-slate-500 ml-1">
                      /{worker.monthlyPackageRate ? 'mo' : 'day'}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-slate-900 inline-flex items-center gap-0.5">
                    {lang === 'miz' ? 'Book Rawh' : 'View & Book'}
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: 24x7 RAPID EMERGENCY SOS (SINGLE SCREEN + LIVE DISPATCH POPUP) */}
      {/* ===================================================================== */}
      {activeTab === 'sos' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <form
            onSubmit={handleDispatchSos}
            className="lg:col-span-7 rounded-3xl bg-white p-4 sm:p-5 shadow-[0_4px_20px_rgba(220,38,38,0.08)] space-y-4"
          >
            <div className="rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 p-4 text-white flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <h1 className="text-base sm:text-lg font-extrabold truncate">{t.sosTitle}</h1>
                </div>
                <p className="text-xs text-red-100 mt-0.5">
                  {selectedDistrict} · 15–30 min arrival SLA
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setSosTicketsLayerOpen(true);
                }}
                className="min-h-[40px] rounded-xl bg-white/15 hover:bg-white/25 px-3 py-1.5 text-xs font-bold text-white whitespace-nowrap shrink-0"
              >
                {lang === 'miz' ? 'Kal mek' : 'Live'} ({sosTickets.length})
              </button>
            </div>

            {/* 1-Tap Official Mizoram Emergency Helplines */}
            <div className="grid grid-cols-4 gap-2">
              {officialHelplines.map((line) => (
                <a
                  key={line.num}
                  href={`tel:${line.num}`}
                  onClick={() => triggerHaptic('sos')}
                  className="min-h-[48px] rounded-2xl bg-red-50/90 hover:bg-red-100 border border-red-200/80 px-2 py-2 flex flex-col items-center justify-center text-center transition-colors"
                >
                  <span className="text-sm font-extrabold font-mono text-red-700 leading-none">
                    {line.num}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-700 mt-1 truncate max-w-full">
                    {line.label}
                  </span>
                </a>
              ))}
            </div>

            {/* Category Group Filter Tabs */}
            <div className="grid grid-cols-4 gap-1 rounded-2xl bg-slate-100 p-1">
              {(
                [
                  ['all', lang === 'miz' ? 'Vek (12)' : 'All (12)'],
                  ['medical_safety', lang === 'miz' ? 'Medical' : 'Medical'],
                  ['home_utility', lang === 'miz' ? 'In Chhung' : 'Home'],
                  ['road_monsoon', lang === 'miz' ? 'Kawng' : 'Road'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setSosGroupFilter(key);
                  }}
                  className={`min-h-[36px] rounded-xl px-1.5 py-1 text-[11px] font-bold transition-all ${
                    sosGroupFilter === key ? 'bg-white text-red-700 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {visibleSosCategories.map((cat) => {
                const active = sosCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => selectSosCategory(cat.id, cat.defaultNote)}
                    className={`rounded-2xl p-2.5 text-left border transition-all active:scale-[0.97] ${
                      active
                        ? 'border-red-600 bg-red-50/80'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="mb-1">{cat.icon}</div>
                    <p className="text-xs font-bold text-slate-900 leading-tight">
                      {lang === 'miz' ? cat.titleMiz : cat.title}
                    </p>
                    <p className="text-[11px] font-mono text-slate-500 mt-0.5 tabular-nums">
                      ₹{cat.rate} · {cat.sla}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label htmlFor="sos-veng" className="block text-xs font-bold text-slate-700">
                    {lang === 'miz' ? `I Awmna Veng (${selectedDistrict})` : `Your Veng (${selectedDistrict})`}
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCaptureSosGps}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 hover:text-red-700"
                    >
                      <Crosshair className="w-3 h-3" />
                      {locatingSosGps
                        ? 'Locking...'
                        : sosLiveGps
                          ? `GPS ✓${liveUserGps ? ` ±${liveUserGps.accuracyMeters}m` : ''}`
                          : lang === 'miz'
                            ? 'Live GPS'
                            : 'Use GPS'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setPinPickerState({ open: true, mode: 'sos' });
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 hover:text-red-700"
                    >
                      <MapPin className="w-3 h-3" />
                      <span>{lang === 'miz' ? 'Map Pin' : 'Map'}</span>
                    </button>
                  </div>
                </div>
                <select
                  id="sos-veng"
                  value={sosVeng}
                  onChange={(e) => {
                    setSosVeng(e.target.value);
                    setSosLiveGps(null);
                  }}
                  className="w-full min-h-[46px] rounded-2xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-900"
                >
                  {districtVengs.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name} · {v.zone}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="sos-voice" className="block text-xs font-bold text-slate-700 mb-1">
                  {lang === 'miz' ? 'Harsatna Tawi' : 'Emergency Details'}
                </label>
                <input
                  id="sos-voice"
                  type="text"
                  value={sosVoiceNote}
                  onChange={(e) => setSosVoiceNote(e.target.value)}
                  className="w-full min-h-[46px] rounded-2xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-red-600 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={dispatchingSos}
              className="w-full min-h-[52px] rounded-2xl bg-red-600 px-5 py-3 text-sm font-extrabold text-white hover:bg-red-700 active:scale-[0.98] disabled:opacity-50 transition-all shadow-lg shadow-red-600/20"
            >
              {dispatchingSos
                ? lang === 'miz'
                  ? 'Tirh mek...'
                  : 'Dispatching...'
                : sosConfirmArmed
                  ? lang === 'miz'
                    ? 'Hmet nawn la SOS tirh ngei rawh (Confirm)'
                    : 'Tap Again to Confirm Rapid SOS Dispatch'
                  : lang === 'miz'
                    ? `${selectedSosMeta.titleMiz} · ₹${selectedSosMeta.rate} Tirh Rawh`
                    : `Dispatch ${selectedSosMeta.title} · ₹${selectedSosMeta.rate}`}
            </button>

            {sosFeedback && (
              <div
                role="status"
                className="rounded-2xl bg-red-50 p-3.5 text-xs font-semibold text-red-900 flex items-center justify-between gap-2"
              >
                <span>{sosFeedback.msg}</span>
                <button
                  type="button"
                  onClick={() => setSosTicketsLayerOpen(true)}
                  className="underline font-bold whitespace-nowrap shrink-0"
                >
                  {lang === 'miz' ? 'En rawh' : 'Track'}
                </button>
              </div>
            )}
          </form>

          {/* Desktop Compact Side Summary -> Opens Full Live Dispatches Layer */}
          <div className="lg:col-span-5 rounded-3xl bg-white p-4 sm:p-5 shadow-[0_2px_12px_rgba(15,23,42,0.04)] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900">
                {lang === 'miz' ? 'Emergency Kal Mek-te' : 'Active 24×7 Dispatches'} ({sosTickets.length})
              </h2>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setSosTicketsLayerOpen(true);
                }}
                className="text-xs font-bold text-red-600 hover:text-red-700 min-h-[32px]"
              >
                {lang === 'miz' ? 'Window-ah en' : 'Open window'}
              </button>
            </div>

            {sosTickets.length === 0 ? (
              <p className="text-xs text-slate-500">
                {lang === 'miz' ? 'Emergency tirh mek a awm rih lo.' : 'No active emergency dispatches right now.'}
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {sosTickets.slice(0, 3).map((ticket) => (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setDetailSosId(ticket.id);
                    }}
                    className="w-full py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {ticket.assignedTechName} · {ticket.veng}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {ticket.id} · {ticket.slaTargetMinutes}m SLA · {ticket.status.replace('_', ' ')}
                      </p>
                    </div>
                    <span className="text-sm font-extrabold font-mono tabular-nums text-slate-900 shrink-0">
                      ₹{ticket.standardizedRate + ticket.sparePartsAmount}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* LAYER 1: ERRAND & RIDE BOOKING WINDOW                                 */}
      {/* ===================================================================== */}
      <LayerWindow
        open={bookingSheetOpen}
        onClose={() => setBookingSheetOpen(false)}
        title={lang === 'miz' ? 'Runner & Motor Kohna' : 'Book Errand or Ride'}
        subtitle={`${selectedDistrict} · ${t.allInclusiveNote}`}
        size="md"
        footer={
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                All-Inclusive Fare
                {(estimate?.kailawnSurchargeRs ?? kailawnSurchargePreview) > 0 && (
                  <span className="ml-1 font-semibold text-amber-700 dark:text-amber-400">
                    (incl. +₹{estimate?.kailawnSurchargeRs ?? kailawnSurchargePreview} Kailawn)
                  </span>
                )}
              </p>
              <p className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
                ₹{estimate?.allInclusiveTotal ?? instantFarePreview}
              </p>
            </div>
            <button
              type="submit"
              form="zorun-errand-form"
              disabled={submittingErrand}
              className="flex-1 min-h-[48px] rounded-2xl bg-emerald-800 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-900 active:scale-[0.98] disabled:opacity-50 transition-all"
            >
              {submittingErrand
                ? lang === 'miz'
                  ? 'Thawn mek...'
                  : 'Posting...'
                : lang === 'miz'
                  ? 'Partner Ko Rawh'
                  : 'Find Partners Now'}
            </button>
          </div>
        }
      >
        <form id="zorun-errand-form" onSubmit={handleCreateErrand} className="space-y-4">
          <div className="grid grid-cols-4 gap-2">
            {serviceTiles.map((tile) => {
              const selected =
                jobType === tile.id ||
                (tile.id === 'step_delivery' &&
                  (jobType === 'hyperlocal_errand' || jobType === 'queue_standing' || jobType === 'truck_helper'));
              return (
                <button
                  key={tile.id}
                  type="button"
                  onClick={() => openBookingForTier(tile.id)}
                  className={`rounded-2xl p-2.5 text-center border transition-all ${
                    selected
                      ? 'border-emerald-700 bg-emerald-50/80 text-emerald-950'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex justify-center mb-1">{tile.icon}</div>
                  <p className="text-[11px] font-bold leading-tight">{tile.label}</p>
                  <p className="text-[10px] font-mono text-slate-500 tabular-nums">₹{tile.price}</p>
                </button>
              );
            })}
          </div>

          {/* Voice-First Mizo Quick Order Presets */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                <Mic className="w-3 h-3 text-emerald-700 dark:text-emerald-400" />
                {lang === 'miz' ? '1-Tap Mizo Quick Presets' : '1-Tap Mizoram Quick Presets'}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {VOICE_ORDER_PRESETS.map((preset) => (
                <button
                  key={preset.labelEn}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setJobType(preset.jobType);
                    setTitle(preset.title);
                    setVoiceNoteTranscript(preset.note);
                  }}
                  className="min-h-[34px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-emerald-700 dark:hover:border-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-slate-800 dark:text-slate-200 transition-colors"
                >
                  {lang === 'miz' ? preset.labelMiz : preset.labelEn}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-3.5 space-y-3 border border-slate-200/70 dark:border-slate-700">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-700">
                {lang === 'miz' ? 'Kalna Tur (Route)' : 'Pickup & Drop Veng'}
              </span>
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isInterDistrict}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIsInterDistrict(checked);
                    if (checked) {
                      const other = MIZORAM_DISTRICTS.find((d) => d.district !== selectedDistrict);
                      if (other?.vengs[0]) {
                        setDestName(other.vengs[0].name);
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
                  className="rounded border-slate-300 text-emerald-700"
                />
                Inter-District
              </label>
            </div>

            <div className="space-y-2.5">
              {/* Pickup Row with GPS Auto-Fill & Google Map Pin Popup Button */}
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-400">
                    {lang === 'miz' ? 'Pickup (A)' : 'Pickup (A)'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handlePinOriginGps}
                      className="min-h-[28px] rounded-lg border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:text-emerald-400 hover:bg-emerald-50 inline-flex items-center gap-1"
                    >
                      <Crosshair className="w-3 h-3" />
                      {locatingOriginGps
                        ? 'Refining...'
                        : customOrigin
                          ? 'GPS ✓'
                          : 'Live GPS'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setPinPickerState({ open: true, mode: 'pickup' });
                      }}
                      className="min-h-[28px] rounded-lg bg-emerald-800 px-2.5 py-0.5 text-[11px] font-bold text-white hover:bg-emerald-900 inline-flex items-center gap-1"
                    >
                      <MapPin className="w-3 h-3" />
                      <span>{lang === 'miz' ? 'Pin on Map' : 'Pin on Map'}</span>
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 shrink-0" />
                  <select
                    aria-label="Pickup Veng"
                    value={originName}
                    onChange={(e) => {
                      setOriginName(e.target.value);
                      setCustomOrigin(null);
                    }}
                    className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-900 dark:text-slate-100 focus:border-emerald-700 focus:outline-none"
                  >
                    {isInterDistrict
                      ? MIZORAM_DISTRICTS.map((d) => (
                          <optgroup key={d.district} label={d.district}>
                            {d.vengs.map((v) => (
                              <option key={v.name} value={v.name}>
                                {v.name} ({d.district})
                              </option>
                            ))}
                          </optgroup>
                        ))
                      : districtVengs.map((v) => (
                          <option key={v.name} value={v.name}>
                            From: {v.name} ({v.elevationM}m)
                          </option>
                        ))}
                  </select>
                </div>
              </div>

              {/* Drop Row with GPS Auto-Fill & Google Map Pin Popup Button */}
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    {lang === 'miz' ? 'Drop (B)' : 'Drop (B)'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handlePinDropGps}
                      className="min-h-[28px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 inline-flex items-center gap-1"
                    >
                      <Crosshair className="w-3 h-3 text-emerald-700 dark:text-emerald-400" />
                      {locatingDropGps
                        ? 'Refining...'
                        : customDest
                          ? 'GPS ✓'
                          : 'Live GPS'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setPinPickerState({ open: true, mode: 'drop' });
                      }}
                      className="min-h-[28px] rounded-lg bg-slate-900 dark:bg-emerald-700 px-2.5 py-0.5 text-[11px] font-bold text-white hover:bg-slate-800 inline-flex items-center gap-1"
                    >
                      <MapPin className="w-3 h-3" />
                      <span>{lang === 'miz' ? 'Pin on Map' : 'Pin on Map'}</span>
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-slate-900 dark:bg-emerald-400 shrink-0" />
                  <select
                    aria-label="Drop Veng"
                    value={destName}
                    onChange={(e) => {
                      setDestName(e.target.value);
                      setCustomDest(null);
                    }}
                    className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-900 dark:text-slate-100 focus:border-emerald-700 focus:outline-none"
                  >
                    {isInterDistrict
                      ? MIZORAM_DISTRICTS.map((d) => (
                          <optgroup key={d.district} label={d.district}>
                            {d.vengs.map((v) => (
                              <option key={v.name} value={v.name}>
                                {v.name} ({d.district})
                              </option>
                            ))}
                          </optgroup>
                        ))
                      : districtVengs.map((v) => (
                          <option key={v.name} value={v.name}>
                            To: {v.name} ({v.elevationM}m)
                          </option>
                        ))}
                  </select>
                </div>
              </div>
            </div>

            {gpsStatusBanner && (
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-3 py-2 text-[11px] font-semibold text-emerald-900 dark:text-emerald-300 flex items-center justify-between gap-2">
                <span>{gpsStatusBanner}</span>
                <button
                  type="button"
                  onClick={() => setGpsStatusBanner(null)}
                  className="text-emerald-700 dark:text-emerald-400 font-bold"
                >
                  ×
                </button>
              </div>
            )}

            {/* Landmark-First Mizoram Addressing (Veng + YMA Section + Nearest Biak In / Tuikhur / Kawn + GPS Pin) */}
            <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-emerald-700 dark:text-emerald-400" />
                  {lang === 'miz'
                    ? 'Mizoram Landmark Address (Auto-Fill / Editable)'
                    : 'Landmark-First Address (Auto-Fill / Editable)'}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={dropYmaSection}
                  onChange={(e) => setDropYmaSection(e.target.value)}
                  placeholder={lang === 'miz' ? 'Drop YMA Section (e.g. Section II)' : 'Drop YMA Section (e.g. Section II)'}
                  className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-emerald-700 focus:outline-none"
                />
                <input
                  type="text"
                  value={dropNearestLandmark}
                  onChange={(e) => setDropNearestLandmark(e.target.value)}
                  placeholder={
                    lang === 'miz'
                      ? 'Drop Biak In / Tuikhur / Kawn hnai ber'
                      : 'Drop Landmark (Biak In / Tuikhur / Kawn)'
                  }
                  className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-emerald-700 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={pickupYmaSection}
                  onChange={(e) => setPickupYmaSection(e.target.value)}
                  placeholder={lang === 'miz' ? 'Pickup YMA Section (Optional)' : 'Pickup YMA Section (Optional)'}
                  className="w-full min-h-[38px] rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-[11px] text-slate-800 dark:text-slate-200 focus:border-emerald-700 focus:outline-none"
                />
                <input
                  type="text"
                  value={pickupNearestLandmark}
                  onChange={(e) => setPickupNearestLandmark(e.target.value)}
                  placeholder={lang === 'miz' ? 'Pickup Biak In / Kawn (Optional)' : 'Pickup Landmark (Optional)'}
                  className="w-full min-h-[38px] rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-[11px] text-slate-800 dark:text-slate-200 focus:border-emerald-700 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Est. {estimate?.distanceKm ?? 1.2} km
                {typeof estimate?.durationMinutes === 'number' ? ` · ~${estimate.durationMinutes} min` : ''}
                {estimate?.distanceSource === 'google_routes_v2' ? ' (Routes v2)' : ''} · {stops.length} stops
              </span>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  const nextVeng = districtVengs[(stops.length + 2) % districtVengs.length];
                  setStops((prev) => [...prev, { lat: nextVeng.lat, lng: nextVeng.lng, label: nextVeng.name }]);
                }}
                className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 dark:text-emerald-400 hover:text-emerald-700 min-h-[32px]"
              >
                <Plus className="w-3.5 h-3.5" />
                {t.addStop}
              </button>
            </div>

            {stops.map((st, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-xl bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700"
              >
                <span>
                  Stop {idx + 1}: {st.label}
                </span>
                <button
                  type="button"
                  aria-label={`Remove stop ${idx + 1}`}
                  onClick={() => setStops((prev) => prev.filter((_, i) => i !== idx))}
                  className="text-slate-400 hover:text-red-600 p-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Kailawn / Step Access Accessibility Toggle & Fair Terrain Surcharge Selector */}
          <div className="rounded-2xl border border-amber-200/90 dark:border-amber-900/70 bg-amber-50/50 dark:bg-amber-950/20 p-3.5 space-y-2.5">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 flex items-center justify-center shrink-0">
                  <Mountain className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {lang === 'miz'
                      ? 'Kailawn / Step Chho-Chhuk A Ngai'
                      : 'Kailawn / Step Access Needed'}
                  </p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    {lang === 'miz'
                      ? 'Step thui leh awih kalna man dik tak Runner tan'
                      : 'Fair terrain effort fee added transparently for your Runner'}
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={kailawnNeeded}
                onChange={(e) => {
                  triggerHaptic('light');
                  const checked = e.target.checked;
                  setKailawnNeeded(checked);
                  if (checked && kailawnStepTier === 'none') {
                    setKailawnStepTier('steps_15_40');
                  }
                }}
                className="w-5 h-5 rounded border-amber-400 text-emerald-700 shrink-0"
              />
            </label>

            {kailawnNeeded && (
              <div className="grid grid-cols-3 gap-2 pt-1">
                {(
                  [
                    ['steps_0_15', '0–15 steps', '+₹15'],
                    ['steps_15_40', '15–40 steps', '+₹35'],
                    ['steps_40_plus', '40+ steps', '+₹65'],
                  ] as const
                ).map(([tierKey, label, fee]) => {
                  const active = kailawnStepTier === tierKey;
                  return (
                    <button
                      key={tierKey}
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setKailawnStepTier(tierKey);
                        if (tierKey === 'steps_40_plus') {
                          setAccessType('long_steps_walk');
                        }
                      }}
                      className={`min-h-[44px] rounded-xl border px-2 py-1.5 text-center transition-all ${
                        active
                          ? 'border-emerald-700 bg-emerald-900 text-white shadow-xs'
                          : 'border-amber-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <p className="text-[11px] font-bold leading-tight">{label}</p>
                      <p className={`text-[10px] font-mono tabular-nums ${active ? 'text-emerald-200' : 'text-amber-700 dark:text-amber-400'}`}>
                        {fee}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="sheet-errand-title" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              {lang === 'miz' ? 'Eng nge tih ngai?' : 'What should we deliver or do?'}
            </label>
            <input
              id="sheet-errand-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                lang === 'miz'
                  ? 'Entirnan: Damdawi lam la, Mission Veng step-ah chho rawh'
                  : 'e.g., Pick up medicine & climb 60 steps in Mission Veng'
              }
              className="w-full min-h-[46px] rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-emerald-700 focus:outline-none"
            />
          </div>

          {/* 15-Second Mizo Voice Note Booking ("Hmet la Sawi Rawh") + Gate Photo */}
          <VoiceNoteRecorder
            lang={lang}
            value={errandVoiceNote}
            onChange={(next) => {
              setErrandVoiceNote(next);
              if (next?.noteText) {
                setVoiceNoteTranscript(next.noteText);
              }
            }}
            contextLabelEn="Voice instruction for Runner (no typing needed · 15s)"
            contextLabelMiz="Type ngai loin Runner hrilh rawh (second 15)"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setGateCameraOpen(true)}
              className="min-h-[44px] rounded-2xl bg-emerald-800 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-900 flex items-center justify-center gap-2"
            >
              <Camera className="w-4 h-4 shrink-0" />
              <span>
                {buildingPhotoUrl
                  ? lang === 'miz'
                    ? 'Camera-in La Nawn'
                    : 'Retake with Camera'
                  : lang === 'miz'
                    ? 'Live Camera-in La Rawh'
                    : 'Open Live Camera'}
              </span>
            </button>
            <label className="min-h-[44px] rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center gap-2 cursor-pointer">
              <Camera className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
              <span className="truncate">
                {buildingPhotoUrl
                  ? 'Gate Photo Attached ✓'
                  : lang === 'miz'
                    ? 'Thlalak Upload (Gallery)'
                    : 'Upload Gate Photo'}
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </label>
          </div>

          <div className="rounded-2xl border border-slate-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvancedOptions((v) => !v)}
              className="w-full min-h-[44px] px-4 py-2.5 bg-slate-50 flex items-center justify-between text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              <span className="inline-flex items-center gap-2">
                <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-700" />
                {lang === 'miz'
                  ? 'Duh Belh (Landmark Search, Payment, ₹3 Insurance)'
                  : 'More options (Landmark Search, Payment, ₹3 Insurance)'}
              </span>
              <ChevronDown
                className={`w-4 h-4 text-slate-500 transition-transform ${showAdvancedOptions ? 'rotate-180' : ''}`}
              />
            </button>

            {showAdvancedOptions && (
              <div className="p-4 space-y-3 bg-white border-t border-slate-200">
                <Suspense fallback={<div className="h-10 rounded-xl bg-slate-100 animate-pulse" />}>
                  <LazyPlacesSearchInput
                    apiKey={mapsApiKey}
                    district={selectedDistrict}
                    placeholder={`Search specific landmark in ${selectedDistrict}...`}
                    onSelect={(pl) => setCustomDest({ lat: pl.lat, lng: pl.lng, label: pl.label })}
                  />
                </Suspense>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label htmlFor="sheet-access" className="block text-[11px] font-medium text-slate-600 mb-1">
                      Terrain Access
                    </label>
                    <select
                      id="sheet-access"
                      value={accessType}
                      onChange={(e) => setAccessType(e.target.value as AccessType)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900"
                    >
                      <option value="long_steps_walk">{t.terrainSteps}</option>
                      <option value="vehicle_accessible">{t.terrainVehicle}</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="sheet-pay" className="block text-[11px] font-medium text-slate-600 mb-1">
                      Payment
                    </label>
                    <select
                      id="sheet-pay"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as 'upi_escrow' | 'dynamic_qr_cod')}
                      className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900"
                    >
                      <option value="upi_escrow">UPI Escrow (100%)</option>
                      <option value="dynamic_qr_cod">Dynamic QR COD</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label htmlFor="sheet-val" className="block text-[11px] font-medium text-slate-600 mb-1">
                      Item Value (₹)
                    </label>
                    <input
                      id="sheet-val"
                      type="number"
                      min={0}
                      value={declaredValue}
                      onChange={(e) => setDeclaredValue(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label htmlFor="sheet-voice" className="block text-[11px] font-medium text-slate-600 mb-1">
                      Landmark Note
                    </label>
                    <input
                      id="sheet-voice"
                      type="text"
                      value={voiceNoteTranscript}
                      onChange={(e) => setVoiceNoteTranscript(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
                    />
                  </div>
                </div>

                {jobType === 'heavy_cargo_shift' && (
                  <label className="flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={needsWalkerHelper}
                      onChange={(e) => setNeedsWalkerHelper(e.target.checked)}
                    />
                    Add On-Foot Runner Helper (+₹120)
                  </label>
                )}

                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={microInsuranceOptIn}
                    onChange={(e) => setMicroInsuranceOptIn(e.target.checked)}
                  />
                  ₹{remoteConfig.microInsuranceSachetRs} Transit &amp; Accident Micro-Insurance
                </label>
              </div>
            )}
          </div>
        </form>
      </LayerWindow>

      {/* ===================================================================== */}
      {/* LAYER 1: LIVE MIZORAM MAP WINDOW                                      */}
      {/* ===================================================================== */}
      <LayerWindow
        open={mapLayerOpen}
        onClose={() => setMapLayerOpen(false)}
        title={lang === 'miz' ? `${selectedDistrict} Live Map` : `Live in ${selectedDistrict}`}
        subtitle={`${originName} → ${destName} · ${onlinePartnerCount} online · Est. ${estimate?.distanceKm ?? 1.2} km`}
        size="lg"
        headerAction={
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setPinPickerState({ open: true, mode: 'pickup' });
              }}
              className="min-h-[34px] rounded-xl bg-emerald-800 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-900 inline-flex items-center gap-1"
            >
              <MapPin className="w-3 h-3" />
              <span>Pin A</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setPinPickerState({ open: true, mode: 'drop' });
              }}
              className="min-h-[34px] rounded-xl bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-slate-800 inline-flex items-center gap-1"
            >
              <MapPin className="w-3 h-3" />
              <span>Pin B</span>
            </button>
          </div>
        }
        footer={
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] text-slate-500">All-Inclusive Estimate</p>
              <p className="text-xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
                ₹{estimate?.allInclusiveTotal ?? instantFarePreview}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setMapLayerOpen(false);
                setBookingSheetOpen(true);
              }}
              className="flex-1 min-h-[48px] rounded-2xl bg-emerald-900 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-800 active:scale-[0.98] transition-all"
            >
              {lang === 'miz' ? 'Hemi Kawngah Ko Rawh' : 'Book This Route'}
            </button>
          </div>
        }
      >
        <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
          {userSettings.lowDataMode && !forceLoadMapInLowData ? (
            <div className="h-[46dvh] min-h-[260px] bg-slate-50 dark:bg-slate-900 p-6 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                <MapIcon className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-xs">
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {lang === 'miz' ? 'Low-Data Mode Hman Mek A Ni' : 'Low-Data Mode Active'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {originName} → {destName} · {onlinePartnerCount} online partners in {selectedDistrict}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setForceLoadMapInLowData(true);
                }}
                className="min-h-[44px] rounded-2xl bg-emerald-900 px-5 py-2.5 text-xs font-bold text-white"
              >
                {lang === 'miz' ? 'Interactive Map Load Rawh' : 'Load Interactive Map'}
              </button>
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="h-[52dvh] min-h-[280px] bg-slate-100 flex items-center justify-center text-xs text-slate-500">
                  Loading {selectedDistrict} Live Map...
                </div>
              }
            >
              <LazyMizoramMap
                apiKey={mapsApiKey}
                district={selectedDistrict}
                districtCenter={districtInfo.center}
                districtVengs={districtVengs}
                origin={originPoint}
                stops={stops}
                destination={destPoint}
                partners={districtPartners}
                sosTickets={sosTickets}
                liveUserGps={liveUserGps}
                heightClass="h-[52dvh] min-h-[280px]"
              />
            </Suspense>
          )}
        </div>
      </LayerWindow>

      {/* ===================================================================== */}
      {/* LAYER 1: LIVE ACTIVITY & PARTNER BIDS WINDOW                          */}
      {/* ===================================================================== */}
      <LayerWindow
        open={activityLayerOpen}
        onClose={() => setActivityLayerOpen(false)}
        title={lang === 'miz' ? 'Order & Partner Bid-te' : 'Live Activity & Partner Bids'}
        subtitle={`${errands.length} active · ${pendingBidsCount} offers waiting`}
        size="lg"
        headerAction={
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setActivityLayerOpen(false);
              setBookingSheetOpen(true);
            }}
            className="min-h-[38px] rounded-xl bg-emerald-900 px-3 py-1.5 text-xs font-bold text-white inline-flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            {lang === 'miz' ? 'Thar' : 'New'}
          </button>
        }
      >
        {errands.length === 0 ? (
          <div className="py-10 text-center space-y-3">
            <p className="text-sm font-semibold text-slate-700">
              {lang === 'miz' ? 'Order kal mek a awm rih lo.' : 'No active errands or rides yet.'}
            </p>
            <button
              type="button"
              onClick={() => {
                setActivityLayerOpen(false);
                setBookingSheetOpen(true);
              }}
              className="min-h-[44px] rounded-2xl bg-emerald-800 px-5 py-2.5 text-xs font-bold text-white"
            >
              {lang === 'miz' ? 'Runner Ko Rawh' : 'Book Your First Errand'}
            </button>
          </div>
        ) : (
          <div className="space-y-3.5">
            {errands.map((job) => (
              <article
                key={job.id}
                className="rounded-2xl border border-slate-200/80 bg-white p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-slate-500">
                      {job.district || 'Aizawl'} · {job.distanceKm} km · OTP{' '}
                      <span className="font-mono font-bold text-slate-900">{job.otpCode}</span>
                    </p>
                    <h3 className="text-sm font-bold text-slate-900 mt-0.5 leading-snug">{job.title}</h3>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-extrabold font-mono tabular-nums text-slate-900">
                      ₹{job.allInclusiveTotal}
                    </p>
                    <p className="text-[11px] font-semibold text-emerald-700 capitalize">
                      {job.status.replace('_', ' ')}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 px-3 py-2 space-y-1 text-xs">
                  <div className="flex items-center gap-2 text-slate-700">
                    <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />
                    <span className="font-medium truncate">{job.origin.label || 'Pickup'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-900">
                    <span className="w-2 h-2 rounded-xs bg-slate-900 shrink-0" />
                    <span className="font-semibold truncate">
                      {job.destination.label || 'Drop'}
                      {job.stops.length > 0 ? ` (+${job.stops.length} stops)` : ''}
                    </span>
                  </div>
                </div>

                {job.bids.length === 0 ? (
                  <p className="text-xs text-slate-500 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    {lang === 'miz'
                      ? 'Partner hnai berte bid nghah mek a ni...'
                      : 'Finding nearby verified partners...'}
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {job.bids.map((bid) => (
                      <div
                        key={bid.id}
                        className="py-2.5 first:pt-1 last:pb-0 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-900 font-bold text-xs flex items-center justify-center shrink-0">
                            {bid.partnerName
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 truncate">{bid.partnerName}</p>
                            <p className="text-[11px] text-slate-500 truncate">
                              ★ {bid.partnerRating} · {bid.etaMinutes}m away
                              {bid.corridorMatchMeters !== null ? ` · ${bid.corridorMatchMeters}m` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0">
                          <span className="text-sm font-extrabold font-mono tabular-nums text-slate-900">
                            ₹{bid.bidAmount}
                          </span>
                          {job.status === 'bidding' ? (
                            <button
                              type="button"
                              onClick={() => handleSelectBid(job.id, bid.id)}
                              className="min-h-[40px] rounded-xl bg-emerald-800 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-900 active:scale-95 transition-all"
                            >
                              {lang === 'miz' ? 'Thlang' : 'Accept'}
                            </button>
                          ) : (
                            job.selectedBidId === bid.id && (
                              <span className="text-xs font-bold text-emerald-700">Booked</span>
                            )
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  <span className="text-[11px] text-slate-500">
                    {job.paymentMethod === 'upi_escrow' ? 'UPI Escrow' : 'QR COD'} ·{' '}
                    {job.accessType === 'long_steps_walk' ? 'Steps' : 'Road'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setDetailErrandId(job.id);
                    }}
                    className="min-h-[38px] rounded-xl bg-slate-100 hover:bg-slate-200/80 px-3 py-1.5 text-xs font-bold text-slate-900 inline-flex items-center gap-1"
                  >
                    {lang === 'miz' ? 'Detail Kimchang' : 'Full Details'}
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </LayerWindow>

      {/* ===================================================================== */}
      {/* LAYER 1: QUICK 24x7 EMERGENCY SOS POPUP (LAUNCHABLE FROM HOME)        */}
      {/* ===================================================================== */}
      <LayerWindow
        open={quickSosLayerOpen}
        onClose={() => setQuickSosLayerOpen(false)}
        title={t.sosTitle}
        subtitle={`${selectedDistrict} · 15–30 min arrival SLA`}
        accent="danger"
        size="md"
        footer={
          <button
            type="submit"
            form="quick-sos-popup-form"
            disabled={dispatchingSos}
            className="w-full min-h-[50px] rounded-2xl bg-red-600 px-5 py-3 text-sm font-extrabold text-white hover:bg-red-700 active:scale-[0.98] disabled:opacity-50 transition-all"
          >
            {dispatchingSos
              ? lang === 'miz'
                ? 'Tirh mek...'
                : 'Dispatching...'
              : sosConfirmArmed
                ? lang === 'miz'
                  ? 'Hmet nawn la SOS tirh ngei rawh (Confirm)'
                  : 'Tap Again to Confirm Rapid SOS'
                : lang === 'miz'
                  ? `${selectedSosMeta.titleMiz} · ₹${selectedSosMeta.rate} Tirh Rawh`
                  : `Dispatch ${selectedSosMeta.title} · ₹${selectedSosMeta.rate}`}
          </button>
        }
      >
        <form id="quick-sos-popup-form" onSubmit={handleDispatchSos} className="space-y-3.5">
          {/* Direct Helplines */}
          <div className="grid grid-cols-4 gap-1.5">
            {officialHelplines.map((line) => (
              <a
                key={line.num}
                href={`tel:${line.num}`}
                onClick={() => triggerHaptic('sos')}
                className="min-h-[44px] rounded-xl bg-red-50 hover:bg-red-100 border border-red-200/80 px-1.5 py-1.5 flex flex-col items-center justify-center text-center"
              >
                <span className="text-xs font-extrabold font-mono text-red-700 leading-none">{line.num}</span>
                <span className="text-[10px] font-semibold text-slate-700 mt-0.5 truncate max-w-full">
                  {line.label}
                </span>
              </a>
            ))}
          </div>

          {/* Group Filter */}
          <div className="grid grid-cols-4 gap-1 rounded-2xl bg-slate-100 p-1">
            {(
              [
                ['all', lang === 'miz' ? 'Vek (12)' : 'All (12)'],
                ['medical_safety', 'Medical'],
                ['home_utility', lang === 'miz' ? 'In Chhung' : 'Home'],
                ['road_monsoon', lang === 'miz' ? 'Kawng' : 'Road'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setSosGroupFilter(key);
                }}
                className={`min-h-[34px] rounded-xl px-1.5 py-1 text-[11px] font-bold transition-all ${
                  sosGroupFilter === key ? 'bg-white text-red-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {visibleSosCategories.map((cat) => {
              const active = sosCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => selectSosCategory(cat.id, cat.defaultNote)}
                  className={`rounded-2xl p-2.5 text-left border transition-all ${
                    active ? 'border-red-600 bg-red-50/80' : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="mb-1">{cat.icon}</div>
                  <p className="text-xs font-bold text-slate-900 leading-tight">
                    {lang === 'miz' ? cat.titleMiz : cat.title}
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 mt-0.5 tabular-nums">
                    ₹{cat.rate} · {cat.sla}
                  </p>
                </button>
              );
            })}
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label htmlFor="popup-sos-veng" className="block text-xs font-bold text-slate-700">
                {lang === 'miz' ? `I Awmna Veng (${selectedDistrict})` : `Your Veng (${selectedDistrict})`}
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCaptureSosGps}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 hover:text-red-700"
                >
                  <Crosshair className="w-3 h-3" />
                  {locatingSosGps ? 'Locking...' : sosLiveGps ? 'GPS ✓' : 'Live GPS'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setPinPickerState({ open: true, mode: 'sos' });
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 hover:text-red-700"
                >
                  <MapPin className="w-3 h-3" />
                  <span>Map</span>
                </button>
              </div>
            </div>
            <select
              id="popup-sos-veng"
              value={sosVeng}
              onChange={(e) => {
                setSosVeng(e.target.value);
                setSosLiveGps(null);
              }}
              className="w-full min-h-[46px] rounded-2xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-900"
            >
              {districtVengs.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} · {v.zone}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="popup-sos-note" className="block text-xs font-bold text-slate-700 mb-1">
              {lang === 'miz' ? 'Harsatna Tawi' : 'Emergency Details'}
            </label>
            <textarea
              id="popup-sos-note"
              rows={2}
              value={sosVoiceNote}
              onChange={(e) => setSosVoiceNote(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-red-600 focus:outline-none"
            />
          </div>
        </form>
      </LayerWindow>

      {/* ===================================================================== */}
      {/* LAYER 1: LIVE 24x7 SOS DISPATCHES WINDOW                              */}
      {/* ===================================================================== */}
      <LayerWindow
        open={sosTicketsLayerOpen}
        onClose={() => setSosTicketsLayerOpen(false)}
        title={lang === 'miz' ? 'Emergency Kal Mek-te' : 'Live 24×7 SOS Dispatches'}
        subtitle={`${sosTickets.length} active dispatches`}
        accent="danger"
        size="lg"
      >
        {sosTickets.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            {lang === 'miz' ? 'Emergency tirh mek a awm rih lo.' : 'No active SOS tickets right now.'}
          </p>
        ) : (
          <div className="space-y-3">
            {sosTickets.map((ticket) => (
              <article
                key={ticket.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-mono text-red-600 font-bold">
                      {ticket.id} · {ticket.veng} ({ticket.district || 'Aizawl'})
                    </p>
                    <h3 className="text-sm font-bold text-slate-900 mt-0.5">
                      {ticket.assignedTechName} · {ticket.assignedTechShift}
                    </h3>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-extrabold font-mono tabular-nums text-slate-900">
                      ₹{ticket.standardizedRate + ticket.sparePartsAmount}
                    </p>
                    <p className="text-[11px] text-slate-500 capitalize">
                      {ticket.slaTargetMinutes}m SLA · {ticket.status.replace('_', ' ')}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-600 rounded-xl bg-slate-50 px-3 py-2">
                  “{ticket.voiceNoteTranscript}”
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-[11px] text-slate-500">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" /> Salaried Tech
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" /> Parts ₹{ticket.sparePartsAmount}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setDetailSosId(ticket.id);
                    }}
                    className="min-h-[36px] rounded-xl bg-red-50 hover:bg-red-100 px-3 py-1 text-xs font-bold text-red-700 inline-flex items-center gap-1"
                  >
                    {lang === 'miz' ? 'Detail Kimchang' : 'Full Details'}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </LayerWindow>

      {/* ===================================================================== */}
      {/* LAYER 1: MARKETPLACE PRODUCT DETAIL & CHECK-BEFORE-PAY POPUP          */}
      {/* ===================================================================== */}
      <LayerWindow
        open={Boolean(selectedProduct)}
        onClose={() => setSelectedProduct(null)}
        title={selectedProduct ? (lang === 'miz' ? selectedProduct.titleMiz : selectedProduct.titleEn) : ''}
        subtitle={selectedProduct ? `${selectedProduct.shopName} · ${selectedProduct.veng}` : undefined}
        size="md"
        footer={
          selectedProduct && (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] text-slate-500">All-Inclusive Total</p>
                <p className="text-2xl font-extrabold font-mono tabular-nums text-slate-900">
                  ₹{selectedProduct.price + 55 + (mktInsurance ? remoteConfig.microInsuranceSachetRs : 0)}
                </p>
              </div>
              <button
                type="button"
                disabled={!effectiveVisibility.marketplace || placingOrder}
                onClick={() => handlePlaceMarketplaceOrder(selectedProduct.id)}
                className="flex-1 min-h-[48px] rounded-2xl bg-emerald-800 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-900 active:scale-[0.98] disabled:opacity-40 transition-all"
              >
                {placingOrder
                  ? lang === 'miz'
                    ? 'Order mek...'
                    : 'Placing Order...'
                  : lang === 'miz'
                    ? 'Order Rawh'
                    : 'Place Order Now'}
              </button>
            </div>
          )
        }
      >
        {selectedProduct && (
          <div className="space-y-4">
            <div className="aspect-[16/10] rounded-2xl overflow-hidden bg-slate-100">
              <img
                src={selectedProduct.imageUrl}
                alt={selectedProduct.titleEn}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            </div>

            <div className="rounded-2xl border border-slate-200/80 p-3.5 space-y-2 text-xs">
              <h4 className="font-bold uppercase tracking-wider text-slate-500">
                {lang === 'miz' ? 'Thil Nihphung Kimchang' : 'Full Product Specifications'}
              </h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Category</span>
                  <span className="font-semibold text-slate-900 truncate">{selectedProduct.category}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Stock</span>
                  <span className="font-mono font-semibold text-slate-900">{selectedProduct.stock} left</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Color</span>
                  <span className="font-semibold text-slate-900 truncate">{selectedProduct.color}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Size</span>
                  <span className="font-semibold text-slate-900 truncate">{selectedProduct.size}</span>
                </div>
                <div className="flex justify-between gap-2 col-span-2">
                  <span className="text-slate-500">Shop Location</span>
                  <span className="font-semibold text-slate-900 truncate">
                    {selectedProduct.shopName} · {selectedProduct.veng} ({selectedProduct.district || 'Aizawl'})
                  </span>
                </div>
              </div>
              {selectedProduct.tags.length > 0 && (
                <p className="text-[11px] text-slate-500 pt-1.5 border-t border-slate-100">
                  {selectedProduct.tags.join(' · ')}
                </p>
              )}
            </div>

            <div className="rounded-2xl bg-slate-50 p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Item Price</span>
                <span className="font-mono font-bold text-slate-900">₹{selectedProduct.price}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Hyperlocal Delivery</span>
                <span className="font-mono font-semibold text-slate-800">₹55</span>
              </div>
              <label className="flex items-center justify-between pt-2 border-t border-slate-200/80 cursor-pointer">
                <span className="font-semibold text-slate-800">
                  ₹{remoteConfig.microInsuranceSachetRs} Transit &amp; Return Cover
                </span>
                <input
                  type="checkbox"
                  checked={mktInsurance}
                  onChange={(e) => setMktInsurance(e.target.checked)}
                />
              </label>
            </div>

            <div className="rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 p-3.5 text-xs text-emerald-950 dark:text-emerald-200 space-y-1">
              <p className="font-bold">
                {selectedProduct.checkBeforePayEligible
                  ? lang === 'miz'
                    ? 'En Hmasak Phawt (Check-Before-Pay)'
                    : 'En Hmasak Phawt · Check-Before-Pay Eligible'
                  : 'Sealed Hygiene Delivery'}
              </p>
              <p className="text-emerald-900/80 dark:text-emerald-300/80">
                {selectedProduct.checkBeforePayEligible
                  ? `Inspect quality at your doorstep before releasing UPI Escrow. Return fee ₹${remoteConfig.returnDeliveryFee} if rejected (${userMonthlyReturns['cust-1'] ?? 0}/${remoteConfig.monthlyReturnLimit} monthly limit).`
                  : 'Delivered sealed directly from merchant for hygiene safety.'}
              </p>
            </div>

            {/* 15-Second Voice Instruction for Merchant ("Hmet la Sawi Rawh") */}
            <VoiceNoteRecorder
              lang={lang}
              value={mktVoiceNote}
              onChange={setMktVoiceNote}
              contextLabelEn="Optional 15s voice note for Shop / Merchant (size, color, gate)"
              contextLabelMiz="Dawr neitu hrilhna aw (size, rawng, kawt hmun · 15s)"
            />
          </div>
        )}
      </LayerWindow>

      {/* ===================================================================== */}
      {/* LAYER 1: MARKETPLACE ORDERS & DOORSTEP INSPECTION WINDOW              */}
      {/* ===================================================================== */}
      <LayerWindow
        open={ordersLayerOpen}
        onClose={() => setOrdersLayerOpen(false)}
        title={lang === 'miz' ? 'I Bazar Order-te' : 'Your Orders & Gate Inspection'}
        subtitle={`${orders.length} orders · En Hmasak Phawt Escrow`}
        size="lg"
      >
        {orders.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            {lang === 'miz' ? 'Bazar order a la awm lo.' : 'No marketplace orders yet.'}
          </p>
        ) : (
          <div className="space-y-3">
            {orders.map((ord) => (
              <div
                key={ord.id}
                className="rounded-2xl border border-slate-200/90 bg-white p-4 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-mono text-slate-500">
                      {ord.id} · {ord.shopName} ({ord.veng}) · {ord.status.replace(/_/g, ' ')}
                    </p>
                    <h3 className="text-sm font-bold text-slate-900 mt-0.5">{ord.productTitle}</h3>
                  </div>
                  <span className="text-base font-extrabold font-mono tabular-nums text-slate-900">
                    ₹{ord.allInclusiveTotal}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setDetailOrderId(ord.id);
                      }}
                      className="min-h-[40px] rounded-xl bg-slate-100 hover:bg-slate-200/80 px-3 py-2 text-xs font-bold text-slate-900 inline-flex items-center gap-1"
                    >
                      {lang === 'miz' ? 'Detail Kimchang' : 'Full Details'}
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setActiveChatOrderId(ord.id);
                      }}
                      className="min-h-[40px] rounded-xl bg-slate-100 hover:bg-slate-200/80 px-3 py-2 text-xs font-bold text-slate-800 inline-flex items-center gap-1.5"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-700" />
                      {lang === 'miz' ? 'Chat' : 'Chat'} ({ord.chatMessages.length})
                    </button>
                  </div>

                  {ord.status === 'awaiting_inspection' && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleInspectOrder(ord.id, 'accept')}
                        className="min-h-[40px] rounded-xl bg-emerald-800 px-3.5 py-2 text-xs font-bold text-white"
                      >
                        Accept &amp; Pay
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInspectOrder(ord.id, 'reject')}
                        className="min-h-[40px] rounded-xl bg-red-50 px-3.5 py-2 text-xs font-bold text-red-700"
                      >
                        Return (₹{ord.returnFeeOnReject})
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </LayerWindow>

      {/* ===================================================================== */}
      {/* LAYER 2 (STACKED): SHOP CHAT WINDOW ON TOP OF ORDERS LAYER            */}
      {/* ===================================================================== */}
      <LayerWindow
        open={Boolean(activeChatOrder)}
        onClose={() => setActiveChatOrderId(null)}
        onBack={() => setActiveChatOrderId(null)}
        layerLevel={2}
        title={activeChatOrder ? activeChatOrder.shopName : 'Shop Chat'}
        subtitle={activeChatOrder ? `${activeChatOrder.id} · ${activeChatOrder.productTitle}` : undefined}
        size="sm"
        headerAction={
          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-800 mr-1">
            <PhoneCall className="w-3.5 h-3.5" /> Call
          </span>
        }
        footer={
          activeChatOrder && (
            <div className="flex gap-2">
              <input
                type="text"
                value={chatDrafts[activeChatOrder.id] || ''}
                onChange={(e) =>
                  setChatDrafts((p) => ({ ...p, [activeChatOrder.id]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleSendMerchantChat(activeChatOrder.id);
                  }
                }}
                placeholder={lang === 'miz' ? 'Dawr bia rawh...' : 'Message shop...'}
                className="flex-1 min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm focus:border-emerald-700 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => handleSendMerchantChat(activeChatOrder.id)}
                aria-label="Send message"
                className="min-h-[44px] min-w-[44px] rounded-xl bg-emerald-900 px-3.5 text-white flex items-center justify-center active:scale-95 transition-transform"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          )
        }
      >
        {activeChatOrder && (
          <div className="space-y-2.5 min-h-[200px]">
            {activeChatOrder.chatMessages.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-8">
                Start chatting directly with {activeChatOrder.shopName}.
              </p>
            ) : (
              activeChatOrder.chatMessages.map((m, i) => (
                <div
                  key={i}
                  className={`rounded-2xl px-3.5 py-2 text-xs max-w-[85%] ${
                    m.sender === 'customer'
                      ? 'ml-auto bg-emerald-800 text-white'
                      : 'bg-slate-100 text-slate-800'
                  }`}
                >
                  {m.text}
                </div>
              ))
            )}
          </div>
        )}
      </LayerWindow>

      {/* ===================================================================== */}
      {/* LAYER 1: WORKER PROFILE & SAFEGUARDS BOOKING POPUP                    */}
      {/* ===================================================================== */}
      <LayerWindow
        open={Boolean(selectedWorker)}
        onClose={() => setSelectedWorker(null)}
        title={selectedWorker ? selectedWorker.name : ''}
        subtitle={
          selectedWorker
            ? `${lang === 'miz' ? selectedWorker.roleTitleMiz : selectedWorker.roleTitle} · ${selectedWorker.veng}`
            : undefined
        }
        size="md"
        footer={
          selectedWorker && (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] text-slate-500">
                  {selectedWorker.monthlyPackageRate ? 'Monthly Package' : 'Daily Rate'}
                </p>
                <p className="text-2xl font-extrabold font-mono tabular-nums text-slate-900">
                  ₹{(selectedWorker.monthlyPackageRate || selectedWorker.dailyRate || 1100).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                disabled={bookingWorker}
                onClick={() => handleBookWorker(selectedWorker)}
                className="flex-1 min-h-[48px] rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50 transition-all"
              >
                {bookingWorker
                  ? lang === 'miz'
                    ? 'Contract siam mek...'
                    : 'Creating Contract...'
                  : lang === 'miz'
                    ? 'Contract & Book Rawh'
                    : 'Confirm Contract & Book'}
              </button>
            </div>
          )
        }
      >
        {selectedWorker && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <img
                src={selectedWorker.avatarUrl}
                alt={selectedWorker.name}
                referrerPolicy="no-referrer"
                className="h-16 w-16 rounded-2xl object-cover shrink-0 bg-slate-100"
              />
              <div className="space-y-1 min-w-0">
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  <span className="font-bold text-slate-900">{selectedWorker.rating}</span>
                  <span>· Skill {selectedWorker.practicalSkillScore}/100</span>
                </p>
                <p className="text-xs font-semibold text-emerald-800">
                  {selectedWorker.groomingTrainingStatus}
                </p>
                <p className="text-xs text-slate-600">{selectedWorker.skills.join(' · ')}</p>
              </div>
            </div>

            {/* Clean Unboxed Verified Trust Scorecard */}
            <p className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-400 border-y border-slate-200/80 dark:border-slate-800 py-2">
              Police Verified ✓ · YMA/VC Endorsed ✓ · Skill {selectedWorker.practicalSkillScore}/100 ✓ · Zero Hidden Fee ✓
            </p>

            {/* Full Worker Profile & Verification Specs */}
            <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 p-3.5 space-y-2 text-xs">
              <h4 className="font-bold uppercase tracking-wider text-slate-500">
                {lang === 'miz' ? 'Chanchin Kimchang & Verification' : 'Full Profile & Rates'}
              </h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Mode</span>
                  <span className="font-semibold text-slate-900 truncate">
                    {selectedWorker.mode === 'company_managed_staffing' ? 'Managed Awmpui' : 'On-Demand'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">District</span>
                  <span className="font-semibold text-slate-900 truncate">
                    {selectedWorker.district || 'Aizawl'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Outstation</span>
                  <span className="font-semibold text-slate-900">
                    {selectedWorker.outstationAvailable ? 'Available' : 'Local only'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Live-In</span>
                  <span className="font-semibold text-slate-900">
                    {selectedWorker.liveInAvailable ? 'Available' : 'Day shift'}
                  </span>
                </div>
                <div className="flex justify-between gap-2 col-span-2">
                  <span className="text-slate-500">Replacement Guarantee</span>
                  <span className="font-semibold text-emerald-800">
                    {selectedWorker.replacementGuarantee ? 'Verified Instant Replacement' : 'Standard'}
                  </span>
                </div>
              </div>
              {(selectedWorker.hourlyRate || selectedWorker.dailyRate || selectedWorker.monthlyPackageRate) && (
                <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-3 font-mono text-[11px] text-slate-700">
                  {selectedWorker.hourlyRate && <span>Hourly: ₹{selectedWorker.hourlyRate}</span>}
                  {selectedWorker.dailyRate && <span>Daily: ₹{selectedWorker.dailyRate.toLocaleString()}</span>}
                  {selectedWorker.monthlyPackageRate && (
                    <span>Monthly: ₹{selectedWorker.monthlyPackageRate.toLocaleString()}</span>
                  )}
                </div>
              )}
              {selectedWorker.portfolioUrls.length > 0 && (
                <div className="pt-2 border-t border-slate-100 grid grid-cols-3 gap-2">
                  {selectedWorker.portfolioUrls.slice(0, 3).map((url, idx) => (
                    <img
                      key={idx}
                      src={url}
                      alt={`${selectedWorker.name} work sample ${idx + 1}`}
                      referrerPolicy="no-referrer"
                      className="aspect-[4/3] w-full rounded-xl object-cover bg-slate-100"
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Live-In / Outstation Safety Protocol lives cleanly inside the booking layer */}
            <div className="rounded-2xl bg-slate-50 p-4 space-y-3 text-xs border border-slate-200/80">
              <label className="flex items-center justify-between font-bold text-slate-900 cursor-pointer">
                <span>Outstation / Live-In Placement Safeguards</span>
                <input
                  type="checkbox"
                  checked={outstationMode || selectedWorker.mode === 'company_managed_staffing'}
                  disabled={selectedWorker.mode === 'company_managed_staffing'}
                  onChange={(e) => setOutstationMode(e.target.checked)}
                />
              </label>
              <p className="text-[11px] text-slate-500">
                Required for Managed Awmpui &amp; Live-In contracts to guarantee worker welfare.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-slate-800">
                <label className="min-h-[40px] rounded-xl bg-white border border-slate-200 px-3 py-2 inline-flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={accChecked} onChange={(e) => setAccChecked(e.target.checked)} />
                  Safe Room
                </label>
                <label className="min-h-[40px] rounded-xl bg-white border border-slate-200 px-3 py-2 inline-flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={foodChecked} onChange={(e) => setFoodChecked(e.target.checked)} />
                  Daily Meals
                </label>
                <label className="min-h-[40px] rounded-xl bg-white border border-slate-200 px-3 py-2 inline-flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={travelChecked} onChange={(e) => setTravelChecked(e.target.checked)} />
                  Travel Covered
                </label>
              </div>
            </div>

            {staffFeedback && staffFeedback.type === 'err' && (
              <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-800">
                {staffFeedback.msg}
              </p>
            )}
          </div>
        )}
      </LayerWindow>

      {/* ===================================================================== */}
      {/* LAYER 1: ACTIVE CONTRACTS & WORKER SAFETY WINDOW                      */}
      {/* ===================================================================== */}
      <LayerWindow
        open={contractsLayerOpen}
        onClose={() => setContractsLayerOpen(false)}
        title={lang === 'miz' ? 'Awmpui & Staff Contract-te' : 'Active Contracts & Worker Safety'}
        subtitle={`${staffingBookings.length} active digital contracts`}
        size="lg"
      >
        {staffingBookings.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            {lang === 'miz' ? 'Staff contract siam a la awm lo.' : 'No active staffing contracts yet.'}
          </p>
        ) : (
          <div className="space-y-3">
            {staffingBookings.map((b) => (
              <div
                key={b.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {b.workerName} · <span className="font-mono text-xs">{b.contractId}</span>
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    ₹{b.allInclusiveAmount.toLocaleString()} ·{' '}
                    {b.tripartiteAgreement ? 'Managed Payroll Contract' : 'Direct Contract'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setDetailContractId(b.id);
                    }}
                    className="min-h-[42px] rounded-xl bg-slate-100 hover:bg-slate-200/80 px-3.5 py-2 text-xs font-bold text-slate-900 inline-flex items-center gap-1"
                  >
                    {lang === 'miz' ? 'Detail Kimchang' : 'Full Details'}
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTriggerWorkerSos(b.id)}
                    className={`min-h-[42px] rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
                      b.workerSosActive ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100'
                    }`}
                  >
                    {b.workerSosActive ? 'Worker SOS Active' : 'Worker SOS'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </LayerWindow>

      {/* LAYER 1: ZORUN WALLET & REFERRAL REWARDS WINDOW */}
      <WalletRewardsWindow
        open={walletLayerOpen}
        onClose={() => setWalletLayerOpen(false)}
        lang={lang}
        wallet={customerWallet}
        onWalletUpdated={onRefresh}
      />

      {/* LAYER 1: INTER-DISTRICT SUMO COUNTER PARCEL BRIDGE WINDOW */}
      <SumoParcelWindow
        open={sumoLayerOpen}
        onClose={() => setSumoLayerOpen(false)}
        lang={lang}
        selectedDistrict={selectedDistrict}
        plusPassActive={customerWallet.plusPassActive}
        parcels={sumoParcels}
        onBooked={onRefresh}
      />

      {/* LAYER 2: COMPREHENSIVE FULL-DETAIL INSPECTION WINDOWS */}
      <CustomerDetailLayers
        lang={lang}
        selectedErrand={detailErrand}
        onCloseErrand={() => setDetailErrandId(null)}
        onSelectBid={handleSelectBid}
        selectedOrder={detailOrder}
        onCloseOrder={() => setDetailOrderId(null)}
        onInspectOrder={handleInspectOrder}
        onOpenOrderChat={(orderId) => setActiveChatOrderId(orderId)}
        selectedContract={detailContract}
        onCloseContract={() => setDetailContractId(null)}
        onTriggerWorkerSos={handleTriggerWorkerSos}
        selectedSosTicket={detailSosTicket}
        onCloseSosTicket={() => setDetailSosId(null)}
      />

      {/* LAYER 2: GOOGLE MAPS / TERRAIN LOCATION PIN PICKER POPUP MENU */}
      <MapPinPickerWindow
        open={pinPickerState.open}
        onClose={() => setPinPickerState((prev) => ({ ...prev, open: false }))}
        lang={lang}
        apiKey={mapsApiKey}
        initialMode={pinPickerState.mode}
        district={selectedDistrict}
        origin={originPoint}
        destination={destPoint}
        partners={districtPartners}
        sosTickets={sosTickets}
        onConfirmLocation={(mode, resolved) => {
          applyResolvedLocation(mode, resolved);
          if (mode !== 'sos' && !bookingSheetOpen) {
            setBookingSheetOpen(true);
          }
        }}
      />

      {/* LAYER 2: LIVE CAMERA CAPTURE MODAL FOR GATE / BUILDING PHOTO */}
      <CameraCaptureModal
        open={gateCameraOpen}
        onClose={() => setGateCameraOpen(false)}
        lang={lang}
        category="proof_photo"
        district={selectedDistrict}
        titleEn="Capture Gate / Building Photo"
        titleMiz="In / Gate Thlalak Camera-in La Rawh"
        subtitleEn="Helps your Runner spot steep steps & entrance faster"
        subtitleMiz="Runner-in i gate leh kailawn hmuh zung zung nan"
        onCaptured={(result) => {
          setBuildingPhotoUrl(result.url);
        }}
      />
    </div>
  );
};

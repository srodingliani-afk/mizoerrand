import {
  createStorageAdapter,
  type StorageAdapter,
  type StorageDriverMetadata,
  type StorageHealthReport,
} from './dbAdapter';
import type {
  AppRemoteConfig,
  ConfigSnapshot,
  CustomerWalletState,
  DisputeCase,
  DoubleEntryJournal,
  EmergencySosTicket,
  ErrandRequest,
  EscrowLedgerEntry,
  KycQueueItem,
  MarketplaceOrder,
  MarketplaceProduct,
  PartnerProfile,
  PayrollRecord,
  StaffAttendanceLog,
  StaffLeaveRequest,
  StaffingBooking,
  SumoParcelBooking,
  SystemIntegrationConfig,
  SystemPlugin,
  WorkforceMember,
} from '../../src/shared/types';
import { liveGpsCache } from './redisCache';
import {
  postEscrowHoldJournal,
  postEscrowSettlementJournal,
  postPayrollDisbursementJournal,
  postWalletTopupJournal,
} from './ledgerService';

export interface DatabaseState {
  adminAuth?: {
    passcodeHash: string;
    salt: string;
    claimedAt: string;
  };
  remoteConfig: AppRemoteConfig;
  sandboxConfig: AppRemoteConfig | null;
  integrationConfig: SystemIntegrationConfig;
  plugins: SystemPlugin[];
  snapshots: ConfigSnapshot[];
  partners: PartnerProfile[];
  errands: ErrandRequest[];
  products: MarketplaceProduct[];
  marketplaceOrders: MarketplaceOrder[];
  userMonthlyReturns: Record<string, number>;
  prankStrikeCounts: Record<string, number>;
  blacklistedCustomers: string[];
  workforce: WorkforceMember[];
  staffingBookings: StaffingBooking[];
  staffLeaveRequests: StaffLeaveRequest[];
  staffAttendanceLogs: StaffAttendanceLog[];
  payrollRecords: PayrollRecord[];
  sosTickets: EmergencySosTicket[];
  kycQueue: KycQueueItem[];
  disputes: DisputeCase[];
  escrowLedger: EscrowLedgerEntry[];
  doubleEntryJournals: DoubleEntryJournal[];
  accountBalances: Record<string, number>;
  customerWallet: CustomerWalletState;
  sumoParcels: SumoParcelBooking[];
  auditLogs: { id: string; actor: string; action: string; detail: string; at: string }[];
}

function createInitialState(): DatabaseState {
  const now = new Date().toISOString();

  const defaultConfig: AppRemoteConfig = {
    appName: 'ZoRûn Mizoram',
    region: 'asia-south1',
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
    announcementEn: 'All-inclusive transparent fares across all 11 Mizoram District Capitals. Zero hidden fees.',
    announcementMiz: 'Mizoram District Khawpui 11 zawng zawngah man inthup awm lo, hman theih vek a ni.',
    updatedAt: now,
  };

  const defaultPlugins: SystemPlugin[] = [
    {
      id: 'plg-1',
      key: 'strict-walker-step-routing',
      name: 'Strict Walker Step Routing Guard',
      description: 'Restricts <1.5km & steep step deliveries exclusively to Category A Walkers.',
      module: 'errand-fleet',
      enabled: true,
      version: '1.4.0',
      code: `export function guardWalkerExclusive(job) {\n  const isSteps = job.accessType === 'long_steps_walk';\n  const isShort = job.distanceKm < 1.5;\n  return isSteps || isShort ? ['walker'] : ['bike', 'auto_taxi', 'pickup_truck'];\n}`,
      updatedAt: now,
    },
    {
      id: 'plg-2',
      key: 'en-hmasak-phawt-safeguard',
      name: 'Check-Before-Pay Merchant Safeguard',
      description: 'Enforces Rs. 45 return fee, monthly cap of 3 returns, and hygiene exclusions.',
      module: 'marketplace-ai',
      enabled: true,
      version: '2.1.0',
      code: `export const HYGIENE_BLOCKED = ['innerwear', 'opened_cosmetics', 'perishable_food'];\nexport function computeReturnFee(baseFee) {\n  return Math.max(40, Math.min(50, baseFee));\n}`,
      updatedAt: now,
    },
    {
      id: 'plg-3',
      key: 'razorpay-escrow-gst-split',
      name: 'Escrow OTP Split & 18% GST Engine',
      description: 'Holds funds in escrow until OTP handover, then splits commission, GST & payouts.',
      module: 'payment-escrow',
      enabled: true,
      version: '1.8.2',
      code: `export function splitOnOtp(grossRs, productRs = 0) {\n  const serviceFee = grossRs - productRs;\n  const platformGross = Math.round(serviceFee * 0.15);\n  const gst = Math.round((platformGross * 18) / 118);\n  return { gst, netCommission: platformGross - gst, partner: serviceFee - platformGross };\n}`,
      updatedAt: now,
    },
    {
      id: 'plg-4',
      key: 'sunday-emergency-mode-rule',
      name: 'Mizoram Sunday Emergency Mode',
      description: 'Automatically pauses non-essential retail while prioritizing 24x7 Rapid SOS.',
      module: 'remote-config-sdui',
      enabled: true,
      version: '1.1.0',
      code: `export function applySundayRule(config) {\n  if (!config.sundayEmergencyMode) return config.visibleServices;\n  return { ...config.visibleServices, marketplace: false, workforce: false, emergency24x7: true };\n}`,
      updatedAt: now,
    },
    {
      id: 'plg-5',
      key: 'ai-camera-kyc-ocr-guard',
      name: 'Camera-Only AI KYC OCR & 12-Digit Aadhaar Guard',
      description: 'Enforces live phone camera capture for KYC documents, runs AI Vision OCR to verify full 12-digit Aadhaar (auto-masked) & DL/Voter ID, and blocks direct unverified self-edits.',
      module: 'auth-kyc',
      enabled: true,
      version: '2.0.0',
      code: `export function verifyCameraKycScan(scan) {\n  if (scan.captureSource !== 'live_phone_camera') throw new Error('Phone Camera capture required');\n  if (!scan.aadhaarFull12Detected) throw new Error('Full 12-digit Aadhaar must be scanned by AI Agent');\n  return { masked: scan.aadhaarMasked, queueForServerStaff: true };\n}`,
      updatedAt: now,
    },
    {
      id: 'plg-6',
      key: 'live-video-interview-webrtc',
      name: 'In-App Live Video Interview Room (Awmpui & Drivers)',
      description: 'Integrates embedded WebRTC/Jitsi/Daily/LiveKit live video interview rooms for Awmpui and Drivers with server-side HR staff scheduling, scoring, and discretionary waiver.',
      module: 'auth-kyc',
      enabled: true,
      version: '1.5.0',
      code: `export function evaluateVideoInterviewRequirement(item, config) {\n  const isAwmpuiOrDriver = item.targetCategory === 'staff' || ['bike', 'auto_taxi', 'pickup_truck'].includes(item.targetCategory);\n  return isAwmpuiOrDriver && config.defaultRequireVideoForAwmpuiAndDrivers;\n}`,
      updatedAt: now,
    },
  ];

  const partners: PartnerProfile[] = [
    {
      id: 'ptr-walker-1',
      name: 'Lalrinawma Sailo',
      phone: '+91 94361 22104',
      district: 'Aizawl',
      veng: 'Mission Veng',
      category: 'walker',
      online: true,
      lat: 23.7222,
      lng: 92.7165,
      rating: 4.95,
      completedJobs: 312,
      badges: ['Police Verified - Green Shield', 'Gold Pro'],
      commercialPermitVerified: false,
      policeVerified: true,
      securityDepositVerified: true,
      codCashHeld: 420,
      walletBalance: 3840,
      lastHeartbeatAt: now,
    },
    {
      id: 'ptr-bike-1',
      name: 'Zothanpuia Ralte',
      phone: '+91 98623 55110',
      district: 'Aizawl',
      veng: 'Chanmari',
      category: 'bike',
      online: true,
      lat: 23.7358,
      lng: 92.7191,
      rating: 4.88,
      completedJobs: 428,
      badges: ['Police Verified - Green Shield', 'Basic Verified'],
      commercialPermitVerified: false,
      policeVerified: true,
      securityDepositVerified: true,
      codCashHeld: 1180,
      walletBalance: 5490,
      lastHeartbeatAt: now,
    },
    {
      id: 'ptr-auto-1',
      name: 'Hmingthansanga Pachuau',
      phone: '+91 94363 88412',
      district: 'Aizawl',
      veng: 'Dawrpui',
      category: 'auto_taxi',
      online: true,
      lat: 23.7279,
      lng: 92.7182,
      rating: 4.91,
      completedJobs: 265,
      badges: ['Company Certified', 'Police Verified - Green Shield'],
      commercialPermitVerified: true,
      policeVerified: true,
      securityDepositVerified: true,
      codCashHeld: 650,
      walletBalance: 7120,
      lastHeartbeatAt: now,
    },
    {
      id: 'ptr-pickup-1',
      name: 'Vanlalruata Chhangte',
      phone: '+91 96120 44390',
      district: 'Aizawl',
      veng: 'Bawngkawn',
      category: 'pickup_truck',
      online: true,
      lat: 23.7485,
      lng: 92.7254,
      rating: 4.84,
      completedJobs: 149,
      badges: ['Company Certified', 'Basic Verified'],
      commercialPermitVerified: true,
      policeVerified: true,
      securityDepositVerified: true,
      codCashHeld: 0,
      walletBalance: 12450,
      lastHeartbeatAt: now,
    },
    {
      id: 'ptr-sos-tech-1',
      name: 'Rohlupuia Fanai (24x7 Shift Tech)',
      phone: '+91 94361 99001',
      district: 'Aizawl',
      veng: 'Zarkawt',
      category: 'bike',
      online: true,
      lat: 23.7311,
      lng: 92.7184,
      rating: 4.98,
      completedJobs: 510,
      badges: ['Company Certified', 'Police Verified - Green Shield', 'Gold Pro'],
      commercialPermitVerified: false,
      policeVerified: true,
      securityDepositVerified: true,
      codCashHeld: 0,
      walletBalance: 24000,
      shift: 'Morning (06-14)',
      isSalariedTechnician: true,
      lastHeartbeatAt: now,
    },
    // District Capital Fleet Coverage (Lunglei, Champhai, Serchhip, Kolasib, Lawngtlai, Mamit, Siaha, Saitual, Khawzawl, Hnahthial)
    {
      id: 'ptr-lng-walker',
      name: 'Lalbiakzuala Khiangte',
      phone: '+91 94361 77012',
      district: 'Lunglei',
      veng: 'Bazar Veng (Lunglei)',
      category: 'walker',
      online: true,
      lat: 22.8886,
      lng: 92.7393,
      rating: 4.93,
      completedJobs: 184,
      badges: ['Police Verified - Green Shield', 'Gold Pro'],
      commercialPermitVerified: false,
      policeVerified: true,
      securityDepositVerified: true,
      codCashHeld: 210,
      walletBalance: 2950,
      lastHeartbeatAt: now,
    },
    {
      id: 'ptr-lng-bike',
      name: 'Malsawmdawngliana Renthlei',
      phone: '+91 98621 77023',
      district: 'Lunglei',
      veng: 'Chanmari (Lunglei)',
      category: 'bike',
      online: true,
      lat: 22.8935,
      lng: 92.7428,
      rating: 4.89,
      completedJobs: 230,
      badges: ['Company Certified', 'Police Verified - Green Shield'],
      commercialPermitVerified: false,
      policeVerified: true,
      securityDepositVerified: true,
      codCashHeld: 400,
      walletBalance: 4120,
      shift: 'Morning (06-14)',
      isSalariedTechnician: true,
      lastHeartbeatAt: now,
    },
    {
      id: 'ptr-cmp-walker',
      name: 'K. Lalremruata',
      phone: '+91 94362 33108',
      district: 'Champhai',
      veng: 'Vengthlang (Champhai)',
      category: 'walker',
      online: true,
      lat: 23.4744,
      lng: 93.3292,
      rating: 4.91,
      completedJobs: 142,
      badges: ['Police Verified - Green Shield'],
      commercialPermitVerified: false,
      policeVerified: true,
      securityDepositVerified: true,
      codCashHeld: 150,
      walletBalance: 2600,
      lastHeartbeatAt: now,
    },
    {
      id: 'ptr-cmp-pickup',
      name: 'Thanghmingliana Zote',
      phone: '+91 96125 33109',
      district: 'Champhai',
      veng: 'Kahrawt',
      category: 'pickup_truck',
      online: true,
      lat: 23.4698,
      lng: 93.3256,
      rating: 4.86,
      completedJobs: 98,
      badges: ['Company Certified', 'Police Verified - Green Shield'],
      commercialPermitVerified: true,
      policeVerified: true,
      securityDepositVerified: true,
      codCashHeld: 0,
      walletBalance: 9800,
      shift: 'Evening (14-22)',
      isSalariedTechnician: true,
      lastHeartbeatAt: now,
    },
    {
      id: 'ptr-scp-walker',
      name: 'Zoramchhana Hnamte',
      phone: '+91 94365 44102',
      district: 'Serchhip',
      veng: 'Bazar Veng (Serchhip)',
      category: 'walker',
      online: true,
      lat: 23.3106,
      lng: 92.8492,
      rating: 4.9,
      completedJobs: 118,
      badges: ['Police Verified - Green Shield', 'Basic Verified'],
      commercialPermitVerified: false,
      policeVerified: true,
      securityDepositVerified: true,
      codCashHeld: 100,
      walletBalance: 2300,
      shift: 'Morning (06-14)',
      isSalariedTechnician: true,
      lastHeartbeatAt: now,
    },
    {
      id: 'ptr-klb-bike',
      name: 'Lallawmzuala Colney',
      phone: '+91 94366 55104',
      district: 'Kolasib',
      veng: 'Diakkawn',
      category: 'bike',
      online: true,
      lat: 24.2256,
      lng: 92.6774,
      rating: 4.87,
      completedJobs: 190,
      badges: ['Company Certified', 'Police Verified - Green Shield'],
      commercialPermitVerified: false,
      policeVerified: true,
      securityDepositVerified: true,
      codCashHeld: 320,
      walletBalance: 3750,
      shift: 'Evening (14-22)',
      isSalariedTechnician: true,
      lastHeartbeatAt: now,
    },
    {
      id: 'ptr-klb-walker',
      name: 'Lalthakima Hauhnar',
      phone: '+91 98626 55105',
      district: 'Kolasib',
      veng: 'Venglai (Kolasib)',
      category: 'walker',
      online: true,
      lat: 24.2218,
      lng: 92.6798,
      rating: 4.92,
      completedJobs: 114,
      badges: ['Police Verified - Green Shield'],
      commercialPermitVerified: false,
      policeVerified: true,
      securityDepositVerified: true,
      codCashHeld: 80,
      walletBalance: 2100,
      lastHeartbeatAt: now,
    },
    {
      id: 'ptr-lwt-walker',
      name: 'B. Lalhriatrenga',
      phone: '+91 94367 66101',
      district: 'Lawngtlai',
      veng: 'Bazar Veng (Lawngtlai)',
      category: 'walker',
      online: true,
      lat: 22.5284,
      lng: 92.8939,
      rating: 4.89,
      completedJobs: 96,
      badges: ['Police Verified - Green Shield'],
      commercialPermitVerified: false,
      policeVerified: true,
      securityDepositVerified: true,
      codCashHeld: 120,
      walletBalance: 1980,
      shift: 'Morning (06-14)',
      isSalariedTechnician: true,
      lastHeartbeatAt: now,
    },
    {
      id: 'ptr-mmt-walker',
      name: 'Lalmuanpuia Sailo',
      phone: '+91 94368 77101',
      district: 'Mamit',
      veng: 'Bazar Veng (Mamit)',
      category: 'walker',
      online: true,
      lat: 23.9288,
      lng: 92.4906,
      rating: 4.88,
      completedJobs: 87,
      badges: ['Police Verified - Green Shield'],
      commercialPermitVerified: false,
      policeVerified: true,
      securityDepositVerified: true,
      codCashHeld: 90,
      walletBalance: 1850,
      shift: 'Morning (06-14)',
      isSalariedTechnician: true,
      lastHeartbeatAt: now,
    },
    {
      id: 'ptr-sia-walker',
      name: 'N. Beikhochhi',
      phone: '+91 94369 88101',
      district: 'Siaha',
      veng: 'New Siaha',
      category: 'walker',
      online: true,
      lat: 22.4904,
      lng: 92.9803,
      rating: 4.94,
      completedJobs: 134,
      badges: ['Company Certified', 'Police Verified - Green Shield'],
      commercialPermitVerified: false,
      policeVerified: true,
      securityDepositVerified: true,
      codCashHeld: 140,
      walletBalance: 2740,
      shift: 'Night (22-06)',
      isSalariedTechnician: true,
      lastHeartbeatAt: now,
    },
    {
      id: 'ptr-stl-walker',
      name: 'Vanlalthuama Pachuau',
      phone: '+91 94361 90101',
      district: 'Saitual',
      veng: 'Bazar Veng (Saitual)',
      category: 'walker',
      online: true,
      lat: 23.6947,
      lng: 92.9748,
      rating: 4.91,
      completedJobs: 78,
      badges: ['Police Verified - Green Shield'],
      commercialPermitVerified: false,
      policeVerified: true,
      securityDepositVerified: true,
      codCashHeld: 60,
      walletBalance: 1620,
      shift: 'Morning (06-14)',
      isSalariedTechnician: true,
      lastHeartbeatAt: now,
    },
    {
      id: 'ptr-kwz-walker',
      name: 'R. Lalnunfela',
      phone: '+91 94362 91101',
      district: 'Khawzawl',
      veng: 'Vengthar (Khawzawl)',
      category: 'walker',
      online: true,
      lat: 23.5335,
      lng: 93.1846,
      rating: 4.89,
      completedJobs: 72,
      badges: ['Police Verified - Green Shield'],
      commercialPermitVerified: false,
      policeVerified: true,
      securityDepositVerified: true,
      codCashHeld: 75,
      walletBalance: 1580,
      shift: 'Evening (14-22)',
      isSalariedTechnician: true,
      lastHeartbeatAt: now,
    },
    {
      id: 'ptr-hnt-walker',
      name: 'C. Lalramnghaka',
      phone: '+91 94363 92101',
      district: 'Hnahthial',
      veng: 'Bazar Veng (Hnahthial)',
      category: 'walker',
      online: true,
      lat: 22.9661,
      lng: 92.9316,
      rating: 4.92,
      completedJobs: 81,
      badges: ['Police Verified - Green Shield'],
      commercialPermitVerified: false,
      policeVerified: true,
      securityDepositVerified: true,
      codCashHeld: 110,
      walletBalance: 1790,
      shift: 'Morning (06-14)',
      isSalariedTechnician: true,
      lastHeartbeatAt: now,
    },
  ];

  const errands: ErrandRequest[] = [
    {
      id: 'err-101',
      customerId: 'cust-1',
      customerName: 'Malsawmkimi',
      district: 'Aizawl',
      title: 'Pharmacy pickup + steep 120-step delivery below Mission Veng church',
      jobType: 'step_delivery',
      origin: { lat: 23.7271, lng: 92.7176, label: 'Dawrpui Civil Hospital Gate' },
      stops: [],
      destination: { lat: 23.7204, lng: 92.7158, label: 'Mission Veng Thlanmual Road' },
      distanceKm: 0.9,
      accessType: 'long_steps_walk',
      needsWalkerHelper: false,
      buildingPhotoUrl: '/src/assets/images/mizoram_hero_hills_1794891319409.jpg',
      voiceNoteUrl: '/api/auth-kyc/signed-media/demo-voice',
      voiceNoteTranscript: 'Walk down the concrete steps beside Blue Tea stall, green gate on left.',
      declaredValue: 780,
      paymentMethod: 'upi_escrow',
      microInsuranceOptIn: true,
      microInsuranceFee: 3,
      allInclusiveTotal: 61,
      advanceTokenAmount: 0,
      advanceTokenPaid: false,
      requiresPoliceVerifiedPartner: false,
      otpCode: '4912',
      status: 'bidding',
      bids: [
        {
          id: 'bid-101-a',
          errandId: 'err-101',
          partnerId: 'ptr-walker-1',
          partnerName: 'Lalrinawma Sailo',
          partnerCategory: 'walker',
          partnerRating: 4.95,
          partnerBadges: ['Police Verified - Green Shield', 'Gold Pro'],
          bidAmount: 60,
          etaMinutes: 8,
          corridorMatchMeters: 180,
          createdAt: now,
        },
      ],
      createdAt: now,
    },
    {
      id: 'err-102',
      customerId: 'cust-2',
      customerName: 'Lalthanzuala',
      district: 'Aizawl',
      title: 'Two-wheeler urgent documents: Chanmari Traffic Point to Khatla Secretariat',
      jobType: 'bike_express',
      origin: { lat: 23.7365, lng: 92.719, label: 'Chanmari Junction' },
      stops: [{ lat: 23.7271, lng: 92.7176, label: 'Zarkawt Print Hub' }],
      destination: { lat: 23.7241, lng: 92.7134, label: 'Khatla Secretariat Annex' },
      distanceKm: 3.6,
      accessType: 'vehicle_accessible',
      needsWalkerHelper: false,
      buildingPhotoUrl: '/src/assets/images/partner_hill_rider_1794891322041.jpg',
      voiceNoteTranscript: 'Call at Secretariat main gate, yellow file folder for Room 204.',
      declaredValue: 1500,
      paymentMethod: 'upi_escrow',
      microInsuranceOptIn: true,
      microInsuranceFee: 3,
      allInclusiveTotal: 143,
      advanceTokenAmount: 29,
      advanceTokenPaid: true,
      requiresPoliceVerifiedPartner: false,
      otpCode: '7340',
      status: 'bidding',
      bids: [
        {
          id: 'bid-102-a',
          errandId: 'err-102',
          partnerId: 'ptr-bike-1',
          partnerName: 'Zothanpuia Ralte',
          partnerCategory: 'bike',
          partnerRating: 4.88,
          partnerBadges: ['Police Verified - Green Shield', 'Basic Verified'],
          bidAmount: 140,
          etaMinutes: 11,
          corridorMatchMeters: 95,
          createdAt: now,
        },
      ],
      createdAt: now,
    },
  ];

  const products: MarketplaceProduct[] = [
    {
      id: 'prd-1',
      shopId: 'shop-dawrpui-craft',
      shopName: 'Zoram Loom & Bamboo',
      district: 'Aizawl',
      veng: 'Dawrpui',
      titleEn: 'Handwoven Puanchei Textile & Bamboo Storage Basket',
      titleMiz: 'Puanchei Tah & Mau Bawm',
      category: 'Handloom & Crafts',
      hygieneCategory: 'standard',
      checkBeforePayEligible: true,
      price: 1450,
      color: 'Crimson & Indigo',
      size: 'Standard Gift Set',
      tags: ['puan', 'bamboo', 'dawrpui', 'gift'],
      imageUrl: '/src/assets/images/market_bamboo_craft_1794891320417.jpg',
      stock: 14,
    },
    {
      id: 'prd-2',
      shopId: 'shop-chanmari-agro',
      shopName: 'Hmar Hills Organic Pantry',
      district: 'Aizawl',
      veng: 'Chanmari',
      titleEn: 'Mizo Bird-Eye Chili, Highland Ginger & Wild Honey Pack',
      titleMiz: 'Hmarcha Te, Sawhthing & Khawizu',
      category: 'Fresh Highland Produce',
      hygieneCategory: 'perishable_food',
      checkBeforePayEligible: false,
      price: 480,
      color: 'Natural',
      size: '750g Combo',
      tags: ['chili', 'ginger', 'honey', 'organic'],
      imageUrl: '/src/assets/images/market_local_produce_1794891320650.jpg',
      stock: 28,
    },
    {
      id: 'prd-3',
      shopId: 'shop-zarkawt-apparel',
      shopName: 'Zarkawt Heritage Wear',
      district: 'Aizawl',
      veng: 'Zarkawt',
      titleEn: 'Cotton Thermal Innerwear Set (Sealed Hygiene Pack)',
      titleMiz: 'Kawrchung Lum (Hawn Loh)',
      category: 'Apparel & Essentials',
      hygieneCategory: 'innerwear',
      checkBeforePayEligible: false,
      price: 690,
      color: 'Slate Charcoal',
      size: 'M / L',
      tags: ['innerwear', 'winter', 'zarkawt'],
      imageUrl: '/src/assets/images/market_bamboo_craft_1794891320417.jpg',
      stock: 19,
    },
    {
      id: 'prd-4',
      shopId: 'shop-lunglei-bazar',
      shopName: 'Chhimlam Handloom Collective',
      district: 'Lunglei',
      veng: 'Bazar Veng (Lunglei)',
      titleEn: 'Lunglei Woven Shawl & Bamboo Tea Tray',
      titleMiz: 'Lunglei Puan & Thingpui Tray',
      category: 'Handloom & Crafts',
      hygieneCategory: 'standard',
      checkBeforePayEligible: true,
      price: 1180,
      color: 'Indigo & Terracotta',
      size: 'Medium',
      tags: ['lunglei', 'puan', 'bamboo'],
      imageUrl: '/src/assets/images/market_bamboo_craft_1794891320417.jpg',
      stock: 12,
    },
    {
      id: 'prd-5',
      shopId: 'shop-champhai-grape',
      shopName: 'Champhai Valley Vineyard Store',
      district: 'Champhai',
      veng: 'Vengthlang (Champhai)',
      titleEn: 'Champhai Highland Grape Juice & Roasted Sesame Pack',
      titleMiz: 'Champhai Grep Tui & Chhawhchhi',
      category: 'Fresh Highland Produce',
      hygieneCategory: 'perishable_food',
      checkBeforePayEligible: false,
      price: 520,
      color: 'Deep Plum',
      size: '1L + 250g',
      tags: ['champhai', 'grape', 'sesame'],
      imageUrl: '/src/assets/images/market_local_produce_1794891320650.jpg',
      stock: 20,
    },
    {
      id: 'prd-6',
      shopId: 'shop-siaha-craft',
      shopName: 'Maraland Artisans Hub',
      district: 'Siaha',
      veng: 'New Siaha',
      titleEn: 'Siaha Traditional Beaded Sash & Cane Basket',
      titleMiz: 'Siaha Hnam Thil & Mau Bawm',
      category: 'Handloom & Crafts',
      hygieneCategory: 'standard',
      checkBeforePayEligible: true,
      price: 1350,
      color: 'Red & Obsidian',
      size: 'Standard',
      tags: ['siaha', 'mara', 'craft'],
      imageUrl: '/src/assets/images/market_bamboo_craft_1794891320417.jpg',
      stock: 9,
    },
  ];

  const workforce: WorkforceMember[] = [
    {
      id: 'wrk-1',
      name: 'Lalhmangaihi Khiangte',
      mode: 'company_managed_staffing',
      roleTitle: 'Company-Managed Live-In Caregiver & Elderly Support',
      roleTitleMiz: 'Awmpui & Upa Enkawltu (Company Trained)',
      skills: ['Elderly Care', 'Mizo & English Cooking', 'First Aid', 'Housekeeping'],
      district: 'Aizawl',
      veng: 'Khatla',
      monthlyPackageRate: 14500,
      practicalSkillScore: 94,
      groomingTrainingStatus: 'Certified · Batch 2026-Q4',
      outstationAvailable: true,
      liveInAvailable: true,
      replacementGuarantee: true,
      availabilityStatus: 'active',
      bankAccountMasked: 'SBI •••• 4821',
      verifiedBadge: 'Company Certified',
      avatarUrl: '/src/assets/images/staffing_caregiver_portrait_1794891321006.jpg',
      portfolioUrls: ['/src/assets/images/staffing_caregiver_portrait_1794891321006.jpg'],
      rating: 4.96,
    },
    {
      id: 'wrk-2',
      name: 'Biakthansanga Hauhnar',
      mode: 'on_demand_workforce',
      roleTitle: 'Brush-Cutter Hillside Gardener & Mason',
      roleTitleMiz: 'Hlo Thlawhna Khawl & Mistiri',
      skills: ['Brush-Cutter Clearing', 'Retaining Wall Masonry', 'Drainage Clearing'],
      district: 'Aizawl',
      veng: 'Vaivakawn',
      hourlyRate: 220,
      dailyRate: 1100,
      practicalSkillScore: 91,
      groomingTrainingStatus: 'Safety & Slope Certified',
      outstationAvailable: true,
      liveInAvailable: false,
      replacementGuarantee: false,
      availabilityStatus: 'active',
      bankAccountMasked: 'MRB •••• 2041',
      verifiedBadge: 'Police Verified - Green Shield',
      avatarUrl: '/src/assets/images/partner_hill_rider_1794891322041.jpg',
      portfolioUrls: ['/src/assets/images/mizoram_hero_hills_1794891319409.jpg'],
      rating: 4.89,
    },
    {
      id: 'wrk-3',
      name: 'Remsangpuii Vanchhawng',
      mode: 'company_managed_staffing',
      roleTitle: 'Personal Family Driver & School Commute Specialist',
      roleTitleMiz: 'Chhungkaw Driver & Hill-Road Specialist',
      skills: ['Steep Hill Manual/Auto', 'School Run', 'Defensive Driving', 'Police Verified'],
      district: 'Lunglei',
      veng: 'Chanmari (Lunglei)',
      monthlyPackageRate: 18500,
      practicalSkillScore: 96,
      groomingTrainingStatus: 'Company Uniform & Etiquette Certified',
      outstationAvailable: true,
      liveInAvailable: true,
      replacementGuarantee: true,
      availabilityStatus: 'active',
      bankAccountMasked: 'MRB •••• 9104',
      verifiedBadge: 'Company Certified',
      avatarUrl: '/src/assets/images/partner_hill_rider_1794891322041.jpg',
      portfolioUrls: ['/src/assets/images/partner_hill_rider_1794891322041.jpg'],
      rating: 4.94,
    },
  ];

  const staffingBookings: StaffingBooking[] = [
    {
      id: 'stf-101',
      workerId: 'wrk-1',
      workerName: 'Lalhmangaihi Khiangte',
      mode: 'company_managed_staffing',
      customerName: 'Dr. Zoramthanga Household (Khatla)',
      isOutstationOrLiveIn: true,
      accommodationProvided: true,
      foodProvided: true,
      travelCovered: true,
      allInclusiveAmount: 14500,
      contractId: 'CTR-MZ-261101',
      tripartiteAgreement: true,
      workerSosActive: false,
      status: 'active',
      createdAt: now,
    },
    {
      id: 'stf-102',
      workerId: 'wrk-3',
      workerName: 'Remsangpuii Vanchhawng',
      mode: 'company_managed_staffing',
      customerName: 'Pu Lalmuana Family (Chaltlang)',
      isOutstationOrLiveIn: false,
      accommodationProvided: false,
      foodProvided: true,
      travelCovered: true,
      allInclusiveAmount: 18500,
      contractId: 'CTR-MZ-261102',
      tripartiteAgreement: true,
      workerSosActive: false,
      status: 'active',
      createdAt: now,
    },
  ];

  const todayIso = now.slice(0, 10);
  const staffAttendanceLogs: StaffAttendanceLog[] = [
    {
      id: 'att-101',
      workerId: 'wrk-1',
      workerName: 'Lalhmangaihi Khiangte',
      date: todayIso,
      checkInTime: '07:15 AM',
      status: 'present',
      veng: 'Khatla',
    },
    {
      id: 'att-102',
      workerId: 'wrk-3',
      workerName: 'Remsangpuii Vanchhawng',
      date: todayIso,
      checkInTime: '07:45 AM',
      status: 'present',
      veng: 'Chaltlang',
    },
  ];

  const staffLeaveRequests: StaffLeaveRequest[] = [
    {
      id: 'lvr-201',
      workerId: 'wrk-1',
      workerName: 'Lalhmangaihi Khiangte',
      bookingId: 'stf-101',
      fromDate: '2026-11-26',
      toDate: '2026-11-27',
      reason: 'Family church fellowship visit to Serchhip — requesting 2-day backup Awmpui.',
      needsInstantReplacement: true,
      status: 'pending',
      createdAt: now,
    },
  ];

  const payrollRecords: PayrollRecord[] = [
    {
      id: 'pay-2026-11-01',
      staffName: 'Lalhmangaihi Khiangte',
      clientName: 'Dr. Zoramthanga Household (Khatla)',
      billingWindow: '1st-5th',
      payoutWindow: 'By 7th',
      monthlyPackage: 14500,
      platformMgmtFee: 1500,
      netSalaryDisbursed: 13000,
      bankAccountMasked: 'SBI •••• 4821',
      status: 'salary_disbursed',
      payslipId: 'SLIP-202611-01',
    },
    {
      id: 'pay-2026-11-02',
      staffName: 'Remsangpuii Vanchhawng',
      clientName: 'Pu Lalmuana Family (Chaltlang)',
      billingWindow: '1st-5th',
      payoutWindow: 'By 7th',
      monthlyPackage: 18500,
      platformMgmtFee: 2000,
      netSalaryDisbursed: 16500,
      bankAccountMasked: 'MRB •••• 9104',
      status: 'client_billed',
      payslipId: 'SLIP-202611-02',
    },
  ];

  const sosTickets: EmergencySosTicket[] = [
    {
      id: 'sos-901',
      customerName: 'Pi Zikpuii',
      district: 'Aizawl',
      veng: 'Kulikawn',
      lat: 23.7155,
      lng: 92.7168,
      category: 'plumber_water',
      voiceNoteTranscript: 'Main water tank pipe burst on steep roof terrace, water flooding stairs.',
      assignedTechName: 'Rohlupuia Fanai',
      assignedTechShift: 'Morning (06-14)',
      standardizedRate: 450,
      sparePartsAmount: 180,
      slaTargetMinutes: 20,
      dispatchSlaSeconds: 18,
      status: 'en_route',
      createdAt: now,
    },
  ];

  const kycQueue: KycQueueItem[] = [
    {
      id: 'kyc-401',
      requestType: 'new_onboarding',
      applicantName: 'K. Lalbiakdika',
      phone: '9436188210',
      targetCategory: 'auto_taxi',
      district: 'Aizawl',
      veng: 'Vaivakawn',
      aadhaarMasked: 'XXXX-XXXX-7192',
      aadhaarFull12Validated: true,
      aadhaarVerificationHash: 'sha256:9f4b2c7192a8e41c',
      voterIdNumber: 'MIZ/01/449281',
      drivingLicenceNumber: 'MZ01-2019004412',
      commercialPermitNumber: 'MZ-COMM-TAXI-8812',
      vehicleRcNumber: 'MZ01-T-4491',
      pvcNumber: 'PVC-AZL-2026-1182',
      ymaVcReference: 'Vaivakawn Branch YMA Secretary Verified',
      resumeSummary: '6 years Aizawl-Lengpui hill terrain commercial driving',
      practicalTestScore: 92,
      documentSignedToken: 'pending-issue',
      cameraCaptureVerified: true,
      aiOcrReport: {
        docType: 'combined_kyc_sheet',
        extractedName: 'K. Lalbiakdika',
        aadhaarFull12Detected: true,
        aadhaarMasked: 'XXXX-XXXX-7192',
        aadhaarVerificationHash: 'sha256:9f4b2c7192a8e41c',
        voterIdNumber: 'MIZ/01/449281',
        drivingLicenceNumber: 'MZ01-2019004412',
        commercialPermitNumber: 'MZ-COMM-TAXI-8812',
        vehicleRcNumber: 'MZ01-T-4491',
        pvcNumber: 'PVC-AZL-2026-1182',
        aiConfidenceScore: 96,
        captureSource: 'live_phone_camera',
        livenessVerified: true,
        tamperVerdict: 'authentic_live_camera',
        aiModelUsed: 'gemini-2.5-flash',
        aiSummary: 'Live camera frame verified. Full 12-digit UIDAI Aadhaar format & Verhoeff check passed; DL & Commercial Taxi Permit matched applicant name.',
        scannedAt: now,
      },
      videoInterview: {
        required: true,
        status: 'scheduled',
        provider: 'jitsi_webrtc',
        roomName: 'zorun-mizoram-hr-kyc-401',
        roomUrl: 'https://meet.jit.si/zorun-mizoram-hr-kyc-401',
        scheduledAt: now,
        interviewerName: 'HR & Fleet Vetting Desk',
        updatedAt: now,
      },
      status: 'pending',
    },
    {
      id: 'kyc-402',
      requestType: 'new_onboarding',
      applicantName: 'Lalnunmawii Tochhawng',
      phone: '9862344190',
      targetCategory: 'staff',
      staffMode: 'company_managed_staffing',
      roleTitle: 'Company-Managed Awmpui & Home Caregiver',
      district: 'Lunglei',
      veng: 'Serkawn',
      aadhaarMasked: 'XXXX-XXXX-3310',
      aadhaarFull12Validated: true,
      aadhaarVerificationHash: 'sha256:4a8d1e3310c7b209',
      voterIdNumber: 'MIZ/02/119044',
      pvcNumber: 'PVC-AZL-2026-1209',
      ymaVcReference: 'Republic Veng VC Chairperson Endorsed',
      resumeSummary: '4 years infant & elderly home care, first-aid trained',
      practicalTestScore: 95,
      documentSignedToken: 'pending-issue',
      cameraCaptureVerified: true,
      aiOcrReport: {
        docType: 'combined_kyc_sheet',
        extractedName: 'Lalnunmawii Tochhawng',
        aadhaarFull12Detected: true,
        aadhaarMasked: 'XXXX-XXXX-3310',
        aadhaarVerificationHash: 'sha256:4a8d1e3310c7b209',
        voterIdNumber: 'MIZ/02/119044',
        pvcNumber: 'PVC-AZL-2026-1209',
        aiConfidenceScore: 97,
        captureSource: 'live_phone_camera',
        livenessVerified: true,
        tamperVerdict: 'authentic_live_camera',
        aiModelUsed: 'gemini-2.5-flash',
        aiSummary: 'Live phone camera capture verified. Full 12-digit Aadhaar validated and masked; EPIC & Police Verification hologram matched.',
        scannedAt: now,
      },
      videoInterview: {
        required: true,
        status: 'live_room_open',
        provider: 'jitsi_webrtc',
        roomName: 'zorun-mizoram-hr-kyc-402',
        roomUrl: 'https://meet.jit.si/zorun-mizoram-hr-kyc-402',
        scheduledAt: now,
        interviewerName: 'Pi Zoramthangi (HR Lead)',
        updatedAt: now,
      },
      status: 'pending',
    },
  ];

  const disputes: DisputeCase[] = [
    {
      id: 'dsp-301',
      orderRef: 'MKT-8821',
      customerName: 'Vanlalthanga',
      partnerName: 'Zothanpuia Ralte',
      reason: 'Customer refused En Hmasak Phawt item claiming packaging dent; Before/After proof shows intact box.',
      amountInvolved: 1450,
      beforeProofUrl: '/src/assets/images/market_bamboo_craft_1794891320417.jpg',
      afterProofUrl: '/src/assets/images/market_bamboo_craft_1794891320417.jpg',
      gpsCheckSummary: 'Partner GPS matched customer gate within 14m for 6 mins.',
      prankStrikeCount: 1,
      status: 'open',
    },
  ];

  const escrowLedger: EscrowLedgerEntry[] = [
    {
      id: 'esc-501',
      orderRef: 'err-100',
      grossAllInclusive: 180,
      gstAmount: 4,
      platformCommission: 23,
      microInsuranceSachet: 3,
      partnerPayout: 150,
      merchantSettlement: 0,
      paymentMode: 'upi_escrow',
      escrowStatus: 'split_settled',
      createdAt: now,
    },
  ];

  const initialSnapshot: ConfigSnapshot = {
    id: 'snap-initial',
    label: 'Baseline Production Release (asia-south1)',
    createdAt: now,
    config: structuredClone(defaultConfig),
    plugins: structuredClone(defaultPlugins),
  };

  const ledgerSlice: {
    doubleEntryJournals: DoubleEntryJournal[];
    accountBalances: Record<string, number>;
  } = {
    doubleEntryJournals: [],
    accountBalances: {},
  };

  postWalletTopupJournal(ledgerSlice, {
    customerId: 'cust-1',
    amountRs: 320,
    refId: 'wtx-seed-1',
  });
  postEscrowHoldJournal(ledgerSlice, {
    orderRef: escrowLedger[0].orderRef,
    customerId: 'cust-1',
    grossAllInclusive: escrowLedger[0].grossAllInclusive,
    paymentMode: 'upi_escrow',
  });
  postEscrowSettlementJournal(ledgerSlice, {
    entry: escrowLedger[0],
    partnerId: 'ptr-walker-1',
  });
  postPayrollDisbursementJournal(ledgerSlice, payrollRecords[0]);

  const defaultIntegrationConfig: SystemIntegrationConfig = {
    geminiApiKey: process.env.GEMINI_API_KEY?.trim() || '',
    geminiModel: process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash',
    enforceCameraOnlyKyc: true,
    requireFull12DigitAadhaarScan: true,
    aiOcrMinConfidence: 82,
    requireServerStaffVerificationForUpdates: true,
    videoProvider: 'jitsi_webrtc',
    videoServerDomain: 'https://meet.jit.si',
    videoApiKey: process.env.VIDEO_INTERVIEW_API_KEY?.trim() || '',
    videoApiSecret: process.env.VIDEO_INTERVIEW_API_SECRET?.trim() || '',
    roomPrefix: 'zorun-mizoram-hr',
    defaultRequireVideoForAwmpuiAndDrivers: true,
    gpayMerchantVpa: 'zorun.mizoram@oksbi',
    gpayMerchantName: 'ZoRûn Mizoram Escrow',
    gpayBusinessPhone: '9862009900',
    gpayEnabled: true,
    updatedAt: now,
  };

  return {
    remoteConfig: defaultConfig,
    sandboxConfig: null,
    integrationConfig: defaultIntegrationConfig,
    plugins: defaultPlugins,
    snapshots: [initialSnapshot],
    partners,
    errands,
    products,
    marketplaceOrders: [],
    userMonthlyReturns: { 'cust-1': 1 },
    prankStrikeCounts: {},
    blacklistedCustomers: [],
    workforce,
    staffingBookings,
    staffLeaveRequests,
    staffAttendanceLogs,
    payrollRecords,
    sosTickets,
    kycQueue,
    disputes,
    escrowLedger,
    doubleEntryJournals: ledgerSlice.doubleEntryJournals,
    accountBalances: ledgerSlice.accountBalances,
    customerWallet: {
      balanceRs: 320,
      loyaltyPoints: 240,
      referralCode: 'ZORUN-MZ-2026',
      referralsClaimed: [],
      plusPassActive: false,
      transactions: [
        {
          id: 'wtx-seed-1',
          type: 'topup',
          title: 'Welcome UPI Wallet Credit',
          amountRs: 320,
          pointsDelta: 240,
          createdAt: now,
        },
      ],
    },
    sumoParcels: [
      {
        id: 'sumo-seed-1',
        trackingCode: 'SUMO-MZ-4821',
        senderName: 'Malsawmkimi',
        receiverName: 'Pi Lalhmingliani',
        receiverPhone: '+91 94361 55210',
        originDistrict: 'Aizawl',
        originVeng: 'Khatla',
        originCounter: 'Zarkawt Sumo Counter',
        destinationDistrict: 'Lunglei',
        destinationCounter: 'Chanmari Lunglei Counter',
        parcelDescription: 'Home-baked cakes & winter shawls (3 kg box)',
        weightKg: 3,
        includeHomeDrop: true,
        allInclusiveTotal: 280,
        status: 'in_transit',
        createdAt: now,
      },
    ],
    auditLogs: [
      {
        id: 'aud-1',
        actor: 'system',
        action: 'BOOTSTRAP',
        detail: 'Initialized ZoRun Mizoram asia-south1 modular microservices, Firebase & Double-Entry Ledger',
        at: now,
      },
    ],
  };
}

class PersistentStore {
  private readonly adapter: StorageAdapter<DatabaseState>;
  private state: DatabaseState;

  constructor(adapter?: StorageAdapter<DatabaseState>) {
    this.adapter = adapter ?? createStorageAdapter<DatabaseState>();
    this.state = this.loadOrSeed();
    for (const p of this.state.partners) {
      liveGpsCache.setPartnerLocation(p.id, p.lat, p.lng, p.online, 3600_000);
    }
  }

  private loadOrSeed(): DatabaseState {
    try {
      const parsed = this.adapter.loadSync();
      if (parsed) {
        return this.mergeWithDefaults(parsed);
      }
    } catch {
      // Fallback to fresh seed if corrupted
    }
    const fresh = createInitialState();
    this.adapter.saveSync(fresh);
    return fresh;
  }

  async initAsync(): Promise<void> {
    try {
      const remote = await this.adapter.loadAsync();
      if (remote) {
        this.state = this.mergeWithDefaults(remote);
        for (const p of this.state.partners) {
          liveGpsCache.setPartnerLocation(p.id, p.lat, p.lng, p.online, 3600_000);
        }
      }
    } catch {
      // Keep sync-loaded local mirror / seeded state
    }
  }

  private mergeWithDefaults(parsed: Partial<DatabaseState>): DatabaseState {
    const defaults = createInitialState();
    const rawConfig = parsed.remoteConfig
      ? { ...defaults.remoteConfig, ...parsed.remoteConfig }
      : defaults.remoteConfig;
    const normalizedConfig: AppRemoteConfig = {
      ...rawConfig,
      appName:
        !rawConfig.appName || rawConfig.appName === 'ZoRun Mizoram' || rawConfig.appName === 'ZoRun'
          ? 'ZoRûn Mizoram'
          : rawConfig.appName,
      region:
        !rawConfig.region || rawConfig.region === 'ap-south-1'
          ? 'asia-south1'
          : rawConfig.region,
    };

    const mergedPlugins = Array.isArray(parsed.plugins) ? [...parsed.plugins] : [...defaults.plugins];
    for (const defPlg of defaults.plugins) {
      if (!mergedPlugins.some((p) => p.key === defPlg.key)) {
        mergedPlugins.push(defPlg);
      }
    }

    return {
      ...defaults,
      ...parsed,
      remoteConfig: normalizedConfig,
      integrationConfig: parsed.integrationConfig
        ? { ...defaults.integrationConfig, ...parsed.integrationConfig }
        : defaults.integrationConfig,
      plugins: mergedPlugins,
      kycQueue: Array.isArray(parsed.kycQueue)
        ? parsed.kycQueue.map((k) => {
            const seedKyc = defaults.kycQueue.find((d) => d.id === k.id);
            return {
              ...seedKyc,
              ...k,
              aiOcrReport: k.aiOcrReport || seedKyc?.aiOcrReport,
              videoInterview: k.videoInterview || seedKyc?.videoInterview,
              cameraCaptureVerified: k.cameraCaptureVerified ?? seedKyc?.cameraCaptureVerified ?? true,
              aadhaarFull12Validated: k.aadhaarFull12Validated ?? seedKyc?.aadhaarFull12Validated ?? true,
            };
          })
        : defaults.kycQueue,
      staffLeaveRequests: Array.isArray(parsed.staffLeaveRequests)
        ? parsed.staffLeaveRequests
        : defaults.staffLeaveRequests,
      staffAttendanceLogs: Array.isArray(parsed.staffAttendanceLogs)
        ? parsed.staffAttendanceLogs
        : defaults.staffAttendanceLogs,
      staffingBookings:
        Array.isArray(parsed.staffingBookings) && parsed.staffingBookings.length > 0
          ? parsed.staffingBookings
          : defaults.staffingBookings,
      workforce: Array.isArray(parsed.workforce)
        ? parsed.workforce.map((w) => {
            const seedMatch = defaults.workforce.find((d) => d.id === w.id);
            return {
              ...w,
              availabilityStatus: w.availabilityStatus || 'active',
              bankAccountMasked: w.bankAccountMasked || seedMatch?.bankAccountMasked,
              verifiedBadge: w.verifiedBadge || seedMatch?.verifiedBadge,
            };
          })
        : defaults.workforce,
      customerWallet:
        parsed.customerWallet && typeof parsed.customerWallet.balanceRs === 'number'
          ? {
              ...defaults.customerWallet,
              ...parsed.customerWallet,
              referralsClaimed: Array.isArray(parsed.customerWallet.referralsClaimed)
                ? parsed.customerWallet.referralsClaimed
                : [],
              transactions: Array.isArray(parsed.customerWallet.transactions)
                ? parsed.customerWallet.transactions
                : defaults.customerWallet.transactions,
            }
          : defaults.customerWallet,
      sumoParcels:
        Array.isArray(parsed.sumoParcels) && parsed.sumoParcels.length > 0
          ? parsed.sumoParcels
          : defaults.sumoParcels,
      doubleEntryJournals:
        Array.isArray(parsed.doubleEntryJournals) && parsed.doubleEntryJournals.length > 0
          ? parsed.doubleEntryJournals
          : defaults.doubleEntryJournals,
      accountBalances:
        parsed.accountBalances && typeof parsed.accountBalances === 'object'
          ? parsed.accountBalances
          : defaults.accountBalances,
    };
  }

  get(): DatabaseState {
    return this.state;
  }

  commit(): void {
    this.adapter.saveSync(this.state);
  }

  getStorageInfo(): StorageDriverMetadata {
    return this.adapter.getMetadata();
  }

  checkDatabaseHealth(): Promise<StorageHealthReport> {
    return this.adapter.checkHealth();
  }

  addAudit(actor: string, action: string, detail: string): void {
    this.state.auditLogs.unshift({
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      actor,
      action,
      detail,
      at: new Date().toISOString(),
    });
    if (this.state.auditLogs.length > 80) {
      this.state.auditLogs.length = 80;
    }
    this.commit();
  }
}

export const db = new PersistentStore();

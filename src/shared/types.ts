export type Language = 'en' | 'miz';

export type UserRole =
  | 'CUSTOMER'
  | 'RUNNER'
  | 'STAFF'
  | 'MERCHANT'
  | 'TECHNICIAN'
  | 'SUPER_ADMIN';

export interface DoubleEntryPosting {
  account: string;
  side: 'debit' | 'credit';
  amountRs: number;
}

export interface DoubleEntryJournal {
  id: string;
  eventType:
    | 'wallet_topup'
    | 'escrow_hold'
    | 'escrow_settlement'
    | 'payroll_disbursement'
    | 'runner_tip'
    | 'return_fee';
  orderRef: string;
  description: string;
  postings: DoubleEntryPosting[];
  totalAmountRs: number;
  balanced: boolean;
  createdAt: string;
}

export type AppMode =
  | 'customer'
  | 'partner'
  | 'staff'
  | 'merchant'
  | 'technician'
  | 'apply'
  | 'admin'
  | 'dev_studio'
  | 'backend';

export type MizoramDistrict =
  | 'Aizawl'
  | 'Lunglei'
  | 'Champhai'
  | 'Serchhip'
  | 'Kolasib'
  | 'Lawngtlai'
  | 'Mamit'
  | 'Siaha'
  | 'Saitual'
  | 'Khawzawl'
  | 'Hnahthial';

export type PartnerCategory = 'walker' | 'bike' | 'auto_taxi' | 'pickup_truck';

export type AccessType = 'vehicle_accessible' | 'long_steps_walk';

export type KailawnStepTier = 'none' | 'steps_0_15' | 'steps_15_40' | 'steps_40_plus';

export interface MizoramLandmarkAddress {
  veng: string;
  ymaSection?: string;
  nearestLandmark?: string;
  gpsPinned?: boolean;
}

export type TrustBadge =
  | 'Basic Verified'
  | 'Police Verified - Green Shield'
  | 'Gold Pro'
  | 'Company Certified';

export type ErrandJobType =
  | 'hyperlocal_errand'
  | 'step_delivery'
  | 'queue_standing'
  | 'truck_helper'
  | 'bike_express'
  | 'auto_cab_ride'
  | 'heavy_cargo_shift';

export type HygieneCategory =
  | 'standard'
  | 'innerwear'
  | 'opened_cosmetics'
  | 'perishable_food';

export type EmergencyCategory =
  | 'plumber_water'
  | 'electrician_power'
  | 'roadside_mechanic_towing'
  | 'locksmith'
  | 'medical_urgent_cab'
  | 'ambulance_oxygen'
  | 'night_pharmacy_run'
  | 'lpg_gas_leak'
  | 'landslide_drain_clear'
  | 'water_tanker_urgent'
  | 'tyre_puncture_fuel'
  | 'women_night_escort';

export interface LatLng {
  lat: number;
  lng: number;
  label?: string;
}

export interface PartnerProfile {
  id: string;
  name: string;
  phone: string;
  district?: MizoramDistrict;
  veng: string;
  category: PartnerCategory;
  online: boolean;
  lat: number;
  lng: number;
  rating: number;
  completedJobs: number;
  badges: TrustBadge[];
  commercialPermitVerified: boolean;
  policeVerified: boolean;
  securityDepositVerified: boolean;
  codCashHeld: number;
  walletBalance: number;
  shift?: 'Morning (06-14)' | 'Evening (14-22)' | 'Night (22-06)';
  isSalariedTechnician?: boolean;
  lastHeartbeatAt: string;
}

export interface ErrandBid {
  id: string;
  errandId: string;
  partnerId: string;
  partnerName: string;
  partnerCategory: PartnerCategory;
  partnerRating: number;
  partnerBadges: TrustBadge[];
  bidAmount: number;
  etaMinutes: number;
  corridorMatchMeters: number | null;
  createdAt: string;
}

export interface ErrandRequest {
  id: string;
  customerId: string;
  customerName: string;
  district?: MizoramDistrict;
  isInterDistrict?: boolean;
  title: string;
  jobType: ErrandJobType;
  origin: LatLng;
  stops: LatLng[];
  destination: LatLng;
  distanceKm: number;
  accessType: AccessType;
  kailawnNeeded?: boolean;
  kailawnStepTier?: KailawnStepTier;
  kailawnSurchargeRs?: number;
  pickupLandmark?: MizoramLandmarkAddress;
  dropLandmark?: MizoramLandmarkAddress;
  needsWalkerHelper: boolean;
  buildingPhotoUrl?: string;
  voiceNoteUrl?: string;
  voiceNoteDurationSec?: number;
  voiceNoteTranscript?: string;
  declaredValue: number;
  paymentMethod: 'upi_escrow' | 'dynamic_qr_cod';
  microInsuranceOptIn: boolean;
  microInsuranceFee: number;
  allInclusiveTotal: number;
  advanceTokenAmount: number;
  advanceTokenPaid: boolean;
  requiresPoliceVerifiedPartner: boolean;
  otpCode: string;
  status: 'bidding' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
  selectedBidId?: string;
  assignedPartnerId?: string;
  beforeProofUrl?: string;
  afterProofUrl?: string;
  bids: ErrandBid[];
  customerRating?: number;
  tipAmountRs?: number;
  ratingNote?: string;
  createdAt: string;
}

export interface SavedPlace {
  id: string;
  label: string;
  district: MizoramDistrict;
  veng: string;
  landmark?: string;
}

export interface WalletTransaction {
  id: string;
  type: 'topup' | 'referral_bonus' | 'plus_pass' | 'runner_tip' | 'parcel_payment';
  title: string;
  amountRs: number;
  pointsDelta?: number;
  createdAt: string;
}

export interface CustomerWalletState {
  balanceRs: number;
  loyaltyPoints: number;
  referralCode: string;
  referralsClaimed: string[];
  plusPassActive: boolean;
  transactions: WalletTransaction[];
}

export interface SumoParcelBooking {
  id: string;
  trackingCode: string;
  bookingMode?: 'parcel_bridge' | 'proxy_shopping';
  senderName: string;
  receiverName: string;
  receiverPhone: string;
  originDistrict: MizoramDistrict;
  originVeng: string;
  originCounter: string;
  destinationDistrict: MizoramDistrict;
  destinationCounter: string;
  parcelDescription: string;
  shoppingMarket?: string;
  estimatedItemBudgetRs?: number;
  actualItemBillRs?: number;
  billReconciledDeltaRs?: number;
  proxyShoppingFeeRs?: number;
  receiptPhotoUrl?: string;
  assignedRunnerId?: string;
  assignedRunnerName?: string;
  sumoVehicleNumber?: string;
  paidViaWallet?: boolean;
  weightKg: number;
  includeHomeDrop: boolean;
  allInclusiveTotal: number;
  status: 'pickup_scheduled' | 'at_sumo_counter' | 'in_transit' | 'delivered';
  createdAt: string;
}

export interface MarketplaceProduct {
  id: string;
  shopId: string;
  shopName: string;
  district?: MizoramDistrict;
  veng: string;
  titleEn: string;
  titleMiz: string;
  category: string;
  hygieneCategory: HygieneCategory;
  checkBeforePayEligible: boolean;
  price: number;
  color: string;
  size: string;
  tags: string[];
  imageUrl: string;
  stock: number;
}

export interface MarketplaceOrder {
  id: string;
  customerId: string;
  productId: string;
  productTitle: string;
  shopName: string;
  district?: MizoramDistrict;
  veng: string;
  price: number;
  deliveryFee: number;
  microInsuranceFee: number;
  allInclusiveTotal: number;
  checkBeforePay: boolean;
  hygieneCategory: HygieneCategory;
  returnFeeOnReject: number;
  status: 'awaiting_inspection' | 'accepted_paid' | 'rejected_return_fee_charged';
  assignedPartnerId?: string;
  assignedPartnerName?: string;
  paidViaWallet?: boolean;
  voiceNoteUrl?: string;
  voiceNoteDurationSec?: number;
  voiceNoteTranscript?: string;
  chatMessages: { sender: 'customer' | 'merchant'; text: string; at: string }[];
  createdAt: string;
}

export type WorkforceAvailability = 'active' | 'on_leave' | 'suspended';

export interface WorkforceMember {
  id: string;
  name: string;
  phone?: string;
  mode: 'on_demand_workforce' | 'company_managed_staffing';
  roleTitle: string;
  roleTitleMiz: string;
  skills: string[];
  district?: MizoramDistrict;
  veng: string;
  hourlyRate?: number;
  dailyRate?: number;
  monthlyPackageRate?: number;
  practicalSkillScore: number;
  groomingTrainingStatus: string;
  outstationAvailable: boolean;
  liveInAvailable: boolean;
  replacementGuarantee: boolean;
  availabilityStatus?: WorkforceAvailability;
  bankAccountMasked?: string;
  verifiedBadge?: TrustBadge;
  avatarUrl: string;
  portfolioUrls: string[];
  rating: number;
}

export interface StaffingBooking {
  id: string;
  workerId: string;
  workerName: string;
  mode: 'on_demand_workforce' | 'company_managed_staffing';
  customerName: string;
  isOutstationOrLiveIn: boolean;
  accommodationProvided: boolean;
  foodProvided: boolean;
  travelCovered: boolean;
  allInclusiveAmount: number;
  contractId: string;
  tripartiteAgreement: boolean;
  workerSosActive: boolean;
  sosResolvedAt?: string;
  sosResolutionNote?: string;
  replacementWorkerId?: string;
  replacementWorkerName?: string;
  status: 'active' | 'completed';
  createdAt: string;
}

export interface StaffLeaveRequest {
  id: string;
  workerId: string;
  workerName: string;
  bookingId?: string;
  fromDate: string;
  toDate: string;
  reason: string;
  needsInstantReplacement: boolean;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  createdAt: string;
}

export interface StaffAttendanceLog {
  id: string;
  workerId: string;
  workerName: string;
  date: string;
  checkInTime: string;
  status: 'present' | 'half_day' | 'on_leave';
  veng: string;
  lat?: number;
  lng?: number;
  accuracyMeters?: number;
  gpsVerified?: boolean;
}

export interface PayrollRecord {
  id: string;
  staffName: string;
  clientName: string;
  billingWindow: '1st-5th';
  payoutWindow: 'By 7th';
  monthlyPackage: number;
  platformMgmtFee: number;
  netSalaryDisbursed: number;
  bankAccountMasked: string;
  status: 'client_billed' | 'salary_disbursed';
  payslipId: string;
}

export interface EmergencySosTicket {
  id: string;
  customerName: string;
  district?: MizoramDistrict;
  veng: string;
  lat: number;
  lng: number;
  category: EmergencyCategory;
  voiceNoteTranscript: string;
  assignedTechName: string;
  assignedTechShift: string;
  standardizedRate: number;
  sparePartsAmount: number;
  sparePartReceiptUrl?: string;
  slaTargetMinutes: number;
  dispatchSlaSeconds: number;
  status: 'flashing_dispatch' | 'en_route' | 'resolved';
  createdAt: string;
}

export interface KycAiOcrExtraction {
  docType: 'aadhaar_full_card' | 'voter_epic' | 'driving_licence' | 'commercial_permit' | 'vehicle_rc' | 'police_pvc' | 'combined_kyc_sheet';
  extractedName: string;
  aadhaarFull12Detected: boolean;
  aadhaarMasked: string;
  aadhaarVerificationHash: string;
  voterIdNumber?: string;
  drivingLicenceNumber?: string;
  commercialPermitNumber?: string;
  vehicleRcNumber?: string;
  pvcNumber?: string;
  dobOrYear?: string;
  aiConfidenceScore: number;
  captureSource: 'live_phone_camera';
  livenessVerified: boolean;
  tamperVerdict: 'authentic_live_camera' | 'needs_manual_check';
  aiModelUsed: string;
  aiSummary: string;
  scannedAt: string;
}

export interface KycVideoInterviewSession {
  required: boolean;
  status:
    | 'not_required'
    | 'scheduled'
    | 'live_room_open'
    | 'completed_passed'
    | 'completed_failed'
    | 'waived_by_staff';
  provider: 'jitsi_webrtc' | 'google_meet_v2' | 'daily_co' | 'livekit_cloud' | 'agora_rtc';
  roomName: string;
  roomUrl: string;
  scheduledAt?: string;
  interviewerName?: string;
  interviewScore?: number;
  interviewerNotes?: string;
  updatedAt: string;
}

export interface SystemIntegrationConfig {
  geminiApiKey: string;
  geminiModel: string;
  enforceCameraOnlyKyc: boolean;
  requireFull12DigitAadhaarScan: boolean;
  aiOcrMinConfidence: number;
  requireServerStaffVerificationForUpdates: boolean;
  videoProvider: 'jitsi_webrtc' | 'google_meet_v2' | 'daily_co' | 'livekit_cloud' | 'agora_rtc';
  videoServerDomain: string;
  videoApiKey: string;
  videoApiSecret: string;
  roomPrefix: string;
  defaultRequireVideoForAwmpuiAndDrivers: boolean;
  updatedAt: string;
}

export interface KycQueueItem {
  id: string;
  requestType?: 'new_onboarding' | 'partner_doc_update' | 'staff_doc_update';
  targetEntityId?: string;
  applicantName: string;
  phone?: string;
  targetCategory: PartnerCategory | 'staff';
  staffMode?: 'on_demand_workforce' | 'company_managed_staffing';
  roleTitle?: string;
  expectedMonthlyRate?: number;
  expectedDailyRate?: number;
  skills?: string[];
  outstationAvailable?: boolean;
  liveInAvailable?: boolean;
  district?: MizoramDistrict;
  veng: string;
  aadhaarMasked: string;
  aadhaarFull12Validated?: boolean;
  aadhaarVerificationHash?: string;
  voterIdNumber: string;
  drivingLicenceNumber?: string;
  commercialPermitNumber?: string;
  vehicleRcNumber?: string;
  pvcNumber?: string;
  ymaVcReference: string;
  resumeSummary: string;
  practicalTestScore: number;
  documentSignedToken: string;
  kycDocumentPath?: string;
  cameraCaptureVerified?: boolean;
  aiOcrReport?: KycAiOcrExtraction;
  videoInterview?: KycVideoInterviewSession;
  status: 'pending' | 'approved' | 'rejected';
  assignedBadge?: TrustBadge;
  reviewedByStaff?: string;
  reviewedAt?: string;
}

export interface DisputeCase {
  id: string;
  orderRef: string;
  customerName: string;
  partnerName: string;
  reason: string;
  amountInvolved: number;
  beforeProofUrl: string;
  afterProofUrl: string;
  gpsCheckSummary: string;
  prankStrikeCount: number;
  status: 'open' | 'resolved_refund' | 'resolved_payout' | 'blacklisted';
}

export interface EscrowLedgerEntry {
  id: string;
  orderRef: string;
  grossAllInclusive: number;
  gstAmount: number;
  platformCommission: number;
  microInsuranceSachet: number;
  partnerPayout: number;
  merchantSettlement: number;
  paymentMode: 'upi_escrow' | 'dynamic_qr_cod';
  escrowStatus: 'held_until_otp' | 'split_settled' | 'reconciled_webhook';
  createdAt: string;
}

export interface SystemPlugin {
  id: string;
  key: string;
  name: string;
  description: string;
  module:
    | 'auth-kyc'
    | 'errand-fleet'
    | 'marketplace-ai'
    | 'managed-staffing'
    | 'emergency-24x7'
    | 'payment-escrow'
    | 'remote-config-sdui';
  enabled: boolean;
  version: string;
  code: string;
  updatedAt: string;
}

export interface AppRemoteConfig {
  appName: string;
  region: string;
  sundayEmergencyMode: boolean;
  rainSurgeMultiplier: number;
  trafficSurgeMultiplier: number;
  baseWalkerRate: number;
  baseBikeRate: number;
  baseAutoTaxiRate: number;
  basePickupRate: number;
  returnDeliveryFee: number;
  monthlyReturnLimit: number;
  codCashLimitRs: number;
  microInsuranceSachetRs: number;
  visibleServices: {
    errands: boolean;
    marketplace: boolean;
    workforce: boolean;
    managedStaffing: boolean;
    emergency24x7: boolean;
  };
  announcementEn: string;
  announcementMiz: string;
  updatedAt: string;
}

export interface ConfigSnapshot {
  id: string;
  label: string;
  createdAt: string;
  config: AppRemoteConfig;
  plugins: SystemPlugin[];
}

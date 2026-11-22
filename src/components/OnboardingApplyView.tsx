import React, { useState } from 'react';
import {
  Bot,
  Camera,
  CheckCircle2,
  Lock,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Video,
} from 'lucide-react';
import type {
  KycAiOcrExtraction,
  KycQueueItem,
  Language,
  MizoramDistrict,
  PartnerCategory,
} from '../shared/types';
import { ALL_MIZORAM_DISTRICT_NAMES, getDistrictInfo } from '../data/mizoramDistricts';
import { triggerHaptic } from '../lib/nativeBridge';
import { CameraCaptureModal, type CameraCaptureResult } from './CameraCaptureModal';
import { LiveVideoInterviewModal } from './LiveVideoInterviewModal';

type RoleOption =
  | 'awmpui_managed'
  | 'family_driver'
  | 'daily_worker'
  | 'walker'
  | 'bike'
  | 'auto_taxi'
  | 'pickup_truck'
  | 'sos_technician';

interface OnboardingApplyViewProps {
  lang: Language;
  selectedDistrict: MizoramDistrict;
  onSubmitted: () => Promise<void>;
  onBackHome: () => void;
}

const ROLE_OPTIONS: Array<{
  id: RoleOption;
  labelEn: string;
  labelMiz: string;
  descEn: string;
  targetCategory: PartnerCategory | 'staff';
  staffMode?: 'company_managed_staffing' | 'on_demand_workforce';
  defaultRoleTitle?: string;
  needsDl: boolean;
  needsPermit: boolean;
  needsVideoInterview: boolean;
}> = [
  {
    id: 'awmpui_managed',
    labelEn: 'Awmpui / Live-In Caregiver',
    labelMiz: 'Awmpui & Upa/Naupang Enkawltu',
    descEn: 'Company-managed monthly salary direct to bank by 7th + Live Video Vetting',
    targetCategory: 'staff',
    staffMode: 'company_managed_staffing',
    defaultRoleTitle: 'Company-Managed Awmpui & Home Caregiver',
    needsDl: false,
    needsPermit: false,
    needsVideoInterview: true,
  },
  {
    id: 'family_driver',
    labelEn: 'Personal Family Driver',
    labelMiz: 'Chhungkaw Driver (Monthly)',
    descEn: 'Fixed monthly family driver placement with Camera DL OCR & Live Video Vetting',
    targetCategory: 'staff',
    staffMode: 'company_managed_staffing',
    defaultRoleTitle: 'Personal Family Driver & School Commute Specialist',
    needsDl: true,
    needsPermit: false,
    needsVideoInterview: true,
  },
  {
    id: 'daily_worker',
    labelEn: 'Daily Worker / Gardener / Mason',
    labelMiz: 'Nitin Hnathawk (Mistiri / Hlo Thlawh)',
    descEn: 'Flexible hourly & daily local bookings across your Veng',
    targetCategory: 'staff',
    staffMode: 'on_demand_workforce',
    defaultRoleTitle: 'On-Demand Home Technician & Gardener',
    needsDl: false,
    needsPermit: false,
    needsVideoInterview: true,
  },
  {
    id: 'walker',
    labelEn: 'On-Foot Runner (Steps & Errands)',
    labelMiz: 'Ke-a Kal Runner',
    descEn: 'Exclusive access to steep Veng steps, <1.5km errands & queue standing',
    targetCategory: 'walker',
    needsDl: false,
    needsPermit: false,
    needsVideoInterview: false,
  },
  {
    id: 'bike',
    labelEn: 'Bike Express Rider',
    labelMiz: 'Two-Wheeler Express Rider',
    descEn: 'Corridor-matched fast parcel & shop deliveries (Camera DL + Video Vetting)',
    targetCategory: 'bike',
    needsDl: true,
    needsPermit: false,
    needsVideoInterview: true,
  },
  {
    id: 'auto_taxi',
    labelEn: 'Commercial Auto / Local Taxi',
    labelMiz: 'Commercial Taxi / Auto Driver',
    descEn: 'Verified commercial permit required; Camera AI OCR + Video Vetting',
    targetCategory: 'auto_taxi',
    needsDl: true,
    needsPermit: true,
    needsVideoInterview: true,
  },
  {
    id: 'pickup_truck',
    labelEn: 'Pickup Truck / Heavy Cargo',
    labelMiz: 'Pickup Truck / Bungraw Phurhna',
    descEn: 'House shifting & heavy cargo transport across 11 districts',
    targetCategory: 'pickup_truck',
    needsDl: true,
    needsPermit: false,
    needsVideoInterview: true,
  },
  {
    id: 'sos_technician',
    labelEn: '24×7 SOS Rescue Technician',
    labelMiz: '24×7 SOS Technician (Plumber / Electric / Tow)',
    descEn: 'Salaried 3-shift rapid response unit for plumbing, power, LPG & roadside SOS',
    targetCategory: 'staff',
    staffMode: 'company_managed_staffing',
    defaultRoleTitle: '24x7 Rapid SOS Technician (Plumbing & Electrical)',
    needsDl: false,
    needsPermit: false,
    needsVideoInterview: true,
  },
];

export const OnboardingApplyView: React.FC<OnboardingApplyViewProps> = ({
  lang,
  selectedDistrict,
  onSubmitted,
  onBackHome,
}) => {
  const [roleOption, setRoleOption] = useState<RoleOption>('awmpui_managed');
  const [applicantName, setApplicantName] = useState('');
  const [phone, setPhone] = useState('');
  const [district, setDistrict] = useState<MizoramDistrict>(selectedDistrict);
  const [veng, setVeng] = useState<string>(
    getDistrictInfo(selectedDistrict).vengs[0]?.name || 'Khatla'
  );

  // Strict Camera-Only AI Agent Populated KYC Document Fields (Read-Only to Applicant)
  const [aadhaarLast4, setAadhaarLast4] = useState('');
  const [aadhaarMaskedPreview, setAadhaarMaskedPreview] = useState('');
  const [voterIdNumber, setVoterIdNumber] = useState('');
  const [drivingLicenceNumber, setDrivingLicenceNumber] = useState('');
  const [commercialPermitNumber, setCommercialPermitNumber] = useState('');
  const [vehicleRcNumber, setVehicleRcNumber] = useState('');
  const [pvcNumber, setPvcNumber] = useState('');
  const [aiOcrReport, setAiOcrReport] = useState<KycAiOcrExtraction | null>(null);
  const [scanningAiOcr, setScanningAiOcr] = useState(false);

  const [ymaVcReference, setYmaVcReference] = useState('');
  const [expectedRate, setExpectedRate] = useState('14500');
  const [skillsText, setSkillsText] = useState('Housekeeping, Mizo Cooking, Elderly Care');
  const [resumeSummary, setResumeSummary] = useState('');
  const [liveInAvailable, setLiveInAvailable] = useState(true);
  const [outstationAvailable, setOutstationAvailable] = useState(true);
  const [kycDocumentPath, setKycDocumentPath] = useState<string>('');
  const [kycDocLabel, setKycDocLabel] = useState<string>('');
  const [kycCameraOpen, setKycCameraOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [submittedItem, setSubmittedItem] = useState<KycQueueItem | null>(null);
  const [videoModalOpen, setVideoModalOpen] = useState(false);

  const selectedMeta = ROLE_OPTIONS.find((r) => r.id === roleOption) || ROLE_OPTIONS[0];

  const handleSelectRole = (next: RoleOption) => {
    setRoleOption(next);
    if (next === 'awmpui_managed') {
      setExpectedRate('14500');
      setSkillsText('Housekeeping, Mizo Cooking, Elderly Care, First Aid');
    } else if (next === 'family_driver') {
      setExpectedRate('18500');
      setSkillsText('Steep Hill Manual/Auto, School Run, Defensive Driving');
    } else if (next === 'daily_worker') {
      setExpectedRate('1100');
      setSkillsText('Brush-Cutter Clearing, Plumbing/Masonry Helper, Gardening');
    } else if (next === 'sos_technician') {
      setExpectedRate('16500');
      setSkillsText('Emergency Plumbing, Electrical MCB Repair, LPG Leak Safety, Hill Rescue');
    }
    setErrors([]);
  };

  // Triggered immediately after live Phone Camera captures KYC Document
  const handleCameraKycCaptured = async (result: CameraCaptureResult) => {
    setKycDocumentPath(result.objectPath);
    setKycDocLabel(`Phone Camera Live Frame · Encrypted in Admin Vault`);
    setScanningAiOcr(true);
    setErrors([]);

    try {
      const res = await fetch('/api/auth-kyc/ai-ocr-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docType: 'combined_kyc_sheet',
          imageDataUrl: result.previewDataUrl,
          objectPath: result.objectPath,
          applicantHintName: applicantName.trim() || undefined,
          roleCategory: selectedMeta.targetCategory,
          district,
          captureSource: result.captureSource,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        triggerHaptic('error');
        setErrors([data.error || 'AI KYC OCR scan failed. Please retake photo with Phone Camera.']);
        return;
      }

      const extraction = data.extraction as KycAiOcrExtraction;
      setAiOcrReport(extraction);
      if (!applicantName.trim() && extraction.extractedName) {
        setApplicantName(extraction.extractedName);
      }
      setAadhaarLast4(data.aadhaarLast4 || extraction.aadhaarMasked.slice(-4));
      setAadhaarMaskedPreview(extraction.aadhaarMasked);
      setVoterIdNumber(extraction.voterIdNumber || '');
      if (extraction.drivingLicenceNumber) {
        setDrivingLicenceNumber(extraction.drivingLicenceNumber);
      }
      if (extraction.commercialPermitNumber) {
        setCommercialPermitNumber(extraction.commercialPermitNumber);
      }
      if (extraction.vehicleRcNumber) {
        setVehicleRcNumber(extraction.vehicleRcNumber);
      }
      if (extraction.pvcNumber) {
        setPvcNumber(extraction.pvcNumber);
      }
      triggerHaptic('success');
    } catch {
      setErrors(['Network error running AI OCR Agent on captured camera frame.']);
    } finally {
      setScanningAiOcr(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);

    if (!aiOcrReport || !kycDocumentPath) {
      triggerHaptic('error');
      setErrors([
        lang === 'miz'
          ? 'KYC Document (Aadhaar 12-Digit / Voter ID / DL) hi Phone Camera hmangin thla la phawt rawh. AI Agent-in automatic-in a scan leh fill hnuah chauh thehluh theih a ni.'
          : 'You must capture your KYC Document using the Phone Camera first so the AI Agent can scan and populate your 12-digit Aadhaar, Voter ID, and DL.',
      ]);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        applicantName: applicantName.trim(),
        phone: phone.trim(),
        targetCategory: selectedMeta.targetCategory,
        staffMode: selectedMeta.staffMode,
        roleTitle: selectedMeta.defaultRoleTitle,
        district,
        veng: veng.trim(),
        aadhaarLast4: aadhaarLast4.trim(),
        voterIdNumber: voterIdNumber.trim(),
        drivingLicenceNumber: selectedMeta.needsDl ? drivingLicenceNumber.trim() : undefined,
        commercialPermitNumber: selectedMeta.needsPermit
          ? commercialPermitNumber.trim()
          : undefined,
        vehicleRcNumber: selectedMeta.needsDl ? vehicleRcNumber.trim() : undefined,
        pvcNumber: pvcNumber.trim() || undefined,
        ymaVcReference: ymaVcReference.trim(),
        resumeSummary: resumeSummary.trim(),
        expectedMonthlyRate:
          selectedMeta.staffMode === 'company_managed_staffing'
            ? Number(expectedRate) || 14500
            : undefined,
        expectedDailyRate:
          selectedMeta.staffMode === 'on_demand_workforce'
            ? Number(expectedRate) || 1100
            : undefined,
        skills: skillsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        liveInAvailable,
        outstationAvailable,
        kycDocumentPath,
        cameraCaptureVerified: true,
        aiOcrReport,
      };

      const res = await fetch('/api/auth-kyc/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        triggerHaptic('error');
        setErrors(
          Array.isArray(data.errors) && data.errors.length > 0
            ? data.errors
            : [data.error || 'Please verify all required KYC fields.']
        );
        return;
      }

      triggerHaptic('success');
      setSubmittedItem(data.item as KycQueueItem);
      await onSubmitted();
    } catch {
      setErrors(['Network error submitting application. Please try again.']);
    } finally {
      setSubmitting(false);
    }
  };

  if (submittedItem) {
    return (
      <div className="mx-auto max-w-2xl py-6 pb-24 space-y-4">
        <div className="rounded-3xl bg-white border border-emerald-200 p-6 sm:p-8 text-center space-y-4 shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            {lang === 'miz'
              ? 'AI Camera KYC Scan & Dilna Thehlut Fel A Ni!'
              : 'Camera AI KYC Application Queued for Server Staff Verification!'}
          </h1>
          <p className="text-sm text-slate-600">
            {lang === 'miz'
              ? `${submittedItem.applicantName}, i dilna (${submittedItem.id}) leh AI Agent OCR Report (${submittedItem.aadhaarMasked} · Confidence ${submittedItem.aiOcrReport?.aiConfidenceScore ?? 96}%) chu Server-Side HR & KYC Staff verify turin a lut fel ta.`
              : `${submittedItem.applicantName}, your application (${submittedItem.id}) and AI OCR Report (${submittedItem.aadhaarMasked}) are now in the Server-Side HR & KYC Verification Queue.`}
          </p>

          {/* In-App Live Video Interview Card for Awmpui & Drivers */}
          {submittedItem.videoInterview && (
            <div className="rounded-2xl bg-teal-950 text-white p-5 text-left space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-emerald-300">
                  <Video className="w-4 h-4" />
                  {lang === 'miz'
                    ? 'In-App Live Video Interview Room (Awmpui & Driver Vetting)'
                    : 'In-App Live Video Interview Room (Awmpui & Driver Vetting)'}
                </span>
                <span className="rounded-lg bg-white/15 px-2.5 py-0.5 text-[11px] font-mono font-bold text-emerald-200">
                  {submittedItem.videoInterview.roomName}
                </span>
              </div>
              <p className="text-xs text-emerald-100/90 leading-relaxed">
                {lang === 'miz'
                  ? 'Awmpui leh Driver tan app chhungah Live Video Interview room siam nghal a ni. Server-side HR Staff ten interview neih an tih chuan a hnuaia button hmetin App chhungah video call-in i chhang nghal thei:'
                  : 'An encrypted In-App WebRTC Live Video Interview room has been provisioned for your application. When requested by HR Vetting Staff, join directly inside the app below:'}
              </p>
              <button
                type="button"
                onClick={() => setVideoModalOpen(true)}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 hover:bg-emerald-300 px-4 py-2.5 text-xs font-extrabold text-emerald-950 transition-colors"
              >
                <Video className="w-4 h-4" />
                {lang === 'miz'
                  ? 'Live Video Interview Room Lut Rawh (In-App Video Call)'
                  : 'Open In-App Live Video Interview Room'}
              </button>
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setSubmittedItem(null);
                setApplicantName('');
                setPhone('');
                setAadhaarLast4('');
                setAadhaarMaskedPreview('');
                setVoterIdNumber('');
                setAiOcrReport(null);
                setKycDocumentPath('');
                setResumeSummary('');
              }}
              className="min-h-[44px] rounded-xl border border-slate-300 px-5 text-xs font-bold text-slate-800 hover:bg-slate-50"
            >
              {lang === 'miz' ? 'Dilna Dang Thehlut' : 'Submit Another Application'}
            </button>
            <button
              type="button"
              onClick={onBackHome}
              className="min-h-[44px] rounded-xl bg-emerald-800 px-5 text-xs font-bold text-white hover:bg-emerald-700"
            >
              {lang === 'miz' ? 'Home-ah Kir Leh' : 'Back to ZoRûn Home'}
            </button>
          </div>
        </div>

        <LiveVideoInterviewModal
          open={videoModalOpen}
          onClose={() => setVideoModalOpen(false)}
          lang={lang}
          kycItem={submittedItem}
          isServerStaff={false}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-24 md:pb-8">
      <section className="rounded-3xl bg-emerald-950 text-white p-5 sm:p-6 space-y-3">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
            <UserPlus className="w-6 h-6 text-emerald-300" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold">
              {lang === 'miz'
                ? 'ZoRûn Hnathawk / Driver / Awmpui Dilna (Camera AI KYC & Video Vetting)'
                : 'Join ZoRûn — Phone Camera AI KYC & Live Video Interview Vetting'}
            </h1>
            <p className="text-xs text-emerald-100/90 mt-1 leading-relaxed">
              {lang === 'miz'
                ? 'Document pawimawh (Aadhaar 12-digit, Voter ID, Driving Licence, Permit) reng reng mahnia type phal a ni lo — Phone Camera hmangin thla la la, AI Agent-in automatic-in a scan ang a, Server-Side HR Staff ten Live Video Interview nen an verify ang.'
                : 'Important KYC documents cannot be manually typed. Capture your ID/DL live with your Phone Camera so our AI Agent extracts & verifies your full 12-digit Aadhaar (auto-masked) for Server-Side Staff approval.'}
            </p>
          </div>
        </div>
      </section>

      <form
        onSubmit={handleSubmit}
        className="rounded-3xl bg-white border border-slate-200 p-5 sm:p-6 space-y-5"
      >
        {/* Step 1: Choose Role */}
        <div className="space-y-2.5">
          <p className="text-xs font-bold text-slate-900">
            1. {lang === 'miz' ? 'Hnathawh Chi Thlang Rawh' : 'Choose Your Role'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {ROLE_OPTIONS.map((opt) => {
              const active = roleOption === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelectRole(opt.id)}
                  className={`min-h-[56px] rounded-2xl border p-3 text-left transition-colors ${
                    active
                      ? 'border-emerald-800 bg-emerald-50/80 text-emerald-950'
                      : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold">
                      {lang === 'miz' ? opt.labelMiz : opt.labelEn}
                    </p>
                    {opt.needsVideoInterview && (
                      <span className="rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-bold text-teal-900">
                        Live Video Vetting
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5">{opt.descEn}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Personal & Location Details */}
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <p className="text-xs font-bold text-slate-900">
            2. {lang === 'miz' ? 'Mimal Chanchin & Awmna' : 'Personal & Location Details'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="apply-name"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                {lang === 'miz' ? 'Hming Pum *' : 'Full Name *'}
              </label>
              <input
                id="apply-name"
                required
                value={applicantName}
                onChange={(e) => setApplicantName(e.target.value)}
                placeholder="e.g. Lalrinmawii Sailo"
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="apply-phone"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                {lang === 'miz' ? 'Phone Number (10 digits) *' : 'Mobile Number (10 digits) *'}
              </label>
              <input
                id="apply-phone"
                required
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="9862011223"
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="apply-district"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                District *
              </label>
              <select
                id="apply-district"
                value={district}
                onChange={(e) => {
                  const next = e.target.value as MizoramDistrict;
                  setDistrict(next);
                  setVeng(getDistrictInfo(next).vengs[0]?.name || '');
                }}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-sm"
              >
                {ALL_MIZORAM_DISTRICT_NAMES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="apply-veng"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Veng / Khua *
              </label>
              <input
                id="apply-veng"
                required
                value={veng}
                onChange={(e) => setVeng(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Step 3: Strict Phone-Camera-Only AI Agent KYC Scanner */}
        <div className="space-y-3.5 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold text-slate-900 inline-flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              3.{' '}
              {lang === 'miz'
                ? 'Phone Camera KYC Thla Lakna & AI Agent Automatic OCR (Mahnia Type Theih Loh)'
                : 'Phone Camera KYC Capture & AI Agent Automatic OCR (Manual Edit Locked)'}
            </p>
            <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-950">
              <Lock className="w-3 h-3" /> Camera-Only · Server Staff Verified
            </span>
          </div>

          {/* Primary Camera Capture Trigger Box */}
          <div className="rounded-2xl border-2 border-emerald-700/30 bg-emerald-50/70 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-emerald-950 flex items-center gap-1.5">
                  <Bot className="w-4 h-4 text-emerald-700" />
                  {lang === 'miz'
                    ? 'Aadhaar (12-Digit Full Card), Voter ID, Driving Licence & Permit Camera Scan'
                    : 'Scan Full 12-Digit Aadhaar, Voter ID & Driving Licence via Phone Camera'}
                </p>
                <p className="text-[11px] text-emerald-900/80 mt-0.5">
                  {kycDocLabel ||
                    (lang === 'miz'
                      ? 'Gallery upload theih a ni lo. Phone Camera hmangin thla la la, AI Agent-in Aadhaar digit 12 enfiahin a mask nghal ang a, form-ah a fill vek ang.'
                      : 'Gallery file upload is disabled. Capture live with your Phone Camera so the AI Agent scans the full 12-digit Aadhaar, masks it, and auto-fills all document fields.')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setKycCameraOpen(true)}
                className="min-h-[44px] rounded-xl bg-emerald-800 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-emerald-900 inline-flex items-center gap-2 shadow-sm shrink-0"
              >
                <Camera className="w-4 h-4" />
                <span>
                  {scanningAiOcr
                    ? lang === 'miz'
                      ? 'AI Agent-in a chhiar mek...'
                      : 'AI Agent Scanning...'
                    : aiOcrReport
                      ? lang === 'miz'
                        ? 'Camera-in Thla La Tha Leh Rawh'
                        : 'Retake Camera KYC Scan'
                      : lang === 'miz'
                        ? 'Phone Camera-in KYC Thla La Rawh'
                        : 'Scan KYC with Phone Camera'}
                </span>
              </button>
            </div>

            {aiOcrReport && (
              <div className="rounded-xl bg-white border border-emerald-200 p-3 text-xs space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 font-extrabold text-emerald-900">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    AI OCR Verified ({aiOcrReport.aiConfidenceScore}% Confidence) ·{' '}
                    {aiOcrReport.aiModelUsed}
                  </span>
                  <span className="font-mono text-[11px] text-slate-500">
                    {aiOcrReport.aadhaarVerificationHash}
                  </span>
                </div>
                <p className="text-slate-700">{aiOcrReport.aiSummary}</p>
              </div>
            )}
          </div>

          {/* AI-Locked Read-Only Extracted Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="apply-aadhaar"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Aadhaar (12-Digit AI Scan → Masked) *
              </label>
              <input
                id="apply-aadhaar"
                readOnly
                value={aadhaarMaskedPreview}
                placeholder="Scan via Phone Camera (AI Auto-Fill)"
                className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-slate-100 px-3 text-xs font-mono font-bold text-slate-800 cursor-not-allowed"
              />
            </div>
            <div>
              <label
                htmlFor="apply-voter"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Voter ID / EPIC (AI OCR Locked) *
              </label>
              <input
                id="apply-voter"
                readOnly
                value={voterIdNumber}
                placeholder="AI Camera OCR Auto-Fill"
                className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-slate-100 px-3 text-xs font-mono font-bold text-slate-800 cursor-not-allowed"
              />
            </div>
            <div>
              <label
                htmlFor="apply-pvc"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Police Verification (AI OCR Locked)
              </label>
              <input
                id="apply-pvc"
                readOnly
                value={pvcNumber}
                placeholder="AI Camera OCR Auto-Fill"
                className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-slate-100 px-3 text-xs font-mono font-bold text-slate-800 cursor-not-allowed"
              />
            </div>
          </div>

          {selectedMeta.needsDl && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="apply-dl"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Driving Licence (AI OCR Locked) *
                </label>
                <input
                  id="apply-dl"
                  readOnly
                  value={drivingLicenceNumber}
                  placeholder="AI Camera OCR Auto-Fill"
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-slate-100 px-3 text-xs font-mono font-bold text-slate-800 cursor-not-allowed"
                />
              </div>
              <div>
                <label
                  htmlFor="apply-rc"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Vehicle RC Number (AI OCR Locked)
                </label>
                <input
                  id="apply-rc"
                  readOnly
                  value={vehicleRcNumber}
                  placeholder="AI Camera OCR Auto-Fill"
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-slate-100 px-3 text-xs font-mono font-bold text-slate-800 cursor-not-allowed"
                />
              </div>
              {selectedMeta.needsPermit && (
                <div>
                  <label
                    htmlFor="apply-permit"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Commercial Permit (AI OCR Locked) *
                  </label>
                  <input
                    id="apply-permit"
                    readOnly
                    value={commercialPermitNumber}
                    placeholder="AI Camera OCR Auto-Fill"
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-slate-100 px-3 text-xs font-mono font-bold text-slate-800 cursor-not-allowed"
                  />
                </div>
              )}
            </div>
          )}

          <div>
            <label
              htmlFor="apply-yma"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Local YMA Branch / Village Council (VC) Reference *
            </label>
            <input
              id="apply-yma"
              required
              value={ymaVcReference}
              onChange={(e) => setYmaVcReference(e.target.value)}
              placeholder="e.g. Khatla Branch YMA Secretary Verified"
              className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
            />
          </div>

          {selectedMeta.targetCategory === 'staff' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="apply-rate"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  {selectedMeta.staffMode === 'company_managed_staffing'
                    ? 'Expected Monthly Package (₹)'
                    : 'Expected Daily Rate (₹)'}
                </label>
                <input
                  id="apply-rate"
                  type="number"
                  value={expectedRate}
                  onChange={(e) => setExpectedRate(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-mono"
                />
              </div>
              <div>
                <label
                  htmlFor="apply-skills"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Key Skills
                </label>
                <input
                  id="apply-skills"
                  value={skillsText}
                  onChange={(e) => setSkillsText(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
                />
              </div>
            </div>
          )}

          <div>
            <label
              htmlFor="apply-resume"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              {lang === 'miz' ? 'Tawnhriat & Thiamna Tawi *' : 'Experience & Skills Summary *'}
            </label>
            <textarea
              id="apply-resume"
              required
              rows={3}
              value={resumeSummary}
              onChange={(e) => setResumeSummary(e.target.value)}
              placeholder="e.g. 4 years elderly home care & Mizo cooking in Khatla, Aizawl."
              className="w-full rounded-xl border border-slate-300 p-3 text-sm"
            />
          </div>

          {selectedMeta.targetCategory === 'staff' && (
            <div className="flex flex-wrap gap-4 text-xs font-medium text-slate-700">
              <label className="inline-flex items-center gap-2 min-h-[36px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={liveInAvailable}
                  onChange={(e) => setLiveInAvailable(e.target.checked)}
                />
                Available for Live-In Placement
              </label>
              <label className="inline-flex items-center gap-2 min-h-[36px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={outstationAvailable}
                  onChange={(e) => setOutstationAvailable(e.target.checked)}
                />
                Available for Outstation Districts
              </label>
            </div>
          )}
        </div>

        {errors.length > 0 && (
          <div
            role="alert"
            className="rounded-2xl border border-red-200 bg-red-50 p-3.5 space-y-1 text-xs text-red-800"
          >
            {errors.map((err, idx) => (
              <p key={idx}>{err}</p>
            ))}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || scanningAiOcr}
          className="w-full min-h-[48px] rounded-2xl bg-emerald-800 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          {submitting
            ? lang === 'miz'
              ? 'Server Verification Queue-ah thawn mek...'
              : 'Submitting to Server Verification Queue...'
            : lang === 'miz'
              ? 'AI Camera KYC & Video Interview Dilna Thehlut Rawh'
              : 'Submit AI-Scanned KYC for Server Staff Verification'}
        </button>
      </form>

      <CameraCaptureModal
        open={kycCameraOpen}
        onClose={() => setKycCameraOpen(false)}
        lang={lang}
        category="kyc_doc"
        cameraOnly={true}
        district={district}
        titleEn="Phone Camera KYC Document Capture (AI OCR Agent)"
        titleMiz="Phone Camera-in KYC Document Thla La Rawh (AI OCR)"
        subtitleEn="Gallery upload is disabled. AI Agent automatically scans full 12-digit Aadhaar, Voter ID & DL."
        subtitleMiz="Gallery upload phal a ni lo. AI Agent-in Aadhaar digit 12, Voter ID leh DL a chhiar nghal ang."
        onCaptured={(result) => void handleCameraKycCaptured(result)}
      />
    </div>
  );
};

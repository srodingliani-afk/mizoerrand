import React, { useState } from 'react';
import { CheckCircle2, ShieldCheck, UserPlus } from 'lucide-react';
import type { Language, MizoramDistrict, PartnerCategory } from '../shared/types';
import { ALL_MIZORAM_DISTRICT_NAMES, getDistrictInfo } from '../data/mizoramDistricts';
import { triggerHaptic } from '../lib/nativeBridge';

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
}> = [
  {
    id: 'awmpui_managed',
    labelEn: 'Awmpui / Live-In Caregiver',
    labelMiz: 'Awmpui & Upa/Naupang Enkawltu',
    descEn: 'Company-managed monthly salary direct to bank by 7th + safety protection',
    targetCategory: 'staff',
    staffMode: 'company_managed_staffing',
    defaultRoleTitle: 'Company-Managed Awmpui & Home Caregiver',
    needsDl: false,
    needsPermit: false,
  },
  {
    id: 'family_driver',
    labelEn: 'Personal Family Driver',
    labelMiz: 'Chhungkaw Driver (Monthly)',
    descEn: 'Fixed monthly family driver placement with DL & hill-driving verification',
    targetCategory: 'staff',
    staffMode: 'company_managed_staffing',
    defaultRoleTitle: 'Personal Family Driver & School Commute Specialist',
    needsDl: true,
    needsPermit: false,
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
  },
  {
    id: 'walker',
    labelEn: 'On-Foot Runner (Steps & Errands)',
    labelMiz: 'Ke-a Kal Runner',
    descEn: 'Exclusive access to steep Veng steps, <1.5km errands & queue standing',
    targetCategory: 'walker',
    needsDl: false,
    needsPermit: false,
  },
  {
    id: 'bike',
    labelEn: 'Bike Express Rider',
    labelMiz: 'Two-Wheeler Express Rider',
    descEn: 'Corridor-matched fast parcel & shop deliveries',
    targetCategory: 'bike',
    needsDl: true,
    needsPermit: false,
  },
  {
    id: 'auto_taxi',
    labelEn: 'Commercial Auto / Local Taxi',
    labelMiz: 'Commercial Taxi / Auto Driver',
    descEn: 'Verified commercial permit required; zero hidden platform fees',
    targetCategory: 'auto_taxi',
    needsDl: true,
    needsPermit: true,
  },
  {
    id: 'pickup_truck',
    labelEn: 'Pickup Truck / Heavy Cargo',
    labelMiz: 'Pickup Truck / Bungraw Phurhna',
    descEn: 'House shifting & heavy cargo transport across 11 districts',
    targetCategory: 'pickup_truck',
    needsDl: true,
    needsPermit: false,
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
  const [veng, setVeng] = useState<string>(getDistrictInfo(selectedDistrict).vengs[0]?.name || 'Khatla');
  const [aadhaarLast4, setAadhaarLast4] = useState('');
  const [voterIdNumber, setVoterIdNumber] = useState('');
  const [drivingLicenceNumber, setDrivingLicenceNumber] = useState('');
  const [commercialPermitNumber, setCommercialPermitNumber] = useState('');
  const [vehicleRcNumber, setVehicleRcNumber] = useState('');
  const [pvcNumber, setPvcNumber] = useState('');
  const [ymaVcReference, setYmaVcReference] = useState('');
  const [expectedRate, setExpectedRate] = useState('14500');
  const [skillsText, setSkillsText] = useState('Housekeeping, Mizo Cooking, Elderly Care');
  const [resumeSummary, setResumeSummary] = useState('');
  const [liveInAvailable, setLiveInAvailable] = useState(true);
  const [outstationAvailable, setOutstationAvailable] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [submittedRef, setSubmittedRef] = useState<{ id: string; name: string } | null>(null);

  const selectedMeta = ROLE_OPTIONS.find((r) => r.id === roleOption) || ROLE_OPTIONS[0];

  const handleSelectRole = (next: RoleOption) => {
    setRoleOption(next);
    const meta = ROLE_OPTIONS.find((r) => r.id === next)!;
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
    void meta;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);
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
        commercialPermitNumber: selectedMeta.needsPermit ? commercialPermitNumber.trim() : undefined,
        vehicleRcNumber: selectedMeta.needsDl ? vehicleRcNumber.trim() : undefined,
        pvcNumber: pvcNumber.trim() || undefined,
        ymaVcReference: ymaVcReference.trim(),
        resumeSummary: resumeSummary.trim(),
        expectedMonthlyRate:
          selectedMeta.staffMode === 'company_managed_staffing' ? Number(expectedRate) || 14500 : undefined,
        expectedDailyRate:
          selectedMeta.staffMode === 'on_demand_workforce' ? Number(expectedRate) || 1100 : undefined,
        skills: skillsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        liveInAvailable,
        outstationAvailable,
      };

      const res = await fetch('/api/auth-kyc/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        triggerHaptic('error');
        setErrors(Array.isArray(data.errors) && data.errors.length > 0 ? data.errors : [data.error || 'Please verify all required KYC fields.']);
        return;
      }

      triggerHaptic('success');
      setSubmittedRef({ id: data.item.id, name: data.item.applicantName });
      await onSubmitted();
    } catch {
      setErrors(['Network error submitting application. Please try again.']);
    } finally {
      setSubmitting(false);
    }
  };

  if (submittedRef) {
    return (
      <div className="mx-auto max-w-xl py-6 pb-24">
        <div className="rounded-3xl bg-white border border-emerald-200 p-6 sm:p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            {lang === 'miz' ? 'KYC Dilna Thehlut Fel A Ni!' : 'KYC Application Submitted!'}
          </h1>
          <p className="text-sm text-slate-600">
            {lang === 'miz'
              ? `${submittedRef.name}, i dilna (${submittedRef.id}) chu Admin KYC & HR Queue-ah a lut fel tawh. An approve rualin live directory-ah a lang nghal ang.`
              : `${submittedRef.name}, your application (${submittedRef.id}) is now live in the Admin KYC & HR Queue. Once approved, your profile publishes automatically.`}
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setSubmittedRef(null);
                setApplicantName('');
                setPhone('');
                setAadhaarLast4('');
                setVoterIdNumber('');
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
              {lang === 'miz' ? 'Home-ah Kir Leh' : 'Back to ZoRun Home'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-24 md:pb-8">
      <section className="rounded-3xl bg-emerald-950 text-white p-5 sm:p-6">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
            <UserPlus className="w-6 h-6 text-emerald-300" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold">
              {lang === 'miz'
                ? 'ZoRun Hnathawk / Driver / Awmpui Dilna'
                : 'Join ZoRun — Awmpui, Driver & Runner KYC Registration'}
            </h1>
            <p className="text-xs text-emerald-100/90 mt-1 leading-relaxed">
              {lang === 'miz'
                ? 'I dilna hi Admin KYC & HR Officer ten an enfiah ang a, an approve rualin Customer Directory emaw Fleet-ah a lang nghal ang.'
                : 'Submit your local YMA/VC reference & KYC details directly to our HR & Vetting Officers for instant onboarding.'}
            </p>
          </div>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="rounded-3xl bg-white border border-slate-200 p-5 sm:p-6 space-y-5">
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
                  <p className="text-xs font-bold">
                    {lang === 'miz' ? opt.labelMiz : opt.labelEn}
                  </p>
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
              <label htmlFor="apply-name" className="block text-xs font-semibold text-slate-700 mb-1">
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
              <label htmlFor="apply-phone" className="block text-xs font-semibold text-slate-700 mb-1">
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
              <label htmlFor="apply-district" className="block text-xs font-semibold text-slate-700 mb-1">
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
              <label htmlFor="apply-veng" className="block text-xs font-semibold text-slate-700 mb-1">
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

        {/* Step 3: KYC & Local YMA/VC Verification */}
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <p className="text-xs font-bold text-slate-900 inline-flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-700" />
            3. {lang === 'miz' ? 'KYC & YMA / VC Hriatpuina' : 'KYC & Local YMA / VC Verification'}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="apply-aadhaar" className="block text-xs font-semibold text-slate-700 mb-1">
                Aadhaar Last 4 Digits *
              </label>
              <input
                id="apply-aadhaar"
                required
                maxLength={4}
                inputMode="numeric"
                value={aadhaarLast4}
                onChange={(e) => setAadhaarLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="4821"
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-mono"
              />
            </div>
            <div>
              <label htmlFor="apply-voter" className="block text-xs font-semibold text-slate-700 mb-1">
                Voter ID / EPIC *
              </label>
              <input
                id="apply-voter"
                required
                value={voterIdNumber}
                onChange={(e) => setVoterIdNumber(e.target.value)}
                placeholder="MIZ/01/558120"
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-mono"
              />
            </div>
            <div>
              <label htmlFor="apply-pvc" className="block text-xs font-semibold text-slate-700 mb-1">
                Police Verification (Optional)
              </label>
              <input
                id="apply-pvc"
                value={pvcNumber}
                onChange={(e) => setPvcNumber(e.target.value)}
                placeholder="PVC-AZL-2026-..."
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-mono"
              />
            </div>
          </div>

          {selectedMeta.needsDl && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="apply-dl" className="block text-xs font-semibold text-slate-700 mb-1">
                  Driving Licence (DL) *
                </label>
                <input
                  id="apply-dl"
                  required
                  value={drivingLicenceNumber}
                  onChange={(e) => setDrivingLicenceNumber(e.target.value)}
                  placeholder="MZ01-2021004412"
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-mono"
                />
              </div>
              <div>
                <label htmlFor="apply-rc" className="block text-xs font-semibold text-slate-700 mb-1">
                  Vehicle RC Number
                </label>
                <input
                  id="apply-rc"
                  value={vehicleRcNumber}
                  onChange={(e) => setVehicleRcNumber(e.target.value)}
                  placeholder="MZ01-T-4491"
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-mono"
                />
              </div>
              {selectedMeta.needsPermit && (
                <div>
                  <label htmlFor="apply-permit" className="block text-xs font-semibold text-slate-700 mb-1">
                    Commercial Permit *
                  </label>
                  <input
                    id="apply-permit"
                    required
                    value={commercialPermitNumber}
                    onChange={(e) => setCommercialPermitNumber(e.target.value)}
                    placeholder="MZ-COMM-TAXI-8812"
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-mono"
                  />
                </div>
              )}
            </div>
          )}

          <div>
            <label htmlFor="apply-yma" className="block text-xs font-semibold text-slate-700 mb-1">
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
                <label htmlFor="apply-rate" className="block text-xs font-semibold text-slate-700 mb-1">
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
                <label htmlFor="apply-skills" className="block text-xs font-semibold text-slate-700 mb-1">
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
            <label htmlFor="apply-resume" className="block text-xs font-semibold text-slate-700 mb-1">
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
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-3.5 space-y-1 text-xs text-red-800">
            {errors.map((err, idx) => (
              <p key={idx}>{err}</p>
            ))}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full min-h-[48px] rounded-2xl bg-emerald-800 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          {submitting
            ? lang === 'miz'
              ? 'Thawn mek...'
              : 'Submitting KYC Application...'
            : lang === 'miz'
              ? 'KYC Dilna Thehlut Rawh'
              : 'Submit KYC Application'}
        </button>
      </form>
    </div>
  );
};

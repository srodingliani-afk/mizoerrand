import { Router } from 'express';
import { db } from '../infrastructure/store';
import { createSignedPrivateUrl, verifySignedPrivateToken } from '../infrastructure/signedUrls';
import { createAdminKycSignedUrl, isValidKycObjectPath } from '../infrastructure/driveStorage';
import { realtimeHub } from '../infrastructure/realtimeHub';
import { liveGpsCache } from '../infrastructure/redisCache';
import { requireAdminAuth } from '../infrastructure/adminAuth';
import { validateOnboardingApplication } from '../domain/staffingRules';
import { findDistrictVeng, getDistrictInfo } from '../../src/data/mizoramDistricts';
import type {
  KycQueueItem,
  MizoramDistrict,
  PartnerCategory,
  PartnerProfile,
  TrustBadge,
  WorkforceMember,
} from '../../src/shared/types';

export const authKycRouter = Router();

// Public Onboarding Submission for Awmpui, Family Drivers, Runners, Riders, Taxis & Pickup Drivers
authKycRouter.post('/apply', (req, res) => {
  const body = req.body as {
    applicantName?: string;
    phone?: string;
    targetCategory?: PartnerCategory | 'staff';
    staffMode?: 'on_demand_workforce' | 'company_managed_staffing';
    roleTitle?: string;
    district?: MizoramDistrict;
    veng?: string;
    aadhaarLast4?: string;
    voterIdNumber?: string;
    drivingLicenceNumber?: string;
    commercialPermitNumber?: string;
    vehicleRcNumber?: string;
    pvcNumber?: string;
    ymaVcReference?: string;
    resumeSummary?: string;
    expectedMonthlyRate?: number;
    expectedDailyRate?: number;
    skills?: string[];
    outstationAvailable?: boolean;
    liveInAvailable?: boolean;
    kycDocumentPath?: string;
  };

  const validation = validateOnboardingApplication(body);
  if (!validation.valid || !validation.aadhaarMasked) {
    res.status(400).json({
      error: validation.errors[0] || 'Please complete all required KYC fields.',
      errors: validation.errors,
    });
    return;
  }

  const state = db.get();
  const targetCategory = body.targetCategory as PartnerCategory | 'staff';
  const item: KycQueueItem = {
    id: `kyc-${Date.now().toString().slice(-5)}`,
    applicantName: body.applicantName!.trim(),
    phone: body.phone!.replace(/\D/g, '').slice(-10),
    targetCategory,
    staffMode:
      targetCategory === 'staff'
        ? body.staffMode === 'on_demand_workforce'
          ? 'on_demand_workforce'
          : 'company_managed_staffing'
        : undefined,
    roleTitle: (body.roleTitle || '').trim().slice(0, 80) || undefined,
    expectedMonthlyRate:
      typeof body.expectedMonthlyRate === 'number' && body.expectedMonthlyRate >= 4000
        ? Math.round(body.expectedMonthlyRate)
        : undefined,
    expectedDailyRate:
      typeof body.expectedDailyRate === 'number' && body.expectedDailyRate >= 300
        ? Math.round(body.expectedDailyRate)
        : undefined,
    skills: Array.isArray(body.skills)
      ? body.skills.map((s) => String(s).trim()).filter(Boolean).slice(0, 8)
      : undefined,
    outstationAvailable: Boolean(body.outstationAvailable),
    liveInAvailable: Boolean(body.liveInAvailable),
    district: body.district || 'Aizawl',
    veng: body.veng!.trim(),
    aadhaarMasked: validation.aadhaarMasked,
    voterIdNumber: body.voterIdNumber!.trim().toUpperCase().slice(0, 28),
    drivingLicenceNumber: (body.drivingLicenceNumber || '').trim().toUpperCase().slice(0, 28) || undefined,
    commercialPermitNumber: (body.commercialPermitNumber || '').trim().toUpperCase().slice(0, 32) || undefined,
    vehicleRcNumber: (body.vehicleRcNumber || '').trim().toUpperCase().slice(0, 24) || undefined,
    pvcNumber: (body.pvcNumber || '').trim().toUpperCase().slice(0, 32) || 'Pending Verification',
    ymaVcReference: body.ymaVcReference!.trim().slice(0, 100),
    resumeSummary: body.resumeSummary!.trim().slice(0, 240),
    practicalTestScore: 88,
    documentSignedToken: 'pending-issue',
    kycDocumentPath:
      typeof body.kycDocumentPath === 'string' && isValidKycObjectPath(body.kycDocumentPath.trim())
        ? body.kycDocumentPath.trim()
        : undefined,
    status: 'pending',
  };

  state.kycQueue.unshift(item);
  db.addAudit(
    item.applicantName,
    'KYC_APPLICATION_SUBMITTED',
    `${item.id} (${item.targetCategory}) · ${item.district} · ${item.veng}`
  );
  realtimeHub.broadcast('kyc_update', { id: item.id, status: item.status });
  res.status(201).json({ item });
});

authKycRouter.get('/queue', requireAdminAuth, async (_req, res) => {
  const state = db.get();
  const enriched = await Promise.all(
    state.kycQueue.map(async (item) => {
      if (item.kycDocumentPath) {
        try {
          const cloudSigned = await createAdminKycSignedUrl(item.kycDocumentPath, 60);
          return {
            ...item,
            signedDocumentUrl: cloudSigned.signedUrl,
            signedExpiresAt: cloudSigned.expiresAt,
            signedStorageProvider: cloudSigned.provider,
          };
        } catch {
          // Fall back to HMAC token if bucket probe fails
        }
      }
      const signed = createSignedPrivateUrl(item.id, 'kyc_doc', 60);
      return {
        ...item,
        signedDocumentUrl: signed.url,
        signedExpiresAt: signed.expiresAt,
        signedStorageProvider: 'local_fallback' as const,
      };
    })
  );
  res.json({ kycQueue: enriched });
});

authKycRouter.post('/issue-signed-url', requireAdminAuth, (req, res) => {
  const { resourceId, resourceType } = req.body as {
    resourceId?: string;
    resourceType?: 'kyc_doc' | 'voice_note' | 'proof_photo' | 'spare_receipt';
  };
  if (!resourceId || !resourceType) {
    res.status(400).json({ error: 'resourceId and resourceType are required' });
    return;
  }
  const signed = createSignedPrivateUrl(resourceId, resourceType, 60);
  res.json(signed);
});

authKycRouter.get('/signed-media/:token', (req, res) => {
  const { token } = req.params;
  if (token === 'demo-voice' || token === 'voice-guide') {
    res.json({
      verified: true,
      ttlPolicy: '60s private signed URL',
      resourceId: token,
      resourceType: 'voice_note',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    return;
  }
  const verification = verifySignedPrivateToken(token);
  if (!verification.valid) {
    res.status(403).json({ error: verification.error });
    return;
  }
  res.json({
    verified: true,
    ttlPolicy: '60s private signed URL',
    resourceId: verification.payload.resourceId,
    resourceType: verification.payload.resourceType,
    expiresAt: new Date(verification.payload.exp).toISOString(),
  });
});

authKycRouter.post('/review', requireAdminAuth, (req, res) => {
  const { id, decision, badge } = req.body as {
    id?: string;
    decision?: 'approved' | 'rejected';
    badge?: TrustBadge;
  };
  if (!id || !decision) {
    res.status(400).json({ error: 'id and decision are required' });
    return;
  }
  const state = db.get();
  const item = state.kycQueue.find((k) => k.id === id);
  if (!item) {
    res.status(404).json({ error: 'KYC item not found' });
    return;
  }
  item.status = decision;
  let promotedWorkforce: WorkforceMember | undefined;
  let promotedPartner: PartnerProfile | undefined;

  if (decision === 'approved') {
    const assignedBadge = badge || 'Police Verified - Green Shield';
    item.assignedBadge = assignedBadge;

    // Auto-publish approved Awmpui / Family Driver / Workforce applicant into live Directory
    if (item.targetCategory === 'staff') {
      const exists = state.workforce.some(
        (w) => w.name.toLowerCase() === item.applicantName.toLowerCase()
      );
      if (!exists) {
        const mode = item.staffMode || 'company_managed_staffing';
        const roleTitle = item.roleTitle || 'Company-Managed Awmpui & Home Caregiver';
        const isDriver = /driver/i.test(roleTitle) || Boolean(item.drivingLicenceNumber);
        promotedWorkforce = {
          id: `wrk-${Date.now().toString().slice(-5)}`,
          name: item.applicantName,
          phone: item.phone,
          mode,
          roleTitle,
          roleTitleMiz: isDriver ? 'Chhungkaw Driver (Verified)' : 'Awmpui & In Enkawltu (Verified)',
          skills:
            item.skills && item.skills.length > 0
              ? item.skills
              : isDriver
                ? ['Hill Road Driving', 'School Commute', 'Police Verified']
                : ['Housekeeping', 'Mizo Cooking', 'Elderly & Child Care'],
          district: item.district || 'Aizawl',
          veng: item.veng,
          monthlyPackageRate:
            mode === 'company_managed_staffing' ? item.expectedMonthlyRate || 14500 : undefined,
          dailyRate: mode === 'on_demand_workforce' ? item.expectedDailyRate || 1100 : undefined,
          hourlyRate: mode === 'on_demand_workforce' ? 220 : undefined,
          practicalSkillScore: item.practicalTestScore || 90,
          groomingTrainingStatus: `${assignedBadge} · KYC Approved`,
          outstationAvailable: item.outstationAvailable ?? true,
          liveInAvailable: item.liveInAvailable ?? mode === 'company_managed_staffing',
          replacementGuarantee: mode === 'company_managed_staffing',
          availabilityStatus: 'active',
          bankAccountMasked: 'SBI •••• 0000',
          verifiedBadge: assignedBadge,
          avatarUrl: isDriver
            ? '/src/assets/images/partner_hill_rider_1794891322041.jpg'
            : '/src/assets/images/staffing_caregiver_portrait_1794891321006.jpg',
          portfolioUrls: [
            isDriver
              ? '/src/assets/images/partner_hill_rider_1794891322041.jpg'
              : '/src/assets/images/staffing_caregiver_portrait_1794891321006.jpg',
          ],
          rating: 4.9,
        };
        state.workforce.unshift(promotedWorkforce);
      }
    } else {
      // Auto-publish approved Runner / Bike / Auto-Taxi / Pickup driver into live Fleet Partners
      const exists = state.partners.some(
        (p) => p.name.toLowerCase() === item.applicantName.toLowerCase()
      );
      if (!exists) {
        const dist = item.district || 'Aizawl';
        const info = getDistrictInfo(dist);
        const vengPoint = findDistrictVeng(dist, item.veng);
        promotedPartner = {
          id: `prt-${Date.now().toString().slice(-5)}`,
          name: item.applicantName,
          phone: item.phone || '+91-9862000000',
          district: dist,
          veng: item.veng,
          category: item.targetCategory,
          online: true,
          lat: vengPoint?.lat ?? info.center.lat,
          lng: vengPoint?.lng ?? info.center.lng,
          rating: 4.9,
          completedJobs: 0,
          badges: [assignedBadge],
          commercialPermitVerified:
            item.targetCategory === 'auto_taxi' ? Boolean(item.commercialPermitNumber) : true,
          policeVerified:
            assignedBadge === 'Police Verified - Green Shield' ||
            assignedBadge === 'Company Certified' ||
            assignedBadge === 'Gold Pro',
          securityDepositVerified: true,
          codCashHeld: 0,
          walletBalance: 0,
          lastHeartbeatAt: new Date().toISOString(),
        };
        state.partners.unshift(promotedPartner);
        liveGpsCache.setPartnerLocation(
          promotedPartner.id,
          promotedPartner.lat,
          promotedPartner.lng,
          true,
          3600_000
        );
      }
    }
  }

  db.addAudit(
    'admin',
    'KYC_REVIEW',
    `${item.applicantName} -> ${decision} (${item.assignedBadge || 'none'})${
      promotedWorkforce ? ` · Published ${promotedWorkforce.id}` : promotedPartner ? ` · Published ${promotedPartner.id}` : ''
    }`
  );
  realtimeHub.broadcast('kyc_update', { id: item.id, status: item.status });
  if (promotedWorkforce) realtimeHub.broadcast('staffing_update', { worker: promotedWorkforce });
  if (promotedPartner) realtimeHub.broadcast('errand_update', { partner: promotedPartner });
  res.json({ item, promotedWorkforce, promotedPartner });
});

// =========================================================================
// SELF-SERVICE USER, PARTNER & STAFF PROFILE MANAGEMENT ENDPOINTS
// =========================================================================
let cachedCustomerProfile = {
  fullName: 'Lalhriatpuii Chhangte',
  phone: '+91-9862411022',
  email: 'hriatpuii.azl@zorun.mz',
  upiId: 'hriatpuii@oksbi',
  homeDistrict: 'Aizawl' as MizoramDistrict,
  homeVeng: 'Dawrpui',
  ymaSection: 'Section-II YMA',
  houseLandmark: 'Near Dawrpui Presbyterian Church Concrete Steps, Blue Gate',
  bioNote: 'Gate bulah bell hmet rawh / Ring doorbell beside concrete steps.',
  lat: 23.7307,
  lng: 92.7173,
  emergencyContactName: 'Pu Zoramthanga (Chhungte)',
  emergencyContactPhone: '+91-9436140099',
  avatarUrl: '',
  updatedAt: new Date().toISOString(),
};

authKycRouter.get('/profile', (_req, res) => {
  res.json({ profile: cachedCustomerProfile });
});

authKycRouter.put('/profile', (req, res) => {
  const body = (req.body || {}) as Partial<typeof cachedCustomerProfile>;
  if (typeof body.fullName === 'string' && body.fullName.trim().length < 2) {
    res.status(400).json({ error: 'Hming kimchang (min 2 characters) ziak rawh / Name must be at least 2 characters.' });
    return;
  }

  cachedCustomerProfile = {
    ...cachedCustomerProfile,
    fullName:
      typeof body.fullName === 'string' && body.fullName.trim()
        ? body.fullName.trim().slice(0, 80)
        : cachedCustomerProfile.fullName,
    phone:
      typeof body.phone === 'string' && body.phone.trim()
        ? body.phone.trim().slice(0, 24)
        : cachedCustomerProfile.phone,
    email:
      typeof body.email === 'string'
        ? body.email.trim().slice(0, 120)
        : cachedCustomerProfile.email,
    upiId:
      typeof body.upiId === 'string'
        ? body.upiId.trim().slice(0, 80)
        : cachedCustomerProfile.upiId,
    homeDistrict:
      typeof body.homeDistrict === 'string' && body.homeDistrict.trim()
        ? (body.homeDistrict as MizoramDistrict)
        : cachedCustomerProfile.homeDistrict,
    homeVeng:
      typeof body.homeVeng === 'string' && body.homeVeng.trim()
        ? body.homeVeng.trim().slice(0, 80)
        : cachedCustomerProfile.homeVeng,
    ymaSection:
      typeof body.ymaSection === 'string'
        ? body.ymaSection.trim().slice(0, 80)
        : cachedCustomerProfile.ymaSection,
    houseLandmark:
      typeof body.houseLandmark === 'string'
        ? body.houseLandmark.trim().slice(0, 180)
        : cachedCustomerProfile.houseLandmark,
    bioNote:
      typeof body.bioNote === 'string'
        ? body.bioNote.trim().slice(0, 200)
        : cachedCustomerProfile.bioNote,
    lat:
      typeof body.lat === 'number' && Number.isFinite(body.lat)
        ? Number(body.lat.toFixed(6))
        : cachedCustomerProfile.lat,
    lng:
      typeof body.lng === 'number' && Number.isFinite(body.lng)
        ? Number(body.lng.toFixed(6))
        : cachedCustomerProfile.lng,
    emergencyContactName:
      typeof body.emergencyContactName === 'string'
        ? body.emergencyContactName.trim().slice(0, 80)
        : cachedCustomerProfile.emergencyContactName,
    emergencyContactPhone:
      typeof body.emergencyContactPhone === 'string'
        ? body.emergencyContactPhone.trim().slice(0, 24)
        : cachedCustomerProfile.emergencyContactPhone,
    avatarUrl:
      typeof body.avatarUrl === 'string' ? body.avatarUrl : cachedCustomerProfile.avatarUrl,
    updatedAt: new Date().toISOString(),
  };

  db.addAudit(
    cachedCustomerProfile.fullName,
    'USER_PROFILE_UPDATED',
    `${cachedCustomerProfile.homeDistrict} · ${cachedCustomerProfile.homeVeng} · ${cachedCustomerProfile.phone}`
  );
  res.json({ profile: cachedCustomerProfile });
});

// Self-service Partner (Runner / Rider / Driver) profile update
authKycRouter.put('/partner-profile/:id', (req, res) => {
  const { id } = req.params;
  const body = (req.body || {}) as Partial<PartnerProfile>;
  const state = db.get();
  const partner = state.partners.find((p) => p.id === id);
  if (!partner) {
    res.status(404).json({ error: 'Partner profile not found' });
    return;
  }

  if (typeof body.name === 'string' && body.name.trim().length >= 2) {
    partner.name = body.name.trim().slice(0, 80);
  }
  if (typeof body.phone === 'string' && body.phone.trim()) {
    partner.phone = body.phone.trim().slice(0, 24);
  }
  if (typeof body.district === 'string' && body.district.trim()) {
    partner.district = body.district as MizoramDistrict;
  }
  if (typeof body.veng === 'string' && body.veng.trim()) {
    partner.veng = body.veng.trim().slice(0, 80);
    const vengPt = findDistrictVeng(partner.district || 'Aizawl', partner.veng);
    if (vengPt && typeof body.lat !== 'number') {
      partner.lat = vengPt.lat;
      partner.lng = vengPt.lng;
    }
  }
  if (typeof body.lat === 'number' && Number.isFinite(body.lat)) partner.lat = body.lat;
  if (typeof body.lng === 'number' && Number.isFinite(body.lng)) partner.lng = body.lng;
  if (typeof body.online === 'boolean') partner.online = body.online;

  liveGpsCache.setPartnerLocation(partner.id, partner.lat, partner.lng, partner.online);
  db.addAudit(partner.name, 'PARTNER_SELF_PROFILE_UPDATED', `${partner.id} (${partner.district} · ${partner.veng})`);
  realtimeHub.broadcast('errand_update', { partnerUpdated: partner.id });
  res.json({ partner });
});

// Self-service Staff (Awmpui / Family Driver) profile update
authKycRouter.put('/staff-profile/:id', (req, res) => {
  const { id } = req.params;
  const body = (req.body || {}) as Partial<WorkforceMember>;
  const state = db.get();
  const worker = state.workforce.find((w) => w.id === id);
  if (!worker) {
    res.status(404).json({ error: 'Staff profile not found' });
    return;
  }

  if (typeof body.name === 'string' && body.name.trim().length >= 2) {
    worker.name = body.name.trim().slice(0, 80);
  }
  if (typeof body.phone === 'string' && body.phone.trim()) {
    worker.phone = body.phone.trim().slice(0, 24);
  }
  if (typeof body.district === 'string' && body.district.trim()) {
    worker.district = body.district as MizoramDistrict;
  }
  if (typeof body.veng === 'string' && body.veng.trim()) {
    worker.veng = body.veng.trim().slice(0, 80);
  }
  if (typeof body.roleTitle === 'string' && body.roleTitle.trim()) {
    worker.roleTitle = body.roleTitle.trim().slice(0, 80);
  }
  if (Array.isArray(body.skills) && body.skills.length > 0) {
    worker.skills = body.skills.map((s) => String(s).trim()).filter(Boolean).slice(0, 10);
  }
  if (typeof body.dailyRate === 'number' && body.dailyRate >= 200) {
    worker.dailyRate = Math.round(body.dailyRate);
  }
  if (typeof body.monthlyPackageRate === 'number' && body.monthlyPackageRate >= 3000) {
    worker.monthlyPackageRate = Math.round(body.monthlyPackageRate);
  }
  if (typeof body.outstationAvailable === 'boolean') {
    worker.outstationAvailable = body.outstationAvailable;
  }
  if (typeof body.liveInAvailable === 'boolean') {
    worker.liveInAvailable = body.liveInAvailable;
  }
  if (body.availabilityStatus === 'active' || body.availabilityStatus === 'on_leave') {
    worker.availabilityStatus = body.availabilityStatus;
  }

  db.addAudit(worker.name, 'STAFF_SELF_PROFILE_UPDATED', `${worker.id} (${worker.district} · ${worker.veng})`);
  realtimeHub.broadcast('staffing_update', { worker });
  res.json({ worker });
});

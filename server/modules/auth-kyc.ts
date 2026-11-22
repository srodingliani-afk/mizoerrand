import { Router } from 'express';
import { db } from '../infrastructure/store';
import { createSignedPrivateUrl, verifySignedPrivateToken } from '../infrastructure/signedUrls';
import { createAdminKycSignedUrl, isValidKycObjectPath } from '../infrastructure/driveStorage';
import { realtimeHub } from '../infrastructure/realtimeHub';
import { requireAdminAuth } from '../infrastructure/adminAuth';
import { validateOnboardingApplication } from '../domain/staffingRules';
import { getDistrictInfo } from '../../src/data/mizoramDistricts';
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
  const verification = verifySignedPrivateToken(req.params.token);
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
        promotedPartner = {
          id: `prt-${Date.now().toString().slice(-5)}`,
          name: item.applicantName,
          phone: item.phone || '+91-9862000000',
          district: dist,
          veng: item.veng,
          category: item.targetCategory,
          online: true,
          lat: info.center.lat,
          lng: info.center.lng,
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

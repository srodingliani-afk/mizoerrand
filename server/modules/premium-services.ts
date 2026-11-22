import { Router } from 'express';
import type { MizoramDistrict, SumoParcelBooking } from '../../src/shared/types';
import { db } from '../infrastructure/store';
import { realtimeHub } from '../infrastructure/realtimeHub';
import { isTrustedMediaUrl } from '../infrastructure/driveStorage';
import {
  postEscrowHoldJournal,
  postEscrowSettlementJournal,
  postRunnerTipJournal,
  postWalletTopupJournal,
  recordDoubleEntryJournal,
} from '../infrastructure/ledgerService';
import { calculateEscrowSplit } from '../domain/rules';
import { getDistrictInfo } from '../../src/data/mizoramDistricts';
import {
  AIZAWL_PROXY_MARKETS,
  DISTRICT_SUMO_COUNTERS,
  calculateSumoParcelFare,
  validateReferralCode,
  validateSumoParcelInput,
  validateTipAndRating,
} from '../domain/premiumRules';

export const premiumServicesRouter = Router();

const VALID_DISTRICTS = new Set<string>(Object.keys(DISTRICT_SUMO_COUNTERS));

premiumServicesRouter.get('/state', (_req, res) => {
  const state = db.get();
  res.json({
    customerWallet: state.customerWallet,
    sumoParcels: state.sumoParcels,
  });
});

premiumServicesRouter.post('/wallet/topup', (req, res) => {
  const amount = Math.round(Number(req.body?.amountRs));
  if (!Number.isFinite(amount) || amount < 50 || amount > 10000) {
    res.status(400).json({ error: 'Top-up amount must be between ₹50 and ₹10,000.' });
    return;
  }

  const state = db.get();
  const pointsEarned = Math.round(amount / 25);
  const txId = `wtx-${Date.now()}`;
  state.customerWallet.balanceRs += amount;
  state.customerWallet.loyaltyPoints += pointsEarned;
  state.customerWallet.transactions.unshift({
    id: txId,
    type: 'topup',
    title: 'Instant UPI Wallet Top-Up',
    amountRs: amount,
    pointsDelta: pointsEarned,
    createdAt: new Date().toISOString(),
  });
  if (state.customerWallet.transactions.length > 30) {
    state.customerWallet.transactions.length = 30;
  }

  postWalletTopupJournal(state, {
    customerId: 'cust-1',
    amountRs: amount,
    refId: txId,
  });

  db.addAudit('customer', 'WALLET_TOPUP', `Added ₹${amount} (+${pointsEarned} pts) to ZoRûn Wallet`);
  realtimeHub.broadcast('escrow_update', { walletBalanceRs: state.customerWallet.balanceRs });
  res.json({ customerWallet: state.customerWallet });
});

premiumServicesRouter.post('/wallet/claim-referral', (req, res) => {
  const state = db.get();
  const code = String(req.body?.code || '');
  const check = validateReferralCode(
    code,
    state.customerWallet.referralCode,
    state.customerWallet.referralsClaimed
  );
  if (!check.ok || !check.normalized) {
    res.status(400).json({ error: check.error || 'Invalid referral code.' });
    return;
  }

  const bonusRs = 50;
  const bonusPts = 100;
  const refTxId = `wtx-${Date.now()}`;
  state.customerWallet.balanceRs += bonusRs;
  state.customerWallet.loyaltyPoints += bonusPts;
  state.customerWallet.referralsClaimed.push(check.normalized);
  state.customerWallet.transactions.unshift({
    id: refTxId,
    type: 'referral_bonus',
    title: `Referral Bonus (${check.normalized})`,
    amountRs: bonusRs,
    pointsDelta: bonusPts,
    createdAt: new Date().toISOString(),
  });
  recordDoubleEntryJournal(state, {
    eventType: 'wallet_topup',
    orderRef: refTxId,
    description: `Referral bonus credit (${check.normalized})`,
    postings: [
      { account: 'EXPENSE:MARKETING_REFERRAL', side: 'debit', amountRs: bonusRs },
      { account: 'LIABILITY:WALLET:cust-1', side: 'credit', amountRs: bonusRs },
    ],
  });

  db.addAudit('customer', 'REFERRAL_CLAIMED', `Claimed code ${check.normalized} (+₹${bonusRs})`);
  realtimeHub.broadcast('escrow_update', { walletBalanceRs: state.customerWallet.balanceRs });
  res.json({ customerWallet: state.customerWallet, bonusRs, bonusPts });
});

premiumServicesRouter.post('/wallet/toggle-pass', (_req, res) => {
  const state = db.get();
  const passFee = 99;

  if (!state.customerWallet.plusPassActive) {
    if (state.customerWallet.balanceRs < passFee) {
      res.status(400).json({
        error: `Minimum ₹${passFee} wallet balance required to activate ZoRûn Plus Pass.`,
      });
      return;
    }
    const passTxId = `wtx-${Date.now()}`;
    state.customerWallet.balanceRs -= passFee;
    state.customerWallet.loyaltyPoints += 150;
    state.customerWallet.plusPassActive = true;
    state.customerWallet.transactions.unshift({
      id: passTxId,
      type: 'plus_pass',
      title: 'ZoRûn Plus Pass Activated (30 Days)',
      amountRs: -passFee,
      pointsDelta: 150,
      createdAt: new Date().toISOString(),
    });
    recordDoubleEntryJournal(state, {
      eventType: 'escrow_settlement',
      orderRef: passTxId,
      description: 'ZoRûn Plus Pass 30-Day Subscription',
      postings: [
        { account: 'LIABILITY:WALLET:cust-1', side: 'debit', amountRs: passFee },
        { account: 'REVENUE:PLUS_PASS_SUBSCRIPTION', side: 'credit', amountRs: passFee },
      ],
    });
    db.addAudit('customer', 'PLUS_PASS_ACTIVATED', 'Activated ZoRûn Plus Pass (₹99)');
  } else {
    state.customerWallet.plusPassActive = false;
    db.addAudit('customer', 'PLUS_PASS_PAUSED', 'Paused ZoRûn Plus Pass auto-renew');
  }

  realtimeHub.broadcast('escrow_update', { plusPassActive: state.customerWallet.plusPassActive });
  res.json({ customerWallet: state.customerWallet });
});

function sanitizeReceiptPhoto(raw?: unknown): string | undefined {
  return isTrustedMediaUrl(raw, 'image');
}

premiumServicesRouter.post('/sumo-parcels', (req, res) => {
  const body = req.body || {};
  const bookingMode: 'parcel_bridge' | 'proxy_shopping' =
    body.bookingMode === 'proxy_shopping' ? 'proxy_shopping' : 'parcel_bridge';
  const rawOrigin = bookingMode === 'proxy_shopping' ? 'Aizawl' : String(body.originDistrict || '');

  const check = validateSumoParcelInput({
    bookingMode,
    senderName: String(body.senderName || ''),
    receiverName: String(body.receiverName || ''),
    receiverPhone: String(body.receiverPhone || ''),
    originDistrict: rawOrigin,
    destinationDistrict: String(body.destinationDistrict || ''),
    parcelDescription: String(body.parcelDescription || ''),
    shoppingMarket: typeof body.shoppingMarket === 'string' ? body.shoppingMarket : undefined,
    estimatedItemBudgetRs:
      bookingMode === 'proxy_shopping' ? Number(body.estimatedItemBudgetRs) : undefined,
    weightKg: Number(body.weightKg),
  });

  if (!check.ok) {
    res.status(400).json({ error: check.error });
    return;
  }

  const originDistrict = rawOrigin as MizoramDistrict;
  const destinationDistrict = String(body.destinationDistrict) as MizoramDistrict;
  if (!VALID_DISTRICTS.has(originDistrict) || !VALID_DISTRICTS.has(destinationDistrict)) {
    res.status(400).json({ error: 'Selected Mizoram district is invalid.' });
    return;
  }

  const state = db.get();
  const weightKg = Number(body.weightKg);
  const includeHomeDrop = Boolean(body.includeHomeDrop);
  const estimatedItemBudgetRs =
    bookingMode === 'proxy_shopping' ? Math.round(Number(body.estimatedItemBudgetRs) || 500) : undefined;
  const fare = calculateSumoParcelFare({
    bookingMode,
    originDistrict,
    destinationDistrict,
    weightKg,
    includeHomeDrop,
    estimatedItemBudgetRs,
    plusPassActive: state.customerWallet.plusPassActive,
  });

  const originCounters = DISTRICT_SUMO_COUNTERS[originDistrict];
  const destCounters = DISTRICT_SUMO_COUNTERS[destinationDistrict];
  const originCounter =
    typeof body.originCounter === 'string' && originCounters.includes(body.originCounter)
      ? body.originCounter
      : originCounters[0];
  const destinationCounter =
    typeof body.destinationCounter === 'string' && destCounters.includes(body.destinationCounter)
      ? body.destinationCounter
      : destCounters[0];
  const shoppingMarket =
    bookingMode === 'proxy_shopping'
      ? typeof body.shoppingMarket === 'string' && body.shoppingMarket.trim()
        ? body.shoppingMarket.trim().slice(0, 80)
        : AIZAWL_PROXY_MARKETS[0]
      : undefined;

  const suffix = Math.floor(1000 + Math.random() * 9000);
  const trackingCode =
    bookingMode === 'proxy_shopping' ? `BUY-MZ-${suffix}` : `SUMO-MZ-${suffix}`;
  const payWithWallet = Boolean(body.payWithWallet);

  if (payWithWallet) {
    if (state.customerWallet.balanceRs < fare.allInclusiveTotal) {
      res.status(400).json({
        error: `Insufficient ZoRûn Wallet balance (₹${state.customerWallet.balanceRs}) for ₹${fare.allInclusiveTotal} booking.`,
      });
      return;
    }
    state.customerWallet.balanceRs -= fare.allInclusiveTotal;
    state.customerWallet.transactions.unshift({
      id: `wtx-${Date.now()}`,
      type: 'parcel_payment',
      title: `${bookingMode === 'proxy_shopping' ? 'Buy & Send via Sumo' : 'Sumo Parcel'} (${trackingCode})`,
      amountRs: -fare.allInclusiveTotal,
      pointsDelta: bookingMode === 'proxy_shopping' ? 40 : 25,
      createdAt: new Date().toISOString(),
    });
  }

  const assignedRunner =
    state.partners.find(
      (p) =>
        p.online &&
        (p.district || 'Aizawl') === originDistrict &&
        (p.category === 'walker' || p.category === 'bike')
    ) ||
    state.partners.find((p) => p.online && (p.district || 'Aizawl') === originDistrict) ||
    state.partners[0];

  const rtoCode = getDistrictInfo(destinationDistrict).rtoCode;
  const sumoVehicleNumber = `${rtoCode}-C-${(suffix % 8000) + 1000}`;

  const parcel: SumoParcelBooking = {
    id: `sumo-${Date.now()}`,
    trackingCode,
    bookingMode,
    senderName: String(body.senderName).trim().slice(0, 80),
    receiverName: String(body.receiverName).trim().slice(0, 80),
    receiverPhone: String(body.receiverPhone).trim().slice(0, 20),
    originDistrict,
    originVeng:
      bookingMode === 'proxy_shopping'
        ? shoppingMarket || 'Bara Bazar (Dawrpui)'
        : String(body.originVeng || originDistrict).trim().slice(0, 80),
    originCounter,
    destinationDistrict,
    destinationCounter,
    parcelDescription: String(body.parcelDescription).trim().slice(0, 220),
    shoppingMarket,
    estimatedItemBudgetRs: fare.estimatedItemBudgetRs || undefined,
    proxyShoppingFeeRs: fare.proxyShoppingFee || undefined,
    receiptPhotoUrl: sanitizeReceiptPhoto(body.receiptPhotoUrl),
    assignedRunnerId: assignedRunner?.id,
    assignedRunnerName: assignedRunner?.name,
    sumoVehicleNumber,
    paidViaWallet: payWithWallet,
    weightKg,
    includeHomeDrop,
    allInclusiveTotal: fare.allInclusiveTotal,
    status: 'pickup_scheduled',
    createdAt: new Date().toISOString(),
  };

  state.sumoParcels.unshift(parcel);
  if (state.sumoParcels.length > 40) {
    state.sumoParcels.length = 40;
  }

  const split = calculateEscrowSplit({
    grossAllInclusive: parcel.allInclusiveTotal,
    productAmount: fare.estimatedItemBudgetRs || 0,
    microInsuranceSachet: 0,
    declaredValue: parcel.allInclusiveTotal,
  });
  state.escrowLedger.unshift({
    id: `esc-${Date.now().toString().slice(-5)}`,
    orderRef: parcel.trackingCode,
    grossAllInclusive: split.grossAllInclusive,
    gstAmount: split.gstAmount,
    platformCommission: split.platformCommission,
    microInsuranceSachet: 0,
    partnerPayout: split.partnerPayout,
    merchantSettlement: split.merchantSettlement,
    paymentMode: 'upi_escrow',
    escrowStatus: 'held_until_otp',
    createdAt: new Date().toISOString(),
  });
  postEscrowHoldJournal(state, {
    orderRef: parcel.trackingCode,
    customerId: 'cust-1',
    grossAllInclusive: parcel.allInclusiveTotal,
    paymentMode: 'upi_escrow',
  });

  state.customerWallet.loyaltyPoints += bookingMode === 'proxy_shopping' ? 40 : 25;
  db.addAudit(
    'customer',
    bookingMode === 'proxy_shopping' ? 'SUMO_PROXY_SHOP_BOOKED' : 'SUMO_PARCEL_BOOKED',
    `${parcel.trackingCode}: ${originDistrict} → ${destinationDistrict} (₹${parcel.allInclusiveTotal} · ${sumoVehicleNumber})`
  );
  realtimeHub.broadcast('errand_update', { sumoParcelId: parcel.id });
  res.status(201).json({ parcel, fare, customerWallet: state.customerWallet });
});

premiumServicesRouter.post('/sumo-parcels/:id/receipt', (req, res) => {
  const state = db.get();
  const parcel = state.sumoParcels.find((p) => p.id === req.params.id);
  if (!parcel) {
    res.status(404).json({ error: 'Sumo parcel booking not found.' });
    return;
  }
  const cleanPhoto = sanitizeReceiptPhoto(req.body?.receiptPhotoUrl);
  if (!cleanPhoto) {
    res.status(400).json({ error: 'Valid receipt photo URL (Google Drive HTTPS URL or compressed image) is required.' });
    return;
  }
  parcel.receiptPhotoUrl = cleanPhoto;

  // Real-world Proxy Shopping Actual Receipt Bill Reconciliation
  const rawActualBill = req.body?.actualItemBillRs;
  if (
    parcel.bookingMode === 'proxy_shopping' &&
    typeof rawActualBill === 'number' &&
    Number.isFinite(rawActualBill) &&
    rawActualBill >= 50 &&
    rawActualBill <= 15000 &&
    typeof parcel.estimatedItemBudgetRs === 'number' &&
    typeof parcel.actualItemBillRs !== 'number'
  ) {
    const actualBill = Math.round(rawActualBill);
    const delta = parcel.estimatedItemBudgetRs - actualBill; // positive => refund to customer
    parcel.actualItemBillRs = actualBill;
    parcel.billReconciledDeltaRs = delta;
    parcel.allInclusiveTotal = Math.max(90, parcel.allInclusiveTotal - delta);

    if (delta > 0) {
      const txId = `wtx-${Date.now()}`;
      state.customerWallet.balanceRs += delta;
      state.customerWallet.transactions.unshift({
        id: txId,
        type: 'topup',
        title: `Proxy Shopping Bill Excess Refund (${parcel.trackingCode})`,
        amountRs: delta,
        createdAt: new Date().toISOString(),
      });
      recordDoubleEntryJournal(state, {
        eventType: 'wallet_topup',
        orderRef: `${parcel.trackingCode}-RECON`,
        description: `Proxy shopping actual receipt refund (Est ₹${parcel.estimatedItemBudgetRs} vs Actual ₹${actualBill})`,
        postings: [
          { account: 'LIABILITY:ESCROW_HOLD_POOL', side: 'debit', amountRs: delta },
          { account: 'LIABILITY:WALLET:cust-1', side: 'credit', amountRs: delta },
        ],
      });
    }
  }

  db.addAudit('partner', 'SUMO_RECEIPT_UPLOADED', `Receipt uploaded for ${parcel.trackingCode}`);
  realtimeHub.broadcast('errand_update', { sumoParcelId: parcel.id, receiptUploaded: true });
  res.json({ parcel, customerWallet: state.customerWallet });
});

premiumServicesRouter.post('/sumo-parcels/:id/advance', (req, res) => {
  const state = db.get();
  const parcel = state.sumoParcels.find((p) => p.id === req.params.id);
  if (!parcel) {
    res.status(404).json({ error: 'Sumo parcel booking not found.' });
    return;
  }

  const order: SumoParcelBooking['status'][] = [
    'pickup_scheduled',
    'at_sumo_counter',
    'in_transit',
    'delivered',
  ];
  const idx = order.indexOf(parcel.status);
  if (idx >= 0 && idx < order.length - 1) {
    parcel.status = order[idx + 1];
    if (parcel.status === 'delivered') {
      const runner = state.partners.find((p) => p.id === parcel.assignedRunnerId);
      const ledger = state.escrowLedger.find((e) => e.orderRef === parcel.trackingCode);
      if (ledger && ledger.escrowStatus === 'held_until_otp') {
        ledger.escrowStatus = 'split_settled';
        postEscrowSettlementJournal(state, {
          entry: ledger,
          partnerId: runner?.id,
          merchantId: parcel.shoppingMarket || parcel.destinationCounter,
        });
      }
      if (runner) {
        runner.walletBalance += ledger ? ledger.partnerPayout : parcel.proxyShoppingFeeRs || 85;
        runner.completedJobs += 1;
      }
    }
    db.addAudit('partner', 'SUMO_PARCEL_STATUS', `${parcel.trackingCode} -> ${parcel.status}`);
    realtimeHub.broadcast('errand_update', { sumoParcelId: parcel.id, status: parcel.status });
  }
  res.json({ parcel });
});

premiumServicesRouter.post('/errands/:id/rate', (req, res) => {
  const state = db.get();
  const errand = state.errands.find((e) => e.id === req.params.id);
  if (!errand) {
    res.status(404).json({ error: 'Errand not found.' });
    return;
  }

  const rating = Number(req.body?.rating);
  const tipAmountRs = Math.round(Number(req.body?.tipAmountRs || 0));
  const ratingNote = String(req.body?.note || '').trim().slice(0, 160);

  const check = validateTipAndRating({ rating, tipAmountRs });
  if (!check.ok) {
    res.status(400).json({ error: check.error });
    return;
  }

  const alreadyRated = typeof errand.customerRating === 'number';
  const alreadyTipped = typeof errand.tipAmountRs === 'number' && errand.tipAmountRs > 0;
  if (alreadyTipped && tipAmountRs > 0) {
    res.status(400).json({ error: 'A tip has already been sent for this errand.' });
    return;
  }

  if (tipAmountRs > 0 && state.customerWallet.balanceRs < tipAmountRs) {
    res.status(400).json({
      error: `Wallet balance (₹${state.customerWallet.balanceRs}) is too low for ₹${tipAmountRs} tip. Top up wallet first.`,
    });
    return;
  }

  errand.customerRating = rating;
  if (!alreadyTipped) {
    errand.tipAmountRs = tipAmountRs;
  }
  if (ratingNote) errand.ratingNote = ratingNote;

  const assignedPartner = state.partners.find(
    (p) => p.id === errand.assignedPartnerId || p.id === errand.bids[0]?.partnerId
  );
  if (assignedPartner) {
    if (!alreadyRated) {
      const prevJobs = Math.max(1, assignedPartner.completedJobs);
      assignedPartner.rating = Number(
        Math.min(5, (assignedPartner.rating * prevJobs + rating) / (prevJobs + 1)).toFixed(2)
      );
    }
    if (tipAmountRs > 0 && !alreadyTipped) {
      assignedPartner.walletBalance += tipAmountRs;
    }
  }

  if (tipAmountRs > 0) {
    state.customerWallet.balanceRs -= tipAmountRs;
    state.customerWallet.loyaltyPoints += 15;
    state.customerWallet.transactions.unshift({
      id: `wtx-${Date.now()}`,
      type: 'runner_tip',
      title: `Runner Tip (${assignedPartner?.name || 'ZoRûn Runner'})`,
      amountRs: -tipAmountRs,
      pointsDelta: 15,
      createdAt: new Date().toISOString(),
    });
    postRunnerTipJournal(state, {
      orderRef: errand.id,
      customerId: errand.customerId || 'cust-1',
      partnerId: assignedPartner?.id || 'fleet',
      tipAmountRs,
    });
  }

  db.addAudit(
    'customer',
    'ERRAND_RATED',
    `Rated ${errand.id} ${rating}/5 stars${tipAmountRs > 0 ? ` + ₹${tipAmountRs} tip` : ''}`
  );
  realtimeHub.broadcast('errand_update', { errandId: errand.id, rating, tipAmountRs });
  res.json({ errand, customerWallet: state.customerWallet });
});

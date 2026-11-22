import { Router } from 'express';
import { z } from 'zod';
import { db } from '../infrastructure/store';
import { realtimeHub } from '../infrastructure/realtimeHub';
import { requireAdminAuth } from '../infrastructure/adminAuth';
import { verifyLedgerIntegrity } from '../infrastructure/ledgerService';

export const paymentEscrowRouter = Router();

const withdrawSchema = z.object({
  amount: z.number().finite().positive().max(200000).optional(),
});

const resolveDisputeSchema = z.object({
  resolution: z.enum(['resolved_refund', 'resolved_payout', 'blacklisted']),
  blacklistCustomer: z.boolean().optional(),
});

paymentEscrowRouter.get('/ledger', requireAdminAuth, (_req, res) => {
  const state = db.get();
  res.json({
    ledger: state.escrowLedger,
    doubleEntryJournals: state.doubleEntryJournals,
    accountBalances: state.accountBalances,
    ledgerIntegrity: verifyLedgerIntegrity(state),
    disputes: state.disputes,
    blacklistedCustomers: state.blacklistedCustomers,
    prankStrikeCounts: state.prankStrikeCounts,
  });
});

paymentEscrowRouter.post('/partners/:id/deposit-cod', (req, res) => {
  const state = db.get();
  const partner = state.partners.find((p) => p.id === req.params.id);
  if (!partner) {
    res.status(404).json({ error: 'Partner not found' });
    return;
  }
  const deposited = partner.codCashHeld;
  partner.codCashHeld = 0;
  db.addAudit(partner.name, 'COD_UPI_DEPOSIT', `Settled Rs. ${deposited} COD cash via UPI`);
  realtimeHub.broadcast('escrow_update', { partnerId: partner.id, codCleared: deposited });
  res.json({ partner, deposited });
});

paymentEscrowRouter.post('/partners/:id/withdraw', (req, res) => {
  const parsed = withdrawSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid withdrawal amount' });
    return;
  }
  const state = db.get();
  const partner = state.partners.find((p) => p.id === req.params.id);
  if (!partner) {
    res.status(404).json({ error: 'Partner not found' });
    return;
  }
  const withdrawAmt = Math.min(partner.walletBalance, Math.max(100, Number(parsed.data.amount) || partner.walletBalance));
  if (withdrawAmt <= 0 || partner.walletBalance < withdrawAmt) {
    res.status(400).json({ error: 'Insufficient wallet balance' });
    return;
  }
  partner.walletBalance -= withdrawAmt;
  db.addAudit(partner.name, 'PAYOUT_WITHDRAWAL', `Instant bank payout Rs. ${withdrawAmt}`);
  realtimeHub.broadcast('escrow_update', { partnerId: partner.id });
  res.json({ partner, withdrawn: withdrawAmt });
});

paymentEscrowRouter.post('/webhooks/razorpay-reconcile', requireAdminAuth, (req, res) => {
  const { ledgerId } = req.body as { ledgerId?: string };
  const state = db.get();
  const entry = ledgerId
    ? state.escrowLedger.find((e) => e.id === ledgerId)
    : state.escrowLedger[0];
  if (!entry) {
    res.status(404).json({ error: 'Escrow ledger entry not found' });
    return;
  }
  entry.escrowStatus = 'reconciled_webhook';
  db.addAudit('razorpay-route', 'WEBHOOK_RECONCILED', `${entry.id} (${entry.orderRef})`);
  realtimeHub.broadcast('escrow_update', { ledgerId: entry.id });
  res.json({ entry });
});

paymentEscrowRouter.post('/disputes/:id/resolve', requireAdminAuth, (req, res) => {
  const parsed = resolveDisputeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid dispute resolution' });
    return;
  }
  const { resolution, blacklistCustomer } = parsed.data;
  const state = db.get();
  const dispute = state.disputes.find((d) => d.id === req.params.id);
  if (!dispute) {
    res.status(404).json({ error: 'Dispute not found' });
    return;
  }
  dispute.status = resolution;
  if (blacklistCustomer || resolution === 'blacklisted') {
    if (!state.blacklistedCustomers.includes(dispute.customerName)) {
      state.blacklistedCustomers.push(dispute.customerName);
    }
    dispute.prankStrikeCount += 1;
  }
  db.addAudit('dispute-center', 'DISPUTE_RESOLVED', `${dispute.id} -> ${resolution}`);
  realtimeHub.broadcast('escrow_update', { dispute });
  res.json({ dispute, blacklistedCustomers: state.blacklistedCustomers });
});

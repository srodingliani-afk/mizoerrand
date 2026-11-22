import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertBalancedPostings,
  postEscrowHoldJournal,
  postEscrowSettlementJournal,
  postPayrollDisbursementJournal,
  postWalletTopupJournal,
  verifyLedgerIntegrity,
  type LedgerStoreSlice,
} from './ledgerService';

test('assertBalancedPostings rejects unbalanced debit/credit entries', () => {
  assert.throws(
    () =>
      assertBalancedPostings([
        { account: 'ASSET:UPI', side: 'debit', amountRs: 500 },
        { account: 'LIABILITY:WALLET', side: 'credit', amountRs: 450 },
      ]),
    /Unbalanced double-entry journal/i
  );
});

test('wallet topup, escrow hold, 18% GST settlement, and payroll maintain zero-sum balance', () => {
  const slice: LedgerStoreSlice = {
    doubleEntryJournals: [],
    accountBalances: {},
  };

  postWalletTopupJournal(slice, { customerId: 'cust-1', amountRs: 500, refId: 'wtx-1' });
  postEscrowHoldJournal(slice, {
    orderRef: 'err-201',
    customerId: 'cust-1',
    grossAllInclusive: 1000,
    paymentMode: 'upi_escrow',
  });
  postEscrowSettlementJournal(slice, {
    entry: {
      id: 'esc-1',
      orderRef: 'err-201',
      grossAllInclusive: 1000,
      gstAmount: 23,
      platformCommission: 127,
      microInsuranceSachet: 3,
      partnerPayout: 847,
      merchantSettlement: 0,
      paymentMode: 'upi_escrow',
      escrowStatus: 'split_settled',
      createdAt: new Date().toISOString(),
    },
    partnerId: 'ptr-walker-1',
  });
  postPayrollDisbursementJournal(slice, {
    id: 'pay-1',
    staffName: 'Lalhmangaihi Khiangte',
    clientName: 'Dr. Zoramthanga',
    billingWindow: '1st-5th',
    payoutWindow: 'By 7th',
    monthlyPackage: 14500,
    platformMgmtFee: 1500,
    netSalaryDisbursed: 13000,
    bankAccountMasked: 'SBI •••• 4821',
    status: 'salary_disbursed',
    payslipId: 'SLIP-1',
  });

  const summary = verifyLedgerIntegrity(slice);
  assert.equal(summary.totalJournals, 4);
  assert.equal(summary.unbalancedJournals, 0);
  assert.equal(summary.isBalanced, true);
  assert.equal(summary.totalDebitsRs, summary.totalCreditsRs);
});

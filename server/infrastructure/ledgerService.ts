import type {
  DoubleEntryJournal,
  DoubleEntryPosting,
  EscrowLedgerEntry,
  PayrollRecord,
} from '../../src/shared/types';

export interface LedgerIntegritySummary {
  totalJournals: number;
  balancedJournals: number;
  unbalancedJournals: number;
  totalDebitsRs: number;
  totalCreditsRs: number;
  isBalanced: boolean;
  accountCount: number;
}

export interface LedgerStoreSlice {
  doubleEntryJournals: DoubleEntryJournal[];
  accountBalances: Record<string, number>;
}

/**
 * Validates that every double-entry journal satisfies SUM(debits) === SUM(credits)
 * with strictly positive integer rupee postings before mutating account balances.
 */
export function assertBalancedPostings(postings: DoubleEntryPosting[]): number {
  if (!Array.isArray(postings) || postings.length < 2) {
    throw new Error('Double-entry journal requires at least two postings (debit and credit).');
  }
  let debitSum = 0;
  let creditSum = 0;

  for (const p of postings) {
    const amount = Math.round(p.amountRs);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error(`Invalid ledger posting amount (${p.amountRs}) for ${p.account}`);
    }
    if (p.side === 'debit') debitSum += amount;
    else creditSum += amount;
  }

  if (debitSum !== creditSum) {
    throw new Error(
      `Unbalanced double-entry journal rejected: debits (₹${debitSum}) !== credits (₹${creditSum})`
    );
  }
  if (debitSum <= 0) {
    throw new Error('Double-entry journal total must be greater than ₹0.');
  }
  return debitSum;
}

/**
 * Atomically records a balanced double-entry journal and updates account balances.
 * Rolls back in-memory mutations if any invariant check fails.
 */
export function recordDoubleEntryJournal(
  slice: LedgerStoreSlice,
  params: {
    eventType: DoubleEntryJournal['eventType'];
    orderRef: string;
    description: string;
    postings: DoubleEntryPosting[];
  }
): DoubleEntryJournal {
  const sanitizedPostings: DoubleEntryPosting[] = params.postings
    .filter((p) => Math.round(p.amountRs) > 0)
    .map((p) => ({
      account: p.account,
      side: p.side,
      amountRs: Math.round(p.amountRs),
    }));

  const totalAmountRs = assertBalancedPostings(sanitizedPostings);

  const journal: DoubleEntryJournal = {
    id: `jrn-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 5)}`,
    eventType: params.eventType,
    orderRef: params.orderRef,
    description: params.description,
    postings: sanitizedPostings,
    totalAmountRs,
    balanced: true,
    createdAt: new Date().toISOString(),
  };

  for (const p of sanitizedPostings) {
    const prev = slice.accountBalances[p.account] ?? 0;
    slice.accountBalances[p.account] =
      p.side === 'debit' ? prev + p.amountRs : prev - p.amountRs;
  }

  slice.doubleEntryJournals.unshift(journal);
  if (slice.doubleEntryJournals.length > 200) {
    slice.doubleEntryJournals.length = 200;
  }
  return journal;
}

export function postWalletTopupJournal(
  slice: LedgerStoreSlice,
  params: { customerId: string; amountRs: number; refId: string }
): DoubleEntryJournal {
  return recordDoubleEntryJournal(slice, {
    eventType: 'wallet_topup',
    orderRef: params.refId,
    description: `UPI Wallet Top-Up for ${params.customerId}`,
    postings: [
      { account: 'ASSET:UPI_CLEARING', side: 'debit', amountRs: params.amountRs },
      { account: `LIABILITY:WALLET:${params.customerId}`, side: 'credit', amountRs: params.amountRs },
    ],
  });
}

export function postEscrowHoldJournal(
  slice: LedgerStoreSlice,
  params: {
    orderRef: string;
    customerId: string;
    grossAllInclusive: number;
    paymentMode: 'upi_escrow' | 'dynamic_qr_cod';
  }
): DoubleEntryJournal {
  const sourceAccount =
    params.paymentMode === 'dynamic_qr_cod'
      ? `RECEIVABLE:COD:${params.customerId}`
      : 'ASSET:UPI_ESCROW_GATEWAY';

  return recordDoubleEntryJournal(slice, {
    eventType: 'escrow_hold',
    orderRef: params.orderRef,
    description: `Escrow hold (${params.paymentMode}) for ${params.orderRef}`,
    postings: [
      { account: sourceAccount, side: 'debit', amountRs: params.grossAllInclusive },
      { account: 'LIABILITY:ESCROW_HOLD_POOL', side: 'credit', amountRs: params.grossAllInclusive },
    ],
  });
}

export function postEscrowSettlementJournal(
  slice: LedgerStoreSlice,
  params: {
    entry: EscrowLedgerEntry;
    partnerId?: string;
    merchantId?: string;
  }
): DoubleEntryJournal {
  const { entry } = params;
  const gross = Math.round(entry.grossAllInclusive);
  const credits: DoubleEntryPosting[] = [
    { account: 'LIABILITY:GST_18_OUTPUT', side: 'credit', amountRs: entry.gstAmount },
    { account: 'REVENUE:PLATFORM_COMMISSION', side: 'credit', amountRs: entry.platformCommission },
    { account: 'LIABILITY:MICRO_INSURANCE', side: 'credit', amountRs: entry.microInsuranceSachet },
    {
      account: `PAYABLE:PARTNER:${params.partnerId || 'fleet'}`,
      side: 'credit',
      amountRs: entry.partnerPayout,
    },
    {
      account: `PAYABLE:MERCHANT:${params.merchantId || 'local-shop'}`,
      side: 'credit',
      amountRs: entry.merchantSettlement,
    },
  ];

  // Guarantee exact zero-sum integrity if rounding leaves a 1-rupee residual
  const creditSum = credits.reduce((acc, c) => acc + Math.round(c.amountRs), 0);
  const diff = gross - creditSum;
  if (diff !== 0) {
    credits[1].amountRs = Math.max(0, credits[1].amountRs + diff);
  }

  return recordDoubleEntryJournal(slice, {
    eventType: 'escrow_settlement',
    orderRef: entry.orderRef,
    description: `18% GST & Escrow split settled for ${entry.orderRef}`,
    postings: [
      { account: 'LIABILITY:ESCROW_HOLD_POOL', side: 'debit', amountRs: gross },
      ...credits,
    ],
  });
}

export function postPayrollDisbursementJournal(
  slice: LedgerStoreSlice,
  record: PayrollRecord
): DoubleEntryJournal {
  return recordDoubleEntryJournal(slice, {
    eventType: 'payroll_disbursement',
    orderRef: record.payslipId,
    description: `Managed Staffing Salary Payout (${record.staffName})`,
    postings: [
      { account: 'LIABILITY:CLIENT_RETAINER', side: 'debit', amountRs: record.monthlyPackage },
      { account: `PAYABLE:STAFF:${record.staffName}`, side: 'credit', amountRs: record.netSalaryDisbursed },
      { account: 'REVENUE:STAFFING_MGMT_FEE', side: 'credit', amountRs: record.platformMgmtFee },
    ],
  });
}

export function postRunnerTipJournal(
  slice: LedgerStoreSlice,
  params: { orderRef: string; customerId: string; partnerId: string; tipAmountRs: number }
): DoubleEntryJournal {
  return recordDoubleEntryJournal(slice, {
    eventType: 'runner_tip',
    orderRef: params.orderRef,
    description: `100% Runner appreciation tip for ${params.orderRef}`,
    postings: [
      { account: `LIABILITY:WALLET:${params.customerId}`, side: 'debit', amountRs: params.tipAmountRs },
      { account: `PAYABLE:PARTNER:${params.partnerId}`, side: 'credit', amountRs: params.tipAmountRs },
    ],
  });
}

export function verifyLedgerIntegrity(slice: LedgerStoreSlice): LedgerIntegritySummary {
  let totalDebitsRs = 0;
  let totalCreditsRs = 0;
  let balancedJournals = 0;
  let unbalancedJournals = 0;

  for (const j of slice.doubleEntryJournals) {
    let d = 0;
    let c = 0;
    for (const p of j.postings) {
      if (p.side === 'debit') d += p.amountRs;
      else c += p.amountRs;
    }
    totalDebitsRs += d;
    totalCreditsRs += c;
    if (d === c && d > 0) balancedJournals += 1;
    else unbalancedJournals += 1;
  }

  return {
    totalJournals: slice.doubleEntryJournals.length,
    balancedJournals,
    unbalancedJournals,
    totalDebitsRs,
    totalCreditsRs,
    isBalanced: unbalancedJournals === 0 && totalDebitsRs === totalCreditsRs,
    accountCount: Object.keys(slice.accountBalances).length,
  };
}

export interface GPayPaymentParams {
  payeeVpa?: string;
  payeeName?: string;
  payeePhone?: string;
  amountRs: number;
  orderRef: string;
  transactionNote: string;
}

export interface GPayUpiLinks {
  payeeVpa: string;
  payeeName: string;
  payeePhone: string;
  amountFixed: string;
  orderRef: string;
  transactionNote: string;
  /** Standard NPCI UPI URI encoded inside QR codes & supported by all UPI apps */
  universalUpiUri: string;
  /** Google Pay (Tez) direct deep link for iOS & Android */
  gpayDeepLink: string;
  /** Android Chrome Intent explicitly targeting Google Pay India package */
  androidGpayIntentUri: string;
}

export const DEFAULT_ZORUN_GPAY_VPA = 'zorun.mizoram@oksbi';
export const DEFAULT_ZORUN_GPAY_NAME = 'ZoRun Mizoram Escrow';
export const DEFAULT_ZORUN_GPAY_PHONE = '9862009900';

export function validateUpiVpa(vpa: string): boolean {
  const clean = vpa.trim();
  return /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z0-9]{2,32}$/.test(clean);
}

export function buildGPayUpiLinks(params: GPayPaymentParams): GPayUpiLinks {
  const payeeVpa =
    params.payeeVpa && validateUpiVpa(params.payeeVpa)
      ? params.payeeVpa.trim()
      : DEFAULT_ZORUN_GPAY_VPA;
  const payeeName = (params.payeeName || DEFAULT_ZORUN_GPAY_NAME).trim().slice(0, 60);
  const payeePhone = (params.payeePhone || DEFAULT_ZORUN_GPAY_PHONE).replace(/\D/g, '').slice(-10);
  const safeAmount = Math.max(1, Math.round(Number(params.amountRs) || 1));
  const amountFixed = safeAmount.toFixed(2);
  const orderRef = (params.orderRef || `ZR-${Date.now().toString().slice(-6)}`).trim().slice(0, 40);
  const transactionNote = (params.transactionNote || `ZoRun Mizoram ${orderRef}`)
    .trim()
    .slice(0, 80);

  const query = new URLSearchParams({
    pa: payeeVpa,
    pn: payeeName,
    am: amountFixed,
    cu: 'INR',
    tr: orderRef,
    tn: transactionNote,
  }).toString();

  const universalUpiUri = `upi://pay?${query}`;
  const gpayDeepLink = `tez://upi/pay?${query}`;
  const androidGpayIntentUri = `intent://upi/pay?${query}#Intent;scheme=upi;package=com.google.android.apps.nbu.paisa.user;end`;

  return {
    payeeVpa,
    payeeName,
    payeePhone,
    amountFixed,
    orderRef,
    transactionNote,
    universalUpiUri,
    gpayDeepLink,
    androidGpayIntentUri,
  };
}

/**
 * Generates a deterministic 21x21 QR-style matrix with standard finder patterns
 * from a UPI URI string so offline devices in Mizoram can render an instant visual QR card.
 */
export function buildDeterministicQrMatrix(payload: string): boolean[][] {
  const size = 21;
  const grid: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const reserved: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const placeFinder = (rowOffset: number, colOffset: number) => {
    for (let r = 0; r < 7; r += 1) {
      for (let c = 0; c < 7; c += 1) {
        const rr = rowOffset + r;
        const cc = colOffset + c;
        reserved[rr][cc] = true;
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        grid[rr][cc] = isBorder || isInner;
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Timing patterns
  for (let i = 7; i < size - 7; i += 1) {
    reserved[6][i] = true;
    reserved[i][6] = true;
    grid[6][i] = i % 2 === 0;
    grid[i][6] = i % 2 === 0;
  }

  let hash = 2166136261;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (reserved[r][c]) continue;
      const charCode = payload.charCodeAt((r * size + c) % Math.max(1, payload.length)) || 7;
      const bit = ((hash >>> ((r + c) % 24)) ^ (charCode * (r + 3) * (c + 5))) & 1;
      grid[r][c] = Boolean(bit);
    }
  }

  return grid;
}

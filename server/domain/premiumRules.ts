import type { MizoramDistrict } from '../../src/shared/types';

export const DISTRICT_SUMO_COUNTERS: Record<MizoramDistrict, string[]> = {
  Aizawl: ['Zarkawt Sumo Counter', 'Thuampui Maxicab Stand', 'Chanmari Counter', 'Kulikawn Stand'],
  Lunglei: ['Chanmari Lunglei Counter', 'Bazar Veng Sumo Stand', 'Serkawn Point'],
  Champhai: ['Vengthlang Counter', 'Kahrawt Maxicab Stand'],
  Serchhip: ['Bazar Veng Counter', 'New Serchhip Stand'],
  Kolasib: ['Diakkawn Sumo Stand', 'Venglai Counter'],
  Lawngtlai: ['Bazar Veng Counter', 'Chandmary Stand'],
  Mamit: ['Bazar Veng Stand', 'Hmar Veng Counter'],
  Siaha: ['New Siaha Counter', 'Council Veng Stand'],
  Saitual: ['Bazar Veng Counter', 'Keifang Junction Stand'],
  Khawzawl: ['Vengthar Counter', 'Dinthar Stand'],
  Hnahthial: ['Bazar Veng Counter', 'Electric Veng Stand'],
};

// Approximate road-corridor tiers between districts relative to Aizawl hub (in km)
const DISTRICT_HUB_DISTANCE_KM: Record<MizoramDistrict, number> = {
  Aizawl: 0,
  Kolasib: 82,
  Serchhip: 108,
  Saitual: 77,
  Mamit: 92,
  Khawzawl: 152,
  Champhai: 186,
  Hnahthial: 154,
  Lunglei: 170,
  Lawngtlai: 256,
  Siaha: 304,
};

export const AIZAWL_PROXY_MARKETS: string[] = [
  'Bara Bazar (Dawrpui)',
  'Millennium Centre (Dawrpui)',
  'Zarkawt Pharmacies & Medical Hub',
  'Chanmari Electronics & Hardware',
  'New Market Handloom & Puan Hub',
];

export interface SumoFareInput {
  bookingMode?: 'parcel_bridge' | 'proxy_shopping';
  originDistrict: MizoramDistrict;
  destinationDistrict: MizoramDistrict;
  weightKg: number;
  includeHomeDrop: boolean;
  estimatedItemBudgetRs?: number;
  plusPassActive?: boolean;
}

export interface SumoFareBreakdown {
  homePickupFee: number;
  proxyShoppingFee: number;
  estimatedItemBudgetRs: number;
  sumoCounterFreight: number;
  destinationDropFee: number;
  plusDiscount: number;
  allInclusiveTotal: number;
  estimatedHours: number;
}

export function calculateSumoParcelFare(input: SumoFareInput): SumoFareBreakdown {
  const mode = input.bookingMode === 'proxy_shopping' ? 'proxy_shopping' : 'parcel_bridge';
  const safeWeight = Math.max(0.5, Math.min(50, Number(input.weightKg) || 1));
  const origin: MizoramDistrict = mode === 'proxy_shopping' ? 'Aizawl' : input.originDistrict;
  const distA = DISTRICT_HUB_DISTANCE_KM[origin] ?? 100;
  const distB = DISTRICT_HUB_DISTANCE_KM[input.destinationDistrict] ?? 100;
  const routeKm =
    origin === 'Aizawl' || input.destinationDistrict === 'Aizawl'
      ? Math.max(distA, distB)
      : Math.max(95, Math.round((distA + distB) * 0.72));

  const homePickupFee = mode === 'proxy_shopping' ? 0 : 55;
  const estimatedItemBudgetRs =
    mode === 'proxy_shopping'
      ? Math.max(100, Math.min(15000, Math.round(Number(input.estimatedItemBudgetRs) || 500)))
      : 0;
  // Fair Aizawl runner proxy shopping fee: Rs. 85 base + 3% of budget (capped at Rs. 250)
  const proxyShoppingFee =
    mode === 'proxy_shopping'
      ? Math.min(250, Math.round(85 + estimatedItemBudgetRs * 0.03))
      : 0;

  const baseCounterFreight = routeKm <= 110 ? 110 : routeKm <= 200 ? 160 : 220;
  const extraWeightFee = safeWeight > 3 ? Math.ceil(safeWeight - 3) * 18 : 0;
  const sumoCounterFreight = baseCounterFreight + extraWeightFee;
  const destinationDropFee = input.includeHomeDrop ? 65 : 0;

  const serviceSubtotal =
    homePickupFee + proxyShoppingFee + sumoCounterFreight + destinationDropFee;
  const plusDiscount = input.plusPassActive
    ? Math.min(50, Math.round(serviceSubtotal * 0.12))
    : 0;
  const allInclusiveTotal = Math.max(
    90,
    estimatedItemBudgetRs + serviceSubtotal - plusDiscount
  );
  const estimatedHours = Math.max(3, Math.round(routeKm / 32));

  return {
    homePickupFee,
    proxyShoppingFee,
    estimatedItemBudgetRs,
    sumoCounterFreight,
    destinationDropFee,
    plusDiscount,
    allInclusiveTotal,
    estimatedHours,
  };
}

export interface SumoParcelValidationInput {
  bookingMode?: 'parcel_bridge' | 'proxy_shopping';
  senderName?: string;
  receiverName?: string;
  receiverPhone?: string;
  originDistrict?: string;
  destinationDistrict?: string;
  parcelDescription?: string;
  shoppingMarket?: string;
  estimatedItemBudgetRs?: number;
  weightKg?: number;
}

export function validateSumoParcelInput(input: SumoParcelValidationInput): {
  ok: boolean;
  error?: string;
} {
  const mode = input.bookingMode === 'proxy_shopping' ? 'proxy_shopping' : 'parcel_bridge';
  const sender = (input.senderName || '').trim();
  const receiver = (input.receiverName || '').trim();
  const phone = (input.receiverPhone || '').trim();
  const desc = (input.parcelDescription || '').trim();
  const weight = Number(input.weightKg);

  if (!sender || sender.length < 2) {
    return { ok: false, error: 'Requester / sender name is required (min 2 characters).' };
  }
  if (!receiver || receiver.length < 2) {
    return { ok: false, error: 'Receiver name is required (min 2 characters).' };
  }
  if (!/^[+\d\s-]{8,16}$/.test(phone)) {
    return { ok: false, error: 'Valid receiver phone number is required.' };
  }
  if (!input.originDistrict || !input.destinationDistrict) {
    return { ok: false, error: 'Both origin and destination districts are required.' };
  }
  if (mode === 'proxy_shopping') {
    if (input.destinationDistrict === 'Aizawl') {
      return {
        ok: false,
        error: 'Buy & Send via Sumo delivers from Aizawl markets to outer Mizoram districts.',
      };
    }
    const budget = Number(input.estimatedItemBudgetRs);
    if (!Number.isFinite(budget) || budget < 100 || budget > 15000) {
      return {
        ok: false,
        error: 'Estimated item shopping budget must be between ₹100 and ₹15,000.',
      };
    }
  } else if (input.originDistrict === input.destinationDistrict) {
    return {
      ok: false,
      error: 'Inter-district Sumo parcel requires two different Mizoram districts.',
    };
  }
  if (!desc || desc.length < 3) {
    return {
      ok: false,
      error:
        mode === 'proxy_shopping'
          ? 'Please list the items to purchase from Aizawl (min 3 characters).'
          : 'Please describe the parcel contents (min 3 characters).',
    };
  }
  if (!Number.isFinite(weight) || weight < 0.5 || weight > 50) {
    return { ok: false, error: 'Parcel weight must be between 0.5 kg and 50 kg.' };
  }
  return { ok: true };
}

export function validateTipAndRating(input: {
  rating: number;
  tipAmountRs: number;
}): { ok: boolean; error?: string } {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    return { ok: false, error: 'Star rating must be an integer between 1 and 5.' };
  }
  if (!Number.isFinite(input.tipAmountRs) || input.tipAmountRs < 0 || input.tipAmountRs > 500) {
    return { ok: false, error: 'Runner tip must be between ₹0 and ₹500.' };
  }
  return { ok: true };
}

export function validateReferralCode(
  codeRaw: string,
  ownCode: string,
  alreadyClaimed: string[]
): { ok: boolean; normalized?: string; error?: string } {
  const normalized = (codeRaw || '').trim().toUpperCase();
  if (!/^[A-Z0-9-]{5,24}$/.test(normalized)) {
    return { ok: false, error: 'Invalid referral code format (use 5–24 letters/numbers).' };
  }
  if (normalized === ownCode.toUpperCase()) {
    return { ok: false, error: 'You cannot claim your own referral code.' };
  }
  if (alreadyClaimed.includes(normalized)) {
    return { ok: false, error: 'This referral code has already been claimed.' };
  }
  return { ok: true, normalized };
}

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSumoParcelFare,
  validateReferralCode,
  validateSumoParcelInput,
  validateTipAndRating,
} from './premiumRules';
import { getKailawnSurcharge } from './rules';

describe('premiumRules domain logic', () => {
  it('calculates transparent inter-district Sumo parcel fares with weight & Plus Pass discount', () => {
    const standard = calculateSumoParcelFare({
      originDistrict: 'Aizawl',
      destinationDistrict: 'Lunglei',
      weightKg: 5,
      includeHomeDrop: true,
      plusPassActive: false,
    });
    assert.equal(standard.homePickupFee, 55);
    assert.equal(standard.destinationDropFee, 65);
    // 170km tier => 160 base + 2kg extra * 18 = 196
    assert.equal(standard.sumoCounterFreight, 196);
    assert.equal(standard.allInclusiveTotal, 316);

    const withPass = calculateSumoParcelFare({
      originDistrict: 'Aizawl',
      destinationDistrict: 'Lunglei',
      weightKg: 5,
      includeHomeDrop: true,
      plusPassActive: true,
    });
    assert.ok(withPass.plusDiscount > 0);
    assert.equal(withPass.allInclusiveTotal, standard.allInclusiveTotal - withPass.plusDiscount);
  });

  it('calculates Buy & Send via Sumo (proxy shopping) fares and validates outer district + budget', () => {
    const proxy = calculateSumoParcelFare({
      bookingMode: 'proxy_shopping',
      originDistrict: 'Aizawl',
      destinationDistrict: 'Lawngtlai',
      weightKg: 3,
      includeHomeDrop: true,
      estimatedItemBudgetRs: 1500,
      plusPassActive: false,
    });
    assert.equal(proxy.homePickupFee, 0);
    assert.equal(proxy.estimatedItemBudgetRs, 1500);
    // 85 + 3% of 1500 = 130
    assert.equal(proxy.proxyShoppingFee, 130);
    // Lawngtlai is 256km => 220 freight + 65 drop
    assert.equal(proxy.sumoCounterFreight, 220);
    assert.equal(proxy.allInclusiveTotal, 1500 + 130 + 220 + 65);

    const invalidDest = validateSumoParcelInput({
      bookingMode: 'proxy_shopping',
      senderName: 'Rodingliana',
      receiverName: 'Rodingliana',
      receiverPhone: '+91 94361 22019',
      originDistrict: 'Aizawl',
      destinationDistrict: 'Aizawl',
      parcelDescription: 'Bara Bazar winter jacket',
      estimatedItemBudgetRs: 1200,
      weightKg: 2,
    });
    assert.equal(invalidDest.ok, false);

    const invalidBudget = validateSumoParcelInput({
      bookingMode: 'proxy_shopping',
      senderName: 'Rodingliana',
      receiverName: 'Rodingliana',
      receiverPhone: '+91 94361 22019',
      originDistrict: 'Aizawl',
      destinationDistrict: 'Lawngtlai',
      parcelDescription: 'Bara Bazar winter jacket',
      estimatedItemBudgetRs: 50,
      weightKg: 2,
    });
    assert.equal(invalidBudget.ok, false);

    const validProxy = validateSumoParcelInput({
      bookingMode: 'proxy_shopping',
      senderName: 'Rodingliana',
      receiverName: 'Rodingliana',
      receiverPhone: '+91 94361 22019',
      originDistrict: 'Aizawl',
      destinationDistrict: 'Lawngtlai',
      parcelDescription: 'Bara Bazar winter jacket & warm socks',
      shoppingMarket: 'Bara Bazar (Dawrpui)',
      estimatedItemBudgetRs: 1200,
      weightKg: 2,
    });
    assert.equal(validProxy.ok, true);
  });

  it('computes fair Kailawn step terrain surcharges across step tiers', () => {
    assert.equal(getKailawnSurcharge(false, 'steps_40_plus'), 0);
    assert.equal(getKailawnSurcharge(true, 'steps_0_15'), 15);
    assert.equal(getKailawnSurcharge(true, 'steps_15_40'), 35);
    assert.equal(getKailawnSurcharge(true, 'steps_40_plus'), 65);
  });

  it('rejects same-district Sumo parcel requests and out-of-range weights', () => {
    const sameDistrict = validateSumoParcelInput({
      senderName: 'Malsawmkimi',
      receiverName: 'Lalnunpuii',
      receiverPhone: '+91 94361 22019',
      originDistrict: 'Aizawl',
      destinationDistrict: 'Aizawl',
      parcelDescription: 'Warm clothes box',
      weightKg: 3,
    });
    assert.equal(sameDistrict.ok, false);

    const tooHeavy = validateSumoParcelInput({
      senderName: 'Malsawmkimi',
      receiverName: 'Lalnunpuii',
      receiverPhone: '+91 94361 22019',
      originDistrict: 'Aizawl',
      destinationDistrict: 'Champhai',
      parcelDescription: 'Heavy rice sacks',
      weightKg: 80,
    });
    assert.equal(tooHeavy.ok, false);

    const valid = validateSumoParcelInput({
      senderName: 'Malsawmkimi',
      receiverName: 'Lalnunpuii',
      receiverPhone: '+91 94361 22019',
      originDistrict: 'Aizawl',
      destinationDistrict: 'Champhai',
      parcelDescription: 'Home-baked cakes & parcel',
      weightKg: 2.5,
    });
    assert.equal(valid.ok, true);
  });

  it('enforces bounded star ratings (1..5) and runner tips (0..500)', () => {
    assert.equal(validateTipAndRating({ rating: 5, tipAmountRs: 20 }).ok, true);
    assert.equal(validateTipAndRating({ rating: 0, tipAmountRs: 10 }).ok, false);
    assert.equal(validateTipAndRating({ rating: 4.5, tipAmountRs: 10 }).ok, false);
    assert.equal(validateTipAndRating({ rating: 5, tipAmountRs: 900 }).ok, false);
    assert.equal(validateTipAndRating({ rating: 5, tipAmountRs: -5 }).ok, false);
  });

  it('validates referral codes and blocks self-referral or duplicate claims', () => {
    const selfRes = validateReferralCode('zorun-mz-2026', 'ZORUN-MZ-2026', []);
    assert.equal(selfRes.ok, false);

    const dupRes = validateReferralCode('MIZO-FRIEND-99', 'ZORUN-MZ-2026', ['MIZO-FRIEND-99']);
    assert.equal(dupRes.ok, false);

    const okRes = validateReferralCode('  aizawl-50  ', 'ZORUN-MZ-2026', []);
    assert.equal(okRes.ok, true);
    assert.equal(okRes.normalized, 'AIZAWL-50');
  });
});

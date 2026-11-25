import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeterministicQrMatrix,
  buildGPayUpiLinks,
  validateUpiVpa,
} from './gpayUpi';

test('validateUpiVpa accepts valid GPay handles (@oksbi, @okaxis, @okicici) and rejects malformed VPAs', () => {
  assert.equal(validateUpiVpa('zorun.mizoram@oksbi'), true);
  assert.equal(validateUpiVpa('hriatpuii_98@okaxis'), true);
  assert.equal(validateUpiVpa('invalid-vpa-without-at'), false);
  assert.equal(validateUpiVpa('@oksbi'), false);
});

test('buildGPayUpiLinks generates NPCI universal upi://, GPay tez://, and Android package intent URIs', () => {
  const links = buildGPayUpiLinks({
    payeeVpa: 'zorun.mizoram@oksbi',
    payeeName: 'ZoRun Mizoram Escrow',
    amountRs: 185,
    orderRef: 'err-101',
    transactionNote: 'Step delivery Dawrpui to Mission Veng',
  });

  assert.equal(links.amountFixed, '185.00');
  assert.ok(links.universalUpiUri.startsWith('upi://pay?'));
  assert.ok(links.gpayDeepLink.startsWith('tez://upi/pay?'));
  assert.ok(
    links.androidGpayIntentUri.includes('package=com.google.android.apps.nbu.paisa.user')
  );
  assert.ok(links.universalUpiUri.includes('pa=zorun.mizoram%40oksbi'));
  assert.ok(links.universalUpiUri.includes('am=185.00'));
});

test('buildDeterministicQrMatrix produces a 21x21 matrix with intact 7x7 finder corners', () => {
  const matrix = buildDeterministicQrMatrix('upi://pay?pa=zorun.mizoram@oksbi&am=100.00');
  assert.equal(matrix.length, 21);
  assert.equal(matrix[0].length, 21);
  // Top-left finder corner outer border and center dot must be true
  assert.equal(matrix[0][0], true);
  assert.equal(matrix[3][3], true);
  assert.equal(matrix[0][20], true);
  assert.equal(matrix[20][0], true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDistanceMeters,
  findAnyMizoramVeng,
  findNearestMizoramVeng,
} from '../data/mizoramDistricts';
import {
  buildLocalResolvedAddress,
  classifyGpsAccuracy,
  shouldAcceptGpsUpdate,
  type LiveGpsFix,
} from './geolocation';

test('findNearestMizoramVeng snaps exact Dawrpui Aizawl coordinates cleanly', () => {
  const dawrpui = findAnyMizoramVeng('Dawrpui');
  const match = findNearestMizoramVeng(dawrpui.lat + 0.0002, dawrpui.lng - 0.0001);
  assert.equal(match.veng.name, 'Dawrpui');
  assert.equal(match.veng.district, 'Aizawl');
  assert.equal(match.isWithinMizoramBounds, true);
  assert.ok(match.distanceMeters < 100);
});

test('findNearestMizoramVeng identifies Lunglei Veng correctly', () => {
  const zotlang = findAnyMizoramVeng('Zotlang (Lunglei)');
  const match = findNearestMizoramVeng(zotlang.lat, zotlang.lng);
  assert.equal(match.veng.district, 'Lunglei');
  assert.equal(match.veng.name, 'Zotlang (Lunglei)');
  assert.equal(match.isWithinMizoramBounds, true);
});

test('buildLocalResolvedAddress handles outside-Mizoram test coordinates cleanly', () => {
  const resolved = buildLocalResolvedAddress(37.422, -122.084, 'Aizawl', 18);
  assert.equal(resolved.isOutsideMizoram, true);
  assert.ok(resolved.formattedAddress.includes('37.42200, -122.08400'));
  assert.equal(resolved.accuracyMeters, 18);
});

test('classifyGpsAccuracy categorizes high, medium, and coarse locks', () => {
  assert.equal(classifyGpsAccuracy(12), 'high');
  assert.equal(classifyGpsAccuracy(85), 'medium');
  assert.equal(classifyGpsAccuracy(420), 'coarse');
});

test('shouldAcceptGpsUpdate upgrades coarse fix to accurate fix and rejects worse noise', () => {
  const coarse: LiveGpsFix = {
    lat: 23.7295,
    lng: 92.7176,
    accuracyMeters: 450,
    timestamp: 1000,
    quality: 'coarse',
  };
  const fine: LiveGpsFix = {
    lat: 23.7301,
    lng: 92.7182,
    accuracyMeters: 14,
    timestamp: 2000,
    quality: 'high',
  };
  const noisyJump: LiveGpsFix = {
    lat: 23.7302,
    lng: 92.7183,
    accuracyMeters: 500,
    timestamp: 3000,
    quality: 'coarse',
  };

  assert.equal(shouldAcceptGpsUpdate(null, coarse), true);
  assert.equal(shouldAcceptGpsUpdate(coarse, fine), true);
  assert.equal(shouldAcceptGpsUpdate(fine, noisyJump), false);
});

test('calculateDistanceMeters returns expected distance for ~1km shift', () => {
  const d = calculateDistanceMeters(
    { lat: 23.7295, lng: 92.7176 },
    { lat: 23.7385, lng: 92.7176 }
  );
  assert.ok(d > 900 && d < 1100);
});

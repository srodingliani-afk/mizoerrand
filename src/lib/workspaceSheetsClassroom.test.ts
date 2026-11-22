import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSpreadsheetRange,
  extractDriveSpreadsheetId,
  formatZoRunCampusAnnouncement,
  formatZoRunOrdersSheetRows,
  parseClassroomApiError,
} from './workspaceSheetsClassroom';

test('extractDriveSpreadsheetId parses both full Google Sheets URLs and raw file IDs', () => {
  const id = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
  assert.equal(
    extractDriveSpreadsheetId(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`),
    id
  );
  assert.equal(extractDriveSpreadsheetId(id), id);
  assert.equal(extractDriveSpreadsheetId('too-short'), null);
});

test('buildSpreadsheetRange safely quotes sheet tab names with spaces and apostrophes', () => {
  assert.equal(buildSpreadsheetRange('Orders', 'A1:G10'), 'Orders!A1:G10');
  assert.equal(
    buildSpreadsheetRange("Aizawl Runner's Ledger", 'A1:H25'),
    "'Aizawl Runner''s Ledger'!A1:H25"
  );
  assert.throws(() => buildSpreadsheetRange('   '));
});

test('formatZoRunOrdersSheetRows formats district-scoped errands and orders into sheet rows', () => {
  const rows = formatZoRunOrdersSheetRows({
    district: 'Lunglei',
    errands: [
      {
        id: 'ERR-202',
        customerId: 'c1',
        customerName: 'Lalthansanga',
        district: 'Lunglei',
        title: 'Bookstore pickup',
        jobType: 'step_delivery',
        origin: { lat: 22.88, lng: 92.75, label: 'Chanmari' },
        stops: [],
        destination: { lat: 22.89, lng: 92.76, label: 'Venglai' },
        distanceKm: 1.4,
        accessType: 'long_steps_walk',
        needsWalkerHelper: true,
        declaredValue: 400,
        paymentMethod: 'upi_escrow',
        microInsuranceOptIn: true,
        microInsuranceFee: 3,
        kailawnSurchargeRs: 35,
        allInclusiveTotal: 88,
        advanceTokenAmount: 0,
        advanceTokenPaid: false,
        requiresPoliceVerifiedPartner: false,
        status: 'in_progress',
        otpCode: '9104',
        bids: [],
        createdAt: '2026-11-22T10:00:00.000Z',
      },
    ],
  });

  assert.equal(rows[0]?.[0], 'Record Type');
  assert.equal(rows[1]?.[1], 'ERR-202');
  assert.equal(rows[1]?.[2], 'Lunglei');
  assert.equal(rows[1]?.[6], '88');
  assert.equal(rows[1]?.[7], '35');
});

test('formatZoRunCampusAnnouncement generates localized Mizo and English Classroom notices', () => {
  const miz = formatZoRunCampusAnnouncement({
    district: 'Aizawl',
    lang: 'miz',
    courseName: 'CS-301',
  });
  const en = formatZoRunCampusAnnouncement({
    district: 'Champhai',
    lang: 'en',
  });

  assert.match(miz, /\[CS-301\]/);
  assert.match(miz, /Kailawn/);
  assert.match(en, /Champhai/);
  assert.match(en, /UPI Escrow/);
});

test('parseClassroomApiError maps HTTP 401, 403, and 404 API payloads cleanly', () => {
  const unauth = parseClassroomApiError(401, 'Unauthorized');
  assert.equal(unauth.kind, 'unauthorized');

  const denied = parseClassroomApiError(
    403,
    JSON.stringify({ error: { message: 'The caller does not have permission' } })
  );
  assert.equal(denied.kind, 'permission_denied');
  assert.match(denied.message, /does not have permission/i);

  const missing = parseClassroomApiError(404, '{}');
  assert.equal(missing.kind, 'not_found');
});

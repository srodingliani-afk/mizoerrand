import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRawMimeEmail,
  formatZoRunOrderCommsTemplate,
  parseChatApiError,
  parseGmailMessageSummary,
} from './workspaceComms';

test('buildRawMimeEmail encodes RFC 2822 headers, UTF-8 Mizo subject, and base64url payload', () => {
  const raw = buildRawMimeEmail({
    to: 'runner@zorun.in',
    subject: 'ZoRûn Order Receipt #ERR-101',
    body: 'Chibai! Order kal mek e.',
  });

  assert.equal(raw.includes('+'), false);
  assert.equal(raw.includes('/'), false);
  assert.equal(raw.includes('='), false);

  const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
  const decoded = Buffer.from(normalized, 'base64').toString('utf8');
  assert.match(decoded, /^To: runner@zorun\.in/m);
  assert.match(decoded, /Subject: =\?UTF-8\?B\?/);
  assert.match(decoded, /Chibai! Order kal mek e\./);
});

test('buildRawMimeEmail rejects invalid email or empty subject', () => {
  assert.throws(() =>
    buildRawMimeEmail({ to: 'invalid-address', subject: 'Hi', body: 'Test' })
  );
  assert.throws(() =>
    buildRawMimeEmail({ to: 'user@example.com', subject: '   ', body: 'Test' })
  );
});

test('parseGmailMessageSummary extracts headers and unread label cleanly', () => {
  const summary = parseGmailMessageSummary({
    id: 'msg-1',
    threadId: 'thr-1',
    snippet: 'Parcel arrived at Lunglei Sumo counter',
    labelIds: ['INBOX', 'UNREAD'],
    payload: {
      headers: [
        { name: 'Subject', value: 'ZoRûn Sumo Receipt' },
        { name: 'From', value: 'ZoRûn Dispatch <dispatch@zorun.in>' },
        { name: 'Date', value: 'Sun, 22 Nov 2026 12:00:00 +0530' },
      ],
    },
  });

  assert.equal(summary.id, 'msg-1');
  assert.equal(summary.subject, 'ZoRûn Sumo Receipt');
  assert.equal(summary.unread, true);
  assert.match(summary.from, /dispatch@zorun\.in/);
});

test('parseChatApiError classifies 404 Chat App unconfigured and includes GCP console link', () => {
  const parsed = parseChatApiError(
    404,
    JSON.stringify({
      error: {
        message: 'Google Chat app not found. To create a Chat app, you must turn on the Chat API and configure the app.',
      },
    }),
    'gen-lang-client-0086839991'
  );

  assert.equal(parsed.kind, 'chat_app_not_configured');
  assert.ok(parsed.consoleUrl?.includes('gen-lang-client-0086839991'));
  assert.match(parsed.message, /Google Cloud Console/i);
});

test('parseChatApiError classifies consumer @gmail.com 403 restriction clearly', () => {
  const parsed = parseChatApiError(
    403,
    'Google Chat API is not supported for consumer gmail.com accounts.',
    'gen-lang-client-0086839991'
  );

  assert.equal(parsed.kind, 'workspace_account_required');
  assert.match(parsed.message, /Business or Enterprise Google Workspace/i);
});

test('formatZoRunOrderCommsTemplate generates district-aware order summary', () => {
  const tpl = formatZoRunOrderCommsTemplate({
    district: 'Lunglei',
    lang: 'en',
    latestErrand: {
      id: 'ERR-77',
      customerId: 'cust-1',
      customerName: 'Malsawmi',
      district: 'Lunglei',
      title: 'Pharmacy pickup',
      jobType: 'bike_express',
      origin: { lat: 22.89, lng: 92.75, label: 'Chanmari' },
      stops: [],
      destination: { lat: 22.88, lng: 92.76, label: 'Serkawn' },
      distanceKm: 2.1,
      accessType: 'vehicle_accessible',
      needsWalkerHelper: false,
      declaredValue: 350,
      paymentMethod: 'upi_escrow',
      microInsuranceOptIn: true,
      microInsuranceFee: 3,
      allInclusiveTotal: 63,
      advanceTokenAmount: 0,
      advanceTokenPaid: false,
      requiresPoliceVerifiedPartner: false,
      status: 'assigned',
      otpCode: '4829',
      bids: [],
      createdAt: new Date().toISOString(),
    },
  });

  assert.match(tpl.subject, /ERR-77/);
  assert.match(tpl.subject, /Lunglei/);
  assert.match(tpl.body, /4829/);
  assert.match(tpl.chatNote, /Chanmari/);
});

import type { ErrandRequest, Language, MarketplaceOrder, MizoramDistrict } from '../shared/types';

export const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1';
export const CHAT_API_BASE = 'https://chat.googleapis.com/v1';
export const MEET_API_BASE = 'https://meet.googleapis.com/v2';

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  unread: boolean;
}

export interface ChatSpaceSummary {
  name: string;
  displayName: string;
  spaceType: string;
  singleUserBotDm?: boolean;
}

export interface ChatMessageItem {
  name: string;
  text: string;
  senderName: string;
  senderType: string;
  createTime: string;
}

export interface MeetSpaceResult {
  name: string;
  meetingUri: string;
  meetingCode: string;
  accessType: 'OPEN' | 'TRUSTED' | 'RESTRICTED' | string;
}

export interface ParsedChatError {
  kind: 'chat_app_not_configured' | 'workspace_account_required' | 'unauthorized' | 'generic';
  message: string;
  consoleUrl?: string;
}

function toBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function encodeBase64Url(str: string): string {
  return toBase64Utf8(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeRfc2047Utf8(text: string): string {
  // Use RFC 2047 UTF-8 Base64 encoding whenever non-ASCII characters (e.g. ZoRûn) are present
  if (/^[\x20-\x7E]*$/.test(text)) {
    return text;
  }
  return `=?UTF-8?B?${toBase64Utf8(text)}?=`;
}

export function buildRawMimeEmail(params: {
  to: string;
  subject: string;
  body: string;
}): string {
  const cleanTo = params.to.replace(/[\r\n]+/g, ' ').trim();
  const cleanSubject = params.subject.replace(/[\r\n]+/g, ' ').trim();
  if (!cleanTo || !cleanTo.includes('@')) {
    throw new Error('Valid recipient email address is required.');
  }
  if (!cleanSubject) {
    throw new Error('Email subject is required.');
  }

  const lines = [
    `To: ${cleanTo}`,
    `Subject: ${encodeRfc2047Utf8(cleanSubject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    params.body,
  ];

  return encodeBase64Url(lines.join('\r\n'));
}

export function parseGmailMessageSummary(rawMsg: {
  id?: string;
  threadId?: string;
  snippet?: string;
  labelIds?: string[];
  payload?: {
    headers?: Array<{ name?: string; value?: string }>;
  };
}): GmailMessageSummary {
  const headers = rawMsg.payload?.headers || [];
  const getHeader = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

  return {
    id: rawMsg.id || '',
    threadId: rawMsg.threadId || '',
    subject: getHeader('Subject') || '(No Subject)',
    from: getHeader('From') || 'Unknown Sender',
    date: getHeader('Date') || '',
    snippet: rawMsg.snippet || '',
    unread: Array.isArray(rawMsg.labelIds) && rawMsg.labelIds.includes('UNREAD'),
  };
}

export function parseChatApiError(
  status: number,
  bodyText: string,
  projectId = 'gen-lang-client-0086839991'
): ParsedChatError {
  const consoleUrl = `https://console.cloud.google.com/apis/api/chat.googleapis.com/hangouts-chat?project=${encodeURIComponent(
    projectId
  )}`;

  let parsedMessage = bodyText;
  try {
    const json = JSON.parse(bodyText) as { error?: { message?: string } };
    if (json?.error?.message) {
      parsedMessage = json.error.message;
    }
  } catch {
    // plain text fallback
  }

  if (status === 401) {
    return {
      kind: 'unauthorized',
      message: 'Google Workspace session expired. Please Sign in with Google again.',
    };
  }

  if (
    status === 404 ||
    /chat app not found/i.test(parsedMessage) ||
    /configure the app/i.test(parsedMessage)
  ) {
    return {
      kind: 'chat_app_not_configured',
      message:
        'Google Chat app not found. Configure the Chat App info (Name, Avatar URL, Description) in Google Cloud Console first.',
      consoleUrl,
    };
  }

  if (
    status === 403 &&
    /workspace|consumer|gmail\.com|not supported|permission/i.test(parsedMessage)
  ) {
    return {
      kind: 'workspace_account_required',
      message:
        'Google Chat API requires a Business or Enterprise Google Workspace account (consumer @gmail.com accounts are not supported).',
      consoleUrl,
    };
  }

  return {
    kind: 'generic',
    message: parsedMessage || `Google Chat API error (HTTP ${status}).`,
  };
}

export function formatZoRunOrderCommsTemplate(params: {
  district: MizoramDistrict;
  lang: Language;
  latestErrand?: ErrandRequest | null;
  latestOrder?: MarketplaceOrder | null;
}): { subject: string; body: string; chatNote: string } {
  const { district, lang, latestErrand, latestOrder } = params;

  if (latestErrand) {
    const subject =
      lang === 'miz'
        ? `ZoRûn Order Receipt · ${latestErrand.id} (${district})`
        : `ZoRûn Dispatch Update · ${latestErrand.id} (${district})`;
    const body = [
      `ZoRûn Mizoram (${district}) — Order Summary`,
      `Order ID: ${latestErrand.id}`,
      `Task: ${latestErrand.title}`,
      `Route: ${latestErrand.origin.label || district} -> ${latestErrand.destination.label || district}`,
      `Status: ${latestErrand.status.toUpperCase()}`,
      `Fare: ₹${latestErrand.allInclusiveTotal} (${latestErrand.paymentMethod === 'upi_escrow' ? 'UPI Escrow' : 'Dynamic QR COD'})`,
      `Handover OTP: ${latestErrand.otpCode}`,
      latestErrand.kailawnNeeded ? `Kailawn Step Access: ${latestErrand.kailawnStepTier}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const chatNote = `[ZoRûn ${district}] Order ${latestErrand.id} (${latestErrand.origin.label || 'Pickup'} → ${latestErrand.destination.label || 'Drop'}) · ₹${latestErrand.allInclusiveTotal} · Status: ${latestErrand.status}`;
    return { subject, body, chatNote };
  }

  if (latestOrder) {
    const subject = `ZoRûn En Hmasak Order · ${latestOrder.id} (${district})`;
    const body = [
      `ZoRûn Mizoram (${district}) — En Hmasak Phawt Receipt`,
      `Order ID: ${latestOrder.id}`,
      `Item: ${latestOrder.productTitle}`,
      `Shop: ${latestOrder.shopName} (${latestOrder.veng})`,
      `Total (Escrow): ₹${latestOrder.allInclusiveTotal}`,
      `Status: ${latestOrder.status}`,
    ].join('\n');

    const chatNote = `[ZoRûn ${district}] Bazar Order ${latestOrder.id}: ${latestOrder.productTitle} from ${latestOrder.shopName} · ₹${latestOrder.allInclusiveTotal}`;
    return { subject, body, chatNote };
  }

  return {
    subject:
      lang === 'miz'
        ? `ZoRûn ${district} Thuchah & Support`
        : `ZoRûn ${district} Dispatch & Support Update`,
    body:
      lang === 'miz'
        ? `Chibai! ZoRûn (${district}) aṭangin order/support chungchang hriattirna.\n\nVeng / Landmark: \nOrder / Reference: `
        : `Hello from ZoRûn (${district})! Here is our latest dispatch / support update.\n\nVeng / Landmark: \nReference ID: `,
    chatNote: `[ZoRûn ${district}] Hub dispatch coordination update`,
  };
}

export async function fetchGmailMessages(
  accessToken: string,
  query = '',
  maxResults = 8
): Promise<GmailMessageSummary[]> {
  const listUrl = new URL(`${GMAIL_API_BASE}/users/me/messages`);
  listUrl.searchParams.set('maxResults', String(maxResults));
  if (query.trim()) {
    listUrl.searchParams.set('q', query.trim());
  }

  const listRes = await fetch(listUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listRes.ok) {
    const text = await listRes.text();
    throw new Error(
      listRes.status === 401
        ? 'Gmail authorization expired. Sign in with Google again.'
        : `Gmail inbox load failed (${listRes.status}): ${text.slice(0, 180)}`
    );
  }

  const listData = (await listRes.json()) as {
    messages?: Array<{ id: string; threadId: string }>;
  };
  const refs = listData.messages || [];
  if (refs.length === 0) return [];

  const details = await Promise.all(
    refs.slice(0, maxResults).map(async (ref) => {
      const msgUrl = new URL(`${GMAIL_API_BASE}/users/me/messages/${encodeURIComponent(ref.id)}`);
      msgUrl.searchParams.set('format', 'metadata');
      msgUrl.searchParams.append('metadataHeaders', 'Subject');
      msgUrl.searchParams.append('metadataHeaders', 'From');
      msgUrl.searchParams.append('metadataHeaders', 'Date');

      const res = await fetch(msgUrl.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return null;
      const json = await res.json();
      return parseGmailMessageSummary(json);
    })
  );

  return details.filter((m): m is GmailMessageSummary => Boolean(m));
}

export async function sendGmailEmail(
  accessToken: string,
  params: { to: string; subject: string; body: string }
): Promise<{ id: string; threadId?: string }> {
  const raw = buildRawMimeEmail(params);
  const res = await fetch(`${GMAIL_API_BASE}/users/me/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to send Gmail message (${res.status}): ${errText.slice(0, 200)}`);
  }

  return (await res.json()) as { id: string; threadId?: string };
}

export async function fetchChatSpaces(
  accessToken: string,
  projectId?: string
): Promise<{ spaces: ChatSpaceSummary[]; errorInfo?: ParsedChatError }> {
  const res = await fetch(`${CHAT_API_BASE}/spaces?pageSize=20`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    return {
      spaces: [],
      errorInfo: parseChatApiError(res.status, text, projectId),
    };
  }

  const data = (await res.json()) as {
    spaces?: Array<{
      name?: string;
      displayName?: string;
      spaceType?: string;
      singleUserBotDm?: boolean;
    }>;
  };

  return {
    spaces: (data.spaces || []).map((s) => ({
      name: s.name || '',
      displayName: s.displayName || s.name || 'Direct / Chat Space',
      spaceType: s.spaceType || 'SPACE',
      singleUserBotDm: s.singleUserBotDm,
    })),
  };
}

export async function fetchChatMessages(
  accessToken: string,
  spaceName: string,
  projectId?: string
): Promise<{ messages: ChatMessageItem[]; errorInfo?: ParsedChatError }> {
  const url = `${CHAT_API_BASE}/${spaceName}/messages?pageSize=20&orderBy=createTime desc`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    return {
      messages: [],
      errorInfo: parseChatApiError(res.status, text, projectId),
    };
  }

  const data = (await res.json()) as {
    messages?: Array<{
      name?: string;
      text?: string;
      createTime?: string;
      sender?: { displayName?: string; name?: string; type?: string };
    }>;
  };

  return {
    messages: (data.messages || [])
      .map((m) => ({
        name: m.name || '',
        text: m.text || '(Attachment / Card)',
        senderName: m.sender?.displayName || m.sender?.name || 'Member',
        senderType: m.sender?.type || 'HUMAN',
        createTime: m.createTime || '',
      }))
      .reverse(),
  };
}

export async function sendChatMessage(
  accessToken: string,
  spaceName: string,
  text: string,
  projectId?: string
): Promise<{ ok: boolean; errorInfo?: ParsedChatError }> {
  const res = await fetch(`${CHAT_API_BASE}/${spaceName}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: text.trim() }),
  });

  if (!res.ok) {
    const bodyText = await res.text();
    return { ok: false, errorInfo: parseChatApiError(res.status, bodyText, projectId) };
  }

  return { ok: true };
}

export async function createGoogleMeetSpace(
  accessToken: string,
  accessType: 'OPEN' | 'TRUSTED' = 'TRUSTED'
): Promise<MeetSpaceResult> {
  const res = await fetch(`${MEET_API_BASE}/spaces`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      config: {
        accessType,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create Google Meet room (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    name?: string;
    meetingUri?: string;
    meetingCode?: string;
    config?: { accessType?: string };
  };

  return {
    name: data.name || '',
    meetingUri: data.meetingUri || '',
    meetingCode: data.meetingCode || '',
    accessType: data.config?.accessType || accessType,
  };
}

export async function getGoogleMeetSpace(
  accessToken: string,
  spaceName: string
): Promise<MeetSpaceResult> {
  const res = await fetch(`${MEET_API_BASE}/${spaceName}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to inspect Google Meet space (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    name?: string;
    meetingUri?: string;
    meetingCode?: string;
    config?: { accessType?: string };
  };
  return {
    name: data.name || spaceName,
    meetingUri: data.meetingUri || '',
    meetingCode: data.meetingCode || '',
    accessType: data.config?.accessType || 'TRUSTED',
  };
}

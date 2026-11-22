import type { ErrandRequest, Language, MarketplaceOrder, MizoramDistrict } from '../shared/types';

export const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4';
export const DRIVE_FILES_API_BASE = 'https://www.googleapis.com/drive/v3';
export const CLASSROOM_API_BASE = 'https://classroom.googleapis.com/v1';

export interface SpreadsheetSummary {
  id: string;
  name: string;
  modifiedTime: string;
  webViewLink?: string;
}

export interface SheetTabMeta {
  sheetId: number;
  title: string;
  rowCount: number;
  columnCount: number;
}

export interface SpreadsheetMetadata {
  spreadsheetId: string;
  title: string;
  spreadsheetUrl?: string;
  sheets: SheetTabMeta[];
}

export interface ClassroomCourseSummary {
  id: string;
  name: string;
  section?: string;
  room?: string;
  courseState: string;
  alternateLink?: string;
}

export interface ClassroomAnnouncementItem {
  id: string;
  text: string;
  state: string;
  updateTime: string;
  alternateLink?: string;
}

export interface ClassroomCourseWorkItem {
  id: string;
  title: string;
  description?: string;
  workType: string;
  state: string;
  maxPoints?: number;
  alternateLink?: string;
}

export interface ClassroomMaterialItem {
  id: string;
  title: string;
  description?: string;
  state: string;
  alternateLink?: string;
}

export interface ParsedClassroomError {
  kind: 'unauthorized' | 'permission_denied' | 'not_found' | 'generic';
  message: string;
}

export function extractDriveSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{15,})/);
  if (urlMatch?.[1]) {
    return urlMatch[1];
  }

  if (/^[a-zA-Z0-9_-]{15,}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

export function buildSpreadsheetRange(sheetTitle: string, cellRange = 'A1:H25'): string {
  const cleanTab = sheetTitle.trim();
  if (!cleanTab) {
    throw new Error('Sheet tab title is required.');
  }
  const escaped = cleanTab.replace(/'/g, "''");
  const quoted = /^[A-Za-z0-9_]+$/.test(cleanTab) ? cleanTab : `'${escaped}'`;
  return `${quoted}!${cellRange}`;
}

export function formatZoRunOrdersSheetRows(params: {
  district: MizoramDistrict;
  errands: ErrandRequest[];
  orders?: MarketplaceOrder[];
}): string[][] {
  const { district, errands, orders = [] } = params;
  const header = [
    'Record Type',
    'Order ID',
    'District',
    'Title / Item',
    'Route / Shop',
    'Status',
    'Total (INR)',
    'Kailawn Surcharge (INR)',
    'Created At',
  ];

  const filteredErrands = errands.filter((e) => (e.district || 'Aizawl') === district);
  const targetErrands = filteredErrands.length > 0 ? filteredErrands : errands;

  const errandRows = targetErrands.slice(0, 15).map((e) => [
    'Errand',
    e.id,
    e.district || district,
    e.title,
    `${e.origin.label || district} -> ${e.destination.label || district}`,
    e.status.toUpperCase(),
    String(e.allInclusiveTotal),
    String(e.kailawnSurchargeRs ?? 0),
    e.createdAt,
  ]);

  const orderRows = orders.slice(0, 10).map((o) => [
    'Bazar Order',
    o.id,
    district,
    o.productTitle,
    `${o.shopName} (${o.veng})`,
    o.status.toUpperCase(),
    String(o.allInclusiveTotal),
    '0',
    o.createdAt,
  ]);

  return [header, ...errandRows, ...orderRows];
}

export function formatZoRunCampusAnnouncement(params: {
  district: MizoramDistrict;
  lang: Language;
  courseName?: string;
}): string {
  const { district, lang, courseName } = params;
  const prefix = courseName ? `[${courseName}] ` : '';

  if (lang === 'miz') {
    return `${prefix}ZoRûn (${district}) Campus & Hostel Delivery Hriattirna: Lehkhabu, Stationery, Lab Record emaw Hostel parcel lam/thawn duh tan ZoRûn Runner a hman theih reng e. Kailawn/Slope access leh 100% UPI Escrow him tak a awm.`;
  }

  return `${prefix}ZoRûn (${district}) Campus & Hostel Dispatch Notice: Students and faculty can book verified ZoRûn Runners for textbook, stationery, photocopy, or hostel parcel errands with Kailawn step access support and 100% UPI Escrow.`;
}

export function parseClassroomApiError(status: number, bodyText: string): ParsedClassroomError {
  let msg = bodyText;
  try {
    const parsed = JSON.parse(bodyText) as { error?: { message?: string } };
    if (parsed?.error?.message) {
      msg = parsed.error.message;
    }
  } catch {
    // keep raw text fallback
  }

  if (status === 401) {
    return {
      kind: 'unauthorized',
      message: 'Google Classroom session expired. Please Sign in with Google again.',
    };
  }

  if (status === 403) {
    return {
      kind: 'permission_denied',
      message:
        msg ||
        'Google Classroom permission denied. Verify you are signed in with a Classroom teacher/student account and accepted Classroom permissions.',
    };
  }

  if (status === 404) {
    return {
      kind: 'not_found',
      message: msg || 'Requested Google Classroom course or resource was not found.',
    };
  }

  return {
    kind: 'generic',
    message: msg || `Google Classroom API error (HTTP ${status}).`,
  };
}

export async function fetchUserSpreadsheets(
  accessToken: string,
  maxResults = 12
): Promise<SpreadsheetSummary[]> {
  const url = new URL(`${DRIVE_FILES_API_BASE}/files`);
  url.searchParams.set(
    'q',
    "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"
  );
  url.searchParams.set('pageSize', String(maxResults));
  url.searchParams.set('orderBy', 'modifiedTime desc');
  url.searchParams.set('fields', 'files(id,name,modifiedTime,webViewLink)');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Could not list Google Sheets (${res.status}): ${text.slice(0, 180)}`);
  }

  const data = (await res.json()) as {
    files?: Array<{
      id?: string;
      name?: string;
      modifiedTime?: string;
      webViewLink?: string;
    }>;
  };

  return (data.files || []).map((f) => ({
    id: f.id || '',
    name: f.name || 'Untitled Spreadsheet',
    modifiedTime: f.modifiedTime || '',
    webViewLink: f.webViewLink,
  }));
}

export async function fetchSpreadsheetMetadata(
  accessToken: string,
  spreadsheetId: string
): Promise<SpreadsheetMetadata> {
  const url = `${SHEETS_API_BASE}/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties(sheetId,title,gridProperties)`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Could not load spreadsheet metadata (${res.status}): ${text.slice(0, 180)}`);
  }

  const json = (await res.json()) as {
    spreadsheetId?: string;
    spreadsheetUrl?: string;
    properties?: { title?: string };
    sheets?: Array<{
      properties?: {
        sheetId?: number;
        title?: string;
        gridProperties?: { rowCount?: number; columnCount?: number };
      };
    }>;
  };

  return {
    spreadsheetId: json.spreadsheetId || spreadsheetId,
    title: json.properties?.title || 'Spreadsheet',
    spreadsheetUrl: json.spreadsheetUrl,
    sheets: (json.sheets || []).map((s) => ({
      sheetId: s.properties?.sheetId ?? 0,
      title: s.properties?.title || 'Tab',
      rowCount: s.properties?.gridProperties?.rowCount ?? 0,
      columnCount: s.properties?.gridProperties?.columnCount ?? 0,
    })),
  };
}

export async function readSheetRange(
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string,
  cellRange = 'A1:H25'
): Promise<string[][]> {
  const range = buildSpreadsheetRange(sheetTitle, cellRange);
  const url = `${SHEETS_API_BASE}/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}/values/${encodeURIComponent(range)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Could not read sheet range (${res.status}): ${text.slice(0, 180)}`);
  }

  const data = (await res.json()) as { values?: string[][] };
  return data.values || [];
}

export async function createSpreadsheetWithRows(
  accessToken: string,
  title: string,
  sheetTitle: string,
  rows: string[][]
): Promise<SpreadsheetMetadata> {
  const createRes = await fetch(`${SHEETS_API_BASE}/spreadsheets`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: sheetTitle } }],
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Could not create spreadsheet (${createRes.status}): ${text.slice(0, 180)}`);
  }

  const created = (await createRes.json()) as {
    spreadsheetId?: string;
    spreadsheetUrl?: string;
    properties?: { title?: string };
    sheets?: Array<{
      properties?: {
        sheetId?: number;
        title?: string;
        gridProperties?: { rowCount?: number; columnCount?: number };
      };
    }>;
  };

  const spreadsheetId = created.spreadsheetId || '';
  const createdTabTitle = created.sheets?.[0]?.properties?.title || sheetTitle;

  if (spreadsheetId && rows.length > 0) {
    const range = buildSpreadsheetRange(createdTabTitle, 'A1');
    const writeRes = await fetch(
      `${SHEETS_API_BASE}/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: rows }),
      }
    );
    if (!writeRes.ok) {
      const errText = await writeRes.text();
      throw new Error(
        `Spreadsheet created, but initial row export failed (${writeRes.status}): ${errText.slice(0, 180)}`
      );
    }
  }

  return {
    spreadsheetId,
    title: created.properties?.title || title,
    spreadsheetUrl: created.spreadsheetUrl,
    sheets: (created.sheets || []).map((s) => ({
      sheetId: s.properties?.sheetId ?? 0,
      title: s.properties?.title || createdTabTitle,
      rowCount: s.properties?.gridProperties?.rowCount ?? 1000,
      columnCount: s.properties?.gridProperties?.columnCount ?? 26,
    })),
  };
}

export async function appendSheetRows(
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string,
  rows: string[][]
): Promise<{ updatedRows: number; updatedRange: string }> {
  const range = buildSpreadsheetRange(sheetTitle, 'A1');
  const url = `${SHEETS_API_BASE}/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: rows }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Could not append rows (${res.status}): ${text.slice(0, 180)}`);
  }

  const data = (await res.json()) as {
    updates?: { updatedRows?: number; updatedRange?: string };
  };

  return {
    updatedRows: data.updates?.updatedRows ?? rows.length,
    updatedRange: data.updates?.updatedRange || range,
  };
}

export async function fetchClassroomCourses(
  accessToken: string
): Promise<{ courses: ClassroomCourseSummary[]; errorInfo?: ParsedClassroomError }> {
  const res = await fetch(`${CLASSROOM_API_BASE}/courses?courseStates=ACTIVE&pageSize=20`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    return {
      courses: [],
      errorInfo: parseClassroomApiError(res.status, text),
    };
  }

  const data = (await res.json()) as {
    courses?: Array<{
      id?: string;
      name?: string;
      section?: string;
      room?: string;
      courseState?: string;
      alternateLink?: string;
    }>;
  };

  return {
    courses: (data.courses || []).map((c) => ({
      id: c.id || '',
      name: c.name || 'Untitled Course',
      section: c.section,
      room: c.room,
      courseState: c.courseState || 'ACTIVE',
      alternateLink: c.alternateLink,
    })),
  };
}

export async function fetchClassroomCourseDetails(
  accessToken: string,
  courseId: string
): Promise<{
  announcements: ClassroomAnnouncementItem[];
  courseWork: ClassroomCourseWorkItem[];
  materials: ClassroomMaterialItem[];
  errorInfo?: ParsedClassroomError;
}> {
  const encodedId = encodeURIComponent(courseId);
  const [annRes, cwRes, matRes] = await Promise.all([
    fetch(`${CLASSROOM_API_BASE}/courses/${encodedId}/announcements?pageSize=10`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
    fetch(`${CLASSROOM_API_BASE}/courses/${encodedId}/courseWork?pageSize=10`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
    fetch(`${CLASSROOM_API_BASE}/courses/${encodedId}/courseWorkMaterials?pageSize=10`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  ]);

  if (!annRes.ok && !cwRes.ok && !matRes.ok) {
    const errText = await annRes.text();
    return {
      announcements: [],
      courseWork: [],
      materials: [],
      errorInfo: parseClassroomApiError(annRes.status, errText),
    };
  }

  const annJson = annRes.ok
    ? ((await annRes.json()) as {
        announcements?: Array<{
          id?: string;
          text?: string;
          state?: string;
          updateTime?: string;
          alternateLink?: string;
        }>;
      })
    : { announcements: [] };

  const cwJson = cwRes.ok
    ? ((await cwRes.json()) as {
        courseWork?: Array<{
          id?: string;
          title?: string;
          description?: string;
          workType?: string;
          state?: string;
          maxPoints?: number;
          alternateLink?: string;
        }>;
      })
    : { courseWork: [] };

  const matJson = matRes.ok
    ? ((await matRes.json()) as {
        courseWorkMaterial?: Array<{
          id?: string;
          title?: string;
          description?: string;
          state?: string;
          alternateLink?: string;
        }>;
      })
    : { courseWorkMaterial: [] };

  return {
    announcements: (annJson.announcements || []).map((a) => ({
      id: a.id || '',
      text: a.text || '(Announcement)',
      state: a.state || 'PUBLISHED',
      updateTime: a.updateTime || '',
      alternateLink: a.alternateLink,
    })),
    courseWork: (cwJson.courseWork || []).map((w) => ({
      id: w.id || '',
      title: w.title || 'Untitled Assignment',
      description: w.description,
      workType: w.workType || 'ASSIGNMENT',
      state: w.state || 'PUBLISHED',
      maxPoints: w.maxPoints,
      alternateLink: w.alternateLink,
    })),
    materials: (matJson.courseWorkMaterial || []).map((m) => ({
      id: m.id || '',
      title: m.title || 'Course Material',
      description: m.description,
      state: m.state || 'PUBLISHED',
      alternateLink: m.alternateLink,
    })),
  };
}

export async function createClassroomAnnouncement(
  accessToken: string,
  courseId: string,
  text: string
): Promise<ClassroomAnnouncementItem> {
  const res = await fetch(
    `${CLASSROOM_API_BASE}/courses/${encodeURIComponent(courseId)}/announcements`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text.trim(),
        state: 'PUBLISHED',
      }),
    }
  );

  if (!res.ok) {
    const bodyText = await res.text();
    throw new Error(parseClassroomApiError(res.status, bodyText).message);
  }

  const data = (await res.json()) as {
    id?: string;
    text?: string;
    state?: string;
    updateTime?: string;
    alternateLink?: string;
  };

  return {
    id: data.id || '',
    text: data.text || text.trim(),
    state: data.state || 'PUBLISHED',
    updateTime: data.updateTime || new Date().toISOString(),
    alternateLink: data.alternateLink,
  };
}

export async function createClassroomCourseWork(
  accessToken: string,
  courseId: string,
  params: { title: string; description?: string; maxPoints?: number }
): Promise<ClassroomCourseWorkItem> {
  const payload: Record<string, unknown> = {
    title: params.title.trim(),
    description: params.description?.trim() || undefined,
    workType: 'ASSIGNMENT',
    state: 'PUBLISHED',
  };
  if (typeof params.maxPoints === 'number' && Number.isFinite(params.maxPoints)) {
    payload.maxPoints = params.maxPoints;
  }

  const res = await fetch(
    `${CLASSROOM_API_BASE}/courses/${encodeURIComponent(courseId)}/courseWork`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const bodyText = await res.text();
    throw new Error(parseClassroomApiError(res.status, bodyText).message);
  }

  const data = (await res.json()) as {
    id?: string;
    title?: string;
    description?: string;
    workType?: string;
    state?: string;
    maxPoints?: number;
    alternateLink?: string;
  };

  return {
    id: data.id || '',
    title: data.title || params.title.trim(),
    description: data.description,
    workType: data.workType || 'ASSIGNMENT',
    state: data.state || 'PUBLISHED',
    maxPoints: data.maxPoints,
    alternateLink: data.alternateLink,
  };
}

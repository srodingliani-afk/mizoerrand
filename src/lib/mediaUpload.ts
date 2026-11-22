import { getFirebaseIdToken, getGoogleDriveAccessToken } from './firebase';

export type ClientMediaCategory = 'voice_note' | 'receipt' | 'proof_photo' | 'kyc_doc';

export interface UploadedMediaResponse {
  ok: boolean;
  folder: string;
  bucket?: string;
  driveFileId?: string;
  objectPath: string;
  url: string | null;
  isPrivate: boolean;
  provider: 'google_drive' | 'local_fallback';
  mimeType: string;
  sizeBytes: number;
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export async function uploadMediaFile(params: {
  file: Blob | File;
  filename: string;
  category: ClientMediaCategory;
  district?: string;
  orderRef?: string;
}): Promise<UploadedMediaResponse> {
  const form = new FormData();
  form.append('file', params.file, params.filename);
  form.append('category', params.category);
  if (params.district) form.append('district', params.district);
  if (params.orderRef) form.append('orderRef', params.orderRef);

  const headers: Record<string, string> = {};
  const driveToken = getGoogleDriveAccessToken();
  const idToken = getFirebaseIdToken();
  if (driveToken) {
    headers['X-Google-Access-Token'] = driveToken;
  }
  if (idToken) {
    headers['X-Firebase-Id-Token'] = idToken;
  }

  const res = await fetch('/api/media/upload', {
    method: 'POST',
    headers,
    body: form,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Media upload failed.');
  }
  return data as UploadedMediaResponse;
}

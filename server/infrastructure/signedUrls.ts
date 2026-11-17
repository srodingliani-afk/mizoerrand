import crypto from 'crypto';

const SIGNING_SECRET =
  process.env.SIGNED_URL_SECRET || 'zorun-ap-south-1-ephemeral-media-signing-key';

interface SignedMediaPayload {
  resourceId: string;
  resourceType: 'kyc_doc' | 'voice_note' | 'proof_photo' | 'spare_receipt';
  exp: number;
}

export function createSignedPrivateUrl(
  resourceId: string,
  resourceType: SignedMediaPayload['resourceType'],
  ttlSeconds = 60
): { url: string; token: string; expiresAt: string } {
  const exp = Date.now() + ttlSeconds * 1000;
  const payload: SignedMediaPayload = { resourceId, resourceType, exp };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(encoded)
    .digest('base64url');
  const token = `${encoded}.${sig}`;
  return {
    url: `/api/auth-kyc/signed-media/${token}`,
    token,
    expiresAt: new Date(exp).toISOString(),
  };
}

export function verifySignedPrivateToken(
  token: string
): { valid: true; payload: SignedMediaPayload } | { valid: false; error: string } {
  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'Malformed signed media token' };
  }
  const [encoded, providedSig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(encoded)
    .digest('base64url');

  if (providedSig.length !== expectedSig.length) {
    return { valid: false, error: 'Invalid signature' };
  }

  const matches = crypto.timingSafeEqual(
    Buffer.from(providedSig, 'utf8'),
    Buffer.from(expectedSig, 'utf8')
  );
  if (!matches) {
    return { valid: false, error: 'Invalid signature' };
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    ) as SignedMediaPayload;
    if (Date.now() > payload.exp) {
      return { valid: false, error: 'Signed URL expired (60-second TTL exceeded)' };
    }
    return { valid: true, payload };
  } catch {
    return { valid: false, error: 'Corrupt signed payload' };
  }
}

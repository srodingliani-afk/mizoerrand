import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isTrustedMediaUrl,
  isValidKycObjectPath,
  uploadMediaToDrive,
} from './driveStorage';

test('uploadMediaToDrive rejects audio larger than 2MB', async () => {
  const oversized = Buffer.alloc(2 * 1024 * 1024 + 64);
  oversized[0] = 0x1a;
  oversized[1] = 0x45;
  oversized[2] = 0xdf;
  oversized[3] = 0xa3;

  await assert.rejects(
    () =>
      uploadMediaToDrive({
        buffer: oversized,
        mimeType: 'audio/webm',
        category: 'voice_note',
        district: 'Aizawl',
      }),
    /maximum allowed size/i
  );
});

test('uploadMediaToDrive rejects spoofed HTML disguised as image/png', async () => {
  const fakePng = Buffer.from('<html><script>alert(1)</script></html>', 'utf8');
  await assert.rejects(
    () =>
      uploadMediaToDrive({
        buffer: fakePng,
        mimeType: 'image/png',
        category: 'receipt',
        district: 'Lunglei',
      }),
    /does not match/i
  );
});

test('uploadMediaToDrive keeps ZoRun/KYC strictly private (url is null)', async () => {
  const validPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF', 'utf8');
  const res = await uploadMediaToDrive({
    buffer: validPdf,
    mimeType: 'application/pdf',
    category: 'kyc_doc',
    district: 'Lawngtlai',
  });

  assert.equal(res.folder, 'ZoRun/KYC');
  assert.equal(res.isPrivate, true);
  assert.equal(res.url, null);
  assert.equal(isValidKycObjectPath(res.objectPath), true);
});

test('isValidKycObjectPath blocks path traversal and cross-folder paths', () => {
  assert.equal(isValidKycObjectPath('kyc_doc/aizawl/1700-doc.pdf'), true);
  assert.equal(isValidKycObjectPath('../ZoRun/Receipts/leak.jpg'), false);
  assert.equal(isValidKycObjectPath('/kyc_doc/aizawl/1700-doc.pdf'), false);
  assert.equal(isValidKycObjectPath('receipt/aizawl/1700-doc.jpg'), false);
});

test('isTrustedMediaUrl allows Google Drive HTTPS URLs and blocks unsafe schemes/hosts', () => {
  assert.equal(
    isTrustedMediaUrl('https://drive.google.com/uc?export=view&id=1abcXYZ', 'image'),
    'https://drive.google.com/uc?export=view&id=1abcXYZ'
  );
  assert.equal(isTrustedMediaUrl('javascript:alert(1)', 'image'), undefined);
  assert.equal(isTrustedMediaUrl('https://169.254.169.254/latest/meta-data', 'image'), undefined);
  assert.equal(isTrustedMediaUrl('https://localhost:3000/secret', 'audio'), undefined);
});

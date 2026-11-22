import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const blueprintPath = path.resolve(process.cwd(), 'firebase-blueprint.json');
const rulesSource = fs.readFileSync(rulesPath, 'utf8');
const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf8')) as {
  firestore: Record<string, unknown>;
};

test('firestore.rules begins with global default-deny catch-all and rules_version = 2', () => {
  assert.match(rulesSource, /rules_version\s*=\s*'2'/);
  assert.match(rulesSource, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;/);
});

test('firestore.rules enforces RBAC anti-escalation, email_verified, and terminal locking', () => {
  assert.match(rulesSource, /request\.auth\.token\.email_verified == true/);
  assert.match(rulesSource, /srodingliani@gmail\.com/);
  assert.match(rulesSource, /incoming\(\)\.role == 'CUSTOMER'/);
  assert.match(rulesSource, /existing\(\)\.status != 'completed' && existing\(\)\.status != 'cancelled'/);
  assert.match(rulesSource, /existing\(\)\.status != 'resolved'/);
});

test('every collection in firebase-blueprint.json has an explicit match block in firestore.rules', () => {
  for (const collectionPath of Object.keys(blueprint.firestore)) {
    const normalized = collectionPath.replace(/\{[^}]+\}/g, '');
    const segments = normalized.split('/').filter(Boolean);
    assert.ok(segments.length > 0);
    assert.ok(
      rulesSource.includes(segments[0]),
      `Missing match rule for blueprint collection path: ${collectionPath}`
    );
  }
});

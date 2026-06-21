import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sep, join } from 'node:path';
import { resolveProjectFromPicked, isSafeRelPath } from '../desktop/main/project.js';

test('resolveProjectFromPicked uses the file folder as root and its basename as name', () => {
  const picked = join(sep, 'home', 'me', 'acme', 'kartograph.json');
  const r = resolveProjectFromPicked(picked);
  assert.equal(r.root, join(sep, 'home', 'me', 'acme'));
  assert.equal(r.name, 'acme');
});

test('isSafeRelPath allows nested feature paths and rejects traversal/absolute', () => {
  assert.equal(isSafeRelPath('features/care/intake/sign-in.feature'), true);
  assert.equal(isSafeRelPath('kartograph.json'), true);
  assert.equal(isSafeRelPath('../secret'), false);
  assert.equal(isSafeRelPath('/etc/passwd'), false);
  assert.equal(isSafeRelPath('a/../../b'), false);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoPlace } from '../viewer/lib/layout.js';

test('existing positions are preserved', () => {
  const out = autoPlace(['a', 'b'], { a: { x: 10, y: 20 } });
  assert.deepEqual(out.a, { x: 10, y: 20 });
});

test('missing nodes get integer positions', () => {
  const out = autoPlace(['a'], {});
  assert.equal(typeof out.a.x, 'number');
  assert.equal(Number.isInteger(out.a.x), true);
  assert.equal(Number.isInteger(out.a.y), true);
});

test('placement is deterministic (no randomness)', () => {
  const a = autoPlace(['x', 'y', 'z'], {});
  const b = autoPlace(['x', 'y', 'z'], {});
  assert.deepEqual(a, b);
});

test('a null saved entry is replaced with a real computed position', () => {
  const out = autoPlace(['a'], { a: null });
  assert.ok(out.a && Number.isInteger(out.a.x) && Number.isInteger(out.a.y));
});

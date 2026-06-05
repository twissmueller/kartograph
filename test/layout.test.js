import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoPlace, autoPlaceGrouped, boundsForGroups } from '../viewer/lib/layout.js';

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

// --- autoPlaceGrouped: cluster nodes by context so context boxes don't overlap ---

const nodes = (pairs) => pairs.map(([slug, context]) => ({ slug, context }));

test('autoPlaceGrouped gives every missing node an integer position', () => {
  const out = autoPlaceGrouped(nodes([['a', 'one'], ['b', 'two']]), {});
  for (const s of ['a', 'b']) {
    assert.ok(Number.isInteger(out[s].x) && Number.isInteger(out[s].y), `${s} integer`);
  }
});

test('autoPlaceGrouped preserves existing positions', () => {
  const out = autoPlaceGrouped(nodes([['a', 'one']]), { a: { x: 5, y: 7 } });
  assert.deepEqual(out.a, { x: 5, y: 7 });
});

test('autoPlaceGrouped replaces a null saved entry', () => {
  const out = autoPlaceGrouped(nodes([['a', 'one']]), { a: null });
  assert.ok(out.a && Number.isInteger(out.a.x));
});

test('autoPlaceGrouped is deterministic', () => {
  const ns = nodes([['a', 'one'], ['b', 'one'], ['c', 'two']]);
  assert.deepEqual(autoPlaceGrouped(ns, {}), autoPlaceGrouped(ns, {}));
});

test('autoPlaceGrouped separates contexts horizontally', () => {
  // one node per context across two contexts -> the two land in different regions
  const out = autoPlaceGrouped(nodes([['a', 'one'], ['b', 'two']]), {}, { width: 1000, height: 600 });
  assert.notEqual(out.a.x, out.b.x);
});

test('autoPlaceGrouped keeps same-context nodes nearer each other than to another context', () => {
  const out = autoPlaceGrouped(
    nodes([['a', 'one'], ['b', 'one'], ['z', 'two']]),
    {}, { width: 1200, height: 400 }
  );
  const d = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  assert.ok(d(out.a, out.b) < d(out.a, out.z), 'siblings closer than cross-context');
});

// --- boundsForGroups: derive a padded bounding box per context from node rects ---

test('boundsForGroups wraps a single centered node with padding', () => {
  // x,y are the node CENTER (the viewer positions nodes with translate(-50%,-50%))
  const out = boundsForGroups([{ context: 'one', x: 100, y: 100, w: 40, h: 20 }], 10);
  assert.deepEqual(out.one, { x: 100 - 20 - 10, y: 100 - 10 - 10, w: 40 + 20, h: 20 + 20 });
});

test('boundsForGroups produces one box per context', () => {
  const out = boundsForGroups([
    { context: 'one', x: 0, y: 0, w: 10, h: 10 },
    { context: 'two', x: 100, y: 0, w: 10, h: 10 },
  ], 0);
  assert.deepEqual(Object.keys(out).sort(), ['one', 'two']);
});

test('boundsForGroups box encloses all nodes of the context', () => {
  const out = boundsForGroups([
    { context: 'one', x: 0, y: 0, w: 20, h: 20 },
    { context: 'one', x: 100, y: 50, w: 20, h: 20 },
  ], 5);
  const b = out.one;
  assert.ok(b.x <= -10 - 5 && b.y <= -10 - 5);
  assert.ok(b.x + b.w >= 110 + 5 && b.y + b.h >= 60 + 5);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoPlace, autoPlaceGrouped, boundsForGroups, separateBoxes } from '../workflows/lib/layout.js';

const overlap = (A, B) => {
  const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
  const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
  return ox > 0 && oy > 0;
};
const moveBox = (box, d) => ({ x: box.x + d.dx, y: box.y + d.dy, w: box.w, h: box.h });

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

// --- autoPlaceGrouped: context boxes must not overlap on a fresh layout ---

test('autoPlaceGrouped lays a fresh map out with non-overlapping context boxes', () => {
  // many capabilities across several contexts, no saved positions
  const ns = nodes([
    ['a1', 'one'], ['a2', 'one'], ['a3', 'one'], ['a4', 'one'], ['a5', 'one'],
    ['b1', 'two'], ['b2', 'two'], ['b3', 'two'],
    ['c1', 'three'], ['c2', 'three'],
    ['d1', 'four'],
  ]);
  const pos = autoPlaceGrouped(ns, {}, { width: 1200, height: 800 });
  // reconstruct each context box from the placed node centres + a nominal node size
  const rects = ns.map((n) => ({ context: n.context, x: pos[n.slug].x, y: pos[n.slug].y, w: 160, h: 48 }));
  const boxes = boundsForGroups(rects, 28);
  const keys = Object.keys(boxes);
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      assert.ok(!overlap(boxes[keys[i]], boxes[keys[j]]), `${keys[i]} overlaps ${keys[j]}`);
    }
  }
});

// --- separateBoxes: push overlapping context boxes apart ---

test('separateBoxes pushes two overlapping boxes apart', () => {
  const boxes = { a: { x: 0, y: 0, w: 100, h: 100 }, b: { x: 50, y: 0, w: 100, h: 100 } };
  const d = separateBoxes(boxes, { gap: 0 });
  assert.ok(!overlap(moveBox(boxes.a, d.a), moveBox(boxes.b, d.b)), 'no overlap after separation');
});

test('separateBoxes keeps the fixed box in place', () => {
  const boxes = { a: { x: 0, y: 0, w: 100, h: 100 }, b: { x: 50, y: 0, w: 100, h: 100 } };
  const d = separateBoxes(boxes, { fixed: 'a' });
  assert.deepEqual(d.a, { dx: 0, dy: 0 });
  assert.ok(!overlap(moveBox(boxes.a, d.a), moveBox(boxes.b, d.b)));
});

test('separateBoxes leaves non-overlapping boxes untouched', () => {
  const boxes = { a: { x: 0, y: 0, w: 100, h: 100 }, b: { x: 200, y: 0, w: 100, h: 100 } };
  const d = separateBoxes(boxes);
  assert.deepEqual(d.a, { dx: 0, dy: 0 });
  assert.deepEqual(d.b, { dx: 0, dy: 0 });
});

test('separateBoxes resolves a three-box pile-up', () => {
  const boxes = {
    a: { x: 0, y: 0, w: 100, h: 100 },
    b: { x: 20, y: 10, w: 100, h: 100 },
    c: { x: 40, y: 20, w: 100, h: 100 },
  };
  const d = separateBoxes(boxes, { gap: 0, iterations: 12 });
  const out = Object.fromEntries(Object.keys(boxes).map((k) => [k, moveBox(boxes[k], d[k])]));
  const keys = Object.keys(out);
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      assert.ok(!overlap(out[keys[i]], out[keys[j]]), `${keys[i]} still overlaps ${keys[j]}`);
    }
  }
});

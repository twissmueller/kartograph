import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_COLUMNS, boardColumns, capabilityStatuses, groupByContext } from '../viewer/lib/board.js';

test('groupByContext orders by the contexts list, preserves within-context order', () => {
  const caps = [
    { capability: 'a', context: 'care' },
    { capability: 'b', context: 'admin' },
    { capability: 'c', context: 'care' },
  ];
  const contexts = [{ context: 'admin', name: 'Admin', color: '#111' }, { context: 'care', name: 'Care' }];
  const groups = groupByContext(caps, contexts);
  assert.deepEqual(groups.map((g) => g.context), ['admin', 'care']);
  assert.deepEqual(groups.map((g) => g.name), ['Admin', 'Care']);
  assert.equal(groups[0].color, '#111');
  assert.deepEqual(groups[1].capabilities.map((c) => c.capability), ['a', 'c']);
});

test('groupByContext puts capabilities with an unlisted context last, under their slug', () => {
  const caps = [{ capability: 'x', context: 'ghost' }, { capability: 'y', context: 'care' }];
  const groups = groupByContext(caps, [{ context: 'care', name: 'Care' }]);
  assert.deepEqual(groups.map((g) => g.context), ['care', 'ghost']);
  assert.equal(groups[1].name, 'ghost'); // falls back to the slug
});

test('capabilityStatuses: green=all done, yellow=some done, red=none done or no scenarios', () => {
  const scenarios = [
    { capability: 'a', progress: 'done' },
    { capability: 'a', progress: 'done' },
    { capability: 'b', progress: 'done' },
    { capability: 'b', progress: 'wip' },
    { capability: 'c', progress: 'open' },
  ];
  const st = capabilityStatuses(scenarios, ['a', 'b', 'c', 'd']);
  assert.equal(st.a, 'green');   // all done
  assert.equal(st.b, 'yellow');  // some done
  assert.equal(st.c, 'red');     // none done
  assert.equal(st.d, 'red');     // no scenarios at all
});

test('capabilityStatuses on empty input is an empty map', () => {
  assert.deepEqual(capabilityStatuses([], []), {});
  assert.deepEqual(capabilityStatuses(undefined, undefined), {});
});

test('BOARD_COLUMNS is the four ordered progress states', () => {
  assert.deepEqual(BOARD_COLUMNS, ['open', 'wip', 'test', 'done']);
});

test('boardColumns groups scenarios by their server-provided progress', () => {
  const scenarios = [
    { name: 'a', progress: 'open' },
    { name: 'b', progress: 'wip' },
    { name: 'c', progress: 'done' },
    { name: 'd', progress: 'wip' },
  ];
  const cols = boardColumns(scenarios);
  assert.deepEqual(cols.open.map((s) => s.name), ['a']);
  assert.deepEqual(cols.wip.map((s) => s.name), ['b', 'd']);
  assert.deepEqual(cols.test.map((s) => s.name), []);
  assert.deepEqual(cols.done.map((s) => s.name), ['c']);
});

test('a scenario with an unknown/missing progress falls into open', () => {
  const cols = boardColumns([{ name: 'x' }, { name: 'y', progress: 'bogus' }]);
  assert.deepEqual(cols.open.map((s) => s.name), ['x', 'y']);
});

test('boardColumns on empty/undefined input yields four empty columns', () => {
  for (const input of [[], undefined]) {
    const cols = boardColumns(input);
    assert.deepEqual(Object.keys(cols), ['open', 'wip', 'test', 'done']);
    assert.equal(cols.open.length + cols.wip.length + cols.test.length + cols.done.length, 0);
  }
});

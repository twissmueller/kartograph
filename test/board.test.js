import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_COLUMNS, boardColumns } from '../viewer/lib/board.js';

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

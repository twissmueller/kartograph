import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NOTE_SOURCES, isNoteSource,
  getScenarioNote, setScenarioNote, clearScenarioNote,
} from '../workflows/lib/notes.js';

const ID = 'cap/f.feature#"A"';
const NOTE = { reason: 'Then step is ambiguous', date: '2026-07-05', source: 'walk' };

test('the note sources are walk and build', () => {
  assert.deepEqual(NOTE_SOURCES, ['walk', 'build']);
  assert.equal(isNoteSource('build'), true);
  assert.equal(isNoteSource('chart'), false);
  assert.equal(isNoteSource(''), false);
});

test('getScenarioNote returns the stored note, or null when absent', () => {
  const map = { scenarioNotes: { [ID]: NOTE } };
  assert.deepEqual(getScenarioNote(map, ID), NOTE);
  assert.equal(getScenarioNote(map, 'cap/f.feature#"B"'), null);
  assert.equal(getScenarioNote({}, 'anything'), null);
  assert.equal(getScenarioNote(null, 'anything'), null);
});

test('setScenarioNote returns a new map with the note set, without mutating the input', () => {
  const map = { meta: { name: 'x' } };
  const next = setScenarioNote(map, ID, NOTE);
  assert.deepEqual(next.scenarioNotes[ID], NOTE);
  assert.equal(map.scenarioNotes, undefined, 'input map not mutated');
  assert.equal(next.meta.name, 'x', 'other fields preserved');
});

test('setScenarioNote keeps other notes when one is added', () => {
  const map = { scenarioNotes: { 'cap/f.feature#"B"': { ...NOTE, source: 'build' } } };
  const next = setScenarioNote(map, ID, NOTE);
  assert.deepEqual(next.scenarioNotes, {
    'cap/f.feature#"B"': { ...NOTE, source: 'build' },
    [ID]: NOTE,
  });
});

test('setScenarioNote rejects a missing/empty reason, missing date, or bad source', () => {
  assert.throws(() => setScenarioNote({}, ID, { reason: '', date: '2026-07-05', source: 'walk' }), /reason/);
  assert.throws(() => setScenarioNote({}, ID, { reason: 'x', date: '', source: 'walk' }), /date/);
  assert.throws(() => setScenarioNote({}, ID, { reason: 'x', date: '2026-07-05', source: 'done' }), /source/);
  assert.throws(() => setScenarioNote({}, ID, {}), /reason/);
});

test('clearScenarioNote removes the note and drops empty scenarioNotes (clear-on-advance)', () => {
  const map = { scenarioNotes: { [ID]: NOTE } };
  const next = clearScenarioNote(map, ID);
  assert.equal('scenarioNotes' in next, false, 'empty scenarioNotes is removed entirely');
});

test('clearScenarioNote keeps other notes when one is cleared', () => {
  const other = { 'cap/f.feature#"B"': { ...NOTE, source: 'build' } };
  const map = { scenarioNotes: { [ID]: NOTE, ...other } };
  const next = clearScenarioNote(map, ID);
  assert.deepEqual(next.scenarioNotes, other);
});

test('clearScenarioNote on an absent note is a no-op that does not mutate the input', () => {
  const map = { meta: { name: 'x' } };
  const next = clearScenarioNote(map, ID);
  assert.equal('scenarioNotes' in next, false);
  assert.equal(next.meta.name, 'x');
  assert.deepEqual(map, { meta: { name: 'x' } }, 'input not mutated');
});

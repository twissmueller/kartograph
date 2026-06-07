import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDiscovery } from '../workflows/lib/apply-discovery.js';

const baseMap = {
  version: '1', meta: { name: 'X' },
  contexts: { care: { name: 'Care', definition: 'Care area.' } },
  capabilities: {}, subjects: {}, actors: {}, events: {}, rules: {}, glossary: {}, adrs: {}, dependencies: [],
};

const discovery = {
  date: '2026-06-05', slug: 's', conversationSummary: 'c', sources: { description: 'd' },
  findings: {
    subjects: [{ slug: 'plant', name: 'Plant', definition: 'A plant.' }],
    events: [], actors: [{ slug: 'gardener', name: 'Gardener' }], rules: [{ name: 'must water', statement: 'Plants must be watered.', subject: 'plant' }],
    affectedCapabilities: [],
    capabilityCandidates: [{ slug: 'task-reminders', name: 'Task reminders', context: 'care', definition: 'Remind the gardener.' }],
    glossaryAdditions: [{ slug: 'plant', term: 'Plant', definition: 'A cultivated plant.', type: 'subjekt' }],
    adrCandidates: [{ title: 'Use local notifications', rationale: 'Offline-friendly.', capabilities: ['task-reminders'] }],
    placement: [{ kind: 'capabilityCandidate', slug: 'task-reminders', context: 'care' }],
  },
};

test('adds a candidate capability in vision', () => {
  const m = applyDiscovery(baseMap, discovery);
  assert.equal(m.capabilities['task-reminders'].declaredStage, 'vision');
  assert.equal(m.capabilities['task-reminders'].derived.maturity, 'vision');
  assert.equal(m.capabilities['task-reminders'].context, 'care');
});

test('adds subject, actor, glossary term, and a rule linked to an existing subject', () => {
  const m = applyDiscovery(baseMap, discovery);
  assert.ok(m.subjects.plant);
  assert.ok(m.actors.gardener);
  assert.equal(m.glossary.plant.term, 'Plant');
  const rule = Object.values(m.rules)[0];
  assert.equal(rule.subject, 'plant');
});

test('creates a missing context referenced by a candidate', () => {
  const d = structuredClone(discovery);
  d.findings.capabilityCandidates[0].context = 'notifications';
  d.findings.placement[0].context = 'notifications';
  const m = applyDiscovery(baseMap, d);
  assert.ok(m.contexts.notifications, 'context auto-created');
});

test('numbers ADR candidates sequentially and marks them proposed', () => {
  const m = applyDiscovery(baseMap, discovery);
  const ids = Object.keys(m.adrs);
  assert.equal(ids.length, 1);
  assert.match(ids[0], /^0001-/);
  assert.equal(m.adrs[ids[0]].status, 'proposed');
});

test('is idempotent — applying twice does not duplicate', () => {
  const once = applyDiscovery(baseMap, discovery);
  const twice = applyDiscovery(once, discovery);
  assert.deepEqual(Object.keys(twice.capabilities), Object.keys(once.capabilities));
  assert.equal(Object.keys(twice.adrs).length, 1);
});

test('does not mutate the input map', () => {
  const before = JSON.stringify(baseMap);
  applyDiscovery(baseMap, discovery);
  assert.equal(JSON.stringify(baseMap), before);
});

test('folds findings.dependencies into the map, dedups, unions features, idempotent', () => {
  const d = structuredClone(discovery);
  d.findings.dependencies = [{ from: 'task-reminders', to: 'watering-schedule', features: ['remind.feature'] }];
  const once = applyDiscovery(baseMap, d);
  const edge = once.dependencies.find((e) => e.from === 'task-reminders' && e.to === 'watering-schedule');
  assert.ok(edge, 'edge added');
  assert.deepEqual(edge.features, ['remind.feature']);

  // second apply with an extra feature on the same edge: no duplicate edge, features unioned
  const d2 = structuredClone(d);
  d2.findings.dependencies = [{ from: 'task-reminders', to: 'watering-schedule', features: ['remind.feature', 'snooze.feature'] }];
  const twice = applyDiscovery(once, d2);
  const edges = twice.dependencies.filter((e) => e.from === 'task-reminders' && e.to === 'watering-schedule');
  assert.equal(edges.length, 1, 'no duplicate edge');
  assert.deepEqual(edges[0].features, ['remind.feature', 'snooze.feature']);
});

test('a bare findings.dependencies edge (no features) is folded without a features key', () => {
  const d = structuredClone(discovery);
  d.findings.dependencies = [{ from: 'task-reminders', to: 'watering-schedule' }];
  const m = applyDiscovery(baseMap, d);
  const edge = m.dependencies.find((e) => e.from === 'task-reminders' && e.to === 'watering-schedule');
  assert.ok(edge);
  assert.equal(edge.features, undefined);
});

test('folds a dependency reason and keeps it on re-apply', () => {
  const d = structuredClone(discovery);
  d.findings.dependencies = [{ from: 'task-reminders', to: 'watering-schedule', reason: 'reads the next-due time', features: ['remind.feature'] }];
  const once = applyDiscovery(baseMap, d);
  const edge = once.dependencies.find((e) => e.from === 'task-reminders' && e.to === 'watering-schedule');
  assert.equal(edge.reason, 'reads the next-due time');
  const twice = applyDiscovery(once, d);
  const edges = twice.dependencies.filter((e) => e.from === 'task-reminders' && e.to === 'watering-schedule');
  assert.equal(edges.length, 1);
  assert.equal(edges[0].reason, 'reads the next-due time');
});

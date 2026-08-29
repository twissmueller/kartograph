import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDiscovery } from '../workflows/lib/apply-discovery.js';

const baseMap = {
  version: '1', meta: { name: 'X' },
  contexts: { care: { name: 'Care' } },
  capabilities: {}, subjects: {}, actors: {}, events: {}, rules: {}, adrs: {}, dependencies: [],
};

const discovery = {
  date: '2026-06-05', slug: 's', conversationSummary: 'c', sources: { description: 'd' },
  findings: {
    subjects: [{ slug: 'plant', name: 'Plant' }],
    events: [], actors: [{ slug: 'gardener', name: 'Gardener' }], rules: [{ name: 'must water', subject: 'plant' }],
    affectedCapabilities: [],
    capabilityCandidates: [{ slug: 'task-reminders', name: 'Task reminders', context: 'care' }],
    glossaryAdditions: [{ slug: 'plant', term: 'Plant', type: 'subjekt', kontext: 'care' }],
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

test('adds subject, actor, and a rule linked to an existing subject', () => {
  const m = applyDiscovery(baseMap, discovery);
  assert.ok(m.subjects.plant);
  assert.ok(m.actors.gardener);
  const rule = Object.values(m.rules)[0];
  assert.equal(rule.subject, 'plant');
});

test('a glossary addition becomes a concept pointer, never glossary data in the map', () => {
  const m = applyDiscovery(baseMap, discovery);
  assert.equal(m.glossary, undefined, 'the map must not carry a glossary object');
  assert.equal(m.subjects.plant.glossaryRef, 'care/plant', 'the subject points at the concept in the bundle');
  assert.equal(m.knowledge.bundle, 'knowledge');
  assert.equal(m.knowledge.okfVersion, '0.2');
});

test('a term with no Kontext lands in the shared area of the bundle', () => {
  const d = structuredClone(discovery);
  delete d.findings.glossaryAdditions[0].kontext;
  const m = applyDiscovery(baseMap, d);
  assert.equal(m.subjects.plant.glossaryRef, 'shared/plant');
});

test('creates a missing context referenced by a candidate', () => {
  const d = structuredClone(discovery);
  d.findings.capabilityCandidates[0].context = 'notifications';
  d.findings.placement[0].context = 'notifications';
  const m = applyDiscovery(baseMap, d);
  assert.ok(m.contexts.notifications, 'context auto-created');
});

test('applies a survey\'s revisions after the additive findings', () => {
  // candidate task-reminders is added by the findings, then retired by a revision in
  // the same survey — a "change" survey (retire-old + add-new) folds in cleanly.
  const d = structuredClone(discovery);
  d.revisions = [{ type: 'rename-context', context: 'care', newName: 'Plant Care', reason: 'clearer' }];
  const m = applyDiscovery(baseMap, d);
  assert.ok(m.capabilities['task-reminders'], 'additive finding still applied');
  assert.equal(m.contexts.care.name, 'Plant Care', 'revision applied on top');
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

test('folds findings.openQuestions onto the map, stamped with the origin feature and date', () => {
  const d = structuredClone(discovery);
  d.findings.openQuestions = [
    { question: 'How long do we retain logs?' },
    { question: 'Who owns the schedule?', context: 'care' },
  ];
  const m = applyDiscovery(baseMap, d);
  assert.equal(m.openQuestions.length, 2);
  const q = m.openQuestions[0];
  assert.equal(q.question, 'How long do we retain logs?');
  assert.deepEqual(q.feature, { slug: 's', description: 'd' });
  assert.equal(q.date, '2026-06-05');
  assert.equal(q.context, undefined);
  assert.equal(m.openQuestions[1].context, 'care');
});

test('open questions are idempotent — re-charting the same survey adds no duplicates', () => {
  const d = structuredClone(discovery);
  d.findings.openQuestions = [{ question: 'How long do we retain logs?' }];
  const once = applyDiscovery(baseMap, d);
  const twice = applyDiscovery(once, d);
  assert.equal(twice.openQuestions.length, 1);
});

test('the same question text under a different feature is kept separate', () => {
  const d1 = structuredClone(discovery);
  d1.findings.openQuestions = [{ question: 'Who owns it?' }];
  const d2 = structuredClone(discovery);
  d2.slug = 'other';
  d2.sources.description = 'Other feature';
  d2.findings.openQuestions = [{ question: 'Who owns it?' }];
  const m = applyDiscovery(applyDiscovery(baseMap, d1), d2);
  assert.equal(m.openQuestions.length, 2);
});

test('a survey with no openQuestions leaves the map array empty', () => {
  const m = applyDiscovery(baseMap, discovery);
  assert.deepEqual(m.openQuestions, []);
});

test('unannotatedDependencies returns edges missing a reason or any features', async () => {
  const { unannotatedDependencies } = await import('../workflows/lib/apply-discovery.js');
  const map = { dependencies: [
    { from: 'a', to: 'b', reason: 'r', features: ['x.feature'] }, // fully annotated
    { from: 'a', to: 'c', features: ['y.feature'] },              // missing reason
    { from: 'a', to: 'd', reason: 'r' },                          // missing features
    { from: 'a', to: 'e' },                                       // bare
  ] };
  const todo = unannotatedDependencies(map).map((d) => d.to);
  assert.deepEqual(todo, ['c', 'd', 'e']);
});

test('unannotatedDependencies on a map with no dependencies is empty', async () => {
  const { unannotatedDependencies } = await import('../workflows/lib/apply-discovery.js');
  assert.deepEqual(unannotatedDependencies({}), []);
});

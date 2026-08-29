import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsMigration, placementFor, planMigration, TODO_DESCRIPTION } from '../scripts/migrate-glossary-to-okf.js';
import { parseConcept } from '../workflows/lib/okf.js';

// A map in the pre-v0.18 shape: definitions live in the map, alongside a glossary object.
const legacy = () => ({
  version: '1',
  meta: { name: 'Garden' },
  contexts: { planning: { name: 'Planning', definition: 'Deciding what goes where.' } },
  capabilities: {
    'bed-layout': { name: 'Bed layout', context: 'planning', definition: 'Arrange beds in the garden.', derived: { maturity: 'vision', featureCount: 0, scenarioCount: 0 } },
  },
  subjects: { bed: { name: 'Bed', glossaryRef: 'bed' } },
  actors: { gardener: { name: 'Gardener' } },
  events: {},
  rules: { 'beds-need-size': { name: 'Beds need a size', statement: 'Every bed has a size.', subject: 'bed' } },
  glossary: {
    bed: { term: 'Bed', definition: 'A bounded growing area.', type: 'subjekt', aliasesToAvoid: ['plot'], related: [] },
  },
  dependencies: [],
});

const byId = (plan, id) => plan.concepts.find((c) => c.id === id);

test('a legacy map needs migration; a migrated one does not', () => {
  assert.equal(needsMigration(legacy()), true);
  const { map } = planMigration(legacy());
  assert.equal(needsMigration(map), false, 'migration is idempotent — a second run is a no-op');
  assert.equal(needsMigration({ contexts: {}, capabilities: {} }), false);
});

test('a map with only a glossary object still needs migration', () => {
  assert.equal(needsMigration({ contexts: {}, capabilities: {}, glossary: { x: {} } }), true);
});

test('placement: a capability sits in its context, a context in its own, everything else shared', () => {
  const m = legacy();
  assert.equal(placementFor(m, 'bed-layout', 'capability'), 'planning');
  assert.equal(placementFor(m, 'planning', 'kontext'), 'planning');
  assert.equal(placementFor(m, 'gardener', 'akteur'), 'shared');
});

test('context and capability definitions move into concepts and leave the map', () => {
  const plan = planMigration(legacy());
  assert.equal(plan.map.contexts.planning.definition, undefined, 'the map no longer holds the definition');
  assert.equal(plan.map.contexts.planning.name, 'Planning', 'the display name stays');
  assert.equal(plan.map.contexts.planning.glossaryRef, 'planning/planning');

  const ctx = parseConcept(byId(plan, 'planning/planning').text).frontmatter;
  assert.equal(ctx.type, 'Kontext');
  assert.equal(ctx.description, 'Deciding what goes where.');

  const cap = parseConcept(byId(plan, 'planning/bed-layout').text).frontmatter;
  assert.equal(cap.type, 'Capability');
  assert.equal(cap.description, 'Arrange beds in the garden.');
  assert.equal(plan.map.capabilities['bed-layout'].definition, undefined);
  assert.equal(plan.map.capabilities['bed-layout'].derived.maturity, 'vision', 'structure is untouched');
});

test("a rule's statement becomes its concept's description", () => {
  const plan = planMigration(legacy());
  const rule = parseConcept(byId(plan, 'shared/beds-need-size').text).frontmatter;
  assert.equal(rule.type, 'Regel');
  assert.equal(rule.description, 'Every bed has a size.');
  assert.equal(plan.map.rules['beds-need-size'].statement, undefined);
  assert.equal(plan.map.rules['beds-need-size'].subject, 'bed', 'the structural link survives');
});

test('an old glossary entry keeps its definition and aliases, and the object is dropped', () => {
  const plan = planMigration(legacy());
  const { frontmatter, body } = parseConcept(byId(plan, 'shared/bed').text);
  assert.equal(frontmatter.description, 'A bounded growing area.');
  assert.deepEqual(frontmatter.aliases_to_avoid, ['plot']);
  assert.match(body, /# Aliases to avoid/);
  assert.equal(plan.map.glossary, undefined);
  assert.equal(plan.map.subjects.bed.glossaryRef, 'shared/bed', 'the bare legacy slug is upgraded to a concept ID');
});

test('a node with a name but no definition becomes a labelled stub, never invented content', () => {
  const plan = planMigration(legacy());
  assert.deepEqual(plan.stubs, ['shared/gardener']);
  const { frontmatter, body } = parseConcept(byId(plan, 'shared/gardener').text);
  assert.equal(frontmatter.title, 'Gardener');
  assert.equal(frontmatter.description, TODO_DESCRIPTION);
  assert.match(body, /carried a name but no definition/);
});

test('everything migrated is draft and attributed to the migration, never human-verified', () => {
  const plan = planMigration(legacy());
  for (const c of plan.concepts) {
    const fm = parseConcept(c.text).frontmatter;
    assert.equal(fm.status, 'draft', `${c.id} must be draft until a human reviews it`);
    assert.equal(fm.generated.by, 'process:kartograph-migrate');
    assert.equal(fm.verified, undefined, `${c.id} must not claim verification`);
    assert.equal(fm.sources[0].resource, '../.kartograph/kartograph.json');
  }
});

test('a concept already on disk is pointed at, never overwritten', () => {
  const plan = planMigration(legacy(), { existing: new Set(['shared/bed']) });
  assert.equal(byId(plan, 'shared/bed'), undefined, 'no file is emitted for it');
  assert.equal(plan.map.subjects.bed.glossaryRef, 'shared/bed', 'but the pointer is still set');
  assert.equal(plan.map.glossary, undefined, 'and the map still loses its copy');
});

test('a glossaryRef that is already a concept ID keeps its placement', () => {
  const m = legacy();
  m.subjects.bed.glossaryRef = 'planning/bed';
  const plan = planMigration(m);
  assert.ok(byId(plan, 'planning/bed'), 'the existing placement is honoured');
  assert.equal(byId(plan, 'shared/bed'), undefined, 'no duplicate is written elsewhere');
});

test('the knowledge pointer is added and an existing one is respected', () => {
  assert.deepEqual(planMigration(legacy()).map.knowledge, { bundle: 'knowledge', okfVersion: '0.2' });
  const m = legacy();
  m.knowledge = { bundle: 'wissen', okfVersion: '0.2' };
  assert.equal(planMigration(m).map.knowledge.bundle, 'wissen');
});

test('an unmigrated map is rejected with an error that names the fix', async () => {
  const { validateKartograph } = await import('../scripts/validate-kartograph.js');
  const { valid, errors } = await validateKartograph(legacy());
  assert.equal(valid, false);
  assert.ok(errors[0].includes('predates v0.18') && errors[0].includes('/karto-sync'),
    `the first error must tell the user what to run, got: ${errors[0]}`);
  assert.ok(errors[0].includes('CLAUDE_PLUGIN_ROOT'),
    'the script path must be the plugin-root one a downstream project can actually run');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import {
  STEPS, STEP_KEYS, DEFAULT_PLAN, MODE_LABELS, isMode, step,
  normalizePlan, mergePlan, stepMode, describePlan, questionnaire, planFromAnswers,
} from '../workflows/lib/automation.js';
import { readPlan, writePlan } from '../workflows/lib/automation-store.js';
import { automationPath } from '../workflows/lib/paths.js';

const tmpProject = async () => {
  const root = await mkdtemp(join(tmpdir(), 'karto-automation-'));
  await mkdir(join(root, '.kartograph'), { recursive: true });
  return root;
};

test('the catalogue covers the pipeline and every step declares a valid default', () => {
  assert.deepEqual(STEP_KEYS, [
    'chart-after-explore', 'build-after-chart', 'acceptance-suite',
    'commit', 'rewalk-check', 'walk-after-build',
  ]);
  for (const s of STEPS) {
    assert.ok(s.modes.includes(s.default), `${s.key} default is one of its modes`);
    assert.ok(s.title && s.when, `${s.key} is described`);
    for (const m of s.modes) {
      assert.ok(MODE_LABELS[m], `mode ${m} has a label`);
      assert.ok(s.hints[m], `${s.key} explains mode ${m}`);
    }
  }
});

test('the defaults keep the old ask-before-continuing behaviour but stop running the full suite', () => {
  assert.deepEqual(DEFAULT_PLAN, {
    'chart-after-explore': 'ask',
    'build-after-chart': 'ask',
    'acceptance-suite': 'scenario',
    commit: 'auto',
    'rewalk-check': 'auto',
    'walk-after-build': 'manual',
  });
});

test('isMode and step only recognise the catalogue', () => {
  assert.equal(isMode('acceptance-suite', 'full'), true);
  assert.equal(isMode('acceptance-suite', 'auto'), false, 'suite modes are full|scenario|off');
  assert.equal(isMode('commit', 'ask'), false, 'commit is auto|manual only');
  assert.equal(isMode('nope', 'auto'), false);
  assert.equal(step('commit').default, 'auto');
  assert.equal(step('nope'), undefined);
});

test('normalizePlan fills the gaps and never throws on junk', () => {
  assert.deepEqual(normalizePlan(null).plan, DEFAULT_PLAN);
  assert.deepEqual(normalizePlan(undefined).plan, DEFAULT_PLAN);
  assert.deepEqual(normalizePlan('nonsense').plan, DEFAULT_PLAN);
  assert.deepEqual(normalizePlan([1, 2]).plan, DEFAULT_PLAN);
  assert.deepEqual(normalizePlan({}).plan, DEFAULT_PLAN);
});

test('normalizePlan warns and falls back rather than failing on a bad mode or unknown step', () => {
  const { plan, warnings } = normalizePlan({ 'acceptance-suite': 'sometimes', 'run-the-dishwasher': 'auto' });
  assert.equal(plan['acceptance-suite'], 'scenario', 'bad mode falls back to the default');
  assert.equal('run-the-dishwasher' in plan, false, 'unknown step is dropped');
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /sometimes/);
  assert.match(warnings[1], /run-the-dishwasher/);
});

test('normalizePlan accepts both the bare map and the stored {version, steps} envelope', () => {
  const bare = normalizePlan({ commit: 'manual' }).plan;
  const wrapped = normalizePlan({ version: 1, steps: { commit: 'manual' } }).plan;
  assert.deepEqual(bare, wrapped);
  assert.equal(bare.commit, 'manual');
  assert.deepEqual(normalizePlan({ version: 1, steps: { commit: 'manual' } }).warnings, [],
    'version/steps are envelope keys, not unknown steps');
});

test('mergePlan lays valid overrides over the base and ignores the rest', () => {
  const base = { ...DEFAULT_PLAN, commit: 'manual' };
  const merged = mergePlan(base, { 'acceptance-suite': 'full', 'rewalk-check': 'nope' });
  assert.equal(merged['acceptance-suite'], 'full', 'valid override wins');
  assert.equal(merged.commit, 'manual', 'untouched base value survives');
  assert.equal(merged['rewalk-check'], 'auto', 'invalid override is ignored, base/default stands');
});

test('mergePlan reads an override in the stored envelope shape too', () => {
  assert.equal(mergePlan({}, { version: 1, steps: { commit: 'manual' } }).commit, 'manual');
});

test('stepMode defaults safely and rejects an unknown step', () => {
  assert.equal(stepMode({}, 'commit'), 'auto');
  assert.equal(stepMode(null, 'walk-after-build'), 'manual');
  assert.equal(stepMode({ commit: 'bogus' }, 'commit'), 'auto');
  assert.equal(stepMode({ commit: 'manual' }, 'commit'), 'manual');
  assert.throws(() => stepMode({}, 'nope'), /unknown automation step/);
});

test('describePlan renders one labelled, explained row per step in catalogue order', () => {
  const rows = describePlan({ 'acceptance-suite': 'off' });
  assert.deepEqual(rows.map((r) => r.key), STEP_KEYS);
  const suite = rows.find((r) => r.key === 'acceptance-suite');
  assert.equal(suite.mode, 'off');
  assert.equal(suite.label, MODE_LABELS.off);
  assert.match(suite.hint, /unit-test/);
});

test('the questionnaire fits AskUserQuestion: at most 4 questions of at most 4 options', () => {
  const qs = questionnaire(DEFAULT_PLAN);
  assert.ok(qs.length <= 4, `${qs.length} questions`);
  for (const q of qs) {
    assert.ok(q.options.length >= 2 && q.options.length <= 4, `${q.header} has ${q.options.length} options`);
    assert.ok(q.question.endsWith('?'));
    assert.ok(q.header.length <= 12, `header "${q.header}" is at most 12 chars`);
    for (const o of q.options) assert.ok(o.step && o.mode, 'every option carries its step and mode');
  }
});

test('the questionnaire covers every step exactly once and lists the current mode first', () => {
  const plan = { ...DEFAULT_PLAN, 'acceptance-suite': 'off', 'chart-after-explore': 'auto' };
  const qs = questionnaire(plan);
  const covered = qs.flatMap((q) => q.options.map((o) => o.step));
  assert.deepEqual([...new Set(covered)].sort(), [...STEP_KEYS].sort());
  const single = qs.filter((q) => !q.multiSelect);
  for (const q of single) {
    assert.equal(q.options[0].mode, stepMode(plan, q.options[0].step), 'current mode leads');
    assert.match(q.options[0].label, /\(current\)/);
  }
  assert.equal(qs.filter((q) => q.multiSelect).length, 1, 'the toggles share one multi-select');
});

test('planFromAnswers applies the picks and reads an unchecked toggle as manual', () => {
  const base = { ...DEFAULT_PLAN, commit: 'auto', 'rewalk-check': 'auto', 'walk-after-build': 'auto' };
  const plan = planFromAnswers(base, [
    { step: 'chart-after-explore', mode: 'auto' },
    { step: 'acceptance-suite', mode: 'full' },
    { step: 'commit', mode: 'auto' },
  ]);
  assert.equal(plan['chart-after-explore'], 'auto');
  assert.equal(plan['acceptance-suite'], 'full');
  assert.equal(plan.commit, 'auto', 'checked toggle stays auto');
  assert.equal(plan['rewalk-check'], 'manual', 'unchecked toggle is turned off');
  assert.equal(plan['walk-after-build'], 'manual', 'unchecked toggle is turned off');
  assert.equal(plan['build-after-chart'], 'ask', 'an unanswered single-choice step keeps its base value');
});

test('planFromAnswers ignores selections that are not in the catalogue', () => {
  const plan = planFromAnswers(DEFAULT_PLAN, [
    { step: 'commit', mode: 'ask' },
    { step: 'nope', mode: 'auto' },
    null,
  ]);
  assert.equal(plan.commit, 'manual', 'an invalid mode leaves the toggle unpicked, so it is off');
  assert.equal('nope' in plan, false);
});

test('readPlan returns the defaults when no file exists, and says so', async () => {
  const root = await tmpProject();
  const { plan, warnings, exists } = await readPlan(root);
  assert.deepEqual(plan, DEFAULT_PLAN);
  assert.deepEqual(warnings, []);
  assert.equal(exists, false);
});

test('readPlan survives a garbled file instead of blocking the pipeline', async () => {
  const root = await tmpProject();
  await writeFile(automationPath(root), '{ not json');
  const { plan, warnings, exists } = await readPlan(root);
  assert.deepEqual(plan, DEFAULT_PLAN);
  assert.equal(exists, true);
  assert.match(warnings[0], /not valid JSON/);
});

test('writePlan round-trips through readPlan and writes the full envelope', async () => {
  const root = await tmpProject();
  await writePlan(root, { ...DEFAULT_PLAN, 'acceptance-suite': 'off', commit: 'manual' });
  const written = JSON.parse(await readFile(automationPath(root), 'utf8'));
  assert.equal(written.version, 1);
  assert.deepEqual(Object.keys(written.steps), STEP_KEYS, 'every step is written, in catalogue order');
  const { plan, exists } = await readPlan(root);
  assert.equal(exists, true);
  assert.equal(plan['acceptance-suite'], 'off');
  assert.equal(plan.commit, 'manual');
  assert.equal(plan['chart-after-explore'], 'ask');
});

test('writePlan normalises a partial or dirty plan before storing it', async () => {
  const root = await tmpProject();
  await writePlan(root, { commit: 'manual', 'acceptance-suite': 'bogus' });
  const { plan, warnings } = await readPlan(root);
  assert.deepEqual(warnings, [], 'what lands on disk is always clean');
  assert.equal(plan.commit, 'manual');
  assert.equal(plan['acceptance-suite'], 'scenario');
});

test('the discovery schema stamps the same steps and modes as the catalogue', () => {
  const schema = JSON.parse(readFileSync(new URL('../schemas/v1/discovery.schema.json', import.meta.url), 'utf8'));
  const stamped = schema.properties.automation;
  assert.equal(stamped.additionalProperties, false);
  assert.deepEqual(Object.keys(stamped.properties), STEP_KEYS, 'schema and catalogue agree on the steps');
  for (const s of STEPS) assert.deepEqual(stamped.properties[s.key].enum, s.modes, `${s.key} modes agree`);
  assert.equal((schema.required || []).includes('automation'), false, 'a survey without a stamp stays valid');
});

// --- the autonomous orchestrator ------------------------------------------------
// /karto-build-all is autonomous by definition, so only two steps mean anything to it:
// `acceptance-suite` and `commit`. The workflow script cannot read the filesystem, so the
// command reads the policy and passes it in `args.automation`; these tests run the real
// script body the way the runtime does (see test/workflow-args.test.js) and assert the
// policy reaches the subagent prompts.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function runBuildAll(automation) {
  const src = await readFile(new URL('../workflows/internal/build-all.js', import.meta.url), 'utf8');
  const fn = new AsyncFunction('agent', 'phase', 'parallel', 'pipeline', 'log', 'args',
    src.replace(/export\s+const\s+meta/, 'const meta'));
  const prompts = [];
  const agent = async (prompt) => { prompts.push(prompt); return { status: 'built', scenariosDeveloped: ['S'] }; };
  const plan = { order: [{ capability: 'watering', context: 'garden', dependsOn: [], openScenarios: [{ feature: 'w.feature', name: 'S', class: 'happy' }] }], skippedEmpty: [] };
  await fn(agent, () => {}, async (t) => Promise.all(t.map((x) => x())), () => {}, () => {},
    { plan, projectRoot: '.', pluginRoot: '.', automation });
  return prompts[0];
}

test('build-all tells its subagents to run only the scenario by default', async () => {
  const prompt = await runBuildAll(undefined);
  assert.match(prompt, /ONLY the scenario being built/);
  assert.doesNotMatch(prompt, /WHOLE acceptance/);
  assert.match(prompt, /Commit your work/);
});

test('build-all passes the full-suite policy through to its subagents', async () => {
  const prompt = await runBuildAll({ 'acceptance-suite': 'full' });
  assert.match(prompt, /WHOLE acceptance\/e2e suite/);
  assert.doesNotMatch(prompt, /ONLY the scenario being built/);
});

test('build-all disables the outer loop when the policy says off', async () => {
  const prompt = await runBuildAll({ 'acceptance-suite': 'off' });
  assert.match(prompt, /DISABLED by the project automation policy/);
});

test('build-all stops its subagents committing when the policy says manual', async () => {
  const prompt = await runBuildAll({ commit: 'manual' });
  assert.match(prompt, /Do NOT commit/);
  assert.doesNotMatch(prompt, /- Commit your work/);
});

test('build-all falls back to the defaults on a garbled policy rather than failing', async () => {
  const prompt = await runBuildAll({ 'acceptance-suite': 'sometimes', commit: 'whenever' });
  assert.match(prompt, /ONLY the scenario being built/);
  assert.match(prompt, /Commit your work/);
});

# Kartograph M2 + M3 — Chart & Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Add the writing phases. **M2 (chart):** record an approved survey onto the map, grow the glossary, generate tagged Gherkin scenarios, write ADRs, and **reconcile maturity from the `.feature` files** — the moment maturity stops being a claim and becomes a computed fact. **M3 (build):** implement a capability's open scenarios with double-loop TDD, configured per project.

**Architecture:** Deterministic, pure modules do the load-bearing work and are unit-tested: a Gherkin parser, maturity derivation, the discovery→map transform, and reconciliation. The creative work (writing scenario prose, ADR text, code) is done by subagents/skills. `/karto-chart` orchestrates: load+validate the latest survey → groom → generate `.feature`/ADR files → apply the discovery to the map (pure) → reconcile maturity from disk (pure) → validate → atomic write → pause. `/karto-build` is an interactive main-session command (not a background workflow — TDD needs the loop) that uses `superpowers:test-driven-development`.

**Tech Stack:** As before — Node ≥ 20, `node:test`, `ajv`. New pure modules import `slugify` from `workflows/lib/survey.js`.

**Testing reality:** Pure modules (`gherkin`, `reconcile`, `apply-discovery`, `open-scenarios`) and the `reconcile`/`config` validators are fully unit-tested. Live behavior of `/karto-chart` and `/karto-build` (subagent generation, TDD loop) is verified manually in Claude Code (final checklist).

---

## File Structure (new)

```
workflows/lib/gherkin.js            parseFeature(), scenarioClass()          [pure]
workflows/lib/maturity-derive.js    deriveMaturity()                          [pure]
workflows/lib/apply-discovery.js    applyDiscovery(map, discovery)            [pure]
workflows/lib/open-scenarios.js     openScenarios(features)                   [pure]
scripts/reconcile.js                reconcileMap() + CLI (read features, write derived)
schemas/v1/config.schema.json       kartograph/config.json shape (M3)
kartograph/config.example.json      example project stack config
skills/karto-groom-glossary/SKILL.md
skills/karto-groom-adr/SKILL.md
commands/karto-chart.md
commands/karto-groom.md
commands/karto-build.md
workflows/chart.js                  generate scenarios + ADR prose (subagents)
test/gherkin.test.js
test/maturity-derive.test.js
test/apply-discovery.test.js
test/open-scenarios.test.js
test/reconcile.test.js
test/config-schema.test.js
```

---

## Task 1: Gherkin parser (TDD)

**Files:** Create `workflows/lib/gherkin.js`; `test/gherkin.test.js`.

- [ ] **Step 1: Test** `test/gherkin.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeature, scenarioClass } from '../workflows/lib/gherkin.js';

const sample = `@watering
Feature: Watering schedule

  @happy
  Scenario: water due today
    Given a plant due for watering
    When the day starts
    Then a reminder is shown

  @edge
  Scenario: already watered
    Given a plant watered today
    Then no reminder is shown

  @error
  Scenario Outline: sensor offline
    Given the moisture sensor is offline
`;

test('parseFeature extracts the feature title and scenarios with tags', () => {
  const r = parseFeature(sample);
  assert.equal(r.feature, 'Watering schedule');
  assert.equal(r.scenarios.length, 3);
  assert.deepEqual(r.scenarios.map(s => s.name), ['water due today', 'already watered', 'sensor offline']);
  assert.ok(r.scenarios[0].tags.includes('@happy'));
  assert.ok(r.scenarios[2].tags.includes('@error'));
});

test('feature-level tags do not leak onto the first scenario', () => {
  const r = parseFeature(sample);
  assert.ok(!r.scenarios[0].tags.includes('@watering'));
});

test('scenarioClass maps tags to happy/edge/error, error wins', () => {
  assert.equal(scenarioClass(['@happy']), 'happy');
  assert.equal(scenarioClass(['@edge']), 'edge');
  assert.equal(scenarioClass(['@happy', '@error']), 'error');
  assert.equal(scenarioClass(['@todo']), null);
});

test('parseFeature on empty text yields no scenarios', () => {
  assert.deepEqual(parseFeature('').scenarios, []);
});
```

- [ ] **Step 2:** `node --test test/gherkin.test.js` → FAIL.
- [ ] **Step 3:** Create `workflows/lib/gherkin.js`:

```javascript
// Minimal Gherkin reader: feature title + scenarios with their tags.
// Tags accumulate on lines above a Scenario and attach to the next one;
// the Feature line resets pending tags so feature-level tags don't leak.
export function parseFeature(text) {
  const scenarios = [];
  let pending = [];
  let feature = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('@')) {
      pending.push(...line.split(/\s+/).filter((t) => t.startsWith('@')));
    } else if (/^Feature:/i.test(line)) {
      feature = line.replace(/^Feature:\s*/i, '').trim();
      pending = [];
    } else if (/^Scenario(\s+Outline)?:/i.test(line)) {
      scenarios.push({ name: line.replace(/^Scenario(\s+Outline)?:\s*/i, '').trim(), tags: pending });
      pending = [];
    }
  }
  return { feature, scenarios };
}

export function scenarioClass(tags) {
  const t = tags || [];
  if (t.includes('@error')) return 'error';
  if (t.includes('@edge')) return 'edge';
  if (t.includes('@happy')) return 'happy';
  return null;
}
```

- [ ] **Step 4:** `node --test test/gherkin.test.js` → 4 PASS.
- [ ] **Step 5:** Commit: `git add workflows/lib/gherkin.js test/gherkin.test.js && git commit -m "feat: add minimal gherkin parser"`

---

## Task 2: Maturity derivation (TDD)

**Files:** Create `workflows/lib/maturity-derive.js`; `test/maturity-derive.test.js`.

- [ ] **Step 1: Test** `test/maturity-derive.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveMaturity } from '../workflows/lib/maturity-derive.js';

test('no features -> vision', () => {
  assert.equal(deriveMaturity({ featureCount: 0, scenarioCount: 0, classes: new Set() }), 'vision');
});
test('features but no scenarios -> sketched', () => {
  assert.equal(deriveMaturity({ featureCount: 2, scenarioCount: 0, classes: new Set() }), 'sketched');
});
test('only happy -> building', () => {
  assert.equal(deriveMaturity({ featureCount: 1, scenarioCount: 3, classes: new Set(['happy']) }), 'building');
});
test('happy + edge -> usable', () => {
  assert.equal(deriveMaturity({ featureCount: 1, scenarioCount: 4, classes: new Set(['happy', 'edge']) }), 'usable');
});
test('happy + edge + error -> stable', () => {
  assert.equal(deriveMaturity({ featureCount: 1, scenarioCount: 6, classes: new Set(['happy', 'edge', 'error']) }), 'stable');
});
test('scenarios with no recognized class still count as building', () => {
  assert.equal(deriveMaturity({ featureCount: 1, scenarioCount: 2, classes: new Set() }), 'building');
});
```

- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Create `workflows/lib/maturity-derive.js`:

```javascript
// The maturity ladder, derived from on-disk feature/scenario state.
// vision is the only declared seed; everything else is computed here.
export function deriveMaturity({ featureCount, scenarioCount, classes }) {
  if (!featureCount) return 'vision';
  if (!scenarioCount) return 'sketched';
  if (classes.has('error')) return 'stable';
  if (classes.has('edge')) return 'usable';
  return 'building';
}
```

- [ ] **Step 4:** 6 PASS.
- [ ] **Step 5:** Commit: `git add workflows/lib/maturity-derive.js test/maturity-derive.test.js && git commit -m "feat: add maturity derivation from scenario coverage"`

---

## Task 3: Reconcile map (TDD)

**Files:** Create `scripts/reconcile.js`; `test/reconcile.test.js`.

`reconcileMap` is pure (takes pre-read features). The CLI globs `features/<context>/<capability>/*.feature`, parses, reconciles, validates, atomic-writes.

- [ ] **Step 1: Test** `test/reconcile.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileMap } from '../scripts/reconcile.js';

const map = {
  version: '1', meta: { name: 'X' },
  contexts: { care: { name: 'Care', definition: 'd' } },
  capabilities: {
    'watering-schedule': { name: 'W', context: 'care', definition: 'd', declaredStage: null, derived: { maturity: 'vision', featureCount: 0, scenarioCount: 0 } },
    'task-reminders': { name: 'T', context: 'care', definition: 'd', declaredStage: 'vision', derived: { maturity: 'vision', featureCount: 0, scenarioCount: 0 } },
  },
};

test('reconcileMap recomputes derived blocks from features', () => {
  const featuresByCapability = {
    'watering-schedule': [
      { scenarios: [{ tags: ['@happy'] }, { tags: ['@edge'] }] },
    ],
  };
  const out = reconcileMap(map, featuresByCapability);
  assert.deepEqual(out.capabilities['watering-schedule'].derived, { maturity: 'usable', featureCount: 1, scenarioCount: 2 });
  // capability with no features stays vision
  assert.equal(out.capabilities['task-reminders'].derived.maturity, 'vision');
});

test('reconcileMap does not mutate its input', () => {
  const before = JSON.stringify(map);
  reconcileMap(map, {});
  assert.equal(JSON.stringify(map), before);
});
```

- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Create `scripts/reconcile.js`:

```javascript
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFeature, scenarioClass } from '../workflows/lib/gherkin.js';
import { deriveMaturity } from '../workflows/lib/maturity-derive.js';
import { validateKartograph } from './validate-kartograph.js';

// Pure: recompute every capability's derived block from pre-read features.
// featuresByCapability: { capSlug: [{ scenarios: [{ tags }] }] }
export function reconcileMap(map, featuresByCapability) {
  const next = structuredClone(map);
  for (const [slug, cap] of Object.entries(next.capabilities || {})) {
    const files = featuresByCapability[slug] || [];
    let scenarioCount = 0;
    const classes = new Set();
    for (const f of files) for (const s of f.scenarios || []) {
      scenarioCount++;
      const c = scenarioClass(s.tags);
      if (c) classes.add(c);
    }
    cap.derived = { maturity: deriveMaturity({ featureCount: files.length, scenarioCount, classes }), featureCount: files.length, scenarioCount };
  }
  return next;
}

// Read all .feature files for a capability from features/<context>/<slug>/.
async function readFeaturesByCapability(root, map) {
  const out = {};
  for (const [slug, cap] of Object.entries(map.capabilities || {})) {
    const dir = join(root, 'features', cap.context, slug);
    let entries = [];
    try { entries = await readdir(dir); } catch { entries = []; }
    const files = [];
    for (const name of entries) {
      if (!name.endsWith('.feature')) continue;
      const text = await readFile(join(dir, name), 'utf8');
      files.push(parseFeature(text));
    }
    out[slug] = files;
  }
  return out;
}

// CLI: node scripts/reconcile.js [kartograph.json] — recompute + atomic write.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const mapPath = process.argv[2] || join(root, 'kartograph.json');
  const map = JSON.parse(await readFile(mapPath, 'utf8'));
  const featuresByCapability = await readFeaturesByCapability(root, map);
  const next = reconcileMap(map, featuresByCapability);
  const { valid, errors } = await validateKartograph(next);
  if (!valid) { console.error('INVALID after reconcile:'); for (const e of errors) console.error('  - ' + e); process.exit(1); }
  await writeFile(mapPath, JSON.stringify(next, null, 2) + '\n');
  console.log(`reconciled ${mapPath}`);
}

export { readFeaturesByCapability };
```

- [ ] **Step 4:** `node --test test/reconcile.test.js` → 2 PASS.
- [ ] **Step 5:** Integration check: create `features/care/watering-schedule/water.feature` with a `@happy` Scenario in a temp dir holding a copy of `examples/demo.kartograph.json` as `kartograph.json`, run `node scripts/reconcile.js` there, confirm the capability's `derived` updates and the file stays schema-valid. (Manual one-off; no committed test for the CLI fs-glob to keep it simple.)
- [ ] **Step 6:** Commit: `git add scripts/reconcile.js test/reconcile.test.js && git commit -m "feat: add maturity reconciliation from .feature files"`

---

## Task 4: Apply discovery to map (TDD)

**Files:** Create `workflows/lib/apply-discovery.js`; `test/apply-discovery.test.js`.

Pure transform `applyDiscovery(map, discovery)` → next map. Idempotent (never duplicates an existing slug); keeps referential integrity (auto-creates a context for a candidate that names a new one; only links a rule's subject when it exists; ADR ids auto-numbered).

- [ ] **Step 1: Test** `test/apply-discovery.test.js`:

```javascript
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
```

- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Create `workflows/lib/apply-discovery.js`:

```javascript
import { slugify } from './survey.js';

const COLLECTIONS = ['contexts', 'capabilities', 'subjects', 'actors', 'events', 'rules', 'glossary', 'adrs'];

function titleCase(slug) {
  return String(slug).split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function nextAdrNumber(adrs) {
  let max = 0;
  for (const id of Object.keys(adrs || {})) {
    const m = /^(\d{4})-/.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return String(max + 1).padStart(4, '0');
}

// Pure: fold a validated discovery document into the map. Idempotent.
export function applyDiscovery(map, discovery) {
  const next = structuredClone(map);
  for (const c of COLLECTIONS) next[c] ||= {};
  next.dependencies ||= [];
  const f = discovery.findings;
  const hasGlossary = new Set(f.glossaryAdditions.map((g) => g.slug));

  for (const c of f.capabilityCandidates) {
    if (!next.contexts[c.context]) {
      next.contexts[c.context] = { name: titleCase(c.context), definition: `Area: ${titleCase(c.context)}.` };
    }
    if (!next.capabilities[c.slug]) {
      next.capabilities[c.slug] = {
        name: c.name, context: c.context, definition: c.definition,
        declaredStage: 'vision', derived: { maturity: 'vision', featureCount: 0, scenarioCount: 0 },
      };
    }
  }
  for (const s of f.subjects) {
    if (!next.subjects[s.slug]) {
      next.subjects[s.slug] = hasGlossary.has(s.slug) ? { name: s.name, glossaryRef: s.slug } : { name: s.name };
    }
  }
  for (const group of ['actors', 'events']) {
    for (const n of f[group]) {
      if (!next[group][n.slug]) next[group][n.slug] = hasGlossary.has(n.slug) ? { name: n.name, glossaryRef: n.slug } : { name: n.name };
    }
  }
  for (const g of f.glossaryAdditions) {
    if (!next.glossary[g.slug]) {
      next.glossary[g.slug] = { term: g.term, definition: g.definition, type: g.type };
      if (g.aliasesToAvoid) next.glossary[g.slug].aliasesToAvoid = g.aliasesToAvoid;
    }
  }
  for (const r of f.rules) {
    const slug = r.slug || slugify(r.name);
    if (slug && !next.rules[slug]) {
      const rule = { name: r.name, statement: r.statement };
      if (r.subject && next.subjects[r.subject]) rule.subject = r.subject;
      next.rules[slug] = rule;
    }
  }
  for (const a of f.adrCandidates) {
    const exists = Object.values(next.adrs).some((x) => x.title === a.title);
    if (!exists) {
      const id = `${nextAdrNumber(next.adrs)}-${slugify(a.title)}`;
      next.adrs[id] = {
        id, title: a.title, status: 'proposed', date: discovery.date,
        contexts: a.contexts || [], capabilities: a.capabilities || [], supersedes: null,
      };
    }
  }
  return next;
}
```

- [ ] **Step 4:** `node --test test/apply-discovery.test.js` → 6 PASS.
- [ ] **Step 5: Cross-check** with the real gate: in a quick `node -e`, build `applyDiscovery(seed, discovery)` from `examples/kartograph.seed.json` and assert `validateKartograph` returns valid. Fix any integrity gap. (Add as a test if convenient.)
- [ ] **Step 6:** Commit: `git add workflows/lib/apply-discovery.js test/apply-discovery.test.js && git commit -m "feat: add idempotent discovery->map transform"`

---

## Task 5: Open scenarios + config schema (TDD) — M3 deterministic core

**Files:** Create `workflows/lib/open-scenarios.js`, `test/open-scenarios.test.js`, `schemas/v1/config.schema.json`, `kartograph/config.example.json`, `test/config-schema.test.js`.

`/karto-build` implements scenarios that aren't done yet. A scenario is **done** when tagged `@done`; **open** otherwise.

- [ ] **Step 1: Test** `test/open-scenarios.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openScenarios } from '../workflows/lib/open-scenarios.js';

const features = [
  { feature: 'A', scenarios: [{ name: 'happy path', tags: ['@happy'] }, { name: 'done one', tags: ['@happy', '@done'] }] },
];

test('openScenarios returns only scenarios not tagged @done', () => {
  const open = openScenarios(features);
  assert.equal(open.length, 1);
  assert.equal(open[0].name, 'happy path');
});
```

- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Create `workflows/lib/open-scenarios.js`:

```javascript
// A scenario is "open" until it's tagged @done.
export function openScenarios(features) {
  const open = [];
  for (const f of features || []) for (const s of f.scenarios || []) {
    if (!(s.tags || []).includes('@done')) open.push({ feature: f.feature, ...s });
  }
  return open;
}
```

- [ ] **Step 4:** PASS.
- [ ] **Step 5: Test** `test/config-schema.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

async function v() {
  const dir = new URL('../schemas/v1/', import.meta.url);
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(JSON.parse(await readFile(new URL('config.schema.json', dir))));
  return ajv.getSchema('https://kartograph.dev/schemas/v1/config.schema.json');
}

test('the example config validates', async () => {
  const validate = await v();
  const cfg = JSON.parse(await readFile(new URL('../kartograph/config.example.json', import.meta.url)));
  assert.equal(validate(cfg), true, JSON.stringify(validate.errors));
});

test('a config missing testCommand is rejected', async () => {
  const validate = await v();
  assert.equal(validate({ language: 'typescript', codeDir: 'src' }), false);
});
```

- [ ] **Step 6:** FAIL.
- [ ] **Step 7:** Create `schemas/v1/config.schema.json`:

```json
{
  "$id": "https://kartograph.dev/schemas/v1/config.schema.json",
  "type": "object",
  "additionalProperties": false,
  "required": ["language", "testCommand", "codeDir"],
  "properties": {
    "language": { "type": "string", "minLength": 1 },
    "testCommand": { "type": "string", "minLength": 1 },
    "acceptanceCommand": { "type": "string" },
    "codeDir": { "type": "string", "minLength": 1 },
    "stepDefinitions": { "type": "string" },
    "notes": { "type": "string" }
  }
}
```

- [ ] **Step 8:** Create `kartograph/config.example.json`:

```json
{
  "language": "typescript",
  "testCommand": "npm test",
  "acceptanceCommand": "npm run cucumber",
  "codeDir": "src",
  "stepDefinitions": "features/steps",
  "notes": "How .feature scenarios bind to step definitions and how to run unit vs acceptance tests."
}
```

- [ ] **Step 9:** `node --test test/open-scenarios.test.js test/config-schema.test.js` → all PASS.
- [ ] **Step 10:** Commit: `git add workflows/lib/open-scenarios.js test/open-scenarios.test.js schemas/v1/config.schema.json kartograph/config.example.json test/config-schema.test.js && git commit -m "feat: add open-scenarios helper and build config schema"`

---

## Task 6: Grooming skills + `/karto-groom` command (authored)

**Files:** Create `skills/karto-groom-glossary/SKILL.md`, `skills/karto-groom-adr/SKILL.md`, `commands/karto-groom.md`.

- [ ] **Step 1:** `skills/karto-groom-glossary/SKILL.md` (frontmatter `name`, `description`). Body: operate on the project glossary in `kartograph.json`; enforce **one canonical term per concept** with synonyms listed under `aliasesToAvoid`; flag ambiguities (same word, two meanings) and collisions (two words, one meaning); keep definitions to one tight sentence; preserve `type`; incremental re-run merges new terms. Output must stay schema-valid (`schemas/v1/glossary.schema.json`). It proposes edits; the caller writes them atomically.
- [ ] **Step 2:** `skills/karto-groom-adr/SKILL.md`. Body: maintain ADRs in `kartograph/decisions/NNNN-slug.md` (MADR: title + 1–3 sentences; optional Status/Options/Consequences); sequential numbering (scan existing, increment); supersession (`supersedes` + mark the old one `superseded`); the worthiness test (hard-to-reverse AND surprising AND real-trade-off). Keep `kartograph.json.adrs` metadata in sync with the files.
- [ ] **Step 3:** `commands/karto-groom.md` (frontmatter `description`). Body: run both grooming skills on the current map on demand (glossary then ADRs), show a diff, validate with `validate-kartograph.js`, write atomically, and report.
- [ ] **Step 4:** Commit: `git add skills/karto-groom-glossary skills/karto-groom-adr commands/karto-groom.md && git commit -m "feat: add glossary/ADR grooming skills and /karto-groom"`

---

## Task 7: `chart.js` workflow + `/karto-chart` command (authored)

**Files:** Create `workflows/chart.js`; `commands/karto-chart.md`; modify `.claude-plugin/plugin.json`.

- [ ] **Step 1:** `workflows/chart.js` — dynamic workflow. `export const meta = { name: 'karto-chart', description: '...', phases: [{ title: 'Scenarios' }, { title: 'Decisions' }] }`. `args: { discoveryPath, mapPath }`. Phase 'Scenarios' — for each capability candidate / affected capability in the discovery, an `agent` writes a tagged `.feature` file (Gherkin with `@happy`/`@edge`/`@error` scenarios) to `features/<context>/<capability>/<feature-slug>.feature` (agents have write tools). Phase 'Decisions' — for each accepted ADR candidate, an `agent` writes `kartograph/decisions/<id>.md` (MADR). Return a small summary object `{ featureFiles: [...], adrFiles: [...] }`. Runtime globals only.
- [ ] **Step 2:** `node`-parse check using the AsyncFunction technique (see `test/workflow-structure.test.js`).
- [ ] **Step 3:** `commands/karto-chart.md` (frontmatter `description`). Body steps: (1) find the latest `kartograph/surveys/*.discovery.json` (or one passed in `$ARGUMENTS`); validate it with `validate-discovery.js`. (2) Invoke `karto-groom-glossary` and `karto-groom-adr` on the planned additions. (3) Apply the discovery to the map deterministically: `node -e` using `workflows/lib/apply-discovery.js` (read map + discovery, write the transformed map to a temp file). (4) Invoke the **Workflow** tool with `scriptPath: ${CLAUDE_PLUGIN_ROOT}/workflows/chart.js`, `args: { discoveryPath, mapPath: "kartograph.json" }` to generate the `.feature` files and ADR `.md` files. (5) Reconcile maturity from the new files: `node ${CLAUDE_PLUGIN_ROOT}/scripts/reconcile.js`. (6) Validate the final `kartograph.json` with `validate-kartograph.js`; on failure, stop and report (the map is not left half-written — write to a temp and move only on success). (7) **Pause and ask**: continue with `/karto-build <capability>` or review the diff first.
- [ ] **Step 4:** Register `./commands/karto-chart.md`, `./commands/karto-groom.md` in `plugin.json` `commands` and `./skills/karto-groom-glossary`, `./skills/karto-groom-adr` in `skills`. Verify it parses.
- [ ] **Step 5:** Commit: `git add workflows/chart.js commands/karto-chart.md commands/karto-groom.md .claude-plugin/plugin.json && git commit -m "feat: add /karto-chart command and chart workflow"`

---

## Task 8: `/karto-build` command (authored) — M3

**Files:** Create `commands/karto-build.md`; modify `.claude-plugin/plugin.json`.

- [ ] **Step 1:** `commands/karto-build.md` (frontmatter `description`). Body: implement the open scenarios of the capability named in `$ARGUMENTS` with **double-loop TDD**:
  1. Read `kartograph/config.json` (language, testCommand, acceptanceCommand, codeDir, stepDefinitions). If absent, tell the user to copy `${CLAUDE_PLUGIN_ROOT}/kartograph/config.example.json` to `kartograph/config.json` and fill it in, then stop.
  2. List the capability's `.feature` files under `features/<context>/<capability>/` and their **open** scenarios (those not tagged `@done`).
  3. For each open scenario: **outer loop** — run it via the acceptance command and watch it fail; **inner loop** — use the `superpowers:test-driven-development` skill to drive the implementation unit by unit (Red→Green→Refactor, Iron Law) until the outer scenario passes; then tag the scenario `@done` in its `.feature` file.
  4. After scenarios close, run `node ${CLAUDE_PLUGIN_ROOT}/scripts/reconcile.js` so the capability's maturity re-derives, then `/karto-show` to see it move.
  5. Commit per scenario. Work `@happy → @edge → @error` in order.
- [ ] **Step 2:** Register `./commands/karto-build.md` in `plugin.json`. Verify parses.
- [ ] **Step 3:** Commit: `git add commands/karto-build.md .claude-plugin/plugin.json && git commit -m "feat: add /karto-build command (double-loop TDD)"`

---

## Task 9: Extend structural checks + final verify

**Files:** modify `test/workflow-structure.test.js`.

- [ ] **Step 1:** Extend the existing structural test to also cover: `workflows/chart.js` (parses as a workflow body; has `meta` with name/description/phases); the new skills (`karto-groom-glossary`, `karto-groom-adr`) frontmatter; the new commands (`karto-chart`, `karto-groom`, `karto-build`) frontmatter; and that `plugin.json` now registers all five commands and all four skills.
- [ ] **Step 2:** Run `npm test` — all suites pass.
- [ ] **Step 3:** Bump `version` to `0.2.0` in both `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` (the plugin entry) so users get the update.
- [ ] **Step 4:** Commit: `git add -A && git commit -m "test: structural checks for chart/build; bump to 0.2.0"`

---

## Final verification

- [ ] `npm test` — all green.
- [ ] `npm run validate` — OK.
- [ ] **Manual (Claude Code):** `/karto-explore` → `/karto-chart` on a scratch project: confirm `.feature` files appear with tags, ADRs get written, `kartograph.json` updates with derived maturity, and the map stays schema-valid. Then `/karto-build <capability>` with a filled `kartograph/config.json`: confirm a scenario goes red → green and the capability's maturity climbs. Record results in the PR/commit.

---

## Self-Review (planning)

- **Spec coverage:** chart writes map+glossary+features+ADRs §9.2 (Tasks 4,6,7); maturity reconciliation §1/§6 (Tasks 1–3); grooming agents §13 (Task 6); `/karto-groom` standalone §13 (Task 6); pause-and-ask §11 (Task 7); double-loop TDD build §9.3 (Task 8); project config §10/§9.3 (Task 5); deterministic gate reused for chart (Task 7 step 6). 
- **Consistency:** `parseFeature`/`scenarioClass`/`deriveMaturity`/`reconcileMap`/`applyDiscovery`/`openScenarios` names align across modules and tests; `@done` is the single "implemented" marker, shared by `open-scenarios` (read) and `/karto-build` (write).
- **No placeholders:** deterministic modules ship complete code with tests; prompt artifacts specify exact required behavior and are structurally enforced (Task 9). Note: `applyDiscovery` auto-creates a context with a generic definition for a candidate naming a new context — flagged for grooming, not a TODO.
- **Honest limit:** live chart/build behavior verified manually (final checklist).
```

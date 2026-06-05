# Kartograph M1b — Explore & Init Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add the AI-workflow half of Kartograph — `/karto-explore` (interactive survey + background discovery workflow), `/karto-init` (bootstrap a draft map from an existing repo), the `karto-grill` and `karto-analyze-repo` skills, and the `discovery.schema.json` gate — building on M1a's schemas and validator.

**Architecture:** Each command is a thin `commands/*.md` prompt that invokes the **Workflow tool** with `scriptPath: ${CLAUDE_PLUGIN_ROOT}/workflows/<name>.js` and `args` (the command stamps `{date, slug}` since the workflow runtime cannot call `Date`). Workflow scripts orchestrate subagents whose structured output is gated by `discovery.schema.json` via `agent({schema})`. Interactive grilling happens **before** the workflow, in the main session, via the `karto-grill` skill. Pure helpers (slugify, survey filename) live in importable, unit-tested modules; the workflow scripts stay thin.

**Tech Stack:** Same as M1a — Node ≥ 20, `node:test`, `ajv`. Workflow scripts are plain ESM run by the Claude Code workflow runtime (no imports of npm modules inside the script body; they use the runtime globals `agent`/`phase`/`parallel`/`args`/`log`).

**Testing reality (read this):** Workflow *behavior* (live subagent orchestration) cannot be exercised in CI. This plan unit-tests what is deterministic — the `discovery.schema.json` gate and the pure helper modules — and **structurally** checks the prompt artifacts (valid frontmatter, `node --check` syntax, required `export const meta` with `name`/`description`/`phases`, schema wiring). End-to-end verification of `/karto-explore` and `/karto-init` is a **manual** step in Claude Code, listed at the end.

---

## Conventions

- Slugs `^[a-z0-9][a-z0-9-]*$`. Survey files: `kartograph/surveys/YYYY-MM-DD-<slug>.discovery.json`.
- Workflow scripts: `workflows/<name>.js`, beginning `export const meta = { name, description, phases }`.
- Skills: `skills/<name>/SKILL.md` with YAML frontmatter (`name`, `description`).
- Commands: `commands/<name>.md` with frontmatter (`description`).
- Register new commands/skills in `.claude-plugin/plugin.json`.

## File Structure

```
schemas/v1/discovery.schema.json     explore gate
workflows/lib/survey.js              slugify(), surveyFilename()  [pure, tested]
workflows/discovery.js               explore discovery workflow (thin orchestration)
workflows/init.js                    init bootstrap workflow (thin orchestration)
skills/karto-grill/SKILL.md          interactive survey grilling
skills/karto-analyze-repo/SKILL.md   repo analysis guidance for /karto-init
commands/karto-explore.md            survey conversation -> discovery workflow
commands/karto-init.md               bootstrap from existing repo
test/discovery-schema.test.js
test/survey.test.js
test/workflow-structure.test.js
```

---

## Task 1: `discovery.schema.json` (TDD)

**Files:** Create `schemas/v1/discovery.schema.json`; Create `test/discovery-schema.test.js`.

The discovery document is the survey: a conversation summary, its sources, and the structured findings `chart` will consume.

- [ ] **Step 1: Write the failing test** `test/discovery-schema.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

async function loadValidator() {
  const dir = new URL('../schemas/v1/', import.meta.url);
  const read = async (f) => JSON.parse(await readFile(new URL(f, dir)));
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(await read('discovery.schema.json'));
  return ajv.getSchema('https://kartograph.dev/schemas/v1/discovery.schema.json');
}

const minimal = {
  date: '2026-06-05',
  slug: 'watering-schedule',
  conversationSummary: 'We discussed reminding gardeners to water plants.',
  sources: { description: 'Gardeners want watering reminders.' },
  findings: {
    subjects: [], events: [], actors: [], rules: [],
    affectedCapabilities: [], capabilityCandidates: [],
    glossaryAdditions: [], adrCandidates: [], placement: [],
  },
};

test('a minimal discovery doc validates', async () => {
  const v = await loadValidator();
  assert.equal(v(minimal), true, JSON.stringify(v.errors));
});

test('a richer discovery doc validates', async () => {
  const v = await loadValidator();
  const doc = structuredClone(minimal);
  doc.findings.subjects.push({ slug: 'plant', name: 'Plant', definition: 'A cultivated plant.' });
  doc.findings.capabilityCandidates.push({ slug: 'task-reminders', name: 'Task reminders', context: 'care', definition: 'Remind the gardener.' });
  doc.findings.adrCandidates.push({ title: 'Use local notifications', rationale: 'Offline-friendly.' });
  doc.findings.placement.push({ kind: 'capabilityCandidate', slug: 'task-reminders', context: 'care' });
  assert.equal(v(doc), true, JSON.stringify(v.errors));
});

test('missing required top-level field is rejected', async () => {
  const v = await loadValidator();
  const doc = structuredClone(minimal);
  delete doc.findings;
  assert.equal(v(doc), false);
});

test('a non-slug subject slug is rejected', async () => {
  const v = await loadValidator();
  const doc = structuredClone(minimal);
  doc.findings.subjects.push({ slug: 'Not A Slug', name: 'X', definition: 'd' });
  assert.equal(v(doc), false);
});
```

- [ ] **Step 2:** Run `node --test test/discovery-schema.test.js`; confirm FAIL (schema missing).

- [ ] **Step 3: Create `schemas/v1/discovery.schema.json`:**

```json
{
  "$id": "https://kartograph.dev/schemas/v1/discovery.schema.json",
  "$defs": {
    "slug": { "type": "string", "pattern": "^[a-z0-9][a-z0-9-]*$" },
    "named": {
      "type": "object", "additionalProperties": false,
      "required": ["slug", "name"],
      "properties": {
        "slug": { "$ref": "#/$defs/slug" },
        "name": { "type": "string", "minLength": 1 },
        "definition": { "type": "string" }
      }
    },
    "candidate": {
      "type": "object", "additionalProperties": false,
      "required": ["slug", "name", "context", "definition"],
      "properties": {
        "slug": { "$ref": "#/$defs/slug" },
        "name": { "type": "string", "minLength": 1 },
        "context": { "$ref": "#/$defs/slug" },
        "definition": { "type": "string", "minLength": 1 }
      }
    },
    "rule": {
      "type": "object", "additionalProperties": false,
      "required": ["name", "statement"],
      "properties": {
        "slug": { "$ref": "#/$defs/slug" },
        "name": { "type": "string", "minLength": 1 },
        "statement": { "type": "string", "minLength": 1 },
        "subject": { "$ref": "#/$defs/slug" }
      }
    },
    "glossaryAddition": {
      "type": "object", "additionalProperties": false,
      "required": ["slug", "term", "definition", "type"],
      "properties": {
        "slug": { "$ref": "#/$defs/slug" },
        "term": { "type": "string", "minLength": 1 },
        "definition": { "type": "string", "minLength": 1 },
        "type": { "enum": ["subjekt", "capability", "kontext", "akteur", "ereignis", "regel", "term"] },
        "aliasesToAvoid": { "type": "array", "items": { "type": "string" } }
      }
    },
    "adrCandidate": {
      "type": "object", "additionalProperties": false,
      "required": ["title", "rationale"],
      "properties": {
        "title": { "type": "string", "minLength": 1 },
        "rationale": { "type": "string", "minLength": 1 },
        "contexts": { "type": "array", "items": { "$ref": "#/$defs/slug" } },
        "capabilities": { "type": "array", "items": { "$ref": "#/$defs/slug" } }
      }
    },
    "placement": {
      "type": "object", "additionalProperties": false,
      "required": ["kind", "slug"],
      "properties": {
        "kind": { "enum": ["affectedCapability", "capabilityCandidate"] },
        "slug": { "$ref": "#/$defs/slug" },
        "context": { "$ref": "#/$defs/slug" }
      }
    }
  },
  "type": "object",
  "additionalProperties": false,
  "required": ["date", "slug", "conversationSummary", "sources", "findings"],
  "properties": {
    "date": { "type": "string", "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" },
    "slug": { "$ref": "#/$defs/slug" },
    "conversationSummary": { "type": "string", "minLength": 1 },
    "sources": {
      "type": "object",
      "required": ["description"],
      "properties": {
        "description": { "type": "string", "minLength": 1 },
        "issue": { "type": "string" }
      }
    },
    "findings": {
      "type": "object", "additionalProperties": false,
      "required": ["subjects", "events", "actors", "rules", "affectedCapabilities", "capabilityCandidates", "glossaryAdditions", "adrCandidates", "placement"],
      "properties": {
        "subjects": { "type": "array", "items": { "$ref": "#/$defs/named" } },
        "events": { "type": "array", "items": { "$ref": "#/$defs/named" } },
        "actors": { "type": "array", "items": { "$ref": "#/$defs/named" } },
        "rules": { "type": "array", "items": { "$ref": "#/$defs/rule" } },
        "affectedCapabilities": { "type": "array", "items": { "$ref": "#/$defs/slug" } },
        "capabilityCandidates": { "type": "array", "items": { "$ref": "#/$defs/candidate" } },
        "glossaryAdditions": { "type": "array", "items": { "$ref": "#/$defs/glossaryAddition" } },
        "adrCandidates": { "type": "array", "items": { "$ref": "#/$defs/adrCandidate" } },
        "placement": { "type": "array", "items": { "$ref": "#/$defs/placement" } }
      }
    }
  }
}
```

- [ ] **Step 4:** Run `node --test test/discovery-schema.test.js`; confirm 4 PASS.
- [ ] **Step 5: Commit:** `git add schemas/v1/discovery.schema.json test/discovery-schema.test.js && git commit -m "feat: add discovery schema (explore gate)"`

---

## Task 2: Survey helper library (TDD)

**Files:** Create `workflows/lib/survey.js`; Create `test/survey.test.js`.

- [ ] **Step 1: Write the failing test** `test/survey.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, surveyFilename } from '../workflows/lib/survey.js';

test('slugify lowercases, hyphenates, strips punctuation', () => {
  assert.equal(slugify('Watering Schedule!'), 'watering-schedule');
  assert.equal(slugify('  Plant   Catalog  '), 'plant-catalog');
  assert.equal(slugify('Crop/Rotation'), 'crop-rotation');
});

test('slugify yields a valid slug or empty string', () => {
  assert.match(slugify('Ümläut Ödd'), /^[a-z0-9][a-z0-9-]*$|^$/);
});

test('surveyFilename builds the dated path', () => {
  assert.equal(
    surveyFilename('2026-06-05', 'watering-schedule'),
    'kartograph/surveys/2026-06-05-watering-schedule.discovery.json'
  );
});
```

- [ ] **Step 2:** Run `node --test test/survey.test.js`; confirm FAIL.
- [ ] **Step 3: Create `workflows/lib/survey.js`:**

```javascript
// Pure helpers shared by the explore command and discovery workflow.
export function slugify(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')   // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')        // non-alphanumerics -> hyphen
    .replace(/^-+|-+$/g, '');           // trim leading/trailing hyphens
}

export function surveyFilename(date, slug) {
  return `kartograph/surveys/${date}-${slug}.discovery.json`;
}
```

- [ ] **Step 4:** Run `node --test test/survey.test.js`; confirm 3 PASS.
- [ ] **Step 5: Commit:** `git add workflows/lib/survey.js test/survey.test.js && git commit -m "feat: add survey filename/slug helpers"`

---

## Task 3: `karto-grill` skill

**Files:** Create `skills/karto-grill/SKILL.md`.

This is the interactive Phase-A of `/karto-explore`. It is a prompt, not code — no unit test; a structural check runs in Task 7.

- [ ] **Step 1: Create `skills/karto-grill/SKILL.md`** with frontmatter `name: karto-grill`, `description:` (mentions surveying a feature for Kartograph, grilling, challenging glossary terms). Body must instruct: load the project glossary from `kartograph.json` (read-only) and the meta-glossary from `${CLAUDE_PLUGIN_ROOT}/reference/glossary.md`; interview the user one question at a time with a recommended answer each; challenge new terms against the existing glossary ("you said X, the glossary already has Y"); sharpen fuzzy language to canonical terms; probe concrete Given/When/Then scenarios; apply the ADR worthiness test (hard-to-reverse AND surprising AND a real trade-off); pull context from a GitHub issue if referenced. **Critical divergence to state explicitly:** capture glossary/ADR candidates into the eventual survey — do **NOT** write to `kartograph.json`, the glossary, `.feature` files, or ADR files (explore is read-only; `chart` writes). End by producing a conversation summary ready to hand to the discovery workflow.

- [ ] **Step 2: Commit:** `git add skills/karto-grill/SKILL.md && git commit -m "feat: add karto-grill survey skill"`

---

## Task 4: `discovery.js` workflow + `/karto-explore` command

**Files:** Create `workflows/discovery.js`; Create `commands/karto-explore.md`; Modify `.claude-plugin/plugin.json`.

- [ ] **Step 1: Create `workflows/discovery.js`** — a thin dynamic workflow. It must begin with `export const meta = { name: 'karto-discovery', description: '...', phases: [{ title: 'Extract' }, { title: 'Cross-check' }] }`. Body: read `args` (`{ date, slug, description, conversationSummary, mapPath }`); Phase 'Extract' — `agent(...)` (with `schema` = the discovery findings shape) to extract Subjects/Events/Actors/Rules/affected & candidate Capabilities/glossary additions/ADR candidates/placement from the description + conversationSummary, cross-checked against the existing map at `mapPath`; Phase 'Cross-check' — a second `agent` that dedupes candidates against the existing map and flags collisions. Assemble the full discovery doc (`date`, `slug`, `conversationSummary`, `sources`, `findings`) and `return` it. Keep it small; do not import npm modules (runtime globals only). Add a top comment that the returned object is written to the survey file by the command.

- [ ] **Step 2: Syntax check:** `node --check workflows/discovery.js` (must pass).

- [ ] **Step 3: Create `commands/karto-explore.md`** with frontmatter `description:`. Body steps: (1) invoke the `karto-grill` skill to survey the feature with the user (Phase A, interactive); (2) compute today's `date` and a `slug` from the feature (use the same slug rules as `workflows/lib/survey.js`); (3) invoke the **Workflow tool** with `scriptPath: ${CLAUDE_PLUGIN_ROOT}/workflows/discovery.js` and `args: { date, slug, description, conversationSummary, mapPath: "kartograph.json" }`; (4) validate the returned discovery doc against `schemas/v1/discovery.schema.json` (run `node ${CLAUDE_PLUGIN_ROOT}/scripts/validate-discovery.js` if present, else inline note) and write it to `kartograph/surveys/<date>-<slug>.discovery.json`; (5) **pause and ask** the user: continue with `/karto-chart` or review the survey first. State that explore is read-only except for the survey file.

- [ ] **Step 4: Register in `.claude-plugin/plugin.json`** — add `"./commands/karto-explore.md"` to `commands` and `"./skills/karto-grill"` to `skills`. Verify it still parses: `node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json'))"`.

- [ ] **Step 5: Commit:** `git add workflows/discovery.js commands/karto-explore.md .claude-plugin/plugin.json && git commit -m "feat: add /karto-explore command and discovery workflow"`

---

## Task 5: `karto-analyze-repo` skill + `init.js` workflow + `/karto-init` command

**Files:** Create `skills/karto-analyze-repo/SKILL.md`, `workflows/init.js`, `commands/karto-init.md`; Modify `.claude-plugin/plugin.json`.

- [ ] **Step 1: Create `skills/karto-analyze-repo/SKILL.md`** (frontmatter `name`, `description`). Body: guidance to reverse-engineer a draft map from an existing codebase — identify Kontexte (top-level areas/modules), Capabilities (cohesive feature units), Subjekte (data classes/persisted entities), Akteure, dependency edges, existing ADRs (e.g. an existing `docs/adr/`), and a glossary seed of recurring domain terms. **Maturity is derived, not invented:** a capability with tests/`.feature` coverage derives its level per the maturity table; one without lands at `sketched` (code exists) or `vision` (named only). Do not fabricate scenario tags.

- [ ] **Step 2: Create `workflows/init.js`** — thin dynamic workflow. `export const meta = { name: 'karto-init', description: '...', phases: [{ title: 'Scan' }, { title: 'Assemble' }] }`. Body: read `args` (`{ root, scope }`); Phase 'Scan' — fan out `agent(...)` over the codebase subtrees to extract contexts/capabilities/subjects/actors/dependencies/glossary-seed/ADRs (each with `schema`); Phase 'Assemble' — combine into a single draft `kartograph.json` object (version '1', slug-keyed collections), `return` it. Runtime globals only.

- [ ] **Step 3: Syntax check:** `node --check workflows/init.js`.

- [ ] **Step 4: Create `commands/karto-init.md`** (frontmatter `description:`). Body: (1) invoke `karto-analyze-repo` for guidance; (2) invoke the **Workflow tool** with `scriptPath: ${CLAUDE_PLUGIN_ROOT}/workflows/init.js` and `args: { root: ".", scope: <optional subtree> }`; (3) validate the returned draft with `node ${CLAUDE_PLUGIN_ROOT}/scripts/validate-kartograph.js` (write to a temp file first), and only on success write it to `kartograph.json` (do not overwrite an existing non-seed map without confirming); (4) **pause and ask** to review the draft, suggest `/karto-show`. For very large repos, suggest running scoped to a subtree first.

- [ ] **Step 5: Register in `.claude-plugin/plugin.json`** — add `"./commands/karto-init.md"` to `commands` and `"./skills/karto-analyze-repo"` to `skills`. Verify it parses.

- [ ] **Step 6: Commit:** `git add skills/karto-analyze-repo workflows/init.js commands/karto-init.md .claude-plugin/plugin.json && git commit -m "feat: add /karto-init command, init workflow and analyze-repo skill"`

---

## Task 6: `validate-discovery.js` CLI (TDD)

**Files:** Create `scripts/validate-discovery.js`; extend `test/discovery-schema.test.js`.

So commands can deterministically gate the discovery doc before writing the survey.

- [ ] **Step 1: Write the failing test** (append to `test/discovery-schema.test.js`):

```javascript
import { validateDiscovery } from '../scripts/validate-discovery.js';

test('validateDiscovery accepts a minimal doc and rejects a broken one', async () => {
  const ok = await validateDiscovery(minimal);
  assert.equal(ok.valid, true, JSON.stringify(ok.errors));
  const bad = structuredClone(minimal);
  delete bad.conversationSummary;
  const res = await validateDiscovery(bad);
  assert.equal(res.valid, false);
  assert.ok(res.errors.length > 0);
});
```

- [ ] **Step 2:** Run `node --test test/discovery-schema.test.js`; confirm the new test FAILS.
- [ ] **Step 3: Create `scripts/validate-discovery.js`** mirroring `validate-kartograph.js`: load `discovery.schema.json` into Ajv (`new Ajv({allErrors:true,strict:false})` + `addFormats`), export `async function validateDiscovery(doc)` returning `{ valid, errors }`, and a CLI guarded by `process.argv[1] === fileURLToPath(import.meta.url)` that reads a file arg, prints `OK:`/`INVALID:` and exits 0/1.
- [ ] **Step 4:** Run `node --test test/discovery-schema.test.js`; confirm all PASS.
- [ ] **Step 5: Commit:** `git add scripts/validate-discovery.js test/discovery-schema.test.js && git commit -m "feat: add discovery validator CLI"`

---

## Task 7: Structural checks for prompt artifacts (TDD)

**Files:** Create `test/workflow-structure.test.js`.

Since workflow/skill/command behavior can't run in CI, lock their *structure*.

- [ ] **Step 1: Write the test** `test/workflow-structure.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const read = (p) => readFile(new URL(p, root), 'utf8');

for (const wf of ['workflows/discovery.js', 'workflows/init.js']) {
  test(`${wf} has valid syntax`, () => {
    execFileSync('node', ['--check', new URL(wf, root).pathname]);
  });
  test(`${wf} exports a meta literal with name/description/phases`, async () => {
    const src = await read(wf);
    assert.match(src, /export\s+const\s+meta\s*=/, 'has export const meta');
    assert.match(src, /name\s*:/);
    assert.match(src, /description\s*:/);
    assert.match(src, /phases\s*:/);
  });
}

for (const skill of ['skills/karto-grill/SKILL.md', 'skills/karto-analyze-repo/SKILL.md']) {
  test(`${skill} has YAML frontmatter with name and description`, async () => {
    const src = await read(skill);
    assert.match(src, /^---\n[\s\S]*?\nname:\s*\S+[\s\S]*?\ndescription:\s*\S+[\s\S]*?\n---/, 'frontmatter present');
  });
}

for (const cmd of ['commands/karto-explore.md', 'commands/karto-init.md', 'commands/karto-show.md']) {
  test(`${cmd} has a description frontmatter`, async () => {
    const src = await read(cmd);
    assert.match(src, /^---\n[\s\S]*?description:\s*\S+[\s\S]*?\n---/);
  });
}

test('explore command wires the discovery workflow by scriptPath', async () => {
  const src = await read('commands/karto-explore.md');
  assert.match(src, /workflows\/discovery\.js/);
  assert.match(src, /CLAUDE_PLUGIN_ROOT/);
});

test('plugin.json registers the new commands and skills', async () => {
  const p = JSON.parse(await read('.claude-plugin/plugin.json'));
  for (const c of ['./commands/karto-explore.md', './commands/karto-init.md', './commands/karto-show.md'])
    assert.ok(p.commands.includes(c), `commands includes ${c}`);
  for (const s of ['./skills/karto-grill', './skills/karto-analyze-repo'])
    assert.ok(p.skills.includes(s), `skills includes ${s}`);
});
```

- [ ] **Step 2:** Run `node --test test/workflow-structure.test.js`; fix any structural gaps in the artifacts until all PASS (do not weaken assertions).
- [ ] **Step 3: Commit:** `git add test/workflow-structure.test.js && git commit -m "test: structural checks for workflows, skills, commands"`

---

## Final verification

- [ ] `npm test` — all suites pass (M1a 30 + M1b additions).
- [ ] `npm run validate` still OK.
- [ ] **Manual (Claude Code, not CI):** in a scratch project, run `/karto-init` and confirm it writes a schema-valid `kartograph.json` you can `/karto-show`; run `/karto-explore "<a feature>"`, confirm it grills you, then writes a schema-valid `kartograph/surveys/<date>-<slug>.discovery.json` and pauses asking to chart. Record the result in the PR description.

---

## Self-Review (completed during planning)

- **Spec coverage (M1b):** discovery schema §14 (Task 1); survey filename/slug + dated survey path §9.1 (Task 2); `karto-grill` with the read-only divergence §13/§9.1 (Task 3); `/karto-explore` brainstorm→grill→workflow→survey→pause §9.1/§11 (Task 4); `/karto-init` + `karto-analyze-repo`, maturity-derived-not-invented §9.4 (Task 5); deterministic discovery gate §10 (Task 6); structural locks for un-runnable prompt artifacts (Task 7). `karto-grill` uses `superpowers:brainstorming` as stated in the command (Task 4 step 1).
- **Consistency:** `validateDiscovery`/`validateKartograph` mirror each other; `slugify`/`surveyFilename` names match across tasks and tests; plugin.json skill paths are directories (`./skills/<name>`), command paths are files (`./commands/<name>.md`), matching M1a's `karto-show` registration.
- **No placeholders:** schema, helpers, validator, and tests are complete code. The prompt artifacts (skill/command/workflow bodies) specify exact required content and are structurally enforced by Task 7; their prose is authored during implementation.
- **Honest limit:** end-to-end workflow behavior is verified manually, not in CI (stated above).
```

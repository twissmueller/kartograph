# `/karto-sync` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/karto-sync [code|glossary|adr|deps]` command that proposes structural drift between the codebase and the map (add new, flag missing — never delete) and runs the existing grooming passes, absorbing and removing `/karto-groom`.

**Architecture:** The `code` pass analyzes the repo into a discovery-style `findings` object (new `workflows/internal/sync.js`); additions are folded by the existing `applyDiscovery` (dedup, non-destructive); a new pure `mapDrift(map, findings)` (in `workflows/lib/map-drift.js`) computes additions + missing entries for a report. The `glossary`/`adr`/`deps` modes reuse the three existing groom skills. Sync never sets maturity and ends by running `reconcile`.

**Tech Stack:** Vanilla ES modules, Node's built-in `node:test`. No new dependencies. Spec: `docs/superpowers/specs/2026-06-08-karto-sync-design.md`.

---

## File Structure

- **Create** `workflows/lib/map-drift.js` — pure `mapDrift(map, findings)` → drift report.
- **Create** `test/map-drift.test.js` — unit tests for `mapDrift`.
- **Create** `workflows/internal/sync.js` — dynamic workflow: analyze repo → `findings`.
- **Create** `commands/karto-sync.md` — the command orchestrating all modes.
- **Delete** `commands/karto-groom.md` — absorbed into `/karto-sync`.
- **Modify** `.claude-plugin/plugin.json` — add `karto-sync`, remove `karto-groom` command.
- **Modify** `test/workflow-structure.test.js` — swap groom→sync, add sync scriptPath test.
- **Modify** `README.md` — add a Sync row; fix the M2 milestone line.
- **Modify** `workflows/lib/apply-discovery.js` — fix a stale `/karto-groom` comment.
- **Modify** `package.json` and `.claude-plugin/plugin.json` — version bump to `0.12.0`.

The three groom skills (`karto-groom-glossary`, `karto-groom-adr`, `karto-groom-dependencies`) are unchanged and reused.

---

## Task 1: Pure drift report — `mapDrift`

**Files:**
- Create: `workflows/lib/map-drift.js`
- Test: `test/map-drift.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/map-drift.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapDrift } from '../workflows/lib/map-drift.js';

// A map with one charted capability (has scenarios) and one dependency.
const map = {
  capabilities: {
    'plant-catalog': { name: 'Plant catalog', context: 'plants', definition: 'd', derived: { maturity: 'building', featureCount: 1, scenarioCount: 3 } },
    'legacy-sync': { name: 'Legacy sync', context: 'plants', definition: 'd', derived: { maturity: 'vision', featureCount: 0, scenarioCount: 0 } },
  },
  dependencies: [{ from: 'legacy-sync', to: 'plant-catalog' }],
};

// Findings from analyzing the code: a NEW capability, a NEW dependency, and
// plant-catalog still present; legacy-sync is NOT surfaced (gone from code).
const findings = {
  affectedCapabilities: ['plant-catalog'],
  capabilityCandidates: [{ slug: 'billing-export', name: 'Billing export', context: 'billing', definition: 'd' }],
  dependencies: [{ from: 'billing-export', to: 'plant-catalog' }],
};

test('reports new capabilities found in code but absent from the map', () => {
  assert.deepEqual(mapDrift(map, findings).newCapabilities, ['billing-export']);
});

test('reports new dependencies found in code but absent from the map', () => {
  assert.deepEqual(mapDrift(map, findings).newDependencies, [{ from: 'billing-export', to: 'plant-catalog' }]);
});

test('flags capabilities in the map but not surfaced by the analysis', () => {
  assert.deepEqual(mapDrift(map, findings).missingCapabilities, ['legacy-sync']);
});

test('flags dependencies in the map but not surfaced by the analysis', () => {
  assert.deepEqual(mapDrift(map, findings).missingDependencies, [{ from: 'legacy-sync', to: 'plant-catalog' }]);
});

test('suggests exploring coded capabilities with no charted scenarios (incl. brand-new)', () => {
  const r = mapDrift(map, findings);
  // billing-export is brand new (no scenarios); plant-catalog has scenarios so is NOT suggested
  assert.ok(r.suggestExplore.includes('billing-export'));
  assert.ok(!r.suggestExplore.includes('plant-catalog'));
});

test('a map that matches the analysis exactly produces no drift', () => {
  const m = {
    capabilities: { a: { name: 'A', context: 'c', definition: 'd', derived: { maturity: 'building', featureCount: 1, scenarioCount: 2 } } },
    dependencies: [],
  };
  const f = { affectedCapabilities: ['a'], capabilityCandidates: [], dependencies: [] };
  assert.deepEqual(mapDrift(m, f), {
    newCapabilities: [], newDependencies: [], missingCapabilities: [], missingDependencies: [], suggestExplore: [],
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/map-drift.test.js`
Expected: FAIL — `Cannot find module '../workflows/lib/map-drift.js'`.

- [ ] **Step 3: Write `workflows/lib/map-drift.js`**

Create `workflows/lib/map-drift.js`:

```javascript
// Pure drift report between the existing map and a discovery-style `findings` object
// produced by analyzing the code (workflows/internal/sync.js). Additions are reported
// for the "+ " summary — the actual add is done by applyDiscovery; entries missing from
// the analysis are reported for the "flag" summary (never deleted). No fs, no mutation.
export function mapDrift(map, findings) {
  const caps = (map && map.capabilities) || {};
  const deps = (map && map.dependencies) || [];
  const f = findings || {};
  const candidates = f.capabilityCandidates || [];
  const fDeps = f.dependencies || [];

  // Capabilities the analysis surfaced at all: existing-and-still-present + new candidates.
  const seen = new Set([...(f.affectedCapabilities || []), ...candidates.map((c) => c.slug)]);
  const depKey = (d) => `${d.from} -> ${d.to}`;
  const haveDep = new Set(deps.map(depKey));
  const seenDep = new Set(fDeps.map(depKey));

  const newCapabilities = candidates.map((c) => c.slug).filter((s) => !caps[s]);
  const newDependencies = fDeps.filter((d) => !haveDep.has(depKey(d))).map((d) => ({ from: d.from, to: d.to }));
  const missingCapabilities = Object.keys(caps).filter((s) => !seen.has(s));
  const missingDependencies = deps.filter((d) => !seenDep.has(depKey(d))).map((d) => ({ from: d.from, to: d.to }));

  // Coded capabilities (surfaced by the analysis) that have no charted scenarios yet —
  // brand-new ones (not on the map) and existing ones whose scenarioCount is 0.
  const suggestExplore = [...seen].filter((s) => !caps[s] || (caps[s].derived?.scenarioCount ?? 0) === 0);

  return { newCapabilities, newDependencies, missingCapabilities, missingDependencies, suggestExplore };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/map-drift.test.js`
Expected: PASS — all six tests green.

- [ ] **Step 5: Commit**

```bash
git add workflows/lib/map-drift.js test/map-drift.test.js
git commit -m "feat(sync): pure mapDrift() — additions and missing-entry drift report"
```

---

## Task 2: The sync workflow — analyze code into findings

**Files:**
- Create: `workflows/internal/sync.js`

This is a dynamic Claude Code workflow (uses the `agent`/`phase`/`args` globals); it cannot run under plain `node`, so it is verified by a syntax check and, later, by the command's structural test. It mirrors `workflows/internal/discovery.js` but reads code instead of a feature description and returns the `findings` object directly.

- [ ] **Step 1: Write `workflows/internal/sync.js`**

Create `workflows/internal/sync.js`:

```javascript
// Kartograph sync workflow (the code-drift half of /karto-sync).
//
// Dynamic Claude Code workflow: the runtime provides the globals `agent`, `phase`,
// and `args`; the script cannot import modules or touch the filesystem, so the agent
// reads the existing map and the code itself via its tools.
//
// Returns a discovery-style `findings` object describing what the CODE currently
// contains. /karto-sync folds the additions into the map via applyDiscovery and
// computes the missing-entry report via mapDrift. Maturity is never decided here.
//
// args: { root, scope?, mapPath? }

export const meta = {
  name: 'karto-sync',
  description: 'Analyze the codebase and report what it contains as Kartograph findings, for /karto-sync to diff against the map.',
  phases: [
    { title: 'Scan', detail: 'read the code for contexts, capabilities, subjects, dependencies and ADRs' },
    { title: 'Cross-check', detail: 'reconcile findings against the existing map' },
  ],
};

const SLUG = { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$' };
const NAMED = {
  type: 'object', additionalProperties: false,
  required: ['slug', 'name'],
  properties: { slug: SLUG, name: { type: 'string' }, definition: { type: 'string' } },
};
const FINDINGS_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['subjects', 'events', 'actors', 'rules', 'affectedCapabilities', 'capabilityCandidates', 'glossaryAdditions', 'adrCandidates', 'placement'],
  properties: {
    subjects: { type: 'array', items: NAMED },
    events: { type: 'array', items: NAMED },
    actors: { type: 'array', items: NAMED },
    rules: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['name', 'statement'],
        properties: { slug: SLUG, name: { type: 'string' }, statement: { type: 'string' }, subject: SLUG },
      },
    },
    affectedCapabilities: { type: 'array', items: SLUG },
    capabilityCandidates: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['slug', 'name', 'context', 'definition'],
        properties: { slug: SLUG, name: { type: 'string' }, context: SLUG, definition: { type: 'string' } },
      },
    },
    glossaryAdditions: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['slug', 'term', 'definition', 'type'],
        properties: {
          slug: SLUG, term: { type: 'string' }, definition: { type: 'string' },
          type: { enum: ['subjekt', 'capability', 'kontext', 'akteur', 'ereignis', 'regel', 'term'] },
          aliasesToAvoid: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    adrCandidates: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['title', 'rationale'],
        properties: {
          title: { type: 'string' }, rationale: { type: 'string' },
          contexts: { type: 'array', items: SLUG }, capabilities: { type: 'array', items: SLUG },
        },
      },
    },
    placement: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['kind', 'slug'],
        properties: { kind: { enum: ['affectedCapability', 'capabilityCandidate'] }, slug: SLUG, context: SLUG },
      },
    },
    dependencies: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['from', 'to'],
        properties: { from: SLUG, to: SLUG, reason: { type: 'string' }, features: { type: 'array', items: { type: 'string' } } },
      },
    },
  },
};

const a = args || {};
const root = a.root || '.';
const where = a.scope ? `${root} (focus on the subtree: ${a.scope})` : root;
const mapPath = a.mapPath || 'kartograph.json';

phase('Scan');
const extracted = await agent(
  `You are re-surveying an EXISTING codebase to keep a Kartograph map in sync with the code.

First read the existing map at "${mapPath}" to learn the contexts, capability slugs, and glossary terms already in use. Reuse existing slugs wherever the thing already exists.

Then analyze the code at ${where} and extract Kartograph findings describing what the code CURRENTLY contains:
- subjects, events, actors: the domain things/things-that-happened/triggers in the code.
- rules: invariants enforced in the code (each tied to a subject when possible).
- affectedCapabilities: slugs of EXISTING map capabilities that the code still implements.
- capabilityCandidates: capabilities present in the code but NOT yet on the map (each with its context slug). They are born "vision".
- dependencies: capability→capability data dependencies inferred from imports/call graphs, as { from, to } (add a one-line "reason" describing how from uses to when clear).
- glossaryAdditions: recurring domain terms worth defining, one canonical term each.
- adrCandidates: only genuinely hard-to-reverse, surprising, trade-off decisions evident in the code.
- placement: where each affected/candidate capability lands (its context).

Do NOT decide maturity — that is derived from Kartograph scenarios elsewhere. Use lowercase-hyphen slugs. Return the findings object.`,
  { schema: FINDINGS_SCHEMA, label: 'scan', phase: 'Scan' }
);

phase('Cross-check');
const checked = await agent(
  `Reconcile these findings against the existing map at "${mapPath}" (read it again to be sure).

Findings:
${JSON.stringify(extracted, null, 2)}

Tasks:
- Move any capabilityCandidate that ALREADY exists in the map into affectedCapabilities instead (it is not new).
- Ensure every remaining capabilityCandidate has a valid context slug and a matching placement entry.
- Keep dependencies as { from, to } (optionally with a one-line reason). Use only capability slugs that exist in the map or appear in capabilityCandidates.

Return the corrected findings object in exactly the same shape.`,
  { schema: FINDINGS_SCHEMA, label: 'cross-check', phase: 'Cross-check' }
);

return checked;
```

- [ ] **Step 2: Syntax-check the workflow**

Run: `node --check workflows/internal/sync.js`
Expected: no output, exit 0 (the file parses).

- [ ] **Step 3: Commit**

```bash
git add workflows/internal/sync.js
git commit -m "feat(sync): sync workflow — analyze the codebase into Kartograph findings"
```

---

## Task 3: The `/karto-sync` command, replacing `/karto-groom`

**Files:**
- Create: `commands/karto-sync.md`
- Delete: `commands/karto-groom.md`
- Modify: `.claude-plugin/plugin.json`
- Modify: `test/workflow-structure.test.js`

The structural test encodes the public command surface, so update it first (it will fail), then make it pass by adding `karto-sync` and removing `karto-groom`. The surface stays "exactly six commands".

- [ ] **Step 1: Update the structural test (defines the new surface)**

In `test/workflow-structure.test.js`, in the command-files loop, replace the `karto-groom` entry:

```javascript
for (const cmd of [
  'commands/karto-explore.md', 'commands/karto-chart.md', 'commands/karto-build.md',
  'commands/karto-sync.md', 'commands/karto-init.md', 'commands/karto-show.md',
]) {
```

In the `plugin.json registers all commands and skills` test, replace the `karto-groom` entry:

```javascript
  for (const c of [
    './commands/karto-explore.md', './commands/karto-chart.md', './commands/karto-build.md',
    './commands/karto-sync.md', './commands/karto-init.md', './commands/karto-show.md',
  ]) assert.ok(p.commands.includes(c), `commands includes ${c}`);
```

Add a new test after the `chart command wires the chart workflow by scriptPath` test:

```javascript
test('sync command wires the sync workflow by scriptPath', async () => {
  const src = await read('commands/karto-sync.md');
  assert.match(src, /workflows\/internal\/sync\.js/);
  assert.match(src, /CLAUDE_PLUGIN_ROOT/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/workflow-structure.test.js`
Expected: FAIL — `commands/karto-sync.md` does not exist yet and `plugin.json` still lists `karto-groom`, not `karto-sync`.

- [ ] **Step 3: Create `commands/karto-sync.md`**

Create `commands/karto-sync.md`:

```markdown
---
description: Keep the Kartograph map current with the code — detect structural drift, run grooming, then validate and write atomically. Non-destructive: proposes additions and flags missing entries, never deletes.
---

Keep `kartograph.json` in sync with the codebase. Optional focus from `$ARGUMENTS`
(`code`, `glossary`, `adr`, `dependencies` — alias `deps`; runs all when empty). Sync only
**proposes** — nothing is written until you approve — and entries missing from the code are
**flagged, never deleted**.

1. Confirm `kartograph.json` exists. If it does not, suggest `/karto-init` to bootstrap first.
   Start a working copy: `cp kartograph.json kartograph.tmp.json`.

2. **Code drift** (when `$ARGUMENTS` is empty or `code`): use the **`karto-analyze-repo`**
   skill for guidance on what to extract, then invoke the **Workflow** tool with:
   - `scriptPath: ${CLAUDE_PLUGIN_ROOT}/workflows/internal/sync.js`
   - `args: { root: ".", scope: "<a subtree if $ARGUMENTS names one, else omit>", mapPath: "kartograph.json" }`
   It returns a discovery-style `findings` object describing what the code contains.
   - **Additions** — fold the findings into the working copy (adds/dedups only; never
     overwrites existing fields):
     ```bash
     FINDINGS='<the workflow findings as JSON>' node -e "import('${CLAUDE_PLUGIN_ROOT}/workflows/lib/apply-discovery.js').then(m=>{const fs=require('fs');const map=JSON.parse(fs.readFileSync('kartograph.tmp.json'));fs.writeFileSync('kartograph.tmp.json',JSON.stringify(m.applyDiscovery(map,{date:'',slug:'sync',conversationSummary:'',sources:{description:''},findings:JSON.parse(process.env.FINDINGS)}),null,2)+'\n');})"
     ```
   - **Drift report** — compute additions and missing entries from the ORIGINAL map:
     ```bash
     FINDINGS='<the same findings JSON>' node -e "import('${CLAUDE_PLUGIN_ROOT}/workflows/lib/map-drift.js').then(m=>{const map=JSON.parse(require('fs').readFileSync('kartograph.json'));console.log(JSON.stringify(m.mapDrift(map,JSON.parse(process.env.FINDINGS)),null,2));})"
     ```
     Present it grouped: `+ additions` (will be added on approval), `⚠ missing from code
     (keep or remove? — nothing deleted)`, and `→ suggestions` (run `/karto-explore` on the
     `suggestExplore` capabilities — coded but unscenarioed). Do **not** edit or delete
     flagged entries.

3. **Glossary** (empty or `glossary`): apply the **`karto-groom-glossary`** skill's logic to
   the working copy `kartograph.tmp.json`.
4. **ADRs** (empty or `adr`): apply the **`karto-groom-adr`** skill's logic to the working
   copy and `kartograph/decisions/*.md`.
5. **Dependencies** (empty, `dependencies`, or `deps`): apply the
   **`karto-groom-dependencies`** skill to back-fill edge `reason`/`features`, then fold its
   returned array into the working copy via `applyDiscovery` (same one-liner as step 2, but
   with `dependencies:` set to that array and the other finding lists empty).

6. Show the user the full diff of `kartograph.tmp.json` vs `kartograph.json`, plus the drift
   report. Wait for approval.

7. **Validate** the working copy:
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/validate-kartograph.js kartograph.tmp.json`. If it
   fails, fix and re-validate — never write an invalid map.

8. **Reconcile and swap** — only on approval and a clean validate:
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/reconcile.js kartograph.tmp.json` (recomputes derived
   maturity/counts and re-validates), then move `kartograph.tmp.json` → `kartograph.json`. On
   any earlier failure, delete `kartograph.tmp.json`; `kartograph.json` is untouched. Report
   what was added and what remains flagged.
```

- [ ] **Step 4: Update `.claude-plugin/plugin.json`**

In the `commands` array, replace `"./commands/karto-groom.md"` with `"./commands/karto-sync.md"`:

```json
  "commands": [
    "./commands/karto-explore.md",
    "./commands/karto-chart.md",
    "./commands/karto-build.md",
    "./commands/karto-sync.md",
    "./commands/karto-init.md",
    "./commands/karto-show.md"
  ],
```

(Leave the `skills` array unchanged — all three groom skills stay.)

- [ ] **Step 5: Delete the old command**

```bash
git rm commands/karto-groom.md
```

- [ ] **Step 6: Run the full suite to verify it passes**

Run: `npm test`
Expected: PASS — all tests green, including the updated `workflow-structure.test.js` and the new sync scriptPath test.

- [ ] **Step 7: Commit**

```bash
git add commands/karto-sync.md .claude-plugin/plugin.json test/workflow-structure.test.js
git commit -m "feat(sync): /karto-sync command; remove /karto-groom (absorbed)"
```

---

## Task 4: Docs, stale comment, version bump

**Files:**
- Modify: `README.md`
- Modify: `workflows/lib/apply-discovery.js`
- Modify: `package.json`
- Modify: `.claude-plugin/plugin.json`

- [ ] **Step 1: Add a Sync row to the README command table**

In `README.md`, the "How it works" table currently ends with the Init row:

```markdown
| **Init** | `/karto-init` | Bootstrap a draft map from an **existing** codebase. |
```

Add a Sync row immediately after it:

```markdown
| **Init** | `/karto-init` | Bootstrap a draft map from an **existing** codebase. |
| **Sync** | `/karto-sync` | Re-scan the code and propose drift (add new, flag missing — never delete), plus glossary/ADR/dependency grooming. Non-destructive; you approve every change. |
```

- [ ] **Step 2: Fix the M2 milestone line in the README**

In `README.md`, the M2 status line reads:

```markdown
- ✅ **M2 — chart**: `/karto-chart` and `/karto-groom`, the glossary/ADR grooming skills, the
```

Change `/karto-groom` to `/karto-sync`:

```markdown
- ✅ **M2 — chart**: `/karto-chart` and `/karto-sync`, the glossary/ADR grooming skills, the
```

- [ ] **Step 3: Fix the stale comment in `apply-discovery.js`**

In `workflows/lib/apply-discovery.js`, the `unannotatedDependencies` comment mentions the old command:

```javascript
// Dependency edges that still need grooming: missing a reason, or missing any justifying
// features. Used by the dependency back-fill (/karto-groom dependencies) to target work.
```

Change `/karto-groom dependencies` to `/karto-sync deps`:

```javascript
// Dependency edges that still need grooming: missing a reason, or missing any justifying
// features. Used by the dependency back-fill (/karto-sync deps) to target work.
```

- [ ] **Step 4: Bump the version in both manifests**

In `package.json`, change `"version": "0.11.0"` to `"version": "0.12.0"`.
In `.claude-plugin/plugin.json`, change `"version": "0.11.0"` to `"version": "0.12.0"`.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — all tests green.

- [ ] **Step 6: Commit**

```bash
git add README.md workflows/lib/apply-discovery.js package.json .claude-plugin/plugin.json
git commit -m "docs(sync): document /karto-sync, drop /karto-groom references (v0.12.0)"
```

---

## Self-Review

- **Spec coverage:**
  - One `/karto-sync [code|glossary|adr|deps]`, all when empty → Task 3 (command). ✓
  - `/karto-groom` removed, three skills reused → Task 3 (delete + plugin.json; skills untouched). ✓
  - `/karto-init` stays → untouched. ✓
  - Add new, flag missing, never auto-remove → Task 1 (`mapDrift` reports, no deletion) + Task 3 (command shows flags, never edits them). ✓
  - Maturity untouched; reconcile at the end → Task 2 (workflow does not set maturity) + Task 3 (step 8 runs reconcile). ✓
  - Reuse `applyDiscovery` for additions; new pure missing-diff → Task 1 + Task 3 (step 2 one-liner). ✓
  - `mapDrift` report shape `{ newCapabilities, newDependencies, missingCapabilities, missingDependencies, suggestExplore }` → Task 1 (matches spec). ✓
  - Non-destructive atomic write (chart-style) → Task 3 (working copy → validate → reconcile → swap). ✓
  - References to update (README, workflow-structure.test.js, apply-discovery comment) → Tasks 3, 4. ✓
  - Tests for `mapDrift` (new caps, new deps, missing caps, missing deps, suggest, no-drift) → Task 1. ✓
  - Removal mode out of scope → not built. ✓
- **Placeholder scan:** none — every code/command step is concrete.
- **Type consistency:** `mapDrift(map, findings)` returns the five-key object used identically in Task 1 tests and the Task 3 command one-liner; `sync.js` returns `findings` (the object the command passes as `FINDINGS` to both `applyDiscovery` and `mapDrift`); `FINDINGS_SCHEMA` in `sync.js` matches the discovery findings shape that `applyDiscovery` consumes. ✓

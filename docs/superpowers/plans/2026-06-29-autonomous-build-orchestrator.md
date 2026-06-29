# Autonomous Build Orchestrator (`/karto-build-all`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `/karto-build-all [scope]` command that autonomously builds every open (not-Accepted) scenario in a scope, one capability per fresh subagent, in dependency order, stopping each scenario at Developed.

**Architecture:** A deterministic Node planner (`scripts/build-plan.js`) computes a dependency-ordered build plan; a dynamic Workflow (`workflows/internal/build-all.js`) walks it sequentially, spawning one build subagent per capability (own context window); the command (`commands/karto-build-all.md`) runs the planner, invokes the workflow, then runs `reconcile.js` and reports. Map writes happen only through `scripts/set-tracking.js`; the workflow never writes the map directly.

**Tech Stack:** Vanilla ESM JavaScript, Node built-ins only, `node:test`, `ajv` (already a dep). Claude Code Workflow runtime (`agent`/`phase`/`args` globals) for the dynamic workflow.

## Global Constraints

- ESM only (`"type": "module"`), Node built-ins only, no new dependencies.
- New deterministic logic = pure exported function + thin CLI guarded by `if (process.argv[1] === fileURLToPath(import.meta.url))`.
- Slugs match `^[a-z0-9][a-z0-9-]*$`; feature filenames match `^[a-z0-9][a-z0-9-]*\.feature$`.
- Tracking states are exactly `open | wip | developed | accepted`; "open to build" = state ≠ `accepted`.
- Workflow scripts cannot import modules or touch the filesystem; they use only `agent`/`phase`/`parallel`/`log`/`args` and must defensively `JSON.parse` a string `args`.
- Scenario ID format (from `viewer/lib/ids.js`): `<capability>/<feature.feature>#"<scenario>"`.
- Release bumps `version` in BOTH `.claude-plugin/plugin.json` AND `package.json` to the same value; feature commits use `feat(...): … (vX.Y.Z)`. Next version: **0.16.0** (new command = notable feature).
- Commit message trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Deterministic planner — pure `buildPlan` + `parseScope`

**Files:**
- Create: `scripts/build-plan.js`
- Test: `test/build-plan.test.js`

**Interfaces:**
- Produces:
  - `parseScope(arg?: string) -> { kind: 'all' } | { kind: 'context', slug } | { kind: 'capability', slug }`
  - `buildPlan(map, scenariosByCapability, scope) -> { scope, order, skippedEmpty, warnings }`
    - `scenariosByCapability`: `{ [capSlug]: { open: [{feature, name, class}], total: number } }`
    - `order`: `[{ capability, context, dependsOn: string[], openScenarios: [{feature,name,class}] }]` (dependency-ordered; only capabilities with ≥1 open scenario; `dependsOn` lists only in-scope capabilities that are themselves in `order`)
    - `skippedEmpty`: `[{ capability, context, reason }]` (in-scope capabilities with zero scenarios charted)
    - `warnings`: `string[]` (e.g. dependency cycles)

- [ ] **Step 1: Write the failing tests**

```javascript
// test/build-plan.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScope, buildPlan } from '../scripts/build-plan.js';

const MAP = {
  capabilities: {
    auth:     { name: 'Auth',     context: 'identity' },
    billing:  { name: 'Billing',  context: 'checkout' },
    checkout: { name: 'Checkout', context: 'checkout' },
    reporting:{ name: 'Reporting',context: 'checkout' },
  },
  // from depends on to: billing->auth, checkout->billing
  dependencies: [
    { from: 'billing', to: 'auth' },
    { from: 'checkout', to: 'billing' },
  ],
};
const SCN = {
  auth:      { open: [{ feature: 'sign-in.feature', name: 'User signs in', class: 'happy' }], total: 1 },
  billing:   { open: [{ feature: 'charge.feature', name: 'Charge a card', class: 'happy' }], total: 2 },
  checkout:  { open: [{ feature: 'pay.feature', name: 'Pay', class: 'happy' }], total: 1 },
  reporting: { open: [], total: 0 }, // nothing charted
};

test('parseScope: no arg = all; context: prefix; bare slug = capability', () => {
  assert.deepEqual(parseScope(), { kind: 'all' });
  assert.deepEqual(parseScope('context:checkout'), { kind: 'context', slug: 'checkout' });
  assert.deepEqual(parseScope('auth'), { kind: 'capability', slug: 'auth' });
});

test('buildPlan orders dependencies before dependents', () => {
  const plan = buildPlan(MAP, SCN, { kind: 'all' });
  const order = plan.order.map((o) => o.capability);
  assert.ok(order.indexOf('auth') < order.indexOf('billing'));
  assert.ok(order.indexOf('billing') < order.indexOf('checkout'));
});

test('buildPlan reports zero-scenario capabilities as skippedEmpty, not in order', () => {
  const plan = buildPlan(MAP, SCN, { kind: 'all' });
  assert.deepEqual(plan.order.map((o) => o.capability).includes('reporting'), false);
  assert.deepEqual(plan.skippedEmpty, [{ capability: 'reporting', context: 'checkout', reason: 'no scenarios charted' }]);
});

test('buildPlan excludes all-accepted capabilities silently (open empty but total>0)', () => {
  const scn = { ...SCN, billing: { open: [], total: 2 } };
  const plan = buildPlan(MAP, scn, { kind: 'all' });
  const slugs = plan.order.map((o) => o.capability);
  assert.equal(slugs.includes('billing'), false);
  assert.equal(plan.skippedEmpty.some((s) => s.capability === 'billing'), false);
});

test('buildPlan dependsOn lists only in-scope capabilities that are in order', () => {
  const plan = buildPlan(MAP, SCN, { kind: 'all' });
  const checkout = plan.order.find((o) => o.capability === 'checkout');
  assert.deepEqual(checkout.dependsOn, ['billing']);
  // billing's dep auth is buildable -> listed
  assert.deepEqual(plan.order.find((o) => o.capability === 'billing').dependsOn, ['auth']);
});

test('buildPlan context scope keeps only that context', () => {
  const plan = buildPlan(MAP, SCN, { kind: 'context', slug: 'checkout' });
  const slugs = plan.order.map((o) => o.capability);
  assert.deepEqual(slugs.includes('auth'), false);
  assert.ok(slugs.includes('billing') && slugs.includes('checkout'));
  // billing depends on auth, but auth is out of scope -> not in dependsOn
  assert.deepEqual(plan.order.find((o) => o.capability === 'billing').dependsOn, []);
});

test('buildPlan capability scope pulls in transitive dependencies', () => {
  const plan = buildPlan(MAP, SCN, { kind: 'capability', slug: 'checkout' });
  const slugs = plan.order.map((o) => o.capability);
  assert.deepEqual(slugs, ['auth', 'billing', 'checkout']);
});

test('buildPlan breaks dependency cycles deterministically with a warning', () => {
  const cyclic = { ...MAP, dependencies: [{ from: 'auth', to: 'billing' }, { from: 'billing', to: 'auth' }] };
  const plan = buildPlan(cyclic, SCN, { kind: 'all' });
  assert.equal(plan.warnings.length >= 1, true);
  // both still appear so the run is usable
  const slugs = plan.order.map((o) => o.capability);
  assert.ok(slugs.includes('auth') && slugs.includes('billing'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/build-plan.test.js`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `../scripts/build-plan.js`.

- [ ] **Step 3: Write the pure implementation (no CLI yet)**

```javascript
// scripts/build-plan.js
import { fileURLToPath } from 'node:url';

// Parse the command scope token. No arg = whole map; "context:<slug>" = one context;
// any bare token = a capability (and, in buildPlan, its transitive dependencies).
export function parseScope(arg) {
  if (!arg) return { kind: 'all' };
  if (arg.startsWith('context:')) return { kind: 'context', slug: arg.slice('context:'.length) };
  return { kind: 'capability', slug: arg };
}

// All capabilities `slug` transitively depends on (following from->to edges), including `slug`.
function transitiveDeps(slug, depsAll) {
  const seen = new Set();
  const stack = [slug];
  while (stack.length) {
    const s = stack.pop();
    if (seen.has(s)) continue;
    seen.add(s);
    for (const d of depsAll[s] || []) stack.push(d);
  }
  return seen;
}

// Kahn topological sort: a dependency (edge target) precedes its dependent (edge source).
// Ties break by the given node order (declaration order). Cycles: leftover nodes are
// appended in declaration order and a warning is emitted, so the result is always usable.
function topoSort(nodes, deps) {
  const inScope = new Set(nodes);
  const dependents = new Map(nodes.map((n) => [n, []]));
  const indegree = new Map(nodes.map((n) => [n, 0]));
  for (const n of nodes) {
    for (const d of deps[n] || []) {
      if (!inScope.has(d)) continue;
      dependents.get(d).push(n);
      indegree.set(n, indegree.get(n) + 1);
    }
  }
  const queue = nodes.filter((n) => indegree.get(n) === 0);
  const out = [];
  const warnings = [];
  while (queue.length) {
    const n = queue.shift();
    out.push(n);
    for (const m of dependents.get(n)) {
      indegree.set(m, indegree.get(m) - 1);
      if (indegree.get(m) === 0) queue.push(m);
    }
  }
  if (out.length < nodes.length) {
    const remaining = nodes.filter((n) => !out.includes(n));
    warnings.push(`dependency cycle among: ${remaining.join(', ')} — appended in declaration order`);
    out.push(...remaining);
  }
  return { order: out, warnings };
}

// Pure: compute the dependency-ordered build plan for a scope.
export function buildPlan(map, scenariosByCapability, scope) {
  const caps = map.capabilities || {};
  const allSlugs = Object.keys(caps);
  const depsAll = {};
  for (const e of map.dependencies || []) {
    if (!caps[e.from] || !caps[e.to]) continue;
    (depsAll[e.from] ||= []).push(e.to);
  }

  let inScope;
  if (scope.kind === 'context') {
    inScope = new Set(allSlugs.filter((s) => caps[s].context === scope.slug));
  } else if (scope.kind === 'capability') {
    inScope = new Set([...transitiveDeps(scope.slug, depsAll)].filter((s) => caps[s]));
  } else {
    inScope = new Set(allSlugs);
  }

  const scopedNodes = allSlugs.filter((s) => inScope.has(s));
  const scopedDeps = {};
  for (const s of scopedNodes) scopedDeps[s] = (depsAll[s] || []).filter((d) => inScope.has(d));

  const { order: sortedAll, warnings } = topoSort(scopedNodes, scopedDeps);

  const skippedEmpty = [];
  const buildable = new Set();
  for (const s of sortedAll) {
    const info = scenariosByCapability[s] || { open: [], total: 0 };
    if (info.total === 0) { skippedEmpty.push({ capability: s, context: caps[s].context, reason: 'no scenarios charted' }); continue; }
    if (info.open.length === 0) continue; // all accepted — nothing to build
    buildable.add(s);
  }

  const order = sortedAll.filter((s) => buildable.has(s)).map((s) => ({
    capability: s,
    context: caps[s].context,
    dependsOn: (scopedDeps[s] || []).filter((d) => buildable.has(d)),
    openScenarios: scenariosByCapability[s].open,
  }));

  return { scope, order, skippedEmpty, warnings };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/build-plan.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/build-plan.js test/build-plan.test.js
git commit -m "$(cat <<'EOF'
feat(build-plan): pure dependency-ordered build planner

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Planner CLI

**Files:**
- Modify: `scripts/build-plan.js` (append CLI block at end)

**Interfaces:**
- Consumes: `buildBoard` from `workflows/lib/board-data.js`, `readMap` from `workflows/lib/map-store.js`, `parseScope`/`buildPlan` from this file.
- Produces: CLI `node scripts/build-plan.js [projectRoot] [scope]` → prints plan JSON to stdout.

- [ ] **Step 1: Add the imports at the top of `scripts/build-plan.js`**

Add below the existing `import { fileURLToPath } ...` line:

```javascript
import { buildBoard } from '../workflows/lib/board-data.js';
import { readMap } from '../workflows/lib/map-store.js';
```

- [ ] **Step 2: Append the CLI block at the end of `scripts/build-plan.js`**

```javascript
// CLI: node scripts/build-plan.js [projectRoot] [scope]
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] || process.cwd();
  const scope = parseScope(process.argv[3]);
  const map = await readMap(root);
  const board = await buildBoard(root);
  const scenariosByCapability = {};
  for (const slug of Object.keys(map.capabilities || {})) scenariosByCapability[slug] = { open: [], total: 0 };
  for (const s of board.scenarios) {
    const e = (scenariosByCapability[s.capability] ||= { open: [], total: 0 });
    e.total++;
    if (s.progress !== 'accepted') e.open.push({ feature: s.feature, name: s.name, class: s.class });
  }
  const plan = buildPlan(map, scenariosByCapability, scope);
  console.log(JSON.stringify(plan, null, 2));
}
```

- [ ] **Step 3: Verify the CLI against a real migrated project**

Run: `node scripts/build-plan.js /Users/tobias.wissmueller/projects/sidetone | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=JSON.parse(s);console.log('order:',p.order.length,'skippedEmpty:',p.skippedEmpty.length,'warnings:',p.warnings.length)})"`
Expected: prints non-negative counts and exits 0 (sidetone validated earlier; 18 scenarios accepted, ~105 open → order should be non-empty). No stack trace.

- [ ] **Step 4: Re-run the unit tests to confirm the CLI block didn't break the pure exports**

Run: `node --test test/build-plan.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/build-plan.js
git commit -m "$(cat <<'EOF'
feat(build-plan): CLI emitting the plan JSON from a project

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The dynamic workflow `build-all.js`

**Files:**
- Create: `workflows/internal/build-all.js`
- Modify: `test/workflow-structure.test.js` (add assertions)

**Interfaces:**
- Consumes: injected globals `agent`, `phase`, `args`. `args = { plan, projectRoot, pluginRoot }` (plan = Task 1 output).
- Produces: workflow returns `{ results, skippedEmpty }` where each result is `{ capability, status: 'built'|'partial'|'failed'|'skipped-blocked', scenariosDeveloped?, scenariosLeftOpen?, note?, blockedBy? }`.

- [ ] **Step 1: Write the workflow file**

```javascript
// workflows/internal/build-all.js
//
// Kartograph autonomous build orchestrator (the creative half of /karto-build-all).
// Runs as a Claude Code dynamic workflow (globals: agent, phase, args). It walks a
// pre-computed, dependency-ordered build plan and spawns ONE build subagent per
// capability, sequentially, each in its own context window. The deterministic plan
// (scripts/build-plan.js), the map writes (scripts/set-tracking.js, run by the
// subagents), and the final maturity reconcile + validate are done by the
// /karto-build-all command around this workflow — this workflow never writes the map.
//
// args: { plan, projectRoot, pluginRoot }

export const meta = {
  name: 'karto-build-all',
  description: 'Autonomously build every open scenario in a scope, one capability per subagent, in dependency order.',
  phases: [
    { title: 'Build', detail: 'one subagent per capability, dependency-ordered, sequential' },
  ],
};

// Tolerate a JSON-stringified args object (a common Workflow mis-call), not just an object.
let a = args || {};
if (typeof a === 'string') { try { a = JSON.parse(a) || {}; } catch { a = {}; } }
const plan = a.plan || { order: [], skippedEmpty: [] };
const projectRoot = a.projectRoot || '.';
const pluginRoot = a.pluginRoot || '.';

const BUILD_RESULT = {
  type: 'object',
  additionalProperties: false,
  required: ['status'],
  properties: {
    status: { enum: ['built', 'partial', 'failed'] },
    scenariosDeveloped: { type: 'array', items: { type: 'string' } },
    scenariosLeftOpen: { type: 'array', items: { type: 'string' } },
    note: { type: 'string' },
  },
};

function buildPrompt(cap) {
  const scenarios = cap.openScenarios.map((s) => `  - [${s.class || 'happy'}] ${s.feature} :: "${s.name}"`).join('\n');
  return `You are autonomously building ONE Kartograph capability end-to-end. Decide everything
yourself — do NOT ask anyone anything; there is no user to answer.

Project root: ${projectRoot}
Capability: ${cap.capability}   Context: ${cap.context}
Open scenarios to build (path class in brackets):
${scenarios}

How to build (double-loop, outside-in TDD):
- Work scenarios in order @happy -> @edge -> @error.
- Outer loop: drive each scenario through the project's acceptance runner if one exists; else rely
  on unit tests. Inner loop: write a failing unit test, watch it fail, minimal code to pass, refactor
  while green. No production code without a failing test you saw fail.
- Build the WHOLE VERTICAL SLICE: every layer the scenario crosses (frontend, backend/API, worker,
  persistence) must be wired together so the scenario is walkable END-TO-END through the real UI /
  entry point the user actually uses. Inspect the project (package.json, Makefile, etc.) to learn its
  test runners and source layout; use what it already uses.

Definition of done per scenario — the user can walk it:
- Only when the scenario is reachable end-to-end through the final interface (all layers connected,
  tests green) do you mark it Developed:
  node ${pluginRoot}/scripts/set-tracking.js ${projectRoot} ${cap.context} ${cap.capability} <feature.feature> "<scenario>" developed
- NEVER mark anything accepted — Accepted is the human's call after they walk it.
- If you cannot make a scenario walkable end-to-end, LEAVE IT OPEN (do not mark it Developed) and
  list it under scenariosLeftOpen with a one-line reason.

Finish:
- Commit your work for this capability.
- Return ONLY the result object: status 'built' (all scenarios Developed), 'partial' (some), or
  'failed' (none); scenariosDeveloped and scenariosLeftOpen arrays of scenario names; note = one-line
  reason when partial/failed.`;
}

phase('Build');
const failed = new Set();
const results = [];
for (const cap of plan.order) {
  const blockedBy = (cap.dependsOn || []).filter((d) => failed.has(d));
  if (blockedBy.length) {
    failed.add(cap.capability);
    results.push({ capability: cap.capability, status: 'skipped-blocked', blockedBy });
    log(`skip ${cap.capability}: blocked by ${blockedBy.join(', ')}`);
    continue;
  }
  const r = await agent(buildPrompt(cap), { schema: BUILD_RESULT, phase: 'Build', label: cap.capability });
  if (!r || r.status !== 'built') failed.add(cap.capability);
  results.push({ capability: cap.capability, ...(r || { status: 'failed', note: 'subagent returned no result' }) });
}

return { results, skippedEmpty: plan.skippedEmpty || [] };
```

- [ ] **Step 2: Add structure assertions to `test/workflow-structure.test.js`**

First open `test/workflow-structure.test.js` and read how existing workflows are asserted (look for `chart.js` / `discovery.js` checks and the `read()` helper). Then add, following the same `read()` helper and style:

```javascript
test('build-all workflow declares meta and defensively parses args', async () => {
  const src = await read('workflows/internal/build-all.js');
  assert.match(src, /export const meta = \{/);
  assert.match(src, /name: 'karto-build-all'/);
  // standing Kartograph guard: tolerate a JSON-stringified args object
  assert.match(src, /typeof a === 'string'/);
  // never writes the map directly; advances state via set-tracking.js (run by subagents)
  assert.match(src, /set-tracking\.js/);
  assert.doesNotMatch(src, /writeMap|kartograph\.json'/);
});
```

(Use the exact name of the existing file-reading helper; if it is named differently than `read`, match it.)

- [ ] **Step 3: Run the structure tests**

Run: `node --test test/workflow-structure.test.js`
Expected: PASS (existing tests + the new one).

- [ ] **Step 4: Syntax-check the workflow file**

Run: `node --check workflows/internal/build-all.js`
Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add workflows/internal/build-all.js test/workflow-structure.test.js
git commit -m "$(cat <<'EOF'
feat(build-all): dynamic workflow orchestrating per-capability build subagents

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: The command `karto-build-all.md` + plugin registration

**Files:**
- Create: `commands/karto-build-all.md`
- Modify: `.claude-plugin/plugin.json` (register the command)
- Modify: `test/workflow-structure.test.js` (assert the command exists + wires the workflow)

**Interfaces:**
- Consumes: `scripts/build-plan.js` (CLI), `workflows/internal/build-all.js` (via Workflow `scriptPath`), `scripts/reconcile.js`.

- [ ] **Step 1: Write the command file**

```markdown
---
description: Autonomously build every open scenario in a scope — one capability per subagent, in dependency order, each left at Developed for you to Accept.
---

Autonomously build the open scenarios in the scope given by `$ARGUMENTS`, with **no questions**.
Scope: empty = the whole map; `context:<slug>` = one context; `<capability-slug>` = that
capability and everything it transitively depends on. Each scenario is taken to **Developed**;
**Accepted** stays your call after you walk it. This is a large autonomous operation that spawns
one build subagent per capability — invoking the command is your opt-in.

1. **Compute the plan (deterministic).** Run
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/build-plan.js . "$ARGUMENTS"` and capture the JSON. Print a
   short human summary: how many capabilities and scenarios will build, in what order, and which
   capabilities are skipped because they have no charted scenarios (suggest `/karto-explore` for
   those). Proceed immediately — do **not** ask for confirmation.

2. **Stop early if empty.** If `order` is empty, report "nothing to build in this scope" (plus any
   `skippedEmpty`) and stop.

3. **Run the orchestrator workflow** via the **Workflow** tool:
   - `scriptPath: ${CLAUDE_PLUGIN_ROOT}/workflows/internal/build-all.js`
   - `args: { "plan": <the plan JSON>, "projectRoot": ".", "pluginRoot": "${CLAUDE_PLUGIN_ROOT}" }`
   Each capability builds in its own subagent/context window, sequentially, dependencies first; a
   capability whose dependency failed is skipped. The subagents mark passing scenarios **Developed**
   via `scripts/set-tracking.js` and commit their own work.

4. **Reconcile + validate.** Run
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/reconcile.js .kartograph/kartograph.json` to recompute derived
   blocks and re-validate the map (atomic write). If it fails, surface the errors.

5. **Report**, grouped by outcome, from the workflow result:
   - **Built** — capability + scenarios now Developed.
   - **Partial** — capability + scenarios left open, with reasons.
   - **Failed** — capability + reason.
   - **Skipped (blocked)** — capability + which failed dependency blocked it.
   - **Skipped (empty)** — capability has no charted scenarios.
   Close with: "Walk the Developed scenarios and mark them **Accepted** on the Board once confirmed."
```

- [ ] **Step 2: Register the command in `.claude-plugin/plugin.json`**

Read `.claude-plugin/plugin.json` and find the array/object listing the `karto-*` commands. Add `karto-build-all` following the EXACT shape of the existing entries (e.g. if commands are listed as `"./commands/karto-build.md"`, add `"./commands/karto-build-all.md"` next to it).

- [ ] **Step 3: Add command assertions to `test/workflow-structure.test.js`**

Following the existing per-command assertions (the test already checks each command has a description and the build command wires its workflow):

```javascript
test('karto-build-all command has a description and wires the build-all workflow by scriptPath', async () => {
  const src = await read('commands/karto-build-all.md');
  assert.match(src, /^---[\s\S]*description:[\s\S]*?---/);
  assert.match(src, /workflows\/internal\/build-all\.js/);
  assert.match(src, /scripts\/build-plan\.js/);
  assert.match(src, /scripts\/reconcile\.js/);
});
```

Also add `'commands/karto-build-all.md'` to any existing list of command files the test iterates (search the file for `karto-build.md` and mirror it), and add the command to the `plugin.json registers all commands and skills` test's expected set if that test enumerates commands.

- [ ] **Step 4: Run the structure tests**

Run: `node --test test/workflow-structure.test.js`
Expected: PASS (including the `plugin.json registers all commands and skills` test).

- [ ] **Step 5: Commit**

```bash
git add commands/karto-build-all.md .claude-plugin/plugin.json test/workflow-structure.test.js
git commit -m "$(cat <<'EOF'
feat(karto-build-all): command wiring planner + orchestrator + reconcile

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Docs, version bump, full-suite gate

**Files:**
- Modify: `CLAUDE.md` (directory map + commands count)
- Modify: `README.md` (document `/karto-build-all`)
- Modify: `.claude-plugin/plugin.json` and `package.json` (version → 0.16.0)

- [ ] **Step 1: Document the command in `README.md`**

Find where the other `/karto-*` commands are described and add a paragraph for `/karto-build-all`:

```markdown
`/karto-build-all [scope]` builds every open scenario in a scope autonomously — the whole map,
`context:<slug>`, or a `<capability-slug>` (and its dependencies). It computes a dependency-ordered
plan, then spawns one build subagent per capability (each in its own context window), taking every
scenario it can walk end-to-end to **Developed**. **Accepted** stays your call. Capabilities with no
charted scenarios are skipped and listed (chart them with `/karto-explore`).
```

- [ ] **Step 2: Update `CLAUDE.md`**

In the `commands/` line of the Directory map, change "the six `/karto-*` slash commands (explore, chart, build, sync, init, show)" to include `build-all` and the new count ("the seven … (explore, chart, build, build-all, sync, init, show)").

- [ ] **Step 3: Bump the version in both manifests**

Run:
```bash
cd /Users/tobias.wissmueller/projects/kartograph
perl -0pi -e 's/"version": "0.15.10"/"version": "0.16.0"/' package.json .claude-plugin/plugin.json
grep '"version"' package.json .claude-plugin/plugin.json
```
Expected: both show `0.16.0`.

- [ ] **Step 4: Run the FULL suite**

Run: `npm test`
Expected: all tests pass (existing + `build-plan` + the new structure assertions). If the `plugin.json registers all commands and skills` test fails, ensure `karto-build-all` was added to both `plugin.json` and the test's expected set.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md README.md package.json .claude-plugin/plugin.json
git commit -m "$(cat <<'EOF'
docs(build-all): document /karto-build-all; bump to v0.16.0

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- §4 surface (`/karto-build-all [scope]`, scope forms, autonomous/no-prompt) → Task 4 command + Task 1 `parseScope`. ✓
- §5 components (`build-plan.js`, `build-all.js`, `karto-build-all.md`) → Tasks 1–4. ✓
- §6 planner (output shape, scope resolution, topo sort, cycles, empty detection, dependsOn scoping) → Task 1 tests + impl. ✓
- §7 workflow (sequential loop, failed-set, skip-blocked, BUILD_RESULT, no map write) → Task 3. ✓
- §8 subagent contract (autonomy, vertical slice, set-tracking developed, never accepted, partial reporting) → Task 3 `buildPrompt`. ✓
- §9 command flow (plan → print → workflow → reconcile → report) → Task 4. ✓
- §10 testing (build-plan unit tests; workflow/command structure tests) → Tasks 1, 3, 4. ✓
- §2 non-goals (no authoring, no auto-accept, no maturity change) → enforced in `buildPrompt` + report wording; planner never authors. ✓

**Placeholder scan:** Tasks 2–4 include "read the existing file and mirror its shape" steps for `plugin.json`/`workflow-structure.test.js` because those files' exact internal structure isn't quoted here; the actual content to add (assertions, command file, workflow file, CLI) is given in full. These are concrete instructions, not deferred work.

**Type consistency:** `buildPlan` output (`order[].capability/context/dependsOn/openScenarios`, `skippedEmpty`, `warnings`) is consumed identically by the workflow (`plan.order`, `cap.dependsOn`, `cap.openScenarios`, `plan.skippedEmpty`) and the command. `BUILD_RESULT` (`status`/`scenariosDeveloped`/`scenariosLeftOpen`/`note`) matches the report grouping in the command. Scenario-state vocabulary (`accepted`, `developed`) consistent throughout.

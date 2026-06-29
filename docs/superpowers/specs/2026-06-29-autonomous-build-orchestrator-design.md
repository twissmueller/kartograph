# Autonomous build orchestrator (`/karto-build-all`)

**Date:** 2026-06-29
**Status:** Design — approved, pending spec review

## 1. Problem

A project can accumulate many unfinished features (open scenarios across many capabilities).
Building them one capability at a time with `/karto-build` means the user must keep steering
Claude and clearing the context window between capabilities — the user becomes the bottleneck.

We want a single command that builds **all open scenarios** in a chosen scope — the whole map,
one context, or one capability (and its dependencies) — **fully autonomously**: Claude analyses,
designs, plans, and implements each feature on its own, without asking the user anything, and
without exhausting the main context window.

## 2. Goals & non-goals

**Goals**
- One command builds every open (not-Accepted) scenario in a scope, autonomously.
- Each capability's build runs in its **own context window**, so the orchestrating session holds
  only the plan and one-line per-capability results.
- Features are built as a complete vertical slice — walkable end-to-end through the real UI.
- Deterministic, dependency-aware build order; safe, resumable, with a single end-of-run report.

**Non-goals**
- **No scenario authoring.** Capabilities with zero scenarios are out of scope (charting stays a
  human-collaborative step via `/karto-explore` + `/karto-chart`). They are reported, not built.
- **No auto-Accept.** The orchestrator stops at `Developed`; `Accepted` remains the user's call
  after walking the feature. (`Accepted` = "a human walked it" stays true.)
- **No maturity change.** `derived.maturity` is a function of which path tags are *charted*
  (`@happy/@edge/@error`), not of whether they are implemented; those scenarios already exist
  before building. The orchestrator advances **tracking state** only. The final `reconcile.js`
  is validation hygiene; the report is framed around scenarios moved to `Developed`.
- **No parallelism in v1.** Builds run sequentially (see §4). Parallel/worktree execution may be
  a later enhancement.

## 3. Decisions (locked)

| Decision | Choice |
|---|---|
| Terminal state per scenario | **Developed** (never Accepted) |
| Execution model | **Sequential, dependency-ordered** (dependencies before dependents) |
| Build scope unit | One **capability** per subagent; builds all that capability's open scenarios |
| Capabilities with no scenarios | **Skipped**, reported as `skippedEmpty` (never authored) |
| On a capability that can't be built | Leave its scenarios open + log reason; **skip its dependents** too; continue the rest |
| Failure reporting | One report at the end: Built / Partial / Failed / Skipped-empty / Skipped-blocked |
| Maturity | Unchanged by this command; report is framed around tracking states |

## 4. Surface

New command:

```
/karto-build-all [scope]
```

- *(no arg)* → the whole map
- `context:<slug>` → every capability in that context
- `<capability-slug>` → that capability and everything it **transitively depends on**

The command is autonomous: it prints the computed plan and proceeds immediately. It never prompts
for confirmation (honouring "don't make me the bottleneck"); invoking the command is the opt-in.

## 5. Architecture (honours the three-layer rule)

Three new pieces, mirroring how `/karto-chart` is built:

1. **`scripts/build-plan.js`** — deterministic (pure function + thin CLI, unit-tested). Computes
   the ordered build plan. No LLM, no mutation.
2. **`workflows/internal/build-all.js`** — the dynamic Workflow that spawns one build subagent per
   capability, sequentially. Generates no map mutations directly; it orchestrates and collects
   results.
3. **`commands/karto-build-all.md`** — orchestration prose: runs the planner, prints the plan,
   invokes the Workflow (`scriptPath: ${CLAUDE_PLUGIN_ROOT}/workflows/internal/build-all.js`),
   then runs `reconcile.js` and prints the report.

Reused unchanged: `set-tracking.js` (subagents mark `Developed`), the `karto-build` procedure
(each subagent's instructions), the map's `dependencies` edges, `reconcile.js`,
`workflows/lib/open-scenarios.js`, `workflows/lib/board-data.js`.

### Map-write discipline
Subagents mutate the map **only** through `scripts/set-tracking.js` (schema-validated, atomic
temp-file→rename). `.feature` files are not rewritten (scenarios already exist; only code is
written). The workflow itself never writes `kartograph.json`. The command runs `reconcile.js` at
the end to revalidate. This preserves Kartograph's rule that creative workflows never mutate the
map directly.

### Context isolation (the core win)
Each `agent()` call is a full subagent with its own context window. A capability's entire build
conversation — reading code, writing tests, iterating TDD — lives in that subagent's window. The
orchestrating workflow (and the user's main session) only ever receives the subagent's structured
result. This is what lets the run cover many capabilities without filling the main context.

## 6. `scripts/build-plan.js`

**Pure function:** `buildPlan(map, openByCapability, scope)` → plan object. `openByCapability` is
`{ capabilitySlug: [openScenario, …] }` (derived from on-disk features + map tracking via the
existing `openScenarios` helper; "open" = tracking state ≠ `accepted`). `scope` is one of
`{ kind: 'all' }`, `{ kind: 'context', slug }`, `{ kind: 'capability', slug }`.

**Output shape:**

```json
{
  "scope": { "kind": "context", "slug": "checkout" },
  "order": [
    {
      "capability": "auth",
      "context": "identity",
      "dependsOn": [],
      "openScenarios": [
        { "feature": "sign-in.feature", "name": "User signs in", "class": "happy" }
      ]
    },
    {
      "capability": "billing",
      "context": "checkout",
      "dependsOn": ["auth"],
      "openScenarios": [ "…" ]
    }
  ],
  "skippedEmpty": [
    { "capability": "reporting", "context": "checkout", "reason": "no scenarios charted" }
  ]
}
```

**Behaviour:**
- **Scope resolution.** `all` = every capability. `context:<slug>` = capabilities whose
  `context === slug`. `<capability-slug>` = that capability plus all capabilities it transitively
  depends on (so its foundations build first). A scope token that is both a valid context slug and
  a capability slug is resolved as **context first** only when prefixed `context:`; a bare slug is
  always treated as a capability (prefix removes the ambiguity).
- **Topological sort** by `dependencies` edges (`from` depends on `to` ⇒ `to` builds first).
  Capabilities not connected by edges keep map-declaration order. **Cycles** are broken
  deterministically (edge into the already-seen node dropped) and noted in the output as
  `warnings`, so a cyclic graph still yields a usable order rather than failing.
- **Empty capabilities.** Capabilities in scope with zero open scenarios *and* zero scenarios at
  all → `skippedEmpty`. Capabilities whose scenarios are all already `accepted` simply don't appear
  in `order` (nothing to build) and are not reported as failures.
- `dependsOn` lists only in-scope dependency slugs (used by the workflow's skip logic).

**CLI:** `node scripts/build-plan.js [projectRoot] [scope]` prints the plan JSON to stdout.

## 7. `workflows/internal/build-all.js`

`meta.name = 'karto-build-all'`. Defensively parses a JSON-stringified `args` (the standing
Kartograph guard). `args = { plan, projectRoot }`.

**Control flow (sequential):**

```
const failed = new Set()        // capability slugs that failed/were partial
const results = []
for (const cap of plan.order) {
  const blockedBy = cap.dependsOn.filter(d => failed.has(d))
  if (blockedBy.length) {
    results.push({ capability: cap.capability, status: 'skipped-blocked', blockedBy })
    failed.add(cap.capability)        // its own dependents are skipped too
    continue
  }
  const r = await agent(buildPrompt(cap, projectRoot), { schema: BUILD_RESULT, phase: 'Build', label: cap.capability })
  results.push({ capability: cap.capability, ...r })
  if (!r || r.status !== 'built') failed.add(cap.capability)
}
return { results, skippedEmpty: plan.skippedEmpty }
```

- One `phase('Build')`; each capability is one labelled agent so `/workflows` shows live progress.
- `agent(..., { schema })` forces the subagent to return a validated `BUILD_RESULT` (no parsing).
- A subagent that dies/returns null is treated as failed (so dependents are skipped).
- Sequential `await` in the loop = one capability at a time; each commits before the next starts.

**`BUILD_RESULT` schema:**

```json
{
  "status": "built | partial | failed",
  "scenariosDeveloped": ["User signs in", "…"],
  "scenariosLeftOpen": ["Reset password"],
  "note": "one-line reason if partial/failed"
}
```

## 8. The build subagent prompt (`buildPrompt`)

Each subagent is handed:
- The capability slug + context + its open scenario list (names, feature files, path classes).
- The `karto-build` procedure verbatim (double-loop outside-in TDD; vertical-slice / definition-of-
  done rules).
- The **autonomy contract**:
  - Decide everything yourself; do **not** ask the user anything.
  - Build the **full vertical slice** so each scenario is walkable end-to-end through the real UI.
  - For each scenario you complete, mark it **Developed** via
    `node ${CLAUDE_PLUGIN_ROOT}/scripts/set-tracking.js <root> <context> <capability> <feature> "<scenario>" developed`.
  - **Never** mark anything `accepted`.
  - Commit your work for this capability.
  - If you cannot make a scenario walkable end-to-end, **leave it open**, do not mark it Developed,
    and return it under `scenariosLeftOpen` with a one-line reason; set `status` to `partial`
    (some built) or `failed` (none built).
  - Return only the `BUILD_RESULT` object.

## 9. Command flow (`commands/karto-build-all.md`)

1. Resolve scope from `$ARGUMENTS`.
2. `node ${CLAUDE_PLUGIN_ROOT}/scripts/build-plan.js . "<scope>"` → plan JSON. Print a human summary
   ("Building N capabilities / M scenarios in this order: …; K empty capabilities skipped"). Proceed
   without prompting.
3. If `order` is empty, report "nothing to build" and stop.
4. Invoke the **Workflow** tool: `scriptPath: ${CLAUDE_PLUGIN_ROOT}/workflows/internal/build-all.js`,
   `args: { plan, projectRoot: "." }`.
5. `node ${CLAUDE_PLUGIN_ROOT}/scripts/reconcile.js .kartograph/kartograph.json` (validate + recompute
   derived; write atomically). If it fails, surface the error.
6. Print the final report grouped by outcome:
   - **Built** — capability, scenarios now Developed.
   - **Partial** — built some; scenarios left open + reasons.
   - **Failed** — none built + reason.
   - **Skipped (blocked)** — capability + which failed dependency blocked it.
   - **Skipped (empty)** — capability has no charted scenarios; suggest `/karto-explore`.
   - Close with: "Walk the Developed scenarios and mark them Accepted on the Board when confirmed."

## 10. Testing

- **`scripts/build-plan.js`** is the deterministic heart → thorough `node:test` unit tests
  (`test/build-plan.test.js`): topological order; dependencies-before-dependents; cycle breaking +
  warning; scope = all / context / capability-with-transitive-deps; empty-capability detection;
  all-accepted capability excluded from `order`; `dependsOn` restricted to in-scope slugs.
- **`workflows/internal/build-all.js`** — structure assertions in `test/workflow-structure.test.js`
  (has `meta`, defensive `args` parse, wired by the command via `scriptPath`), consistent with the
  existing workflow tests. Live build behaviour is verified by running the command, not the suite
  (matches the repo's "tests gate the pure layer only" convention).
- **`commands/karto-build-all.md`** — frontmatter + wiring assertions in
  `test/workflow-structure.test.js`.

## 11. Edge cases & risks

- **Incomplete dependency edges.** Topo order only reflects *declared* edges; undeclared code
  dependencies could cause a build to fail. Mitigation: failures are isolated and reported; the
  user can add edges and re-run (the command is idempotent — already-Developed/Accepted scenarios
  are skipped next time).
- **Long / heavy runs.** Many subagents, real code changes. The command prose states this is a
  large autonomous operation; the user's invocation is the opt-in. `/workflows` shows live progress
  and the run is interruptible.
- **Resumability.** Re-running `/karto-build-all` recomputes the plan from current tracking state,
  so completed work (Developed/Accepted) is naturally excluded — re-runs pick up where it left off.
- **Partial vertical slice.** The definition-of-done already in `karto-build` forbids marking a
  half-wired scenario Developed; such scenarios surface as `partial`, not as silent success.

## 12. Files

| File | Type | Status |
|---|---|---|
| `scripts/build-plan.js` | deterministic (pure + CLI) | new |
| `test/build-plan.test.js` | unit tests | new |
| `workflows/internal/build-all.js` | dynamic workflow | new |
| `commands/karto-build-all.md` | command (orchestration) | new |
| `test/workflow-structure.test.js` | structure assertions | extend |
| `.claude-plugin/plugin.json` | register command + bump version | edit |
| `package.json` | version bump | edit |
| `CLAUDE.md`, `README.md` | document the command | edit |

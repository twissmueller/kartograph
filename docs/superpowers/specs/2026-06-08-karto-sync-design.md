# `/karto-sync` — keep a map current with the code (and absorb `/karto-groom`)

**Date:** 2026-06-08
**Status:** Approved direction — ready for implementation plan

## Problem

`/karto-init` bootstraps a map from a codebase once. After that the map drifts: someone
refactors, adds a module, or removes a feature without touching Kartograph. Today there is no
incremental "bring the map back in line with the code" command. Separately, `/karto-groom`
enriches existing entities (glossary, ADRs, dependency reason/features) but is its own command.

`/karto-sync` unifies map maintenance into one command: detect and propose **structural drift**
from the code, and run the existing **grooming** passes — all non-destructive and
human-approved.

## Decisions (settled with the user)

- **One command, focus modes.** `/karto-sync [code|glossary|adr|deps]`; no argument runs all.
  `/karto-groom` is **removed** — its three grooming skills now run under `/karto-sync`.
  `/karto-init` **stays** as the from-empty bootstrap.
- **Add new, flag missing, never auto-remove.** The `code` pass proposes ADDING structure found
  in code but absent from the map, and FLAGS map entries no longer found in code as "possibly
  stale" for the human to decide. It never deletes or overwrites hand-authored content.
- **Maturity stays earned from scenarios.** Sync never sets `maturity`; it remains derived from
  Kartograph `.feature` coverage by `reconcile`, preserving the validator invariant. A
  capability that has code but no charted scenarios is *suggested* for `/karto-explore`. Sync
  runs `reconcile` as its last step so derived blocks/counts are fresh.
- **Reuse, don't reinvent.** Additions flow through the existing `applyDiscovery` merge (dedups,
  never overwrites); the only new logic is a pure *missing-entry* diff used for reporting.

## Architecture & data flow

```
/karto-sync [mode]
  code:                                         (when mode is empty or "code")
    1. analyze repo  ──► discovery-style findings        (workflows/internal/sync.js,
       (karto-analyze-repo guidance)                      reusing analyze-repo)
    2. additions:  applyDiscovery(map, {findings})        (dedup + non-destructive add)
    3. missing:    mapDrift(map, findings)  ──► report    (pure; reporting only, no writes)
  glossary / adr / deps:                        (when mode is empty or that mode)
    run karto-groom-glossary / -adr / -dependencies       (unchanged skills)
  always:
    show drift report ─► user approves ─► validate ─► atomic swap ─► reconcile
```

The `code` pass emits the same `findings` shape `/karto-explore` produces (subjects, events,
actors, rules, affectedCapabilities, capabilityCandidates, glossaryAdditions, adrCandidates,
placement, dependencies). Additions therefore reuse `applyDiscovery` verbatim: anything already
in the map dedups to a no-op, and existing fields (definitions, declared dependency
reasons/features) are never overwritten. New capabilities are born `vision` with no `.feature`
files (same as init).

## Components

- **`commands/karto-sync.md`** (new) — orchestrates the modes; mirrors the `/karto-chart`
  working-copy → validate → atomic-swap pattern, then runs `reconcile`. Shows the drift report
  and waits for approval before writing.
- **`commands/karto-groom.md`** (removed) — its glossary/adr/deps responsibilities move under
  `/karto-sync`. The three groom **skills** are unchanged and reused.
- **`workflows/internal/sync.js`** (new) — dynamic workflow that analyzes the repo (or a
  `scope` subtree) and returns a `findings` object, mirroring `init.js` but emitting findings
  instead of a full map. Reuses `karto-analyze-repo` guidance.
- **`workflows/lib/map-drift.js`** (new, pure, unit-tested) — `mapDrift(map, findings)` returns:
  ```js
  {
    newCapabilities:     [slug, ...],   // in findings.capabilityCandidates, not in map
    newDependencies:     [{from, to}],  // in findings.dependencies, not in map
    missingCapabilities: [slug, ...],   // capabilities in map, not surfaced by analysis
    missingDependencies: [{from, to}],  // dependencies in map, not surfaced by analysis
    suggestExplore:      [slug, ...],   // capabilities present in code but still vision/0 scenarios
  }
  ```
  `newCapabilities`/`newDependencies` are reported for the "+ additions" summary (the actual
  add is done by `applyDiscovery`); `missing*` drive the "⚠ flag" summary; `suggestExplore`
  drives the "→ suggestions" summary. Pure and deterministic — no fs, no map mutation.
- **`.claude-plugin/plugin.json`** — add `./commands/karto-sync.md`, remove
  `./commands/karto-groom.md`. The skills list is unchanged (all three groom skills stay).

### References to update when removing `/karto-groom`

- **`README.md`** — the "How it works" command table lists `/karto-groom`; replace with
  `/karto-sync` (and describe the new code-drift behaviour).
- **`test/workflow-structure.test.js`** — the command-file list and the
  "plugin.json registers all commands" assertion both name `commands/karto-groom.md` /
  `./commands/karto-groom.md`; change both to the `karto-sync` paths so the public surface
  stays "exactly six commands". Add an assertion that `/karto-sync` wires
  `workflows/internal/sync.js` by `scriptPath` (mirroring the explore/init/chart tests).
- **`workflows/lib/apply-discovery.js`** — the `unannotatedDependencies` comment mentions
  "/karto-groom dependencies"; update it to "/karto-sync deps".
- **`commands/karto-chart.md`** references the groom **skills** (`karto-groom-glossary`,
  `karto-groom-adr`) by name — these skills are unchanged, so that command needs **no** edit.
- Historical files under `docs/superpowers/specs|plans/2026-06-05-*` mention the old command;
  leave them as-is (they are dated design records, not current docs).

## Report format

A grouped, human-readable summary printed before any write:

```
+ additions (will be added on approval)
    capability  billing-export        (context: billing)
    dependency  payments -> ledger

⚠ missing from code (keep or remove? — nothing deleted automatically)
    capability  legacy-sync
    dependency  reports -> legacy-sync

→ suggestions
    capability  billing-export has code but no charted scenarios — run /karto-explore
```

`missing` and `suggestExplore` are advisory: sync never edits them. Removing a flagged entry is
a separate, explicit human action (hand-edit, or a future `/karto-sync` removal mode — out of
scope here).

## Non-destructive guarantees

- Sync only proposes. No write happens until the user approves the drift report.
- Additions go through `applyDiscovery` (adds/dedups only — never overwrites existing fields).
- Missing entries are flagged, never deleted or modified.
- Code-derived dependency proposals remain consistent with "dependencies are declared
  up-front" because the human approves every one before it is written.
- The write uses the same atomic working-copy → validate → swap path as `/karto-chart`; a
  failure leaves `kartograph.json` untouched.

## Testing

- **`test/map-drift.test.js`** (new) — `mapDrift`:
  - reports a capability candidate absent from the map as `newCapabilities`.
  - reports a findings dependency absent from the map as `newDependencies`.
  - reports a map capability not in the analysis as `missingCapabilities`.
  - reports a map dependency not in the analysis as `missingDependencies`.
  - lists a coded capability that is `vision` / 0 scenarios under `suggestExplore`.
  - on a map that matches the analysis exactly, every list is empty (no false drift).
- The additions path (`applyDiscovery`) is already covered by `test/apply-discovery.test.js`.
- The analyze step and the `/karto-sync` orchestration prompt are verified live, like `init`.
- Any existing test that asserts `/karto-groom` exists is updated to `/karto-sync`.

## Out of scope (deferred)

- A removal mode that actually deletes flagged stale entries (kept as a manual/explicit action).
- Code-derived **maturity** (rejected — maturity stays earned from Kartograph scenarios).
- Auto-writing code-derived dependencies without approval (rejected — human-in-the-loop).

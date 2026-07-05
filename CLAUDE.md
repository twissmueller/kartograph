# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Kartograph is **both** a Claude Code plugin and a small Node project. It ships commands,
skills, and workflows that maintain a "living map" of a software system
(`.kartograph/kartograph.json`),
and it contains the deterministic Node code (validators, transforms) that
those commands call. The UI is the Electron desktop app under `desktop/`. There is
**no framework and no build step** — vanilla JavaScript, ESM
(`"type": "module"`), Node built-ins only, plus `ajv` for schema validation.

## Commands

```bash
npm test                                   # full suite (node --test)
node --test test/maturity-derive.test.js   # run a single test file
npm run validate                           # validate the seed map against schema + integrity
bash scripts/start-desktop.sh "$(pwd)"     # launch the desktop app on the current project (first run installs Electron)

# validate any map / survey directly
node scripts/validate-kartograph.js <map.json>
node scripts/validate-discovery.js <survey.discovery.json>
```

**Releases must bump `version` in ALL THREE of `.claude-plugin/plugin.json`,
`package.json`, AND `desktop/package.json`** to the same value — the marketplace and the
installed plugin both compare the manifest `version`, so an un-bumped release is invisible
downstream. Feature commits here are patch bumps (the log uses `feat(...): … (vX.Y.Z)`).

## The core architectural rule: who is allowed to write the map

Every map mutation flows through three distinct layers with a strict division of labor.
Respect this split — it is what makes writes trustworthy:

1. **Commands** (`commands/*.md`) — orchestration prose run by Claude. They sequence the
   steps, run the deterministic scripts, invoke the LLM workflows, and own the **atomic swap**
   of `.kartograph/kartograph.json`.
2. **Deterministic Node** (`scripts/*.js`, `workflows/lib/*.js`) — does **all** validation,
   the discovery→map transform, maturity reconciliation, and the temp-file→rename write.
   This is where correctness lives, and where the tests are.
3. **Dynamic LLM workflows** (`workflows/internal/*.js`) — only generate *creative* content
   (survey findings, Gherkin scenarios, ADR prose). **They never mutate
   `.kartograph/kartograph.json` directly.** They run inside the Claude Code Workflow runtime with injected globals
   (`agent`, `phase`, `args`, `parallel`, …); the script body **cannot import modules or touch
   the filesystem** — the agent reads/writes files via its own tools.

Example (`/karto-chart`): the command applies the survey to a working copy
(`.kartograph/kartograph.tmp.json`) via `apply-discovery.js`, runs the chart workflow to write
`.feature` and ADR files, runs `reconcile.js` to recompute maturity and re-validate, and only
then renames the temp file over `.kartograph/kartograph.json`. Any failure leaves the real map
untouched.

### Two write gates (`scripts/validate-kartograph.js`)

A map is valid only if it passes **both**:
- **JSON Schema** (`schemas/v1/*.json`), and
- **referential integrity** (`checkReferentialIntegrity`) — no dangling slugs between
  capabilities↔contexts, dependencies↔capabilities, rules↔subjects, glossary refs, ADR
  supersession, etc.

### Maturity is derived, never declared (`workflows/lib/maturity-derive.js`)

A capability's `derived.maturity` is **computed** from its on-disk `.feature` scenarios, not
hand-set: `vision → sketched → building → usable → stable`, where coverage is cumulative
(`usable` needs an `@edge` path; `stable` needs `@edge` AND `@error`). The integrity gate
*rejects* a map whose stored maturity is inconsistent with its counts. `/karto-init` may only
ever claim up to `building` (it must not invent class tags); `usable`/`stable` are earned
later when real edge/error scenarios are charted and `reconcile.js` recomputes.

## Directory map

- `commands/` — the nine `/karto-*` slash commands (explore, chart, build, build-all, sync,
  init, show, walk, revise).
- `skills/` — `karto-grill` (converging interview), `karto-analyze-repo`, and three
  `karto-groom-*` skills (glossary / ADR / dependencies). Registered in `plugin.json`.
- `workflows/internal/` — dynamic LLM workflows (`discovery`, `chart`, `init`, `sync`, `build-all`).
- `workflows/lib/` — **pure, testable** helpers shared by scripts and the desktop app
  (`apply-discovery`, `board`, `board-data`, `feature-read`, `gherkin`, `ids`, `layout`,
  `maturity-derive`, `map-drift`, `open-scenarios`, `paths`, `survey`, `survey-html`, `tracking`).
  `paths.js` is the single source of truth for where the map and layout live. `ids`, `board`
  and `layout` were the browser viewer's pure libs; the viewer is gone and the desktop
  renderer imports them from here.
- `scripts/` — deterministic CLIs (`validate-kartograph`, `validate-discovery`, `reconcile`,
  `survey-to-html`). Each is a pure function + a thin `import.meta.url`-guarded CLI.
- `desktop/` — the Electron desktop app (the only UI). `main/` is the Node main process
  (filesystem, watchers, IPC, session), `preload.cjs` is the sandboxed bridge, and
  `renderer/` is the vanilla-JS UI (Map view + Tracking board). Launch it with
  `scripts/start-desktop.sh [projectDir]`; `/karto-show` wraps that.
- `schemas/v1/` — JSON Schemas for the map, glossary, ADR, and discovery survey.
- `test/` — `node:test` unit tests for the pure helpers and the schemas.

## Conventions & gotchas

- **Pure-function + CLI split.** New deterministic logic goes in a pure exported function
  (unit-tested) with a thin CLI wrapper guarded by
  `if (process.argv[1] === fileURLToPath(import.meta.url))`. Follow the existing files.
  **Exception — scripts exposed as npm `bin`s** (`validate-kartograph.js`, `reconcile.js`):
  the `.bin` symlink means `process.argv[1]` is a symlink path that never equals the resolved
  module URL, so those two guard on `realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)`
  instead. Use the plain form everywhere else; only reach for the `realpathSync` variant when a
  script is a declared bin.
- **Map files live under `.kartograph/`.** The map (`kartograph.json`), the viewer layout
  (`kartograph.layout.json`), surveys (`.kartograph/surveys/`), and decisions
  (`.kartograph/decisions/`) all live in a hidden `.kartograph/` directory at the project root —
  never loose in the root. `workflows/lib/paths.js` (`mapPath`, `layoutPath`, `surveysDir`,
  `decisionsDir`, `KARTO_DIR`) is the only place that constructs these paths; Node code imports
  it, while the commands hardcode the same relative paths. Only `.feature` files (`features/`)
  stay top-level — they are the product's living
  spec, deliberately visible. There is **no fallback** to the old `kartograph/` locations.
- **Slugs are the key space.** Everything is keyed by lowercase-hyphen slugs
  (`^[a-z0-9][a-z0-9-]*$`); cross-references are slugs and must resolve (integrity gate).
- **Survey artifacts.** `/karto-explore` writes `.kartograph/surveys/<date>-<slug>.discovery.json`
  (the canonical, append-only log) and, alongside it, a readable
  `.discovery.html` rendered deterministically by `scripts/survey-to-html.js`.
- **Defensive `args` parsing.** A Workflow can be mis-called with a JSON-*stringified* `args`
  object; every `workflows/internal/*.js` script defensively `JSON.parse`s a string `args`
  (see `test/workflow-args.test.js`) — keep this guard when editing them, or surveys come out
  empty.
- **Path tags drive maturity; tracking state lives in the map.** Each Gherkin `Scenario`
  carries exactly **one path tag** (`@happy`/`@edge`/`@error`) in its `.feature` file — that is
  the only kind of tag now, and it feeds maturity (`workflows/lib/gherkin.js` parses it). A
  scenario's **progress** — `Open → Developed → Accepted` — is *not* a tag; it lives in
  `kartograph.json`'s top-level `tracking` block, keyed by the canonical scenario ID
  (`<capability>/<feature.feature>#"<scenario>"`, see `workflows/lib/ids.js`). The pure helpers are
  `workflows/lib/tracking.js` (`getScenarioState`/`setScenarioState`, default `open`); writers go
  through `workflows/lib/map-store.js` (`writeMap`, atomic). Progress never changes maturity. The
  schema validates `tracking`; the integrity gate flags entries whose capability no longer exists.
  `/karto-build` advances scenarios to **Developed**; the user flips **Accepted** after walking
  them. Set state with `scripts/set-tracking.js` or the desktop app's Tracking board.
- **Scenarios are user-walkable, not technical.** Features and scenarios are written for a
  non-technical stakeholder to walk through and confirm in front of the running system: plain
  domain language (glossary terms), only observable behaviour (Given = recognisable situation,
  When = user action, Then = confirmable outcome), and **no leaked implementation detail**
  (no DBs, endpoints, status codes, function/file names, internal IDs, frameworks). The authoring
  rules live in `workflows/internal/chart.js`.
- **Tests gate the pure layer only.** Live command/workflow behavior is verified by running
  the commands in Claude Code, not by the suite — keep the deterministic transforms covered by
  `node:test`.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Kartograph is **both** a Claude Code plugin and a small Node project. It ships commands,
skills, and workflows that maintain a "living map" of a software system
(`.kartograph/kartograph.json`),
and it contains the deterministic Node code (validators, transforms, a viewer/server) that
those commands call. There is **no framework and no build step** — vanilla JavaScript, ESM
(`"type": "module"`), Node built-ins only, plus `ajv` for schema validation.

## Commands

```bash
npm test                                   # full suite (node --test)
node --test test/maturity-derive.test.js   # run a single test file
npm run validate                           # validate the seed map against schema + integrity
npm run show                               # serve the viewer at http://127.0.0.1:4123 (projectRoot = cwd)

# validate any map / survey directly
node scripts/validate-kartograph.js <map.json>
node scripts/validate-discovery.js <survey.discovery.json>
```

**Releases must bump `version` in BOTH `.claude-plugin/plugin.json` AND `package.json`**
to the same value — the marketplace and the installed plugin both compare the manifest
`version`, so an un-bumped release is invisible downstream. Feature commits here are patch
bumps (the log uses `feat(...): … (vX.Y.Z)`).

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

- `commands/` — the six `/karto-*` slash commands (explore, chart, build, sync, init, show).
- `skills/` — `karto-grill` (converging interview), `karto-analyze-repo`, and three
  `karto-groom-*` skills (glossary / ADR / dependencies). Registered in `plugin.json`.
- `workflows/internal/` — dynamic LLM workflows (`discovery`, `chart`, `init`, `sync`).
- `workflows/lib/` — **pure, testable** helpers shared by scripts and the server
  (`apply-discovery`, `gherkin`, `maturity-derive`, `map-drift`, `open-scenarios`, `paths`,
  `survey`, `survey-html`). `paths.js` is the single source of truth for where the map and
  layout live.
- `scripts/` — deterministic CLIs (`validate-kartograph`, `validate-discovery`, `reconcile`,
  `survey-to-html`). Each is a pure function + a thin `import.meta.url`-guarded CLI.
- `server/serve.js` — zero-dependency static server for the viewer: serves viewer assets then
  project files, exposes `GET/POST /board`, `GET /features/...`, `POST /layout`, and pushes
  live-reload over SSE (`/events`) by watching the project tree.
- `viewer/` — the browser app (vanilla JS, no build). `kartograph.js` entry + `lib/` modules;
  Map view (capability graph) and Board view (cross-capability scenario Kanban).
- `schemas/v1/` — JSON Schemas for the map, glossary, ADR, and discovery survey.
- `test/` — `node:test` unit tests for the pure helpers and the schemas.

## Conventions & gotchas

- **Pure-function + CLI split.** New deterministic logic goes in a pure exported function
  (unit-tested) with a thin CLI wrapper guarded by
  `if (process.argv[1] === fileURLToPath(import.meta.url))`. Follow the existing files.
- **Map files live under `.kartograph/`.** The map (`kartograph.json`) and the viewer layout
  (`kartograph.layout.json`) live in a hidden `.kartograph/` directory at the project root —
  never loose in the root. `workflows/lib/paths.js` (`mapPath`, `layoutPath`, `KARTO_DIR`) is
  the only place that constructs these paths; Node code imports it, while the viewer fetches
  `/.kartograph/…` and the commands hardcode the same relative paths. Surveys
  (`kartograph/surveys/`), decisions (`kartograph/decisions/`), and `.feature` files
  (`features/`) keep their existing top-level locations — only the JSON map + layout moved.
  There is **no fallback** to the old project-root location.
- **Slugs are the key space.** Everything is keyed by lowercase-hyphen slugs
  (`^[a-z0-9][a-z0-9-]*$`); cross-references are slugs and must resolve (integrity gate).
- **Survey artifacts.** `/karto-explore` writes `kartograph/surveys/<date>-<slug>.discovery.json`
  (the canonical, append-only log) and, alongside it, a readable
  `.discovery.html` rendered deterministically by `scripts/survey-to-html.js`.
- **Defensive `args` parsing.** A Workflow can be mis-called with a JSON-*stringified* `args`
  object; every `workflows/internal/*.js` script defensively `JSON.parse`s a string `args`
  (see `test/workflow-args.test.js`) — keep this guard when editing them, or surveys come out
  empty.
- **Path tags drive maturity; tracking state lives in the map.** Each Gherkin `Scenario`
  carries exactly **one path tag** (`@happy`/`@edge`/`@error`) in its `.feature` file — that is
  the only kind of tag now, and it feeds maturity (`workflows/lib/gherkin.js` parses it). A
  scenario's **progress** — `Open → WIP → Developed → Accepted` — is *not* a tag; it lives in
  `kartograph.json`'s top-level `tracking` block, keyed by the canonical scenario ID
  (`<capability>/<feature.feature>#"<scenario>"`, see `viewer/lib/ids.js`). The pure helpers are
  `workflows/lib/tracking.js` (`getScenarioState`/`setScenarioState`, default `open`); writers go
  through `workflows/lib/map-store.js` (`writeMap`, atomic). Progress never changes maturity. The
  schema validates `tracking`; the integrity gate flags entries whose capability no longer exists.
  `/karto-build` advances scenarios to **Developed**; the user flips **Accepted** after walking
  them. Set state with `scripts/set-tracking.js` or the viewer's Tracking board; migrate legacy
  `@wip`/`@test`/`@done` tags with `scripts/migrate-tracking.js`.
- **Scenarios are user-walkable, not technical.** Features and scenarios are written for a
  non-technical stakeholder to walk through and confirm in front of the running system: plain
  domain language (glossary terms), only observable behaviour (Given = recognisable situation,
  When = user action, Then = confirmable outcome), and **no leaked implementation detail**
  (no DBs, endpoints, status codes, function/file names, internal IDs, frameworks). The authoring
  rules live in `workflows/internal/chart.js`.
- **Tests gate the pure layer only.** Live command/workflow behavior is verified by running
  the commands in Claude Code, not by the suite — keep the deterministic transforms covered by
  `node:test`.

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
  capabilities↔contexts, dependencies↔capabilities, rules↔subjects, ADR supersession, etc.

Passing `{ projectRoot }` adds a third gate: every `glossaryRef` is resolved against the
knowledge bundle on disk. That gate reads the filesystem by design — see below.

### The glossary is an OKF bundle on disk, never map data

The project glossary is a single [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
(OKF v0.2) bundle at **`knowledge/`** — one markdown file per term, YAML frontmatter plus a
markdown body. **The bundle is the single source of truth and nothing is ever duplicated
back into `.kartograph/kartograph.json`.** The map carries exactly two kinds of pointer:

- a top-level `knowledge: { bundle, okfVersion }` saying where the bundle is, and
- a `glossaryRef` on a subject/actor/event/rule/context/capability, holding the OKF **concept
  ID** — the concept's path inside the bundle without `.md` (`garten/pflanze`).

There is no `glossary` object in the map, and the schema rejects one. Nor is there any
definition text anywhere else in the map: `context.definition`, `capability.definition` and
`rule.statement` are **gone from the schema** — those sentences are the `description` of the
node's own concept. What the map keeps is the display `name`, the structure (context,
dependencies, `derived` counts, `subject` links) and the `glossaryRef`.

```
knowledge/
  index.md            bundle root index (generated); the only index.md that may carry
                      frontmatter, and only `okf_version`
  log.md              dated update history, newest first
  <kontext>/<slug>.md a term belonging to that Kontext
  shared/<slug>.md    a term genuinely used across more than one Kontext
```

`workflows/lib/okf.js` is the only place that knows the file syntax (a hand-rolled parser for
the YAML subset OKF uses — no dependency). `workflows/lib/knowledge.js` holds the bundle
semantics; `scripts/validate-knowledge.js` is the gate.

What OKF buys us beyond the old JSON blob, and what the workflows must keep honest:

- **Provenance** — `sources` records the survey (or the code `/karto-init` read) a term came
  from, so a definition is traceable to where it was agreed.
- **Trust** — `generated.by` is who wrote it, `verified[].by` is who *confirmed* it, and the
  trust tier (`unverified` → `machine-confirmed` → `human-reviewed`) is **derived** from the
  `human:` actor prefix, never stored. An LLM may never write a `human:` verification.
- **Lifecycle** — `status: draft | stable | deprecated` (absent means `stable`). Terms
  Kartograph writes are born `draft`; a retired term is **deprecated, never deleted**, so
  links and history keep resolving.
- **One canonical term** survives as the producer extension `aliases_to_avoid`. OKF
  deliberately prescribes no glossary structure (§4.1), so that rule is ours to enforce:
  `checkBundle` rejects two concepts sharing a title, or a title another concept rejects.

Follow the spec's tolerance rules: a broken cross-link and a missing optional field are
**warnings, never errors** (§6.1, §11) — the deterministic layer reports them and moves on.

### Migrating a pre-v0.18 map (`scripts/migrate-glossary-to-okf.js`)

`node scripts/migrate-glossary-to-okf.js [projectRoot]` moves both the old `glossary` object
and the map's own `definition`/`statement` text into the bundle, leaving a `glossaryRef`
behind. It is **deterministic and idempotent** — a second run reports nothing to do — and
atomic: every concept file is written before the map is swapped in.

Rules it follows, which any code touching it must preserve:

- **Placement**: a capability's concept goes in its context's directory, a context's in its
  own, everything else in `shared/`. A node that already points at a concept ID keeps that
  placement, and a concept already on disk is pointed at, **never overwritten**.
- **Never invent meaning.** A node with a name but no definition anywhere (subjects, actors
  and events carry only a `name`) becomes a concept whose description is the literal
  `TODO — define this term.` stub, reported on stderr and warned about by `checkBundle` on
  every later run until a human writes the real sentence.
- Everything it writes is `status: draft`, attributed to `process:kartograph-migrate`, sourced
  back at the old map, and never `verified`.

`/karto-sync` runs it as step 1a when it detects an unmigrated map.

### Which steps run on their own (`workflows/lib/automation.js`)

The pipeline is a chain — explore/revise → chart → build → walk — and how much of it runs
without stopping to ask is the **user's** policy, not the command's judgement. That policy is a
small `{ version, steps }` file at **`.kartograph/automation.json`**, tracked in git like the
map because it is the team's convention. `/karto-explore` and `/karto-revise` end by putting
the questionnaire to the user (via **AskUserQuestion**); every later command reads the answers
and acts **without asking again**.

Six steps, each with its own mode vocabulary — `workflows/lib/automation.js` is the single
source of truth for the catalogue, and `scripts/automation.js` is the only way commands touch it:

| step | governs | modes | default |
|---|---|---|---|
| `chart-after-explore` | end of explore/revise | `auto` \| `ask` \| `manual` | `ask` |
| `build-after-chart` | end of chart | `auto` \| `ask` \| `manual` | `ask` |
| `acceptance-suite` | build's outer loop | `full` \| `scenario` \| `off` | `scenario` |
| `commit` | after each scenario is Developed | `auto` \| `manual` | `auto` |
| `rewalk-check` | end of build | `auto` \| `manual` | `auto` |
| `walk-after-build` | end of build | `auto` \| `manual` | `manual` |

```bash
node scripts/automation.js . show                     # the policy, explained
node scripts/automation.js . get [<step>] [--survey <s>]   # JSON, or one step's mode
node scripts/automation.js . set <step> <mode> [...]  # atomic write
node scripts/automation.js . questions                # the AskUserQuestion payload
```

Rules any code touching this must preserve:

- **Tolerant, never blocking.** A preferences file must not be able to stop the pipeline, so
  `normalizePlan` and `readPlan` *never throw*: a missing file, unparseable JSON, an unknown
  step or a misspelled mode is a **warning plus a fallback to the default**. This is the same
  tolerance rule the OKF bundle follows.
- **Per-run override.** A survey carries the policy it was written under in its optional
  `automation` block (in `discovery.schema.json`, mirrored one-for-one from the catalogue and
  guarded by a test). `mergePlan(projectPolicy, survey.automation)` — the survey's stamp wins
  for the run that survey drives, so changing the defaults later never rewrites a decision the
  user already made about a specific feature. `--survey` on the CLI does exactly this.
- **The questionnaire is generated, not written by hand.** `questionnaire(plan)` emits the
  AskUserQuestion payload with each step's *current* mode listed first, sized to fit that tool's
  limits (≤4 questions, ≤4 options, 12-char headers — asserted by a test). The commands print it
  and ask it verbatim; they must not invent steps or reword options.
- **An unchecked box is an answer.** In the shared multi-select, *not* selecting a toggle means
  `manual` — `planFromAnswers` sets it explicitly rather than leaving the old value standing.
- **Two things are deliberately NOT configurable**, because they are correctness gates rather
  than preferences: `reconcile.js` (a map whose stored maturity disagrees with its scenarios
  fails the integrity gate) and build's **inner unit-test loop** (the double loop *is* the build
  method). Do not add them to the catalogue.
- **Workflows cannot read it.** `workflows/internal/build-all.js` can't touch the filesystem, so
  `/karto-build-all` reads the policy and passes it in `args.automation`; the script re-validates
  what it gets and falls back to the defaults.

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
  (`apply-discovery`, `automation`, `automation-store`, `board`, `board-data`, `feature-read`,
  `gherkin`, `ids`, `knowledge`, `layout`, `maturity-derive`, `map-drift`, `okf`,
  `open-scenarios`, `paths`, `survey`, `survey-html`, `tracking`). `paths.js` is the single
  source of truth for where the map, layout, automation policy and knowledge bundle live. `ids`, `board`
  and `layout` were the browser viewer's pure libs; the viewer is gone and the desktop
  renderer imports them from here.
- `scripts/` — deterministic CLIs (`validate-kartograph`, `validate-knowledge`,
  `validate-discovery`, `reconcile`, `survey-to-html`, `automation`). Each is a pure function + a thin `import.meta.url`-guarded CLI.
- `desktop/` — the Electron desktop app (the only UI). `main/` is the Node main process
  (filesystem, watchers, IPC, session), `preload.cjs` is the sandboxed bridge, and
  `renderer/` is the vanilla-JS UI (Map view + Tracking board). Launch it with
  `scripts/start-desktop.sh [projectDir]`; `/karto-show` wraps that.
- `schemas/v1/` — JSON Schemas for the map, knowledge concept frontmatter, ADR, and discovery
  survey.
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
  (`kartograph.layout.json`), the automation policy (`automation.json`), surveys
  (`.kartograph/surveys/`), and decisions (`.kartograph/decisions/`) all live in a hidden
  `.kartograph/` directory at the project root — never loose in the root.
  `workflows/lib/paths.js` (`mapPath`, `layoutPath`, `automationPath`, `surveysDir`,
  `decisionsDir`, `knowledgeDir`, `KARTO_DIR`, `KNOWLEDGE_DIR`) is the only place that constructs
  these paths; Node code imports it, while the commands hardcode the same relative paths. Two
  directories stay top-level because they are the product's living spec, deliberately visible:
  `features/` (the scenarios) and `knowledge/` (the glossary bundle). There is **no fallback**
  to the old `kartograph/` locations.
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
  domain language (the `knowledge/` bundle's canonical titles — a word in any concept's
  `aliases_to_avoid` must never appear), only observable behaviour (Given = recognisable situation,
  When = user action, Then = confirmable outcome), and **no leaked implementation detail**
  (no DBs, endpoints, status codes, function/file names, internal IDs, frameworks). The authoring
  rules live in `workflows/internal/chart.js`.
- **Tests gate the pure layer only.** Live command/workflow behavior is verified by running
  the commands in Claude Code, not by the suite — keep the deterministic transforms covered by
  `node:test`.

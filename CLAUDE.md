# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Kartograph is a plugin with **fourteen skills**, a structure validator for each of the nine
that write a fixed-shape file, a directory of **technology stacks** (three design documents
and the delivery scripts per stack), and no build step.
Each skill starts from a fresh context and knows only what the files in the target
project tell it:

- `kartograph-converse` runs one conversation and records it, block by block, as
  `kartograph/<YYYY-MM-DD-HHMM>-<slug>.conversation.md`.
- `kartograph-intent` reads one conversation and derives its goals, intended outcomes,
  non-goals, constraints and decisions, citing every entry, as
  `kartograph/<YYYY-MM-DD-HHMM>-<slug>.intent.md`.
- `kartograph-map` reads one intent and holds it against `features/` and the git history,
  writing `kartograph/<YYYY-MM-DD-HHMM>-<slug>.mapping.md`: done, partly done, new, or
  contradicts, each cited.
- `kartograph-knowledge` reads one intent and its mapping and records its concepts in
  `knowledge/`, an Open Knowledge Format v0.2 bundle (one markdown file per concept,
  path = identity).
- `kartograph-features` reads one intent and its mapping and derives capabilities
  (`features/<capability>/capability.md`) and Gherkin features
  (`features/<capability>/<feature>.feature`), updating what already exists.
- `kartograph-plan` takes one named capability, detects and declares the project's stack
  on first use (`docs/code-design/stack.md` plus the stack's three documents copied
  beside it), and writes `plans/<YYYY-MM-DD-HHMM>-<capability>.md`: a three-ring plan
  with a screens table, layer map, ports and adapters with exact signatures, files, and
  one task per screen (ring 1), per scenario (ring 2), per port or endpoint (ring 3).
- `kartograph-screens`, `kartograph-domain`, `kartograph-adapters` each execute one ring
  of the newest `planned` plan (the named capability's, else the newest), in that order;
  each later ring refuses to run until the previous ring's checkboxes are all ticked.
- `kartograph-walk` takes one named capability, feature or scenario, drives the running
  app in front of the person scenario by scenario after any ring, asks once per scenario,
  and records the verdicts in `walks/<YYYY-MM-DD-HHMM>-<capability>.md`.
- `kartograph-revise` takes what the person wants changed after seeing it, records their
  words as `kartograph/<YYYY-MM-DD-HHMM>-<slug>.revision.md`, and in the same run changes
  the affected scenarios, the concepts, writes a plan superseding the capability's plan
  (ticks kept for untouched work), and builds the change in the rings already built.
- `kartograph-deliver` takes a named action (run locally, on a device, TestFlight, Play
  internal, store listings, prepare a release, release, deploy), copies the stack's
  delivery scripts into the project's `distribution/` on first use and fills
  `distribution/config.sh`, then runs the matching script; outward actions are confirmed
  by the person once.
- `kartograph-release` ships the build tested on TestFlight and Play internal: checks it is
  newer than the store, writes the release notes, adds the new features to the store texts,
  renders the changed screens' screenshots (building the renderer once from the stack's
  `screenshots.md`), commits, asks once, then pushes the listings, releases and tags.
- `kartograph-migrate` brings a project's Kartograph files onto this plugin's layout, in
  one step and one commit, whatever version the project comes from.

The same skills are served to three runtimes from one place:

```
skills/<name>/SKILL.md                      the skill (agentskills.io format, read by all three)
skills/kartograph-converse/conversation-template.md skeleton of the conversation file
skills/kartograph-intent/intent-template.md   skeleton of the intent file
skills/kartograph-map/mapping-template.md     skeleton of the mapping file
skills/kartograph-knowledge/concept-template.md skeleton of one OKF concept file
skills/kartograph-features/capability-template.md skeleton of capability.md
skills/kartograph-features/example.md         worked example (fictional) for features
skills/kartograph-plan/plan-template.md       skeleton of one three-ring plan
skills/kartograph-walk/walk-template.md       skeleton of one walk record
skills/kartograph-revise/revision-template.md skeleton of one revision
skills/<name>/validate-*.js                 the skill's structure validator (see below)
migrations/<version>.md   what each layout change requires; the highest is the layout version
scripts/migrate-*.js   the mechanical part of the migrations
stacks/<stack>/STACK.md                     identity, status (ready | scaffold), detection rules
stacks/<stack>/design-system.md             tokens, theme, components, layout
stacks/<stack>/code-design.md               the three rings in that stack, layout, state, naming, DI, nav
stacks/<stack>/build-design.md              ports and adapters in detail, tests, definition of done
stacks/<stack>/screenshots.md               how kartograph-release builds the store-screenshot renderer
stacks/<stack>/distribution/                the stack's delivery entry scripts and config.sh.template
stacks/common/distribution/lib/             the shared delivery libraries (bash + stdlib python)
stacks/common/DISTRIBUTION.md               the delivery contract: layout, config keys, library API
test/*.test.js                              node:test suite for the validators (`npm test`)
.claude-plugin/plugin.json                  Claude Code manifest  (lists each skill directory)
.claude-plugin/marketplace.json             Claude Code marketplace, source "./"
.codex-plugin/plugin.json                   Codex manifest        (points at ./skills/)
.agents/plugins/marketplace.json            Codex marketplace, local source "./"
opencode/index.js                           OpenCode plugin: one tool per skill, returning
                                            SKILL.md + supporting files at call time
package.json                                npm manifest for the OpenCode plugin only
```

OpenCode plugins can register tools but not skills, which is why the OpenCode entry is a
tiny JS module: it reads the skill files from the package and returns them. It must never
carry a copy of the skill text. `package.json` exists only to publish that module as
`opencode-kartograph`; its single peer dependency is the OpenCode plugin SDK.

## Rules for editing a skill

- **Tool-neutral.** A skill must behave the same in Claude Code, Codex and OpenCode, so it
  asks in plain chat and reads files with whatever the runtime offers. Never reference a
  runtime-specific tool, variable (`${CLAUDE_PLUGIN_ROOT}`), or slash command in `SKILL.md`.
  Supporting files are addressed as "`<file>` in this file's directory"; the stacks as
  "the `stacks/` directory at the plugin root, two levels above this file's directory".
- **Each skill writes only its own output** and commits only that. None names or starts
  a phase beyond itself; the next phase is a separate skill that *reads* the previous
  one's files. The one deliberate exception is `kartograph-revise`: a change the person
  asks for after seeing the product must reach the revision, `features/`, `knowledge/`,
  the plan and the built rings in one run, one commit per step, or plan and code drift.
- **The AI drives.** Converse ends every message with the next question or the written
  file and never waits to be asked what comes next. Intent, map, knowledge, features, plan,
  screens, domain and adapters are fully automated: no question, no review, no
  confirmation; each runs to the end, commits, pushes, reports. Anything undecided becomes
  an open question, a stub, or friction in the written file. Walk is interactive by design,
  but asks exactly once per scenario, never after trivial steps. Plan and walk need an
  argument; the three ring skills fall back to the newest planned plan. Intent and map
  fall back to the newest conversation or intent without a successor. Revise asks only
  when the person's words can be read two ways, one question per message, recorded as a
  block. Release asks exactly once, after it has written and committed everything, before
  anything leaves the machine.
- **Frontmatter is the contract.** `name` is the slash name and the Codex skill folder.
  `description` states *when* to use the skill, never *how* it works — a description that
  summarises the process makes agents skip the body.
- **Adding a skill** means: a directory under `skills/`, an entry in
  `.claude-plugin/plugin.json`'s `skills` list (Codex needs nothing, it scans `./skills/`), a
  tool in `opencode/index.js` (list its supporting files in `files`), and a row in the
  README table.

## Stacks

- **Only plan reads a stack's design documents.** It detects the stack from the build
  files against each `STACK.md`'s *Detection* rules, stops on none, more than one, or
  `status: scaffold`, then copies the three documents into the project's
  `docs/code-design/` and writes `stack.md` there. Screens, domain and adapters read the
  project's copies only, so they stay self-contained and the user's edits to the copies
  steer every later run. Deliver copies a stack's `distribution/`; release reads its
  `screenshots.md` once, to build a project's renderer, and copies `release-check.sh` into
  a project whose `distribution/` predates it. A store stack's `screenshots.md` has the
  five sections of `stacks/kmp/screenshots.md`; a scaffold's are `UNFILLED`.
- **Adding a stack** is adding `stacks/<name>/` with `STACK.md` (frontmatter `name`,
  `title`, `status`, `version`, `targets`, `docs`; a *Detection* section; a table of what
  each document must cover) and the three documents with the same section headings as
  `stacks/kmp/`. A scaffold carries an `UNFILLED` marker in every section and
  `status: scaffold`; it becomes `ready` only when filled from the owner's own conventions,
  never from general practice (the user's knowledge repo rule L7).
- **The KMP stack** derives from the user's knowledge repo (`~/projects/knowledge/references/`,
  atoms A0–A11, C1, C2, C9–C12, P3, P4, P8, I1–I4). Two deliberate departures, marked in
  the documents: the theme lives in `shared/` (core has no Compose), and the server
  section of `build-design.md` is Kartograph's own minimal default because the repo's
  server atom is a deferred stub. The vocabulary is the user's, not hexagonal's: the code
  says `…UseCase`, `…Repository`/`…Impl`, `…Api`, `…Dao`, Pattern A/B, seam; never "port"
  or "adapter" in identifiers, even though the documents teach the rings as a hexagon.
- **The kmp-toolchain stack** is the KMP stack built with JetBrains' Kotlin Toolchain
  (`project.yaml`, one `module.yaml` per module, the committed `kotlin` wrapper) instead of
  Gradle: the owner's decision of 2026-09-25 for new KMP projects; existing Gradle projects
  stay on `kmp`. It derives from the same knowledge-repo atoms plus I11 (Kotlin Toolchain);
  the build facts come from the Toolchain's documentation and a hands-on check on
  2026-09-25, and every line that check did not exercise (iOS archive and export, Android
  `kotlin run`, the server module) says so. Everything that is not the build is copied from
  `stacks/kmp/`; each forced change is marked *Toolchain departure*. The owner's answers
  of 2026-09-25 hold in its documents: projects start with `kotlin new`, no IDE appears
  anywhere, P8 runs through `./kotlin compose-hot-reload-mcp-server` (verified, with
  caveats), and the stack covers only a Compose-UI iOS app. A native SwiftUI iOS app
  over an SPM-wrapped XCFramework with SKIE (I5) stays on `kmp` until the Toolchain
  exports an XCFramework with full SKIE. The Toolchain is
  **Alpha**, so a Toolchain release can break a document: re-check before bumping the
  stack's `version`. Its delivery scripts are kmp's byte for byte; `STACK="kmp-toolchain"`
  makes `kotlin_build_lib` source `lib/kotlin-toolchain.sh` instead of `lib/gradle.sh`.
- **The apple-swift stack** derives from the owner's two shipped Swift apps, Beatrep
  (`~/projects/beatrep`) and Mokuso (`~/projects/mokuso`), plus the knowledge repo's
  native-lane atoms (MON13, MAS8–MAS12, HRD7, RED10, CI4). Where the two apps differ the
  documents take the newer convention and mark the line *project dial* (Swift 6 over mode
  5, `@Observable` over `ObservableObject`, SwiftData over plain files, Swift Testing over
  XCTest, English over German identifiers, XcodeGen over a checked-in project); a project's
  copy may switch a dial. One deliberate departure from KMP, marked: doubles stay beside
  their port in the app target and are chosen only in `AppEnvironment` under `isUITest`,
  because they are the UI-test and walk substrate. Apple's guidance is cited only where it
  confirms a convention.
- **The python-fastapi stack** derives from the owner's simulation-to-AI platform AIDA
  (`~/projects/aida`): a FastAPI aggregator with static dashboards over one shared
  stylesheet and script (no build step), a JSBSim worker, Redis streams, Postgres with a
  single idempotent `db/init.sql`, a pytest suite in a docker image with an `integration`
  marker, docker compose first and the same images on Kubernetes. Its ports are
  `typing.Protocol` classes, its composition root is `wiring.py` reading one env var per
  port (the shape of AIDA's `build_engine(kind)`), and the demo flag is the `fake` value
  of that variable, so fakes stay in production code like AIDA's `SyntheticEngine`. Lines
  the source project was silent on are marked *stack default* in the documents.
- Bump the `generated.by` actor (`kartograph-knowledge/<version>`) in the knowledge
  `SKILL.md` and `concept-template.md` with every release.

## Rules the deliver skill and the delivery scripts must keep

- **The contract is `stacks/common/DISTRIBUTION.md`.** Every function name, config key and
  script in it exists; `test/distribution.test.js` sources the libraries and checks. A
  new function, key or script is added there first.
- **Common library, per-stack entry scripts.** `stacks/common/distribution/lib/` is copied
  into every project; `stacks/<stack>/distribution/` holds only the entry scripts and
  `config.sh.template`. An entry script shared by several stacks is byte-identical in each
  (the test enforces it); edit it once and copy. Where the build system matters, a script
  calls `kotlin_build_lib` and the Kotlin build interface (`android_version_read`, …),
  never `gradle.sh` or `kotlin-toolchain.sh` directly; `STACK` in `config.sh` decides.
- **Bash 3.2, stdlib Python, curl, openssl.** No PyJWT, no fastlane, no Ruby, no gcloud.
  Identifiers (team, key ids, package names, hosts) come only from `config.sh`; the test
  rejects any literal from the source projects.
- **`release-check.sh` only reads**, and uses nothing but `asc_get` and
  `play_track_versions`, so it works when copied alone into a project whose library is
  older. Release ships the tested build; nothing bumps or rebuilds on the way to the stores.
- **Outward actions confirm.** Upload, promote, submit and deploy call `confirm_typed`;
  `--yes` skips it and the skill passes it only after the person agreed in chat. A step that
  fails deletes the edit or reservation it opened and says "nothing was published".
- **Numbers land in the diff.** A bumped version or build number is written to the
  project's file before the upload. A Mac `.pkg` is validated before it is uploaded. Never
  signing flags on the `xcodebuild` command line; never two runs on one derived-data path.
- **The scripts consolidate** Longpath, AFuP Karten, MIDI Aid, Mokuso, Beatrep, Kikitori
  and Hyperid; a trap those projects learned (cloud signing, the DER signature, the Play
  commit error body, 403 versus 404, APP_IPHONE_69) stays as a comment where it applies.

## The validators are the structure contract

Every artifact a skill writes has a validator next to the skill, and the skill runs it
before committing. They exist so files never drift from their templates:

```bash
node skills/kartograph-converse/validate-conversation.js kartograph/<file>.conversation.md # or no arg: all of ./kartograph
node skills/kartograph-intent/validate-intent.js kartograph/<file>.intent.md               # or no arg: all of ./kartograph
node skills/kartograph-map/validate-mapping.js kartograph/<file>.mapping.md                # or no arg: all of ./kartograph
node skills/kartograph-migrate/validate-kartograph.js kartograph                           # or no arg: ./kartograph
node skills/kartograph-knowledge/validate-knowledge.js knowledge        # or one concept file
node skills/kartograph-features/validate-features.js features           # or one capability dir
node skills/kartograph-plan/validate-plan.js plans/<file>.md            # or no arg: all of ./plans
node skills/kartograph-walk/validate-walk.js walks/<file>.md            # or no arg: all of ./walks
node skills/kartograph-revise/validate-revision.js kartograph/<file>.revision.md  # or no arg: all of ./kartograph
npm test                                                                # the suite behind them
```

Rules for editing them:

- **Self-contained.** Each validator is one file with no imports beyond Node built-ins,
  because a skill directory must work when copied on its own. The YAML-subset parser lives
  only in the knowledge validator; the other frontmatters are flat and need no parser,
  with `sources`/`related` as one-line `[a, b]` lists.
- **Pure function + thin CLI.** `validateConversation`, `validateIntent`, `validateMapping`,
  `validateKartograph`, `validateConcept`/`validateBundle`,
  `validateCapability`/`validateFeature`/`validateTree`, `validatePlan`, `validateWalk`,
  `validateRevision` take
  text or a path and return `{ errors, warnings }` (plan also returns which rings are
  done); the CLI is guarded by `fileURLToPath(import.meta.url) === realpathSync(process.argv[1])`.
  Tests exercise the functions on fixtures in temp dirs.
- **Template and validator change together.** A new section, key or rule in a template
  means the same change in its validator and a test for it. Errors are for structure the
  template prescribes; warnings are for things the spec tolerates.
- **Angle-bracket placeholders are errors** in every artifact, except single-token
  `<param>` in `.feature` files, which are Scenario Outline parameters.

## Rules the knowledge skill must keep (OKF v0.2)

- Only `type` is required by the spec; we always write `title`, `description`, `status`,
  `generated`, `sources`. Six types, one directory each: Concept, Actor, Subject, Event,
  Command, Policy.
- **Provenance:** `sources[]` points back at the intent (`../kartograph/<file>.intent.md`) and body
  quotes are footnoted to `sources[].id`.
- **Trust:** an LLM never writes `verified`; the trust tier is derived from the `human:`
  prefix, never stored.
- **Lifecycle:** new concepts are `draft`; retired ones become `deprecated`, never deleted.
- **One canonical title** per concept; synonyms live in `aliases_to_avoid`. Same title →
  extend; contradiction → the existing definition stays and the intent's wording is
  recorded under `# Collision`; undefined word → a `draft` stub reading
  `TODO — define this term.`, never invented.
- `index.md` carries only `okf_version: "0.2"` as frontmatter; `log.md` is date-grouped,
  newest first. Broken cross-links are tolerated by the spec.

## Rules the features skill must keep

- One directory per **capability**, never per intent; capabilities may nest as
  sub-capability directories of the same shape. Every directory under `features/` holds a
  `capability.md`; `## Features` lists its own `.feature` files, `## Capabilities` its
  sub-capabilities. Feature files are plain Gherkin: `Rule:` optional, no requirement
  line, `Background:` allowed, tags anywhere Gherkin allows them, `# language: de` on
  line 1 for German files. The validator checks only Kartograph's additions: the two
  header comments, one `Feature:`, unique scenario names, a When and a Then per scenario.
- `scripts/migrate-features.js <project>` moves a v0 tree (`features/<context>/<capability>/`,
  no `capability.md`, no headers) onto this contract without touching a scenario; it
  writes one migration intent per project as the provenance of every legacy file.
- **Never invent requirements.** Undecided behaviour is an open question in
  `capability.md`, never a scenario with a guessed outcome or a `TODO` step.
- **Steps are bound downstream.** Existing scenario steps change only when the behaviour
  changed; titles are safe. Nothing is removed unless the intent explicitly retires it.
- **Vocabulary comes from `knowledge/`**: canonical titles only, never a word in any
  concept's `aliases_to_avoid`. The skill reads the bundle but never writes it.

## Rules the plan and ring skills must keep

- **The plan is executable by a stranger** (modelled on superpowers' `writing-plans`):
  exact paths, exact signatures in an *Interfaces* block per task, real code in every
  step, a `Run:` and `Expected:` line per test run, ring-2 and ring-3 tests expected to
  FAIL first, ring 1 with no tests at all. The validator rejects every placeholder pattern
  and cross-checks the screens table, the layer map, the tasks and the feature files.
- **The plan, its template, its validator and the ring skills are stack-neutral.** They
  speak of the state contract, the ports, the presentation model, the fakes, the
  composition root and its binding, the demo flag, the adapter and its double; every
  concrete name (ViewModel or Model, Koin module or `AppEnvironment`, Room or SwiftData,
  `./gradlew` or `xcodebuild`) comes from the project's `docs/code-design/` copies. The
  validator's wiring check accepts any binding or wiring word, never a framework name.
  A stack-specific word in a skill or the template is a bug.
- **Rings execute in order and only their own ring.** Screens: presentation, ports,
  fakes, wiring, theme if missing. Domain: implementations, rules, the ports the core
  adds, one presentation-model test per scenario, demo data behind the demo flag, ring-1
  doubles deleted once nothing binds them unless the stack keeps them as its demo
  substrate. Adapters: persistence, HTTP, platform capabilities per target, the server,
  the dependency manifest. Nothing above the ring's boundary changes; a needed change
  there is a reported deviation, never a silent one.
- **The plan is the contract, the code is the truth.** A step the code contradicts gets
  the smallest correction that keeps its intent, reported. The plan's only edit is its
  checkboxes; a re-plan writes a new file and marks the earlier one `superseded`.
- **Test first, fakes over mocks, never a weakened test, never an edited `.feature`.**
  Gherkin is never executed: one scenario is one test function in the stack's framework
  (`kotlin.test`, Swift Testing), per the user's knowledge repo; the visual outer loop
  goes through whatever live window is connected (Compose Hot Reload, a simulator, a
  browser), and never launches, reloads or resets an app the person is looking at.

## Rules the walk skill must keep

- **Present, drive, ask, in that order, every scenario.** The feature title and the
  scenario text verbatim go on screen before anything is driven; the person's answer is
  the only thing that becomes a verdict. The AI's observation never is.
- **Stop rather than improvise**; never edit the app, its data or a `.feature` file to make
  a scenario walkable; never `reload`, `restart` or `reset_ui`; never start the app.
- **Drivers in this order:** Compose Hot Reload (desktop window), Claude in Chrome then
  Playwright (web), a screen-control tool (simulator, native macOS, mirrored iPhone/iPad),
  else the person drives. The skill names runtime tools by their generic role only.
- **The walk record is the only output**, one file per walk, never a change to
  `features/`. A failure needs the person's words; a not-drivable scenario needs where it
  stuck.
- **Voice first.** Designed for ChatGPT/Codex voice mode: the written blocks stay as the
  record, but what matters is spoken in short sentences, actions are announced before
  they happen, questions are one-word answerable, nothing technical is said aloud.

## Rules the conversation, intent and mapping skills must keep

- **Converse records, never interprets.** The person's words verbatim; an AI block holds
  only lookups, one line of reasoning, the question and the options. Lookups (git log,
  features from the top capability down) serve only to ask.
- **Intent derives only from the conversation** and cites the person's block for every
  goal, outcome, non-goal, constraint and decision; an AI recommendation is a decision only
  when the person chose it. Status `derived`.
- **Map treats features and the git log as the truth**; every outcome lands in exactly one
  of Done (commit and scenario), Partly done (cited, `Missing:`), New, Contradicts (`Open
  question:`). Knowledge and features refuse an intent without its mapping.
- **One flat `kartograph/`**, documents `<stamp>-<slug>.<type>.md`; the intent and mapping
  take the conversation's stamp and slug. A revision is the fourth type, with its own stamp.

## Rules the revise and release skills must keep

- **Revise records first.** The person's words verbatim in numbered blocks, the first and
  last the person's; every change cites a person block of the revision itself. `sources`
  names the intents of the affected capabilities; `status` goes `recorded` → `applied`.
- **Revise changes exactly what was said.** Untouched scenarios stay byte for byte; each
  changed or added one gets `# Changed by kartograph/<file>.revision.md` directly above it
  and the capability a `- Revision:` source line; removal only when said.
- **The superseding plan keeps the ticks** of every task the revision does not touch and
  marks the rest `**Revised:** changed|added`, unticked; `validate-plan.js` checks both
  against the superseded plan. Revise builds only rings that were fully built, by the ring
  skills' own `SKILL.md`, never reloading the app; the ring skills skip ticked tasks.
- **Release ships the tested build.** `release-check.sh` decides (exit 1: a new build
  first; exit 3: a store could not be read, never read as exit 1); a first release is out
  of scope. The notes live only in `distribution/release-notes/v<X.Y.Z>.md` (REL5, AV8),
  positive and factual, never naming another platform (ASC32); store texts gain only
  what is new; screenshots are renders from the project's renderer (ASC13, MAS10, ASC14,
  GP5), committed under `distribution/store/`, only for changed screens.
- **Release asks once**, then, stopping at the first failure:
  `push-store-metadata.sh --apple --screenshots --version <X.Y.Z> --yes`, then
  `release-stores.sh --notes … --version <X.Y.Z> --yes`, then
  `push-store-metadata.sh --play --screenshots --yes` last (Play's listing goes live when
  its edit commits), then the tag `v<X.Y.Z>` unless it exists. A project whose copied
  `push-store-metadata.sh` or `lib/asc.sh` predates `--version` gets both refreshed first.
- **A revision plan rebuilds what the revision touched**: every scenario it changed or
  added has a `**Revised:**` ring-2 task, never only a friction entry; `validate-plan.js`
  checks it, and skips the features cross-check for a `superseded` plan.

## Migrations

- A release that changes a project's layout adds `migrations/<version>.md` (Target state,
  Recognise, Do) and extends `scripts/migrate-kartograph.js`. Migration scripts always
  write the newest layout; when a later version changes it, the earlier scripts are
  updated, never chained through an intermediate layout.
- Every skill but migrate starts with the byte-identical `## 0. Version gate`;
  `test/skills.test.js` enforces it.
- A new, optional document type or file is not a layout change: every project on the
  current layout stays valid, so it gets no migration document (the revision of 3.2.0).
  A migration document raises the layout version and stops every project at the gate.

## Releasing

Bump `version` in **all three** of `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`
and `package.json` to the same value — each marketplace compares its own manifest, so an
un-bumped release is invisible downstream. Then tag it and push commit and tag together; the
repo is its own marketplace and resolves against `main`. OpenCode users get the release only
after `npm publish`:

```bash
git tag -a v2.1.0 -m "v2.1.0 — <the one-line headline>"
git push origin main && git push origin v2.1.0
```

Tags `v0.19.0` … `v0.21.2` mark the earlier, much larger Kartograph (a living map with a
desktop app, validators, and nine commands); `v1.x` the single-pipeline rebuild. That
history is still in git; nothing in the current plugin depends on it.

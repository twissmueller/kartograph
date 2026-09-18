# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Kartograph is a plugin with **eight skills**, a structure validator for each of the five
that write a fixed-shape file, a directory of **technology stacks**, and no build step.
Each skill starts from a fresh context and knows only what the files in the target
project tell it:

- `kartograph-explore` runs one exploring conversation and writes
  `intents/<YYYY-MM-DD-HHMM>-<slug>.md`.
- `kartograph-knowledge` reads one intent file and records its concepts in `knowledge/`,
  an Open Knowledge Format v0.2 bundle (one markdown file per concept, path = identity).
- `kartograph-features` reads one intent file and derives capabilities
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

The same skills are served to three runtimes from one place:

```
skills/<name>/SKILL.md                      the skill (agentskills.io format, read by all three)
skills/kartograph-explore/intent-template.md   skeleton of the intent file
skills/kartograph-knowledge/concept-template.md skeleton of one OKF concept file
skills/kartograph-features/capability-template.md skeleton of capability.md
skills/kartograph-features/example.md         worked example (fictional) for features
skills/kartograph-plan/plan-template.md       skeleton of one three-ring plan
skills/kartograph-walk/walk-template.md       skeleton of one walk record
skills/<name>/validate-*.js                 the skill's structure validator (see below)
stacks/<stack>/STACK.md                     identity, status (ready | scaffold), detection rules
stacks/<stack>/design-system.md             tokens, theme, components, layout
stacks/<stack>/code-design.md               the three rings in that stack, layout, state, naming, DI, nav
stacks/<stack>/build-design.md              ports and adapters in detail, tests, definition of done
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
  one's files.
- **The AI drives.** Explore ends every message with the next question or the written
  file and never waits to be asked what comes next. Knowledge, features, plan, screens,
  domain and adapters are fully automated: no question, no review, no confirmation; each
  runs to the end, commits, pushes, reports. Anything undecided becomes an open question,
  a stub, or friction in the written file. Walk is interactive by design, but asks exactly
  once per scenario, never after trivial steps. Plan and walk need an argument; the three
  ring skills fall back to the newest planned plan.
- **Frontmatter is the contract.** `name` is the slash name and the Codex skill folder.
  `description` states *when* to use the skill, never *how* it works — a description that
  summarises the process makes agents skip the body.
- **Adding a skill** means: a directory under `skills/`, an entry in
  `.claude-plugin/plugin.json`'s `skills` list (Codex needs nothing, it scans `./skills/`), a
  tool in `opencode/index.js` (list its supporting files in `files`), and a row in the
  README table.

## Stacks

- **Only plan reads `stacks/`.** It detects the stack from the build files against each
  `STACK.md`'s *Detection* rules, stops on none, more than one, or `status: scaffold`,
  then copies the three documents into the project's `docs/code-design/` and writes
  `stack.md` there. Screens, domain and adapters read the project's copies only, so they
  stay self-contained and the user's edits to the copies steer every later run.
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
- **The apple-swift stack** derives from the owner's two shipped Swift apps, Beatrep
  (`~/projects/beatrep`) and Mokuso (`~/projects/mokuso`), plus the knowledge repo's
  native-lane atoms (MON13, MAS8–MAS12, HRD7, RED10, CI4). Where the two apps differ the
  documents take the newer convention and mark the line *project dial* (Swift 6 over mode
  5, `@Observable` over `ObservableObject`, SwiftData over plain files, Swift Testing over
  XCTest, English over German identifiers, XcodeGen over a checked-in project); a project's
  copy may switch a dial. One deliberate departure from KMP, marked: doubles stay beside
  their port in the app target and are chosen only in `AppEnvironment` under `isUITest`,
  because they are the UI-test and walk substrate. Apple's guidance is cited only where it
  confirms a convention. The plan template, its validator (it requires a Koin step) and the
  ring skills still speak KMP; a Swift plan cannot pass them yet.
- Bump the `generated.by` actor (`kartograph-knowledge/<version>`) in the knowledge
  `SKILL.md` and `concept-template.md` with every release.

## The validators are the structure contract

Every artifact a skill writes has a validator next to the skill, and the skill runs it
before committing. They exist so files never drift from their templates:

```bash
node skills/kartograph-explore/validate-intent.js intents/<file>.md     # or no arg: all of ./intents
node skills/kartograph-knowledge/validate-knowledge.js knowledge        # or one concept file
node skills/kartograph-features/validate-features.js features           # or one capability dir
node skills/kartograph-plan/validate-plan.js plans/<file>.md            # or no arg: all of ./plans
node skills/kartograph-walk/validate-walk.js walks/<file>.md            # or no arg: all of ./walks
npm test                                                                # the suite behind them
```

Rules for editing them:

- **Self-contained.** Each validator is one file with no imports beyond Node built-ins,
  because a skill directory must work when copied on its own. The YAML-subset parser lives
  only in the knowledge validator; the other frontmatters are flat and need no parser.
- **Pure function + thin CLI.** `validateIntent`, `validateConcept`/`validateBundle`,
  `validateCapability`/`validateFeature`/`validateTree`, `validatePlan`, `validateWalk` take
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
- **Provenance:** `sources[]` points back at the intent (`../intents/<file>.md`) and body
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
- **Rings execute in order and only their own ring.** Screens: presentation, use case
  interfaces, fakes, wiring, theme if missing. Domain: use case implementations, rules,
  repository interfaces, one ViewModel test per scenario, in-memory repository behind the
  demo flag, fakes deleted from production and reborn in `commonTest`. Adapters: the
  data layer, `core/data/`, `server/`, per-target platform modules, the version catalog.
  Nothing above the ring's boundary changes; a needed change there is a reported
  deviation, never a silent one.
- **The plan is the contract, the code is the truth.** A step the code contradicts gets
  the smallest correction that keeps its intent, reported. The plan's only edit is its
  checkboxes; a re-plan writes a new file and marks the earlier one `superseded`.
- **Test first, fakes over mocks, never a weakened test, never an edited `.feature`.**
  Gherkin is never executed: one scenario is one `kotlin.test` function, per the user's
  knowledge repo; the visual outer loop goes through Compose Hot Reload when a window is
  connected, and never launches, reloads or resets an app the person is looking at.

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

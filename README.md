# 🗺️ Kartograph

**Draw out what a person really wants, write down the words it is made of, the behaviour it asks for, show it on screen, plan and build it for real, then walk them through it.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-FFDD00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/twissmueller)

Kartograph is a plugin for [Claude Code](https://code.claude.com),
[Codex](https://developers.openai.com/codex) and [OpenCode](https://opencode.ai) with seven
skills that build on each other through plain files in your repository:

| skill | reads | writes |
|---|---|---|
| **`kartograph-explore`** | a conversation with you | `intents/<date>-<slug>.md` |
| **`kartograph-knowledge`** | one intent file | `knowledge/`, an Open Knowledge Format bundle |
| **`kartograph-features`** | one intent file | `features/`, capabilities and Gherkin features |
| **`kartograph-views`** | one capability or feature | screens and view models on fake data in your KMP app |
| **`kartograph-plan`** | one capability or feature | `plans/<date>-<capability>.md`, one double-loop task per scenario |
| **`kartograph-build`** | the newest plan for a capability | the real behaviour underneath: use cases, repositories, database, API, server |
| **`kartograph-walk`** | one capability, feature or scenario, and you watching | `walks/<date>-<capability>.md`, your verdicts |

Each run starts from a fresh context. What one skill knows, it knows from the files the
previous one wrote, so everything worth keeping is in your repo, versioned, and readable
by you, a colleague, or a later AI session.

![The seven phases: who does what, which files result, and when a phase hands over](docs/phases.svg)

## Why

AI assistants write code faster than anyone can think. What they cannot do is know what you
meant. Every drifting implementation, every "that's not what I asked for", starts with an
intent that lived only in someone's head and was never pulled out and written down. And once
written down, the words it uses drift too, unless they are defined once and reused.

## `kartograph-explore` — one conversation, one intent file

The conversation has two halves:

1. **Opening up.** Before any solution is on the table: who you are in this, what you want
   and why, who it is for, and how you would recognise success. When your goal could be
   read two ways, the AI reflects both back and lets you pick.
2. **Converging.** Then it grills you, one question at a time, always with a recommended
   answer, until it can play your whole intent back and you say nothing is missing. Vague
   words get sharpened into concrete cases. Solutions get asked what outcome they serve.
   Non-goals get asked for explicitly. Decisions get recorded with their reasons and the
   alternatives you rejected. Anything you cannot answer yet becomes an open question with
   a name next to it, not a loop.

The intent file has the same sections every time, and an empty section says so: summary,
who (your role, who benefits, who is affected), goals, intended outcomes, non-goals,
constraints, assumptions, decisions with reasons, open questions with who can answer them,
terms, notes. It is written in the language of the conversation.

## `kartograph-knowledge` — one intent, a growing knowledge base

Reads the intent you name, or the newest one, and records every concept it introduces in
`knowledge/`, a bundle in Google's
[Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
v0.2: one markdown file per concept, YAML frontmatter plus a body, the path being the
concept's identity.

```
knowledge/
  index.md      generated listing, grouped by type
  log.md        one entry per processed intent, newest first
  concepts/     a domain word with a definition
  actors/       a role or system that acts
  subjects/     a thing acted upon, with a lifecycle
  events/       something that happened, past tense
  commands/     an action an actor issues, imperative
  policies/     when <event> then <command>, or a constraint that must hold
```

Every concept records where it came from (`sources` points back at the intent, with
footnoted quotes in the body), who generated it, and its lifecycle (`draft`, `stable`,
`deprecated`). One canonical title per concept: a synonym joins `aliases_to_avoid` instead
of becoming a second file. Existing definitions are extended, never rewritten; a
contradicting intent is recorded under a `# Collision` heading for a person to settle. A
word the intent uses but never defines becomes a draft stub that says so, not a guess.
Retired concepts are deprecated, never deleted.

The run is fully automated: it asks nothing, writes, commits, pushes, and reports the
stubs and collisions left for you.

## `kartograph-features` — one intent, the behaviour it asks for

Reads the intent you name, or the newest one, and turns it into what the product must let
someone achieve and how that behaves, under `features/`:

```
features/
  <capability>/
    capability.md        the lasting ability: sources, purpose, scope, constraints, open questions
    <feature>.feature    one Feature, scenarios grouped under Rule: headings
```

Each rule states its requirement in [EARS](https://alistairmavin.com/ears/) form
("When <trigger>, the system shall <response>"), and each scenario is a concrete example
in the domain's own words, using the canonical titles from `knowledge/` and never a word
listed there as an alias to avoid. Every feature file names the intent and capability it
came from.

It reconciles before it writes. A behaviour already covered by an existing scenario is
linked, not duplicated. A behaviour an intent changes updates only the steps that
changed, since scenario steps may be bound to step definitions downstream. A behaviour
the intent leaves undecided becomes an open question in `capability.md`, never a scenario
with a guessed outcome. A contradiction with an existing agreement is recorded with both
statements, never resolved by the AI. Nothing is removed unless the intent says so.

Fully automated, like knowledge: no questions, then commit, push, and a report of what
was created, updated, reused, and left open.

## `kartograph-views` — one capability, its screens on fake data

Builds phase 1 of a capability in a Kotlin Multiplatform app: the screens, the view
models, and fake use cases holding deterministic sample data, so every scenario can be
walked in the running app and you can judge the flow before anything real is built. You
name the capability or feature; the skill reads its scenarios, the `knowledge/` bundle for
the words, and two documents in your project:

- `docs/design-system.md`: tokens, theme entry point, components and layout rules.
- `docs/code-design/mvvm.md`: the five layers, State/Event/Effect, naming, DI, navigation,
  and the three phases: view and view model on fakes, then real use cases, then
  repositories.

If your project has neither, the skill copies in the defaults it ships: a slate-and-blue
Material 3 theme with light and dark modes on an 8 dp grid, and an MVVM design built on
Koin, Jetpack Navigation 3 and `androidx.lifecycle.ViewModel` in `commonMain`. Edit them in
your project; every later run follows your copy.

It writes one Gradle feature module per capability, wires it into Koin, navigation and
`settings.gradle.kts`, creates the theme in `shared/` if missing, compiles, and, when a
Compose Hot Reload server is connected, reloads and screenshots each screen. It never
launches the app, never scaffolds a project, and builds nothing a scenario does not state.
Then it commits as `views: <capability>`, pushes, and tells you which screens to open and
which scenarios to walk.

## `kartograph-plan` — the implementation plan, one task per scenario

Before anything real is built, the plan. You name the capability; the skill reads its
scenarios, `knowledge/`, both design documents, the module as views left it, `core/`,
`server/`, the build and the last walk, and writes `plans/<date>-<capability>.md`: the
layer map (which scenario crosses which layers, and its entry point), what is reused and
what is new, the ports and adapters with exact Kotlin signatures, the files to create or
modify, the global constraints, then one task per scenario in double-loop shape with the
outer test as real code, each layer's failing test and minimal code, the Koin change, the
on-screen check and the commit. Modelled on superpowers' writing-plans: written for an
implementer who sees only their task, and with no placeholders anywhere, no "TBD", no
"add error handling", no "similar to task 3". A scenario that cannot be planned as
written gets a friction entry instead of a task. Fully automated, validated, committed
as `plan: <capability>`, pushed. A re-plan supersedes the earlier plan.

## `kartograph-build` — the real thing, task by task

Executes the newest plan for a capability; without one it stops and says to plan first.
It reviews the plan against the code as it is now, then works through the tasks in
order, each a scenario in double-loop shape:

- **Outer loop:** one test named after the scenario, at the ViewModel level with Given,
  When and Then inside, red first. Your knowledge repo's rule, one scenario is one test,
  so no Gherkin runner is added.
- **Inner loop:** for every layer the scenario crosses, a failing test, the minimal code,
  green, refactor. Use cases and repository interfaces in `domain/` are the ports; the
  adapters are `…RepositoryImpl` over Ktor and Room data sources, Pattern B platform
  capabilities with per-target implementations, and the Ktor server under `server/`.
  Exceptions become `AppError` at the repository boundary and travel as `Resource<T>`.
- **Then it looks:** when a Compose Hot Reload window is connected it reloads and checks
  the scenario's `Then` on screen; otherwise compiling every target is the evidence and
  the report says so.

Phase-1 fakes move to `commonTest`; the sample data survives as an in-memory repository
behind a demo flag so the walk still works before a backend exists. A step the code
contradicts gets the smallest correction that keeps its intent, and the deviation is
reported; a scenario that cannot be built as written is skipped with its friction
recorded; feature files and the plan's content are never edited, only its checkboxes. `build-design.md` in the skill holds the layer-by-layer rules: Room with
semver-collapsed versions and a migration test each, the Ktor client with retry, auth and
timeouts, `safeApiCall` translation, the server's routes, status mapping and route tests,
and the definition of done. Commits as `build: <capability>`, pushes, reports what moved
and what stayed open.

## `kartograph-walk` — you watch, it drives, you judge

Presents what was built, scenario by scenario, in the running app, whether that is the
phase-1 screens on sample data or the finished feature. You start the app on the surface
you want to see it on; the skill picks the driver that can reach it: Compose Hot Reload
for a desktop window, Claude in Chrome or Playwright for a web UI, a screen-control tool
for the iOS simulator, a native macOS app or an iPhone or iPad mirrored to the Mac, and
if none can, you drive while it narrates.

For every scenario, in this order: it shows the feature title and the scenario text
verbatim from the file, then drives it, bringing the app into the `Given` through the UI,
taking the `When` as a user would, and saying in the scenario's own words what it actually
sees at the `Then`, with a screenshot. Then it asks: passed, failed, or skipped. It paces
like a person would: no question after trivial steps, one "with me so far?" where a viewer
could lose the thread on a long scenario.

The guardrails are the point. Its observation is never the verdict. It stops and says
where it got stuck rather than improvising, and never edits the app, its data or a feature
file to make a scenario walkable. It never reloads, restarts or resets the app under test,
and never starts it. Anything destructive is confirmed with you first. It narrates in plain
domain language, never files, selectors or code.

It is meant to be run in voice mode (ChatGPT or Codex), so you keep the app full screen
and talk instead of type: the scenario is read aloud step by step, each action is
announced before it happens, what is seen is said in one sentence, and the question is
answerable with a word. Nothing technical is ever spoken; that stays in the written record.

The walk ends in `walks/<date>-<capability>.md`: driver, surface, one section per scenario
with the verdict and your words on a failure, a summary, and one line saying what that
surface proves. Committed as `walk: <capability>`, pushed. Feature files stay untouched.

## Install

### Claude Code

```
/plugin marketplace add twissmueller/kartograph
/plugin install kartograph@twissmueller
```

Then, in any project:

```
/kartograph:kartograph-explore I want the app to work without a network connection
/kartograph:kartograph-knowledge
/kartograph:kartograph-features
/kartograph:kartograph-views project-archiving
/kartograph:kartograph-plan project-archiving
/kartograph:kartograph-build project-archiving
/kartograph:kartograph-walk project-archiving
```

The first three also trigger on their own when the situation fits; views, plan, build
and walk need the capability or feature named.

### Codex and the ChatGPT app

Register the repository as a marketplace, then install from it. The ChatGPT desktop app
reads the same configuration; restart it afterwards and start a new chat.

```
codex plugin marketplace add twissmueller/kartograph
codex plugin add kartograph@twissmueller
```

Later releases: `codex plugin marketplace upgrade twissmueller`. Plugins are not
available in the IDE extension.

### OpenCode

OpenCode plugins register tools rather than skills, so the plugin exposes the skills as
tools named `kartograph_explore`, `kartograph_knowledge`, `kartograph_features`,
`kartograph_views`, `kartograph_plan`, `kartograph_build` and `kartograph_walk` that hand
the model the same `SKILL.md`. Add the npm package to `opencode.json`:

```json
{ "plugin": ["opencode-kartograph"] }
```

Or skip the plugin: OpenCode also reads skills straight from `~/.agents/skills/`, so a copy
or symlink of the seven `skills/kartograph-*` directories there is enough, and Codex
picks them up from the same place.

### Any agent that reads `SKILL.md`

The skills follow the [agentskills.io](https://agentskills.io) format and depend on no
runtime-specific tool. Drop the `skills/` directories wherever your agent looks for skills.

## Guardrails

- Each skill writes only its own output: explore the intent file, knowledge the
  `knowledge/` bundle, features the `features/` directory, views one feature module plus
  its wiring, plan one file under `plans/`, build that module plus `core/` and `server/`,
  walk one record under `walks/`.
- Each commits only what it wrote (`intent: <title>`, `knowledge: <intent title>`,
  `features: <intent title>`, `views: <capability>`, `plan: <capability>`,
  `build: <capability>`, `walk: <capability>`) and pushes to the branch's upstream.
  Without git or a remote it says so and moves on.
- None invents. What was not said is an assumption, an open question, or a stub marked as
  undefined; never a guessed rule or a scenario with a guessed outcome.
- None writes a `verified` stamp or claims a feature is approved, implemented or tested.
  In a walk, only your answer becomes a verdict.
- All drive. Explore ends every message with the next question or the written file;
  knowledge, features, views, plan and build ask nothing at all; walk asks once per
  scenario.
- Build never edits a feature file, never weakens a test, and never ships a fake in
  production code. A scenario it cannot build stays open with the reason.
- Every file has a fixed structure, and each skill ships a validator it runs before
  committing, so an intent, a concept, or a capability written today looks like one
  written next year:

  ```
  node skills/kartograph-explore/validate-intent.js intents/<file>.md
  node skills/kartograph-knowledge/validate-knowledge.js knowledge
  node skills/kartograph-features/validate-features.js features
  node skills/kartograph-plan/validate-plan.js plans/<file>.md
  node skills/kartograph-walk/validate-walk.js walks/<file>.md
  ```

  They need only Node, no dependencies. `npm test` runs the suite behind them.

## History

Versions up to `v0.21.2` were a much larger Kartograph: a living map of a software system
with a desktop app, validators, nine commands, and a build-and-walk pipeline. That work is
still in git history under its tags. `v1.0.0` restarted from the one step that mattered
most; `v1.1.0` added the knowledge base; `v1.2.0` the features; `v1.4.0` the screens;
`v1.5.0` the walk; `v1.6.0` the plan and the build.

## License

MIT — see [LICENSE](./LICENSE). Attributions in [NOTICE](./NOTICE).

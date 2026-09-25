# 🗺️ Kartograph

**Draw out what a person really wants, write down the words it is made of and the behaviour it asks for, plan it in three rings, show the screens first, build the rest, then walk them through it.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-FFDD00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/twissmueller)

Kartograph is a plugin for [Claude Code](https://code.claude.com),
[Codex](https://developers.openai.com/codex) and [OpenCode](https://opencode.ai) with fourteen
skills that build on each other through plain files in your repository:

| skill | reads | writes |
|---|---|---|
| **`kartograph-converse`** | a conversation with you, the features and the git log | `kartograph/<date>-<slug>.conversation.md` |
| **`kartograph-intent`** | one conversation | `kartograph/<date>-<slug>.intent.md` |
| **`kartograph-map`** | one intent, the features and the git log | `kartograph/<date>-<slug>.mapping.md`: done, partly done, new, contradicts |
| **`kartograph-knowledge`** | one intent and its mapping | `knowledge/`, an Open Knowledge Format bundle |
| **`kartograph-features`** | one intent and its mapping | `features/`, capabilities and Gherkin features |
| **`kartograph-plan`** | one capability, the stack's design docs | `plans/<date>-<capability>.md`, three rings; `docs/code-design/` on first use |
| **`kartograph-screens`** | ring 1 of the plan | the screens and view models on fakes with sample data |
| **`kartograph-domain`** | ring 2 of the plan | use case implementations, rules, ports, one test per scenario |
| **`kartograph-adapters`** | ring 3 of the plan | repositories, database, API client, platform capabilities, server |
| **`kartograph-walk`** | any ring's result, and you watching | `walks/<date>-<capability>.md`, your verdicts |
| **`kartograph-revise`** | what you want changed, after a walk or anytime | `kartograph/<date>-<slug>.revision.md`, then the features, the concepts, a superseding plan and the rings already built, one commit each |
| **`kartograph-deliver`** | the built app, the stack's delivery scripts | `distribution/` on first use; then a device, TestFlight, Play, the stores or a host |
| **`kartograph-release`** | the tested build on TestFlight and Play internal, what changed since the last release | release notes, store texts and screenshots under `distribution/`; the build in App Store review and on Play production; the tag |
| **`kartograph-migrate`** | the project and `migrations/` | the project moved onto the plugin's current layout, one commit |

Each run starts from a fresh context. What one skill knows, it knows from the files the
previous one wrote, so everything worth keeping is in your repo, versioned, and readable
by you, a colleague, or a later AI session.

![The eight phases and fourteen skills: who does what, which files result, and when a phase hands over](docs/phases.svg)

## Why

AI assistants write code faster than anyone can think. What they cannot do is know what you
meant. Every drifting implementation, every "that's not what I asked for", starts with an
intent that lived only in someone's head and was never pulled out and written down. And once
written down, the words it uses drift too, unless they are defined once and reused. And once
the words hold, the screens should be seen before the behaviour behind them is committed to.

## `kartograph-converse` — talk, and only record

One conversation that pulls what you really want out of your head and records it, block by
block, as `kartograph/<date>-<slug>.conversation.md`. It steers as well as it can; it does
not interpret. Before any solution is on the table it establishes who you are in this, what
you want and why, who it is for, and how you would recognise success; when your goal could
be read two ways, it reflects both back and lets you pick. Then it converges, one question
at a time, always with a recommended answer, sharpening vague words into concrete cases and
asking what you deliberately left out, until you say nothing is missing.

Every message ends with the next question or the written file. What it finds in the project
— capabilities under `features/`, commits in the git log — is looked up only to ask a
sharper question, never to answer on your behalf. Your words are recorded verbatim; its own
reasoning is at most one line per message. No goals, no buckets, no summary: deriving your
intent is a separate skill's job.

## `kartograph-intent` — the intent, derived from what you said

Reads one recorded conversation and sorts everything you said into goals, intended
outcomes, non-goals, constraints, assumptions, decisions and open questions, writing
`kartograph/<date>-<slug>.intent.md` beside it. Every entry cites the conversation block it
came from; what you did not say stays an assumption or an open question, never a statement,
and a recommendation only becomes a decision when you chose it.

Fully automated: no questions, no review. It reads the conversation and nothing else — never
code, never `features/` — then writes, commits, pushes, and reports the open questions it
found.

## `kartograph-map` — what exists, held against what you want

Reads one derived intent and holds each intended outcome against what the project already
has — `features/` and the git history — writing `kartograph/<date>-<slug>.mapping.md`
beside it: Done (a scenario and a commit), Partly done (what exists, cited, then what is
missing), New, or Contradicts (both statements, then the open question a follow-up
conversation has to settle).

The truth is what exists, never an earlier intent or conversation. Every Done and Partly
done entry cites its evidence — a commit hash, or a `feature › scenario`; no evidence, not
done. Fully automated, committed and pushed; knowledge and features both refuse to run
against an intent that has not been mapped yet. An intent migrated from before 3.0.0 is
never picked as the newest, but mapped like any other when you name it.

## `kartograph-knowledge` — one intent, a growing knowledge base

Reads the intent you name, or the newest mapped one, and records every concept it
introduces in `knowledge/`, a bundle in Google's
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

Reads the intent you name, or the newest mapped one, and turns it into what the product
must let someone achieve and how that behaves, under `features/`:

```
features/
  <capability>/
    capability.md          the lasting ability: sources, purpose, scope, constraints, open questions
    <feature>.feature      one Feature, plain Gherkin, scenarios optionally grouped under Rule:
    <sub-capability>/      the same shape, as deep as the product needs
      capability.md
      <feature>.feature
```

Feature files are plain Gherkin. Each scenario is a concrete example in the domain's own
words, using the canonical titles from `knowledge/` and never a word listed there as an
alias to avoid. Every feature file names the intent and capability it came from. Older
trees written by Kartograph v0 are moved onto this shape by
`node scripts/migrate-features.js <project>`, which never touches a scenario.

It reconciles before it writes. A behaviour already covered by an existing scenario is
linked, not duplicated. A behaviour an intent changes updates only the steps that
changed, since scenario steps may be bound to step definitions downstream. A behaviour
the intent leaves undecided becomes an open question in `capability.md`, never a scenario
with a guessed outcome. A contradiction with an existing agreement is recorded with both
statements, never resolved by the AI. Nothing is removed unless the intent says so.

Fully automated, like knowledge: no questions, then commit, push, and a report of what
was created, updated, reused, and left open.

## `kartograph-plan` — three rings, for your stack

Before anything is built, the plan. You name the capability; the skill reads its
scenarios, `knowledge/`, the stack's design documents, the code that exists for the
capability, the shared code, the build files and the last walk, and writes
`plans/<date>-<capability>.md`, a hexagon read through Clean Architecture. The plan and
its template are stack-neutral: every unit is named as the project's `code-design.md`
names it, and every command comes from its `build-design.md`:

- **Screens** table: one per feature file unless the scenarios clearly describe more than
  one place, each listing the scenarios it serves and the controls their steps name.
- **Layer map**: which layers each scenario crosses and its entry point.
- **Ports and adapters** with exact signatures in the stack's language, **files** to
  create or modify, **global constraints** copied from the stack's documents.
- **Ring 1: Screens**, one task per screen: the state contract, the ports the screen
  needs, the presentation model, fakes with sample data covering every listed scenario's
  `Given`, the screen and its views, the composition-root binding and navigation, compile
  and see. No tests in this ring.
- **Ring 2: Domain**, one task per scenario: the outer test at the presentation model
  against fakes behind the ports, red first; then per layer a failing test and minimal
  code; the composition-root rebind from fake to implementation; the demo data behind a
  demo flag.
- **Ring 3: Adapters**, one task per port or endpoint: the failing adapter test, the
  implementation, the composition-root rebind from demo to real.
- **Friction** for scenarios that cannot be built as written, **gaps** for what the
  project cannot provide.

Modelled on superpowers' writing-plans: written for an implementer who sees only their
task, exact signatures in an interfaces block per task, and no placeholders anywhere, no
"TBD", no "add error handling", no "similar to task 2.3". The validator rejects every
such pattern and cross-checks screens, layer map, tasks and the feature files against each
other. Fully automated, committed as `plan: <capability>`, pushed. A re-plan supersedes
the earlier plan.

### Technology stacks

Plan is the one skill that knows about stacks. On a project's first plan it detects the
stack from the build files, refuses if it sees none, more than one, or a scaffold, then
writes `docs/code-design/stack.md` declaring the choice and copies the stack's three
documents beside it:

```
docs/code-design/
  stack.md            which stack, which version, when declared
  design-system.md    tokens, theme entry point, components, layout, accessibility
  code-design.md      the three rings, module layout, state contract, naming, DI, navigation
  build-design.md     ports and adapters in detail: persistence, HTTP, platform, server, tests, done
```

From then on every skill reads the project's copies, so your edits steer every later run.
The plugin ships the stacks under `stacks/`, one directory each:

| stack | status | detected by |
|---|---|---|
| `kmp` | ready | `settings.gradle.kts` plus a `kotlin("multiplatform")` module, no Kotlin Toolchain |
| `kmp-toolchain` | ready | a `project.yaml` beside the `kotlin` wrapper plus a `kmp/lib` module, no Gradle (the Kotlin Toolchain, Alpha; iOS as Compose UI) |
| `android-compose` | scaffold | an Android application module without multiplatform |
| `apple-swift` | ready | `Package.swift`, an `.xcodeproj` or a `project.yml`, no Gradle or Kotlin Toolchain |
| `angular-kotlin` | scaffold | `angular.json` beside a Kotlin server build |
| `python-fastapi` | ready | a root `docker-compose.yml` plus a `requirements.txt` pinning `fastapi`, no Gradle, Xcode or Angular |

A scaffold carries every section a stack must answer and an unfilled marker in each; plan
refuses to run against it. Adding a stack is adding a directory with a `STACK.md` and the
three documents. The KMP stack derives from its owner's knowledge repository and reads
Clean Architecture plus MVVM as the hexagon: screens are the driving adapter, use cases
and ports the core, repositories, data sources and the Ktor server the driven adapters.
`kmp-toolchain` is the same stack built with JetBrains' Kotlin Toolchain (`project.yaml`,
one `module.yaml` per module, `./kotlin build|test|run`) instead of Gradle, for new
projects created with `kotlin new` and worked without an IDE; the agent drives the running
desktop app through the Toolchain's Compose Hot Reload MCP server. Existing Gradle
projects, and projects whose iOS app is native SwiftUI over an SPM-wrapped XCFramework
with SKIE, stay on `kmp`.

## `kartograph-screens` — ring 1, the flow before the behaviour

Executes ring 1 of the plan: the screens, their presentation models, the ports they need
and fakes holding deterministic sample data, so every scenario can be walked in the
running app and you can judge the flow before anything real is built. Every control a
scenario names carries the scenario's own words, so a person and a semantic tree can find
it. It compiles the capability and the stack's fast-loop target, looks at each screen when
a live window is connected (a Compose Hot Reload window, a simulator, a browser), never
launches the app, never scaffolds a project, builds nothing a scenario does not state,
commits as `screens: <capability>`, pushes, and tells you which scenarios to walk. This is
where you stop and look.

## `kartograph-domain` — ring 2, the behaviour, data still local

Executes ring 2 once every ring-1 checkbox is ticked. Per scenario: the outer test at the
presentation model against fakes behind the ports, red first; then the implementations,
the rules and the ports the core adds, each behind a failing test; then the
composition-root rebind from fake to implementation. The ring-1 sample data stays behind
a demo flag, so the same screens now run on real rules and the walk still works before a
backend exists. Fakes over mocks, no mocking library, no weakened assertion, never an
edited feature file. Commits as `domain: <capability>`, pushes.

## `kartograph-adapters` — ring 3, real data, real platform, real server

Executes ring 3 once every ring-2 checkbox is ticked. Per port or endpoint: the failing
adapter test over the double the stack's `build-design.md` names (an in-memory database,
a stubbed HTTP engine, a test server, a platform capability in its target's test bundle),
the data source, mapping and adapter, the composition-root rebind from demo to real.
Exceptions stop at the adapter boundary as the stack's error type. Nothing above the
ports changes, and the ring-2 scenario tests must still pass unchanged. Commits as `adapters: <capability>`,
pushes, and says the capability is real end to end.

Screens, domain and adapters all execute the plan as the contract and the code as the
truth: a step the code contradicts gets the smallest correction that keeps its intent,
reported, never silent; the plan's only edit is its checkboxes.

## `kartograph-walk` — you watch, it drives, you judge

Presents what was built, scenario by scenario, in the running app, after any ring: the
screens on sample data, the domain on in-memory data, or the finished feature. You start
the app on the surface you want to see it on; the skill picks the driver that can reach
it: Compose Hot Reload for a desktop window, Claude in Chrome or Playwright for a web UI,
a screen-control tool for the iOS simulator, a native macOS app or an iPhone or iPad
mirrored to the Mac, and if none can, you drive while it narrates.

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

## `kartograph-revise` — change it, and everything follows

Building the screens first is meant to make you say "change this and that". Say it, after
a walk or anytime, and this skill carries it through everything in one run, one commit per
step. It records your words verbatim in `kartograph/<date>-<slug>.revision.md`, with what
they affect and each change (changed, added, removed) citing the words it comes from; it
asks only when the words can honestly be read two ways. Then it changes exactly the
affected scenarios, each marked `# Changed by` the revision; updates the concepts whose
meaning moved; writes a new plan that supersedes the old one, keeping the ticks of work the
revision does not touch and unticking or adding what it does; and builds the change in the
rings already built, by the ring skills' own rules, without ever reloading the app you are
looking at. The report says what changed where, what is still open, and whether a walk is
worth it.

## `kartograph-deliver` — from the build to a person's hands

Names the action: run it here, put it on my iPad, TestFlight, Play internal, the store
listings, a release, the stores, deploy the backend. On first use it copies the stack's
delivery scripts into `distribution/`, fills `distribution/config.sh` from the build files
(identifiers and paths only, never a secret), and commits. From then on the scripts are
yours: run them from a terminal or let the skill run them. Anything that leaves the machine
(upload, promote, submit, deploy) is confirmed by you once; the scripts themselves ask for a
typed word when run by hand.

| script | does |
|---|---|
| `run-local.sh <lane>` | Mac app, iOS simulator, Android emulator, JVM desktop, or the docker stack |
| `run-device.sh [udid]` | Debug build onto a paired iPhone or iPad over the cable, the everyday path |
| `prepare-release.sh <bump>` | release notes from the commits, version and build numbers bumped in every lane's file, optional tag |
| `deploy-testflight.sh` | archive, export, upload, internal group; the Mac lane validates a `.pkg` first |
| `deploy-play-internal.sh` | signed bundle to the internal track in one edit, read back and verified |
| `push-store-metadata.sh` | listing texts and screenshots from `distribution/store/`, templates created when missing |
| `release-check.sh` | reads only: is the tested build on TestFlight and Play internal newer than what the stores sell? |
| `first-release-check.sh` | reads only: which first-release gates the stores already hold (✓), lack (✗), or only show in the web UI (?) |
| `release-stores.sh --notes …` | Play internal promoted to production (a draft on an app never published); the tested build attached, What's New set when a version was ever on sale, submitted for review (not with `--no-submit`) |
| `deploy.sh` | backend to Fly, frontend to Vercel, each with a live health check (angular-kotlin) |

The scripts consolidate the owner's delivery tooling from six shipped apps: one App Store
Connect library (ES256 token, TestFlight groups, versions, review submission with the
subscription check), one Play library (service-account token, one-edit uploads, promotion,
staged rollout, read-back verification), Xcode, Gradle and Kotlin Toolchain helpers, and stdlib-only Python for
the listings and screenshot uploads. The contract every script keeps is in
`stacks/common/DISTRIBUTION.md`; a stack's own scripts live in `stacks/<stack>/distribution/`.

## `kartograph-release` — from TestFlight into the stores

For the build you tested on TestFlight and Play internal. It checks that this build is
newer than what the stores sell, and stops if not: it never bumps, builds or uploads a
binary. It reads what changed since the last release tag (the commits, and the intents,
revisions and features added since), writes the release notes in
`distribution/release-notes/v<version>.md` with a slice for each store, positive and
factual and never naming another platform, and adds the new features to each locale's
description and promotional text without rewording the rest. It renders new screenshots of
the screens that changed, from the real UI with data reaching today, never from the running
app; a project without a renderer gets one, built once from the stack's `screenshots.md`,
and Play reuses the Apple images. Then it commits, shows you the notes, the text changes
and the screenshots in one summary, and asks once. After your yes it pushes the listings
and screenshots, submits the App Store version for review and promotes Play internal to
production, tags the release, and says what is left for the web UI.

The first release works the same way, prepared from scratch. When a store sells nothing
yet, the build tested on TestFlight or Play internal is still required; the skill then
writes the whole listing for every locale from the features, intents and knowledge
(lengths checked, every URL fetched, no other platform named, the EULA link when a
subscription is sold), release notes that introduce the app, and screenshots of every key
screen. What only the web UI can do (App Privacy, price and availability, Data safety, the
content rating, target audience, ads, app access, category) goes into
`distribution/store/first-release.md` with the answers the code supports and where each
came from, beside a ✓ or ✗ for everything the store APIs can read; what nothing shows is
left for you, never guessed, Play's default language included. You click the web steps
through and answer the one question ("the web steps are done, and it goes out?"); it
checks the gates once more, then runs the same scripts in the same order. What's New is
left out on Apple, which refuses it on a first release. When in-app purchases wait for
their first review, the build is attached and the review submission prepared but not
submitted: your Add for Review on each product's page joins it and submits the whole
thing. Play stages a draft production release that
you send for review from the console.

## `kartograph-migrate` — after every update

Every other skill starts with a version gate and refuses to run against a project on an
older Kartograph layout. This skill brings it forward in one step and one commit, whatever
version the project comes from: it checks the project's layout against `migrations/`,
reads every pending migration document (target state, how to recognise a project that is
not there, what to do), runs `scripts/migrate-kartograph.js` for the mechanical part, and
carries out the rest by hand. What it cannot derive is noted in `kartograph/log.md`, never
invented — including validator errors the project had before the migration. Whatever an
earlier `kartograph/` directory held beside the flat documents moves to
`docs/kartograph-v0/`.

## Install

### Claude Code

```
/plugin marketplace add twissmueller/kartograph
/plugin install kartograph@twissmueller
```

Then, in any project:

```
/kartograph:kartograph-converse I want the app to work without a network connection
/kartograph:kartograph-intent
/kartograph:kartograph-map
/kartograph:kartograph-knowledge
/kartograph:kartograph-features
/kartograph:kartograph-plan project-archiving
/kartograph:kartograph-screens
/kartograph:kartograph-walk project-archiving
/kartograph:kartograph-domain
/kartograph:kartograph-adapters
/kartograph:kartograph-walk project-archiving
```

The first three also trigger on their own when the situation fits. Plan and walk need
the capability or feature named; screens, domain and adapters take the newest plan when
you name none.

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
tools named `kartograph_converse`, `kartograph_intent`, `kartograph_map`,
`kartograph_knowledge`, `kartograph_features`, `kartograph_plan`, `kartograph_screens`,
`kartograph_domain`, `kartograph_adapters`, `kartograph_walk`, `kartograph_revise`,
`kartograph_deliver`, `kartograph_release` and `kartograph_migrate` that hand the model
the same `SKILL.md`. Add the npm package to
`opencode.json`:

```json
{ "plugin": ["opencode-kartograph"] }
```

OpenCode also reads skills straight from `~/.agents/skills/`, and Codex picks them up from
the same place; a copy of a single `skills/kartograph-*` directory works for every skill
except plan and deliver, which need the plugin's `stacks/` directory beside it, and
migrate, which needs the plugin's `scripts/` and `migrations/` directories beside it.
Every other skill's version gate simply skips when `migrations/` is not there.

### Any agent that reads `SKILL.md`

The skills follow the [agentskills.io](https://agentskills.io) format and depend on no
runtime-specific tool. Drop the `skills/` directories wherever your agent looks for skills.

## Guardrails

- Each skill writes only its own output: converse the conversation file, intent the intent
  file, map the mapping file, knowledge the `knowledge/` bundle, features the `features/`
  directory, plan the plan and the stack declaration, screens the feature module and its
  wiring, domain the module and `core/`, adapters the module's data layer, `core/` and
  `server/`, walk one record under `walks/`, migrate the project's `kartograph/` layout,
  release the notes, the store texts, the screenshots and their renderer. Revise is the one
  deliberate exception: it carries one change through the revision, the features, the
  knowledge, the plan and the rings already built.
- Each commits only what it wrote (`conversation:`, `intent:`, `mapping:`, `knowledge:`,
  `features:`, `plan:`, `screens:`, `domain:`, `adapters:`, `walk:`, `revision:`,
  `release:`) and pushes to the branch's upstream. Without git or a remote it says so and
  moves on.
- None invents. What was not said is an assumption, an open question, a stub, or
  friction; never a guessed rule, a guessed outcome, or a placeholder in a plan.
- None writes a `verified` stamp or claims a feature is approved, implemented or tested.
  In a walk, only your answer becomes a verdict.
- Screens, domain and adapters never edit a feature file, never weaken a test, never ship
  a fake in production, and never touch the plan's content.
- All drive. Converse ends every message with the next question or the written file;
  intent, map, knowledge, features, plan, screens, domain and adapters ask nothing at all;
  walk asks once per scenario; revise asks only when your words are ambiguous; release asks
  once, before anything leaves the machine.
- Every file has a fixed structure, and each skill ships a validator it runs before
  committing:

  ```
  node skills/kartograph-converse/validate-conversation.js kartograph/<file>.conversation.md
  node skills/kartograph-intent/validate-intent.js kartograph/<file>.intent.md
  node skills/kartograph-map/validate-mapping.js kartograph/<file>.mapping.md
  node skills/kartograph-migrate/validate-kartograph.js kartograph
  node skills/kartograph-knowledge/validate-knowledge.js knowledge
  node skills/kartograph-features/validate-features.js features
  node skills/kartograph-plan/validate-plan.js plans/<file>.md
  node skills/kartograph-walk/validate-walk.js walks/<file>.md
  node skills/kartograph-revise/validate-revision.js kartograph/<file>.revision.md
  ```

  They need only Node, no dependencies. `npm test` runs the suite behind them.

## History

Versions up to `v0.21.2` were a much larger Kartograph: a living map of a software system
with a desktop app, validators, nine commands, and a build-and-walk pipeline. `v1.0.0`
restarted from the one step that mattered most; `v1.1.0` to `v1.6.1` added the knowledge
base, the features, the screens, the walk, the plan and the build. `v2.0.0` reordered
the middle: plan first, then three separately triggered rings, with the stack knowledge
pulled in from `stacks/`. `v2.1.0` let capabilities nest, made feature files plain
Gherkin, and added `scripts/migrate-features.js` for v0 trees.

## License

MIT — see [LICENSE](./LICENSE). Attributions in [NOTICE](./NOTICE).

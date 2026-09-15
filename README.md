# 🗺️ Kartograph

**Draw out what a person really wants, write down the words it is made of, the behaviour it asks for, then show it on screen before building it.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-FFDD00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/twissmueller)

Kartograph is a plugin for [Claude Code](https://code.claude.com),
[Codex](https://developers.openai.com/codex) and [OpenCode](https://opencode.ai) with four
skills that build on each other through plain files in your repository:

| skill | reads | writes |
|---|---|---|
| **`kartograph-explore`** | a conversation with you | `intents/<date>-<slug>.md` |
| **`kartograph-knowledge`** | one intent file | `knowledge/`, an Open Knowledge Format bundle |
| **`kartograph-features`** | one intent file | `features/`, capabilities and Gherkin features |
| **`kartograph-views`** | one capability or feature | screens and view models on fake data in your KMP app |

Each run starts from a fresh context. What one skill knows, it knows from the files the
previous one wrote, so everything worth keeping is in your repo, versioned, and readable
by you, a colleague, or a later AI session.

![The four phases: who does what, which files result, and when a phase hands over](docs/phases.svg)

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
```

The first three also trigger on their own when the situation fits; views needs the
capability or feature named.

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
tools named `kartograph_explore`, `kartograph_knowledge`, `kartograph_features` and
`kartograph_views` that hand the model the same `SKILL.md`. Add the npm package to `opencode.json`:

```json
{ "plugin": ["opencode-kartograph"] }
```

Or skip the plugin: OpenCode also reads skills straight from `~/.agents/skills/`, so a copy
or symlink of the four `skills/kartograph-*` directories there is enough, and Codex picks
them up from the same place.

### Any agent that reads `SKILL.md`

The skills follow the [agentskills.io](https://agentskills.io) format and depend on no
runtime-specific tool. Drop the `skills/` directories wherever your agent looks for skills.

## Guardrails

- Each skill writes only its own output: explore the intent file, knowledge the
  `knowledge/` bundle, features the `features/` directory, views one feature module plus
  its wiring. Only views touches code, and only phase 1 of it.
- Each commits only what it wrote (`intent: <title>`, `knowledge: <intent title>`,
  `features: <intent title>`, `views: <capability>`) and pushes to the branch's upstream.
  Without git or a remote it says so and moves on.
- None invents. What was not said is an assumption, an open question, or a stub marked as
  undefined; never a guessed rule or a scenario with a guessed outcome.
- None writes a `verified` stamp or claims a feature is approved, implemented or tested.
- All drive. Explore ends every message with the next question or the written file;
  knowledge, features and views ask nothing at all.
- Every file has a fixed structure, and each skill ships a validator it runs before
  committing, so an intent, a concept, or a capability written today looks like one
  written next year:

  ```
  node skills/kartograph-explore/validate-intent.js intents/<file>.md
  node skills/kartograph-knowledge/validate-knowledge.js knowledge
  node skills/kartograph-features/validate-features.js features
  ```

  They need only Node, no dependencies. `npm test` runs the suite behind them.

## History

Versions up to `v0.21.2` were a much larger Kartograph: a living map of a software system
with a desktop app, validators, nine commands, and a build-and-walk pipeline. That work is
still in git history under its tags. `v1.0.0` restarted from the one step that mattered
most; `v1.1.0` added the knowledge base; `v1.2.0` the features; `v1.4.0` the screens.

## License

MIT — see [LICENSE](./LICENSE). Attributions in [NOTICE](./NOTICE).

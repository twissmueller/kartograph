# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Kartograph is a plugin with **four skills**, a structure validator for each of the three
file-writing ones, and no build step. Each skill starts from a fresh context and knows
only what the files in the target project tell it:

- `kartograph-explore` runs one exploring conversation and writes
  `intents/<YYYY-MM-DD-HHMM>-<slug>.md`.
- `kartograph-knowledge` reads one intent file and records its concepts in `knowledge/`,
  an Open Knowledge Format v0.2 bundle (one markdown file per concept, path = identity).
- `kartograph-features` reads one intent file and derives capabilities
  (`features/<capability>/capability.md`) and Gherkin features
  (`features/<capability>/<feature>.feature`), updating what already exists.
- `kartograph-views` takes one named capability or feature and builds phase 1 of it in
  the target's Kotlin Multiplatform app: screens, view models and fake use cases with
  sample data, following the project's `docs/design-system.md` and
  `docs/code-design/mvvm.md`. It ships the defaults for both and copies them in when the
  project has none.

The same skills are served to three runtimes from one place:

```
skills/<name>/SKILL.md                      the skill (agentskills.io format, read by all three)
skills/kartograph-explore/intent-template.md   skeleton of the intent file
skills/kartograph-knowledge/concept-template.md skeleton of one OKF concept file
skills/kartograph-features/capability-template.md skeleton of capability.md
skills/kartograph-features/example.md         worked example (fictional) for features
skills/kartograph-views/design-system.md      default design system (tokens, AppTheme, components)
skills/kartograph-views/mvvm.md               default MVVM code design with the three phases
skills/<name>/validate-*.js                 the skill's structure validator (see below)
test/*.test.js                              node:test suite for the validators (`npm test`)
.claude-plugin/plugin.json                  Claude Code manifest  (lists each skill directory)
.claude-plugin/marketplace.json             Claude Code marketplace, source "./"
.codex-plugin/plugin.json                   Codex manifest        (points at ./skills/)
.agents/plugins/marketplace.json            Codex marketplace, local source "./"
opencode/index.js                           OpenCode plugin: one tool per skill, returning
                                            SKILL.md + template at call time
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
  Templates are addressed as "`<file>` in this file's directory".
- **Each skill writes only its own output** and commits only that: explore the intent
  file, knowledge the `knowledge/` directory, features the `features/` directory, views
  one `feature-<capability>` module plus its wiring. None names or starts a phase beyond
  itself; the next phase is a separate skill that *reads* the previous one's files.
- **The AI drives.** Explore ends every message with the next question or the written
  file and never waits to be asked what comes next. Knowledge, features and views are
  fully automated: no question, no review, no confirmation; each runs to the end,
  commits, pushes, reports. Anything undecided becomes an open question in the written
  file. Views is the one skill that needs an argument: the capability or feature.
- **Frontmatter is the contract.** `name` is the slash name and the Codex skill folder.
  `description` states *when* to use the skill, never *how* it works — a description that
  summarises the process makes agents skip the body.
- **Adding a skill** means: a directory under `skills/`, an entry in
  `.claude-plugin/plugin.json`'s `skills` list (Codex needs nothing, it scans `./skills/`), a
  tool in `opencode/index.js` (list its supporting files in `files`), and a row in the
  README table.

## The validators are the structure contract

Every artifact a skill writes has a validator next to the skill, and the skill runs it
before committing. They exist so files never drift from their templates:

```bash
node skills/kartograph-explore/validate-intent.js intents/<file>.md     # or no arg: all of ./intents
node skills/kartograph-knowledge/validate-knowledge.js knowledge        # or one concept file
node skills/kartograph-features/validate-features.js features           # or one capability dir
npm test                                                                # the suite behind them
```

Rules for editing them:

- **Self-contained.** Each validator is one file with no imports beyond Node built-ins,
  because a skill directory must work when copied on its own (`~/.agents/skills/`, the
  Codex cache, the npm package). The YAML-subset parser lives only in the knowledge
  validator; the intent frontmatter is flat and needs no parser.
- **Pure function + thin CLI.** `validateIntent`, `validateConcept`/`validateBundle`,
  `validateCapability`/`validateFeature`/`validateTree` take text or a path and return
  `{ errors, warnings }`; the CLI is guarded by `fileURLToPath(import.meta.url) ===
  process.argv[1]`. Tests exercise the functions on fixtures in temp dirs.
- **Template and validator change together.** A new section, key or rule in a template
  means the same change in its validator and a test for it. Errors are for structure the
  template prescribes; warnings are for things the spec tolerates (a stub description, a
  link to a concept not written yet, a source intent that cannot be checked).
- **Angle-bracket placeholders are errors** in every artifact, except single-token
  `<param>` in `.feature` files, which are Scenario Outline parameters.
- Bump the `generated.by` actor (`kartograph-knowledge/<version>`) in the knowledge
  `SKILL.md` and `concept-template.md` with every release.

## Rules the knowledge skill must keep (OKF v0.2)

- Only `type` is required by the spec; we always write `title`, `description`, `status`,
  `generated`, `sources`. Six types, one directory each: Concept, Actor, Subject, Event,
  Command, Policy.
- **Provenance:** `sources[]` points back at the intent (`../intents/<file>.md`) and body
  quotes are footnoted to `sources[].id`.
- **Trust:** an LLM never writes `verified`; the trust tier (`unverified` →
  `machine-confirmed` → `human-reviewed`) is derived from the `human:` prefix, never stored.
- **Lifecycle:** new concepts are `draft`; retired ones become `deprecated`, never deleted.
- **One canonical title** per concept; synonyms live in `aliases_to_avoid` (our extension,
  the spec prescribes no glossary structure). Same title → extend; contradiction → the
  existing definition stays and the intent's wording is recorded under `# Collision`;
  undefined word → a `draft` stub reading `TODO — define this term.`, never invented.
- `index.md` carries only `okf_version: "0.2"` as frontmatter; `log.md` is date-grouped,
  newest first. Broken cross-links are tolerated by the spec, so a link to a not-yet-written
  concept is allowed.

## Rules the features skill must keep

- One directory per **capability**, never per intent; `capability.md` plus one `Feature:`
  per `.feature` file, scenarios under `Rule:` headings, each rule's requirement in EARS
  form on a `Requirement:` line (a bare `When …` line parses as a step).
- **Never invent requirements**: no permissions, states, limits, UI, error wording or
  integrations the intent does not state. Undecided behaviour is an open question in
  `capability.md`, never a scenario with a guessed outcome or a `TODO` step.
- **Steps are bound downstream.** Existing scenario steps change only when the behaviour
  changed; titles are safe. Nothing is removed unless the intent explicitly retires it.
- **Vocabulary comes from `knowledge/`**: canonical titles only, never a word in any
  concept's `aliases_to_avoid`. The skill reads the bundle but never writes it.
- Idempotent: a re-run with unchanged input changes nothing. Provenance is the
  `# Source intent:` / `# Capability:` comments and the capability's *Sources* list; no
  UUIDs, hashes, or extra logs.

## Rules the views skill must keep

- **Phase 1 only**, as `mvvm.md` §6 defines it: use case *interfaces* plus `Fake…UseCase`
  and `…SampleData` in `presentation/fake/`, bound in the feature's Koin module. No real
  use cases, repositories, data sources or unit tests; those are phases 2 and 3.
- **The two documents are the contract.** The skill follows the project's copies of
  `docs/design-system.md` and `docs/code-design/mvvm.md`; the files in the skill directory
  are only the defaults it copies in when a project has none. Change a default here only
  to change what *new* projects start with. The defaults derive from the user's KMP
  knowledge repo (`~/projects/knowledge/references/`, atoms C11, A0–A6, P3, P8); one
  deliberate departure: the theme lives in `shared/`, not `core/presentation/`, because
  `core` has no Compose.
- **Never scaffold, never launch.** No Gradle build means stop; the app is started by the
  person, and the skill only `reload`s and looks through the Compose Hot Reload server
  when one is connected.
- **Vocabulary comes from `knowledge/`**, screens and controls from the scenarios' own
  words, sample data from every `Given`. Nothing a scenario does not state is built.

## Releasing

Bump `version` in **all three** of `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`
and `package.json` to the same value — each marketplace compares its own manifest, so an
un-bumped release is invisible downstream. Then tag it and push commit and tag together; the
repo is its own marketplace and resolves against `main`. OpenCode users get the release only
after `npm publish`:

```bash
git tag -a v1.5.0 -m "v1.5.0 — <the one-line headline>"
git push origin main && git push origin v1.5.0
```

Tags `v0.19.0` … `v0.21.2` mark the earlier, much larger Kartograph (a living map with a
desktop app, validators, and nine commands). That history is still in git; nothing in the
current plugin depends on it.

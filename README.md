# 🗺️ Kartograph

**A living map of your software system — drawn together by you and AI.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-FFDD00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/twissmueller)

Kartograph is a [Claude Code](https://code.claude.com) plugin that keeps a **living map**
of what your application does — its areas (Kontexte), its abilities (Capabilities), and how
mature each one is. The map lives in your repo as a single JSON file, is rendered by a
static, live-reloading viewer, and is grown through AI workflows that always keep a human in
the loop. It gives you orientation — today, and after months away from the code.

![The Kartograph viewer rendering a demo map](docs/assets/viewer.png)

---

## Why

Every codebase drifts. Six months later nobody remembers which features are solid, which are
half-built, and *why* certain architectural choices were made. Kartograph turns that implicit
knowledge into an explicit, validated, browsable map that you and the AI maintain as you work.

The mental model is cartography (cities, regions, roads) — but that metaphor stays in your
head: the tool itself speaks plain domain language.

## The vocabulary

Kartograph describes any application with ten terms (bilingual, *canonical (translation)*):

**Akteur (Actor)** · **Capability (Fähigkeit)** · **Ereignis (Event)** ·
**Feature (Funktion)** · **Glossar (Glossary)** · **Kontext (Context)** ·
**Regel (Rule)** · **Subjekt (Subject)** · **Szenario (Scenario)** ·
**ADR (Architecture Decision Record)**

> *An application takes **Subjects** in and transforms them by **Rules** into other Subjects
> or **Events**. **Capabilities** are the abilities to do that; **Features** are their
> deliverable parts; **Scenarios** are concrete examples; **Actors** trigger them;
> **Contexts** group everything into areas.*

## How it works

Three human-invoked phases, each a checkpoint you wave through:

| Phase | Command | What it does |
| --- | --- | --- |
| **Explore** | `/karto-explore <feature>` | Survey a feature *with you* (brainstorm + grill), then discover Subjects, Events, Actors, Rules, affected and candidate Capabilities, and ADR candidates. Read-only — writes a survey, nothing else. |
| **Chart** | `/karto-chart` | Record the approved survey onto the map: update `kartograph.json`, grow the glossary, write `.feature` scenarios, add ADRs. |
| **Build** | `/karto-build <capability>` | Implement the open scenarios with double-loop TDD (Gherkin outer loop, unit-test inner loop). |
| **Show** | `/karto-show` | Open the live viewer in your browser. |
| **Init** | `/karto-init` | Bootstrap a draft map from an **existing** codebase. |

Two ideas make it trustworthy:

- **Deterministic gates.** Every write is validated against a JSON Schema *and* a
  referential-integrity check (no dangling references), then swapped in atomically. A failed
  write is a no-op — the map is never left half-written.
- **Maturity is derived, never claimed.** A Capability's level is computed from its
  `.feature` files, not hand-set: `vision` → `sketched` → `building` → `usable` → `stable`,
  driven by how many scenario paths (`@happy`, `@edge`, `@error`) are covered.

## Quickstart

```bash
git clone https://github.com/twissmueller/kartograph.git
cd kartograph
npm install
npm test                                    # run the test suite
npm run validate                            # validate the seed map

# preview the demo map in your browser
cp examples/demo.kartograph.json kartograph.json
npm run show                                # → http://127.0.0.1:4123
```

Drag nodes to arrange them (positions are saved to `kartograph.layout.json`); edit
`kartograph.json` and the page reloads itself.

### Use it as a Claude Code plugin

Point Claude Code at this repo as a plugin (it ships `.claude-plugin/plugin.json` with the
`/karto-*` commands), then run `/karto-init` in a project you want to map, or
`/karto-explore` to design a new feature.

## What lives in your repo

```
kartograph.json            the map (validated, slug-keyed)
kartograph.layout.json     node positions (viewer-written)
kartograph/
  surveys/                 dated survey notes from /karto-explore
  decisions/               ADRs (Markdown, MADR style)
features/<context>/<capability>/*.feature   the behavior, in Gherkin
```

## Status

Kartograph is built in milestones:

- ✅ **M1a — foundation & viewer**: schemas, validator + integrity gate, the seed map, the
  static live-reloading viewer, and `/karto-show`.
- ✅ **M1b — explore & init**: `/karto-explore` and `/karto-init` commands, the `karto-grill`
  and `karto-analyze-repo` skills, the discovery schema + validator, and the dynamic
  workflows. *(Schema and helpers are unit-tested; the live workflow behavior is verified by
  running the commands in Claude Code.)*
- 🔜 **M2 — chart**: `/karto-chart` plus glossary- and ADR-grooming.
- 🔜 **M3 — build**: `/karto-build` with project-configured double-loop TDD.

See [`docs/superpowers/specs`](docs/superpowers/specs) for the full design.

## Built with

No framework, no build step — vanilla JavaScript and Node's built-ins. Skill *ideas* are
adapted from [mattpocock/skills](https://github.com/mattpocock/skills); the explore and build
phases use and honor the [Superpowers](https://github.com/obra/superpowers) skills
(`brainstorming`, `test-driven-development`). See [`NOTICE`](./NOTICE).

## Support

If Kartograph helps you, you can support its development:

<a href="https://buymeacoffee.com/twissmueller"><img src="https://img.shields.io/badge/Buy%20Me%20A%20Coffee-twissmueller-FFDD00?logo=buymeacoffee&logoColor=black" alt="Buy Me A Coffee"></a>

## License

[MIT](./LICENSE) © 2026 Tobias Wissmüller

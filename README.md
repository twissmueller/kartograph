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
| **Sync** | `/karto-sync` | Re-scan the code and propose drift (add new, flag missing — never delete), plus glossary/ADR/dependency grooming. Non-destructive; you approve every change. |

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

Click a capability to open the **Feature Browser** in the side panel: read each of its
features and scenarios with their full Gherkin steps, filter scenarios by path
(`@happy` / `@edge` / `@error`), sort features by scenario count, and see at a glance — via
per-feature coverage badges — which paths each feature still lacks. It updates live as you
edit `.feature` files, so you can grow the software both exploratively and systematically.

## Install as a Claude Code plugin

This repo is its own [plugin marketplace](https://code.claude.com/docs/en/plugin-marketplaces).
In Claude Code:

```text
/plugin marketplace add twissmueller/kartograph   # add the catalog (owner/repo)
/plugin install kartograph@twissmueller           # install kartograph from twissmueller
```

Then, in any project you want to map:

```text
/karto-init                 # bootstrap a map from existing code
/karto-explore "<feature>"  # design a new feature
/karto-show                 # open the live viewer
```

### Updating

Updating is two stages: refresh the catalog, then upgrade your installed copy. Both compare
the manifest `version`, so **every release must bump `version`** — ship commits without
bumping it and nothing downstream sees a change.

**Stage 1 — refresh the catalog** (in Claude Code):

```text
/plugin marketplace update twissmueller   # re-pull marketplace.json; says "1 plugin bumped" when a new version exists
```

This only refreshes the catalog — it does **not** touch your installed copy.

**Stage 2 — upgrade the installed plugin.** There is *no* `/plugin update` slash command
(typing it just opens the `/plugin` manager). Use one of:

- **Interactive:** `/plugin` → *Installed* → select **kartograph** → `Enter` → update, then `/reload-plugins`.
- **Terminal:** `claude plugin update kartograph@twissmueller`

Or skip both stages: enable **auto-update** for the marketplace in `/plugin` → *Marketplaces*,
which upgrades installed plugins at session start (you'll be prompted to run `/reload-plugins`).
Uninstall + reinstall forces it too.

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
- ✅ **M2 — chart**: `/karto-chart` and `/karto-sync`, the glossary/ADR grooming skills, the
  chart workflow, and the deterministic discovery→map transform + maturity reconciliation from
  `.feature` files. *(Pure transforms are unit-tested; live charting is verified in Claude Code.)*
- ✅ **M3 — build**: `/karto-build` with project-configured double-loop TDD, the build config
  schema, and the open-scenario helper. *(Config/helpers unit-tested; the TDD loop runs live.)*

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

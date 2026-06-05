# Kartograph — Plugin Design

**Date:** 2026-06-05
**Status:** Approved design, pending implementation plan
**Author:** Tobias Wissmüller + Claude (brainstorming + grill-me)

---

## 1. Vision

Kartograph is a **Claude Code plugin** that maintains a **living map** of a software
system. The map shows Kontexte (regions), Capabilities (cities) and their Reifegrad
(maturity), and is maintained jointly by human and AI. Its purpose is **orientation** —
both today and after months away from the code.

The mental model: *an application takes Subjekte in, transforms them by Regeln into other
Subjekte or Ereignisse.* Capabilities are the abilities to do that; Features are their
deliverable parts; Szenarien are concrete example cases; Akteure trigger them; Kontexte
group everything into areas. Architecture choices that shape the *how* are recorded as
ADRs.

The plugin works through **Claude Code dynamic workflows** (background subagent
orchestration) plus **interactive skills**, driving three human-gated phases:
**explore → chart → build**, with a static **viewer** rendering the map live.

---

## 2. Core concepts (the meta-glossary)

The framework speaks a fixed vocabulary of **ten terms**, shipped *static* in the plugin
as `reference/glossary.md` and injected into workflow/skill prompts. These are distinct
from each modeled project's own **project glossary** (§7).

Each term is presented **bilingually** as *Canonical (translation)*: **Akteur (Actor)**,
**Capability (Fähigkeit)**, **Ereignis (Event)**, **Feature (Funktion)**,
**Glossar (Glossary)**, **Kontext (Context)**, **Regel (Rule)**, **Subjekt (Subject)**,
**Szenario (Scenario)**. The conceptual terms stay German-canonical; the English
translation rides along for readers and for the (English) UI. The tenth term added by this
design:

> **ADR (Architekturentscheidung)** — Eine dokumentierte Architekturentscheidung: eine
> technische oder strukturelle Festlegung, die das *Wie* der Anwendung prägt, nicht das
> *Was*. Sie hält Kontext, Entscheidung und Konsequenzen fest und hat einen Status
> (Vorgeschlagen, Akzeptiert, Abgelöst, Verworfen). Eine ADR kann sich auf Kontexte und
> Capabilities beziehen und eine frühere ADR ablösen. Wo Subjekte, Capabilities und
> Regeln das *fachliche* Modell bilden, beschreiben ADRs die *technischen* Pfeiler
> darunter.

---

## 3. Architecture principles

These were the load-bearing decisions of the design session:

1. **Split authority by fact type.** No single fact is stored twice.
   - The **map** (`kartograph.json`) owns *structure & intent*: contexts, capabilities,
     subjects, actors, events, rules, the project glossary, ADR metadata, dependencies,
     and a cache of derived values.
   - **`.feature` files** own *behavior* (Gherkin scenario text).
   - **ADR markdown** owns *decision prose*.
   - **Maturity is derived, never stored as truth** — it is a pure function of the
     `.feature` files, cached into the map for rendering.

2. **Derive-and-cache.** Countable/derivable values (Feature counts, Szenario counts,
   maturity) are *computed* by a reconciliation step that reads the `.feature` files and
   writes the result back into `kartograph.json`, so the viewer stays a dumb renderer and
   the file stays self-contained.

3. **Deterministic gates, human-owned meaning.** Every phase that writes passes through a
   three-layer deterministic gate (§10). The gate guarantees the map is *well-formed and
   internally consistent* (shape + referential integrity), never that it is *semantically
   true*. Semantic truth is owned by the **human review gates** between phases. No
   "Claude grades Claude."

4. **Atomic writes.** Writing workflows assemble the complete next version, validate the
   whole document, and only then atomically swap. A failed write is a **no-op** on the
   model.

5. **Humans review between workflows, not inside them.** Dynamic workflows cannot prompt
   the user mid-run. Therefore the pipeline is split into separate small workflows, and
   the orchestrating session **pauses and asks** at each boundary (§11).

6. **The cartography metaphor is mental-only.** Cities, regions, roads, settler, fog —
   these shape how we *think and talk*, but they never appear in UI strings or code
   identifiers. The UI and code use the domain terms: Capability, Kontext, Dependency,
   Maturity. No `class City`; it is `Capability`. This keeps the metaphor a thinking aid,
   not a leaky abstraction.

---

## 4. Persistence model & file layout

In the **modeled project's** repo:

```
kartograph.json              ← semantic model (slug-keyed objects, derive-cached)
kartograph.layout.json       ← node x/y positions; written by the viewer; committed
kartograph/
  surveys/
    2026-06-05-watering-schedule.discovery.json   ← survey notes (append-only log)
    2026-06-05-watering-schedule.rejected.json    ← on gate failure, for inspection
  decisions/
    0001-firebase-remote-config.md                ← ADR prose (MADR)
  config.json                ← project stack config; consumed by `build` (M3)
features/
  <context-slug>/<capability-slug>/<feature-slug>.feature
```

Shipped by the **plugin** (not in the user's repo):

```
.claude-plugin/plugin.json   ← manifest: commands + skills
commands/                    ← karto-explore.md, karto-chart.md, karto-build.md,
                               karto-show.md, karto-groom.md (thin command prompts)
workflows/                   ← discovery.js, chart.js, build.js (pre-authored scripts)
skills/                      ← karto-grill/, karto-groom-glossary/, karto-groom-adr/
schemas/v1/                  ← kartograph.schema.json, discovery.schema.json, …
viewer/                      ← index.html, kartograph.js, styles (static, no build)
server/                      ← tiny ephemeral dev server for /karto-show
reference/glossary.md        ← the ten meta-terms (static)
```

### `kartograph.json` shape (sketch)

All collections are **slug-keyed objects** (not arrays) to localize writes and reduce
merge pain.

```jsonc
{
  "version": "1",                       // schema version, for migrations
  "meta": { "name": "TerraGarden", "tagline": "…" },
  "contexts":     { "<slug>": { "name", "definition", "color" } },
  "capabilities": { "<slug>": {
      "name", "context": "<context-slug>", "definition",
      "declaredStage": "vision" | null, // only declared stage is `vision`
      "derived": { "maturity", "featureCount", "scenarioCount" }  // cache (Q-§6)
  } },
  "subjects":  { "<slug>": { "name", "glossaryRef", "properties", "rules": ["<slug>"] } },
  "actors":    { "<slug>": { "name", "glossaryRef" } },
  "events":    { "<slug>": { "name", "glossaryRef" } },
  "rules":     { "<slug>": { "name", "statement", "subject": "<slug>" } },
  "glossary":  { "<slug>": { "term", "definition", "type", "aliasesToAvoid": [],
                             "related": ["<slug>"] } },
  "adrs":      { "0001-firebase-remote-config": {
      "id", "title", "status": "proposed"|"accepted"|"superseded"|"deprecated"|"rejected",
      "date", "contexts": [], "capabilities": [], "supersedes": "0000-…"|null } },
  "dependencies": [ { "from": "<cap-slug>", "to": "<cap-slug>" } ]  // the "roads"
}
```

`kartograph.layout.json` is a flat `{ "<slug>": { "x", "y" } }` map; nodes with no entry
are auto-placed by the viewer.

### 4.1 Initial state — the seed map

A fresh project is **not** an empty void. The map ships with a minimal, non-empty seed —
the equivalent of Civilization's settler on the one discovered tile, except we show a
seed *Capability*, not a literal settler (the metaphor is mental-only, §3.6). It signals
"you are here, start exploring":

```jsonc
{
  "version": "1",
  "meta": { "name": "<project>", "tagline": "Uncharted — run /karto-init or /karto-explore to begin" },
  "contexts": { "core": { "name": "Core", "definition": "The starting area of the system.", "color": "#33aa77" } },
  "capabilities": {
    "start-here": {
      "name": "Start here",
      "context": "core",
      "definition": "Seed capability. Replace it by exploring and charting your first real feature.",
      "declaredStage": "vision",
      "derived": { "maturity": "vision", "featureCount": 0, "scenarioCount": 0 }
    }
  },
  "subjects": {}, "actors": {}, "events": {}, "rules": {}, "glossary": {}, "adrs": {},
  "dependencies": []
}
```

The viewer renders this as a single dim `vision` node — the rest of the canvas is open,
inviting the first expedition. `/karto-init` (§9.4) replaces the seed with a real draft
map derived from existing code; `/karto-explore` grows it feature by feature.

---

## 5. Identity & linking

- **Slugs, not UUIDs**, are the stable identity for every first-class entity. Stored
  explicitly so renaming a display name never breaks a link. Readable in diffs, usable in
  paths and Gherkin tags, mergeable by hand.
- **The directory layout *is* the Capability→Feature link.** A Capability's Features live
  at `features/<context-slug>/<capability-slug>/`. One `.feature` file = one **Feature**;
  each `Scenario:` inside = one **Szenario**. No back-references; location is the link.
- **Scenario class via Gherkin tags.** Every `Scenario` carries exactly one of
  `@happy`, `@edge`, `@error`. Reconciliation reads the tags — no NLP guessing.
- **Dependencies are slug→slug references**, surviving renames and merges.
- **Glossary references.** First-class entities point at their glossary term via
  `glossaryRef` rather than copying its definition (single source of truth).

Constraint: slugs are **unique and immutable** once assigned. A genuine re-slug is a
migration.

---

## 6. Maturity (Reifegrad)

Five levels. **Exactly one is declared; the rest are derived** by the reconciliation step
from on-disk Feature/Szenario state. Humans never set maturity.

Enum keys and UI labels are **English** (the UI is English; §12):

| Key (enum)   | UI label     | Determined by                              | Kind            |
| ------------ | ------------ | ------------------------------------------ | --------------- |
| `vision`     | **Vision**   | Capability exists, **0 Features**          | declared (seed) |
| `sketched`   | **Sketched** | Has Feature(s), **0 Szenarien**            | derived         |
| `building`   | **Building** | Has Szenarien, only `@happy`               | derived         |
| `usable`     | **Usable**   | `@happy` + `@edge` present                 | derived         |
| `stable`     | **Stable**   | `@happy` + `@edge` + `@error` present      | derived         |

`vision` is the seed a human/`explore` sets when proposing a new capability candidate.
The moment Features and scenarios exist, maturity is a pure function of the files.

Aggregate project maturity (viewer-side): weighted mean over capabilities. Default
weights `vision 0, sketched 0.1, building 0.3, usable 0.7, stable 1.0` (tunable).

---

## 7. Glossary

Two distinct glossaries:

- **Meta-glossary** — the ten framework terms (§2). Fixed, identical across projects,
  shipped static in `reference/glossary.md`, spoken by the workflow/skill prompts.
- **Project glossary** — the ubiquitous language of the modeled system. A **first-class,
  slug-keyed collection** in `kartograph.json` (`term → definition → type →
  aliasesToAvoid → related`). First-class entities reference it via `glossaryRef`; plain
  domain words that aren't entities get glossary-only entries.

**Division of labor:**
- The **workflow** guarantees only the glossary's *structural* validity (schema gate), so
  the map/viewer can always load it.
- A separate **glossary-grooming skill** (`karto-groom-glossary`, §13) owns *semantic*
  quality: canonical terms, the **no-synonyms rule** (realized as an `aliasesToAvoid`
  list), ambiguity flags, relationships.

The no-synonyms rule is **not** a deterministic gate (a schema cannot detect that
"Benutzer" duplicates "Akteur"). It is enforced best-effort by (a) a deterministic
pre-filter (normalize case/plural, block exact/near collisions) and (b) the grooming
skill reconciling new candidates against the full existing glossary. The spec is honest
that (b) is a mitigation, not a guarantee.

---

## 8. ADR (Architekturentscheidung)

- **Storage** follows the split-authority pattern: decision *prose* in
  `kartograph/decisions/NNNN-slug.md` (MADR style — title + 1–3 sentences, optional
  Status/Options/Consequences); *metadata* in `kartograph.json.adrs` for the viewer.
- **Identity:** numbered + slug, `0001-firebase-remote-config`. Next number = scan
  `decisions/` for the max and increment (no `Date` needed in-workflow).
- **Lifecycle:** born `proposed` in discovery; human accepts; later ones can mark a prior
  `superseded`/`deprecated`/`rejected`. `status` is a **declared** field — accepting an
  architecture decision *is* a human judgment (unlike maturity).
- **Worthiness test** (stolen from `grill-with-docs`): offer an ADR only when all three
  hold — **hard to reverse**, **surprising without context**, **the result of a real
  trade-off**. Otherwise it's a plain Feature, not an ADR.
- **Flow:** `explore` *discovers* ADR candidates into the survey; `chart` *writes* the
  `.md` + metadata; `karto-groom-adr` maintains consistency and supersession.
- **Viewer:** a dedicated ADR panel — a decision list/timeline with status and
  supersession chains; clicking an ADR highlights the contexts/capabilities it touches.

---

## 9. The three phases

### 9.1 `/karto-explore <featurebeschreibung>` — survey (read-only)

Two parts:

- **Phase A — Survey conversation (interactive, main session).** Runs
  **`superpowers:brainstorming`** to diverge/expand the idea, then the **`karto-grill`**
  skill to converge: grills the feature, pulls context from a GitHub issue if referenced,
  challenges new terms against the existing project glossary, sharpens fuzzy language,
  probes concrete scenarios, and applies the ADR worthiness test. *Writes nothing to the
  model* — "read-only" means it never mutates the map, glossary, `.feature` files, or
  code.
- **Phase B — Discovery workflow (background).** The command stamps `{date, slug}` (the
  session knows today's date; the workflow runtime cannot call `Date`) and invokes the
  Workflow tool with `scriptPath: ${CLAUDE_PLUGIN_ROOT}/workflows/discovery.js` and
  `args = {date, slug, description, conversationSummary, mapPath}`. Subagents fan out to
  extract Subjekte / Ereignisse / Akteure / Regeln / affected Capabilities / new
  candidates / suggested placement / glossary additions / ADR candidates, cross-checked
  against the existing map, emitted through `discovery.schema.json`.

**Output:** `kartograph/surveys/YYYY-MM-DD-<slug>.discovery.json`, containing
`conversationSummary` (prose), `sources` (raw description, issue link), and `findings`
(structured). The survey log is **append-only** — a durable record of *how the map got
drawn*. `explore` then returns a session summary and **pauses to ask** whether to chart.

### 9.2 `/karto-chart` — record onto the map (writing, fachlich)

Consumes the **latest** survey in `kartograph/surveys/` (or one passed via `args`),
re-validates it, then **atomically** updates the map: adds new cities (candidates in
`vision`), redraws context regions, adds dependency roads, grows the project glossary
(invoking `karto-groom-glossary`), writes `.feature` files with tagged Gherkin scenarios,
and writes ADR `.md` + metadata (invoking `karto-groom-adr`). Runs reconciliation to
recompute the derived cache (maturity, counts). Writes no code. On success it **pauses to
ask** whether to build; the git diff is the human's review gate.

### 9.3 `/karto-build <capability>` — construct (writing, technical) — Milestone 3

Implements the capability's open scenarios via **double-loop (outside-in) TDD**, stealing
the discipline of `superpowers:test-driven-development`:

- **Outer loop — acceptance / BDD (Gherkin).** Pick one open `Scenario` from the
  capability's `.feature` files; run it and **watch it fail** (red). This executable
  specification is the goal of the iteration.
- **Inner loop — classic unit TDD.** To make that scenario pass, drive the implementation
  unit by unit: Red → Green → Refactor, honoring the Iron Law (no production code without
  a failing *unit* test you watched fail), minimal code, refactor while green. Stay in the
  inner loop, adding units, until the **outer** scenario turns green.
- **Close the loop.** Once the scenario is green, refactor at the seam, then advance to
  the next scenario. Working `@happy → @edge → @error` in order walks the capability up
  the maturity ladder (Building → Usable → Stable), so the outer loop *is* the maturity
  progression.
- Project specifics come from **`kartograph/config.json`**: for the **outer loop** — how
  `.feature` steps bind to step definitions and the acceptance runner; for the **inner
  loop** — the unit test runner and code location. This is the one project-configured
  phase.
- After each scenario closes, reconciliation re-derives the capability's maturity from the
  now-passing, tagged scenarios.

`build`'s detailed config schema and step-definition binding are designed at Milestone 3
against a concrete project, since they depend on stack specifics.

### 9.4 `/karto-init` — chart an existing repo (read-mostly bootstrap)

The reverse of `explore`: instead of reading a feature description, it reads **existing
code** to bootstrap a draft map. For an existing (possibly very large) project, this is
the first expedition that charts the known world.

- **Workflow, fan-out over the codebase.** Subagents analyze directories/modules to infer
  **Kontexte** (top-level areas), **Capabilities** (cohesive feature units),
  **Subjekte** (data classes / persisted entities), **Akteure**, dependency edges, and
  any **existing ADRs** (e.g. an existing `docs/adr/`), plus a **glossary seed** of
  recurring domain terms. Backed by the **`karto-analyze-repo`** skill (§13).
- **Maturity is still derived, not invented.** A discovered capability with tests/
  `.feature` coverage derives its level per §6; one without lands at `sketched` (code
  exists) or `vision` (named-only). `init` does not fabricate `@happy/@edge/@error` tags.
- **Same gate, same review.** It assembles a complete draft `kartograph.json`, passes the
  three-layer gate (§10), writes atomically, and then **pauses to ask** — the draft map
  *is* the reviewable artifact (alongside an `init` survey record). For very large repos,
  run it scoped to a subtree first to gauge cost, then widen.

`init` is project-agnostic (it only reads code), so it ships in **M1**.

---

## 10. The validation gate

Three deterministic layers protect every write; a failure after **3 retries** is a no-op
plus a `.rejected.json` dump with the errors.

1. **Per-agent structured output** — `agent({schema})`'s built-in retry forces each
   subagent's JSON to match its schema (shape).
2. **Whole-document schema** — the assembled `kartograph.json` validates against
   `kartograph.schema.json` (enums, required fields, types).
3. **Referential integrity** — a deterministic graph check: every dependency edge
   resolves to an existing capability slug; every `glossaryRef`/subject/rule reference
   resolves; no capability outside a context; no dangling `.feature` path; derived values
   were recomputed and match the files. **No dangling slugs, no orphans.**

What the gate does **not** do: judge semantic correctness. That is the human's job at the
review gates.

---

## 11. Inter-phase orchestration

Between phases Claude is back in the main session (the no-mid-run-input rule binds only
the background workflow), so it **always pauses and asks**, never auto-advances:

- after `explore` → *"Survey done, see `kartograph/surveys/…`. Continue with `chart`, or
  review first?"*
- after `chart` → *"Map charted, here's the diff. Continue with `build`, or review
  first?"*

The commands run standalone **or** as a guided pipeline waved through checkpoint by
checkpoint.

---

## 12. Viewer & `/karto-show`

A **pure static** viewer (vanilla JS, no framework, no build step) renders the map. The
**UI is entirely English**, and uses **domain terms only** — Capability, Kontext,
Dependency, Maturity — never the metaphor words (§3.6). The visual encoding (described
here with the mental metaphor, *not* shown in the UI): capability nodes sized by Feature
count, hued by context, brightness by maturity; edges are data dependencies; context
groupings are regions. Plus a **glossary panel** and an **ADR panel**. Drill-down on a
capability opens its Features/Szenarien (lazy-loaded from `.feature`).

`/karto-show` starts a **tiny ephemeral dev server** (no framework; lives only while
viewing). "No server" is reinterpreted as *no persistent backend / no framework / no
build*. The server does exactly three jobs:

1. **Serve** the static viewer + project files (so the viewer can `fetch`
   `kartograph.json` and lazy-load `.feature`/`.md`).
2. **Watch** `kartograph.json`, `kartograph/decisions/`, `features/**` and push a change
   event (SSE; ~1s polling fallback) so the open map **re-renders live**.
3. **Accept layout saves** (`POST` → writes `kartograph.layout.json`), so "Layout
   automatisch gespeichert" persists to the committed file.

The viewer stays a **dumb renderer**: it shows the derived values *cached* in
`kartograph.json`; it does not recompute maturity on the fly. A hand-edited `.feature`
shows stale maturity until the next `chart`/`build` reconciliation. The viewer remains
openable via `file://` in a pinch (without live-reload or layout-save).

---

## 13. Bundled skills

Adapted (idea, not 1:1 copy) from `mattpocock/skills`, honoring its LICENSE + attributed
in our repo.

- **`karto-grill`** ← idea from `grill-me` + `grill-with-docs`. The `explore` Phase-A
  conversation: relentless one-question-at-a-time grilling with a recommended answer each
  time; challenge terms against the existing glossary; sharpen fuzzy language; probe
  scenarios; apply the ADR worthiness test.
  **Deliberate divergence:** `grill-with-docs` writes `CONTEXT.md`/ADRs *inline*. We do
  **not** — that would break explore's read-only rule and bypass the chart gate.
  `karto-grill` captures glossary/ADR candidates into the **survey**; only `chart` writes.
- **`karto-groom-glossary`** ← idea from `ubiquitous-language`. The glossary-grooming
  agent: canonical terms, `aliasesToAvoid` (= no-synonyms), ambiguity flags,
  relationships, incremental re-run. Invoked by `chart` and standalone via `/karto-groom`.
- **`karto-groom-adr`** ← idea from `grill-with-docs` + `ADR-FORMAT.md`. ADR
  creation/grooming: MADR format, scan-and-increment numbering, supersession, worthiness
  test. Invoked by `chart` and standalone via `/karto-groom`.
- **`karto-analyze-repo`** ← new (no upstream equivalent). Drives `/karto-init` (§9.4):
  reverse-engineers Kontexte / Capabilities / Subjekte / Akteure / dependencies / glossary
  seed / existing ADRs from a codebase, deriving maturity from existing tests where
  present. Built for fan-out over large repos.

**Using superpowers directly, not just borrowing:** explore Phase A invokes
`superpowers:brainstorming`, and `build` invokes `superpowers:test-driven-development`. We
*use and honor* these rather than re-implementing them — no bundled brainstorming or TDD
skill of our own.

---

## 14. Schemas (`schemas/v1/`)

- **`kartograph.schema.json`** — the persistence schema for §4's shape: slug-keyed
  objects, enum for maturity and ADR status, required fields, version field.
- **`discovery.schema.json`** — the `explore` gate. Top sections: `conversationSummary`,
  `sources`, `findings { subjects, events, actors, rules, affectedCapabilities,
  capabilityCandidates, glossaryAdditions, adrCandidates, placement }`.
- **`glossary.schema.json`** — the project-glossary collection (`term`, `definition`,
  `type`, `aliasesToAvoid`, `related`). Used standalone as the `karto-groom-glossary`
  output gate, and `$ref`'d from `kartograph.schema.json` (one definition, no duplication).
- **`adr.schema.json`** — ADR metadata (`id`, `title`, `status`, `date`, `contexts`,
  `capabilities`, `supersedes`) plus the markdown frontmatter shape. Used standalone as
  the `karto-groom-adr` output gate, and `$ref`'d from `kartograph.schema.json`.
- Further per-phase schemas follow (e.g. an `init` draft-map schema if needed).

Schemas are versioned under `v1/`; a `version` field in `kartograph.json` enables future
migrations.

---

## 15. Plugin packaging

- **`.claude-plugin/plugin.json`** lists `commands` and `skills` (model: mattpocock's
  manifest, extended with commands).
- Each command is a **thin `commands/*.md`** that stamps `{date, slug, description,
  paths}` and invokes the **Workflow tool** with
  `scriptPath: ${CLAUDE_PLUGIN_ROOT}/workflows/<name>.js` + `args`. Scripts are
  **pre-authored and version-controlled** (chosen over generate-on-first-run for
  determinism and reviewability).
- Ship a marketplace entry so the plugin is installable.

Commands: `/karto-init`, `/karto-explore`, `/karto-chart`, `/karto-build` (M3),
`/karto-show`, `/karto-groom`. Skills: `karto-grill`, `karto-groom-glossary`,
`karto-groom-adr`, `karto-analyze-repo`.

---

## 16. Milestones

- **M1 — modeling core (project-agnostic):** plugin skeleton + `plugin.json`;
  `schemas/v1/` (`kartograph`, `discovery`, `glossary`, `adr`); the viewer (map +
  glossary panel + ADR panel, English UI) + tiny dev server + `/karto-show`; the **seed
  map** (§4.1) as the example `kartograph.json`; `reference/glossary.md` (ten bilingual
  terms); `karto-grill` skill; `/karto-explore` (brainstorming + grill + discovery
  workflow); and `/karto-init` + `karto-analyze-repo` for bootstrapping existing repos.
- **M2 — charting:** `/karto-chart` + `karto-groom-glossary` + `karto-groom-adr` +
  `/karto-groom`; reconciliation step (derive-and-cache).
- **M3 — building (project-configured):** `kartograph/config.json` schema; `/karto-build`
  with strict TDD bound to step definitions; full design done against a concrete project.

---

## 17. Deferred / future

- **Event-reaction edges** — the glossary's "Capabilities react to Ereignisse." v1 edges
  are capability→capability data dependencies only; reaction edges are a later iteration.
- **Viewer "pending discovery" overlay** — rendering a survey as proposed changes on the
  map before charting (v1 reviews raw JSON).
- **Multi-context file splitting** — single `kartograph.json` for now; revisit per-context
  files only if real team merge pain appears.

---

## 18. Attribution & licensing

Skill *ideas* are adapted from [`mattpocock/skills`](https://github.com/mattpocock/skills)
(no 1:1 copying); honor its LICENSE and credit it in the Kartograph repo.

**Superpowers** is both *used* and *honored*: `/karto-explore` invokes
`superpowers:brainstorming` and `/karto-build` invokes
`superpowers:test-driven-development` directly, and the plugin credits the Superpowers
project (its design conventions — brainstorming → writing-plans, TDD discipline — shaped
this work). We do not re-implement or vendor those skills.

The dynamic workflows mechanism follows the Claude Code docs:
<https://code.claude.com/docs/en/workflows>.

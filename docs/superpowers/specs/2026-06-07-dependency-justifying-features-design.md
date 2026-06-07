# Dependency edges annotated with justifying features

**Date:** 2026-06-07
**Status:** Approved direction — building

## Problem

A dependency edge in Kartograph is a bare `{ from, to }` between two capabilities. It says
*that* A depends on B but never *why*. The user wants every edge to be **explainable**: the
relation exists because one or more **features of the `from` capability** need the `to`
capability. Clicking the dependency should show "A needs B because of feature X".

Decisions already taken with the user:

- Dependencies are **declared up-front** (design-time, human + AI), not derived from code.
- The edge stays **capability → capability**; we *annotate* it with the `from`-capability
  features that justify it (option (a) — a feature still belongs to exactly one capability).
- A feature is referenced by its **`.feature` filename** relative to
  `features/<from.context>/<from>/` (stable, unique per dir, already the `file` field the
  `/features` endpoint returns). Not the `Feature:` title (mutable, can collide).
- Missing referenced feature → **soft warning during `reconcile`** (never blocks a write).
- Annotation shows in the **side panel only** (map edges stay clean; hover tooltip deferred).

## Scope discovery

The explore→chart flow does **not** author dependencies today: `discovery.schema.json` has no
dependency finding and `applyDiscovery` never writes `map.dependencies`. Only `/karto-init`
emits `{from,to}`. So delivering "record justifying features during charting" requires building
the whole up-front dependency-authoring path, with the annotation, end to end.

## Components

### 1. Map schema — `schemas/v1/kartograph.schema.json`

The `dependencies` item gains an optional `features` array (filenames). `additionalProperties`
stays `false`. Backward compatible — existing `{from,to}` edges remain valid.

```json
"items": {
  "type": "object", "additionalProperties": false,
  "required": ["from", "to"],
  "properties": {
    "from": { "$ref": "#/$defs/slug" },
    "to": { "$ref": "#/$defs/slug" },
    "features": { "type": "array", "items": { "type": "string" } }
  }
}
```

### 2. Discovery schema — `schemas/v1/discovery.schema.json`

`findings` gains an **optional** `dependencies` array (NOT added to `required`, so existing
surveys still validate):

```json
"dependencies": {
  "type": "array",
  "items": {
    "type": "object", "additionalProperties": false,
    "required": ["from", "to"],
    "properties": {
      "from": { "$ref": "#/$defs/slug" },
      "to": { "$ref": "#/$defs/slug" },
      "features": { "type": "array", "items": { "type": "string" } }
    }
  }
}
```

### 3. Merge — `workflows/lib/apply-discovery.js`

Fold `findings.dependencies` into `next.dependencies` (pure, idempotent):

- Dedup by `(from, to)`. If the edge is new, push `{ from, to }` plus `features` (a copy) when
  given. If it already exists, **union** the `features` lists (no duplicate filenames), leaving
  a bare existing edge bare when the new one has none.
- `findings.dependencies` defaults to `[]` when the key is absent.

### 4. Authoring prompts

- **`/karto-explore`** (`commands/karto-explore.md`, and the `karto-grill` guidance if it
  enumerates findings): when surveying, capture the capability→capability dependencies the
  explored feature introduces, each with the **planned** justifying `.feature` filename(s) in
  `findings.dependencies`. The survey thus names the filename chart will write.
- **`/karto-chart`** (`workflows/internal/chart.js` scenarios prompt): instruct the agent to
  name each `.feature` file to **match the filename referenced by the survey's
  `findings.dependencies`** when one is given, so the annotation resolves to a real file.
  No change to the `/karto-chart` command orchestration is needed — step 2 already runs
  `applyDiscovery`, which now folds the annotated edges in.

### 5. Validation — `scripts/reconcile.js`

Add a pure, exported `dependencyFeatureWarnings(map, namesByCapability)` returning a list of
human-readable warning strings: for every dependency `features` entry whose filename is not
present in the `from` capability's directory, emit
`dependency <from>→<to> references missing feature '<file>'`. The CLI builds
`namesByCapability` (`{ slug: [filenames] }`) from the directory listing it already does, prints
the warnings to **stderr**, and continues (non-fatal — the write still happens). The schema and
referential-integrity gate are unchanged.

### 6. Viewer — `viewer/kartograph.js` + `viewer/styles.css`

In `openDetail`, keep the dependency **edge objects** (not just names) when building the
relation lists, so the justifying features are available:

- **depends on** (`d.from === slug`): one row per edge — the `to` capability name, and when
  `d.features?.length`, a muted sub-line `via <file>, <file>`.
- **required by** (`d.to === slug`): one row per edge — the `from` capability name, with the
  same `via …` sub-line sourced from that edge's `features`.

Replace the current `chips()` rendering of `deps`/`rev` with a small relation renderer. New CSS
for the row + the `via` sub-line; reuse existing `.chip`/muted styles where possible.

## Testing

- **`test/schemas.test.js`** — a dependency with `features` validates; a bad `features` (not an
  array of strings) fails. Existing cases stay green.
- **`test/discovery-schema.test.js`** — `findings.dependencies` is optional (a survey without it
  still validates) and shape-checked when present.
- **`test/apply-discovery.test.js`** — folds `findings.dependencies` into `map.dependencies`;
  dedups by `(from,to)`; unions `features`; is idempotent on a second apply.
- **`test/reconcile.test.js`** — `dependencyFeatureWarnings` returns a warning for a missing
  referenced feature and nothing when all referenced files exist.
- **Viewer** — verified live in the browser (depends-on / required-by show the `via …` lines).

## Out of scope (deferred)

- Deriving or drift-checking dependencies from real code (the rejected option (b)).
- Hover tooltip on map edges.
- Making individual features first-class, addressable entities in the map beyond the filename
  reference used here.

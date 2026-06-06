# Feature Browser in the Capability Detail Panel

**Date:** 2026-06-06
**Status:** Approved — ready for implementation plan

## Problem

When you click a capability in the viewer, the right-hand detail panel shows only
*counts*: `1 features`, `5 scenarios`, `0 depends on`. The counts confirm that work
exists but say nothing about *what* it is. To develop software both exploratively and
systematically, the user needs to **read** each feature and its scenarios — including
the concrete Gherkin steps — and to slice the scenarios by class (happy / edge / error).

## Scope (v1)

In scope:

- Reading features and scenarios **for a single capability**, inside the existing
  right-hand detail panel, opened by clicking a capability in the map.
- Full Gherkin steps per scenario, expandable on click.
- Filtering scenarios by class (`happy` / `edge` / `error`) across all features of the
  capability.
- Sorting features within the panel by scenario count.
- A per-feature coverage indicator showing which scenario classes are present vs. missing.

Explicitly **out of scope** (deferred until the system grows):

- A full-screen / cross-context Feature Browser that lists features across many
  capabilities or whole contexts. We will revisit this when a single capability panel
  no longer gives enough overview.
- Filtering features by maturity. Maturity is a property of the *capability*, not the
  feature; within one capability it is fixed, so the filter has nothing to act on in v1.

## Architecture decision: where the scenario steps come from

`kartograph.json` stores only derived counts (`derived.featureCount`,
`derived.scenarioCount`). The actual content lives in Gherkin files at
`features/<context>/<slug>/*.feature`. The static viewer cannot list a directory, so it
needs the server's help.

**Chosen approach: a server parse endpoint.** A new `GET /features/<context>/<slug>`
walks the capability's feature directory, parses each `.feature` with the existing
`parseFeature` (extended to capture steps), and returns structured JSON. The viewer
fetches this when a capability is opened.

Rejected alternatives:

- *Index endpoint + client-side parser* — would duplicate the Gherkin parser in both
  server and browser.
- *Embed feature content in `kartograph.json` via `reconcile`* — bloats the map,
  changes the schema, and the data would be only as fresh as the last `reconcile` run.

The chosen approach keeps a single parser, leaves the schema untouched, and parses live:
editing a `.feature` becomes visible immediately after the existing SSE reload.

## Components

### `workflows/lib/gherkin.js` — extend `parseFeature`

Add to each scenario a `steps` array — the trimmed body lines of the scenario (the
`Given` / `When` / `Then` / `And` / `But` lines, plus any `Examples:` lines for a
Scenario Outline). Capture lines from after the `Scenario:`/`Scenario Outline:` line up
to the next tag line, scenario, or feature; skip blank lines and tag lines.

Optionally capture the feature description: the free-text lines between the `Feature:`
line and the first scenario or tag, exposed as `description` on the parse result.

Backwards compatibility: existing fields (`feature`, `scenarios[].name`,
`scenarios[].tags`) are unchanged. `reconcile` uses only `tags`, so it is unaffected.
`scenarioClass` is unchanged.

### `server/serve.js` — new endpoint `GET /features/<context>/<slug>`

- Parse `context` and `slug` from the path; both must match the slug pattern
  (`^[a-z0-9][a-z0-9-]*$`) — reject anything else with 400 to keep the read inside
  `features/`.
- Read `features/<context>/<slug>/` from the project root. If the directory is missing,
  return `{ "files": [] }` (a vision capability with no features is normal, not an error).
- For each `*.feature` file (sorted by name for stable order), parse with the extended
  `parseFeature` and build:

  ```json
  {
    "files": [
      {
        "file": "grant-license.feature",
        "feature": "Grant a license",
        "description": "...optional free text...",
        "scenarios": [
          { "name": "Grant a seat", "tags": ["@happy"], "class": "happy",
            "steps": ["Given an admin", "When they grant a seat", "Then the user gains access"] }
        ]
      }
    ]
  }
  ```

  `class` is `scenarioClass(tags)` (may be `null` for untagged scenarios).
- Content-Type `application/json`. This is a read endpoint; place it alongside the
  existing route handling, before the static-file fallbacks.

### `viewer/kartograph.js` — render features in `openDetail`

After rendering the existing metrics block, fetch
`/features/<encoded context>/<encoded slug>` for the selected capability and render a
**Features** section beneath the metrics. Because `render()` re-invokes
`openDetail(selected)` on every SSE reload, the section refreshes automatically when a
`.feature` file changes — no extra wiring needed. Handle the async fetch so a reload
that arrives mid-fetch does not render stale data into a different capability (e.g.
guard on `selected` still equalling the slug when the fetch resolves).

## Panel layout

Beneath the metrics, within the detail panel:

1. **Filter / sort bar**
   - Three class toggles: `happy`, `edge`, `error`, all on by default. Toggling hides
     scenarios of that class across every feature in the panel.
   - Untagged scenarios (`class === null`) are always shown; they are not behind a toggle.
   - A small control to sort features by scenario count (most scenarios first).

2. **Per feature** (one block each, in the chosen sort order)
   - Feature title.
   - Coverage badges: `✓happy ✓edge ✗error` — a check when at least one scenario of that
     class exists in the feature, a cross when none does. Shows at a glance where work is
     missing.
   - Optional feature description, if present.

3. **Per scenario**
   - Scenario title + a coloured class tag (happy / edge / error; untagged shown neutral).
   - Click to expand → the full Gherkin steps (monospace, preserving line order).

4. **Empty state**
   - When the capability has no feature files, show "No features yet" rather than an
     empty section. Fits vision-stage capabilities.

Styling reuses the existing detail-panel and chip/badge styles in `viewer/styles.css`;
new classes are added for the feature block, coverage badges, class tags, and the
expandable steps.

## Testing

- **`test/gherkin.test.js`** — extend with cases asserting that `parseFeature` captures
  `steps` for each scenario (including a Scenario Outline with an `Examples:` block) and,
  if implemented, the feature `description`. Keep the existing assertions green.
- **`test/server.test.js`** — add a test that creates a temp project with a
  `features/<context>/<slug>/x.feature` file, starts the server, fetches
  `/features/<context>/<slug>`, and asserts the parsed JSON (feature title, scenario
  names, classes, steps). Add a second case asserting `{ files: [] }` for a capability
  with no feature directory, and a 400 for an invalid (non-slug) path segment.

## Out-of-scope notes / future

- The deferred full-screen browser would reuse the same endpoint shape (or a
  list-all variant) and the same per-feature rendering, so this design does not box it out.

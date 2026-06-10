# Scenario Board — Design

**Date:** 2026-06-10
**Status:** Approved (design)

## Problem

When several scenarios are in flight at once, the user loses sight of what is being worked
on and how far along each piece is. The per-capability detail panel shows one capability's
features at a time; there is no single, cross-capability view of work-in-progress.

The user wants one Kanban-style view that shows, at a glance, what is being worked on and its
progress — filterable by capability, with states the user sets manually.

## Goals

- One view across **all** capabilities showing every scenario as a card.
- Columns by progress state; cards moved by drag & drop, written back to the source.
- Filter by capability.
- Manual states (not auto-derived beyond what build already does with `@done`).

## Non-goals

- No automatic state inference beyond the existing `@done` (build still earns `@done`).
- No new persistent file. State lives in the `.feature` files, as today.
- No change to how maturity is computed.

## Decisions made during brainstorming

- **State = scenario tags in `.feature` files**, written back by an interactive board.
- **Columns:** Open → In Progress → Test → Done.
- **Done reuses the existing `@done` tag** (not a parallel tag). Consequences:
  - Build tagging a scenario `@done` moves its card to Done automatically.
  - Dragging a card to Done makes `/karto-build` treat the scenario as closed (it skips
    `@done` scenarios). Acceptable — the user sets states deliberately.
  - **Maturity is unaffected:** maturity derives from the class tags (`@happy/@edge/@error`)
    and counts, never from `@done` (`scripts/reconcile.js`, `workflows/lib/maturity-derive.js`).
    Moving cards to Done does not change graph colours; the board is pure progress tracking.
- **Placement:** a `Map | Board` toggle in the header switches the main area between the
  graph and the board. The sidebar stays. View mode is module state (survives live reload),
  not persisted.
- **Cards = scenarios** (not feature files).
- **Movement = drag & drop**; **clicking a card** navigates to the capability detail and
  focuses the feature (reuses the existing `focusFeature` mechanism).

## State model

Progress is independent of the class tags. The four states map to tags:

| Column      | Tag        | Meaning            |
|-------------|------------|--------------------|
| Open        | *(none)*   | not started        |
| In Progress | `@wip`     | being worked on    |
| Test        | `@test`    | under review/test  |
| Done        | `@done`    | finished           |

A scenario's progress is derived from its tags with precedence **done > test > wip**, else
`open`. Class tags (`@happy/@edge/@error`) and any other tags are orthogonal and preserved.

## Components

### Pure helpers (no DOM / no IO — unit-tested)

- **`viewer/lib/board.js`**
  - `scenarioProgress(tags)` → `'open' | 'wip' | 'test' | 'done'` (precedence done > test > wip).
  - `boardColumns(scenarios)` → groups scenarios into the four ordered columns.
- **`workflows/lib/gherkin.js`** (extend)
  - `setScenarioProgress(source, scenarioName, progress)` → returns the updated file text.
    Rewrites only the target scenario's tag line: removes any existing progress tag
    (`@wip/@test/@done`), adds the new one (none for `open`), preserves class tags and the
    rest of the file. Adds a tag line if the scenario had none. This is the delicate piece,
    hence isolated and thoroughly tested.

Scenario identity = feature file path + scenario name (unique within a file; on a duplicate
name, the first occurrence wins).

### Dev server (`server/serve.js`) — two endpoints

- **`GET /board`** — walk all capabilities in `kartograph.json`, parse their `.feature`
  files, return a flat list:
  ```json
  { "scenarios": [
    { "capability": "<slug>", "capabilityName": "...", "context": "<slug>",
      "feature": "<relative .feature path>", "name": "<scenario>",
      "class": "happy|edge|error|null", "progress": "open|wip|test|done" }
  ] }
  ```
- **`POST /board`** — body `{ feature, scenario, progress }`. Loads the file, applies
  `setScenarioProgress`, writes it back. Mirrors the existing `POST /layout` pattern.
  - Unknown file/scenario → 404; invalid `progress` → 400; write failure → 500.

### Client

- **`viewer/lib/board-view.js`** (DOM wiring), wired into `viewer/kartograph.js`:
  - Renders four columns + cards from `GET /board`.
  - **Filter bar:** capability chips (multi-select, default all). Card colour follows the
    capability's context colour for visual grouping.
  - **Drag & drop:** native HTML5 DnD (no framework). Drop → optimistic UI update →
    `POST /board` → on error, roll back and refetch.
  - **Click a card:** switch to Map, open the capability detail, focus the feature.
  - After a successful write, refetch `/board` (and the existing live-reload on `.feature`
    changes keeps it fresh).
- **Header toggle** in `viewer/index.html`: `Map | Board`. Toggling shows/hides the canvas
  vs. the board container; `showEdges`/zoom state untouched.

## Data flow

```
.feature files (tags: @happy/@edge/@error + @wip/@test/@done)
        │  GET /board  (aggregate across all capabilities)
        ▼
board-view.js → boardColumns() → four columns of cards
        │  drag card to a new column
        ▼
POST /board { feature, scenario, progress }
        │  setScenarioProgress() rewrites the tag line
        ▼
.feature file updated  → live reload → board refetch
```

## Testing

- **`board.js`:** column grouping; progress precedence including multi-tag scenarios; empty input.
- **`gherkin.js`:** `setScenarioProgress` — open→wip→test→done transitions, →open removes the
  tag, class tags preserved, other scenarios untouched, a scenario with no tag line gains one.
- **`server.test.js`:** `GET /board` aggregates correctly across capabilities; `POST /board`
  writes the right tag and nothing else; error codes for unknown scenario / invalid progress.

## Backward compatibility

Purely additive: new endpoints, new client module, a new header toggle, and one new pure
function. No schema change, no new file, no change to maturity or existing commands. Scenarios
without progress tags simply appear in the Open column.

## Release

Bump both version manifests (`plugin.json` + `package.json`) when shipping (minor — new
user-facing capability).

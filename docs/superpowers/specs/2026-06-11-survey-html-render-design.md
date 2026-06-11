# Survey HTML Render — Design

**Date:** 2026-06-11
**Status:** Approved (pending spec review)

## Problem

After `/karto-explore` finishes, the survey is written only as
`kartograph/surveys/<date>-<slug>.discovery.json`. JSON is hard to read when you just
want to review what the survey found. We want a well-readable, structured HTML version
written **alongside** the JSON, so the human can review the survey comfortably before
charting.

## Goals

- A self-contained, readable HTML rendering of a discovery survey, sitting next to the
  JSON as `kartograph/surveys/<date>-<slug>.discovery.html`.
- Generated **deterministically by code** as part of the explore workflow — no LLM, no
  token cost, no nondeterminism.
- Dark theme, visually aligned with the existing viewer.
- Checked into git alongside the JSON (part of the expedition log).

## Non-Goals

- No live-reloading viewer integration, no server changes.
- No batch/regenerate-all CLI mode (can be added later if wanted).
- No editing of the survey through the HTML — it is a read-only rendering.

## Architecture

Two parts, cleanly separated, mirroring `scripts/validate-discovery.js` (pure logic +
thin CLI) and `workflows/lib/survey.js` (pure helpers):

### 1. `workflows/lib/survey-html.js` — pure renderer

```
export function renderSurveyHtml(doc) -> string
```

- No filesystem access, no dependencies, no LLM. Pure function.
- Input: a validated discovery document (shape per
  `schemas/v1/discovery.schema.json`).
- Output: a complete, self-contained HTML document string (`<!doctype html>` … inline
  `<style>`).
- **Every** text value is HTML-escaped via a local `esc()` helper (survey content is
  LLM-generated free text; `<`, `>`, `&`, `"` must be neutralised).
- Robust to missing/empty arrays: a section renders only when it has content; empty
  sections are omitted entirely. `findings.dependencies` and `findings.openQuestions`
  are optional in the schema and may be absent.

### 2. `scripts/survey-to-html.js` — thin CLI wrapper

- Exports `writeSurveyHtml(jsonPath) -> htmlPath`: reads the JSON, calls
  `renderSurveyHtml`, writes the sibling `.html` (same path with
  `.discovery.json` → `.discovery.html`), returns the html path.
- CLI entry (guarded by `process.argv[1] === fileURLToPath(import.meta.url)`):
  `node scripts/survey-to-html.js <discovery.json>` → writes the HTML, prints the path,
  exits 0; usage error → exit 2; read/parse error → exit 1.

## Integration into `/karto-explore`

`commands/karto-explore.md`, Phase B, after the survey JSON is saved (current step 7):

- Add a step: run
  `node ${CLAUDE_PLUGIN_ROOT}/scripts/survey-to-html.js kartograph/surveys/<date>-<slug>.discovery.json`
  to emit the sibling `.discovery.html`.
- Phase C handoff: mention the `.discovery.html` as the readable view to review (the JSON
  remains the canonical append-only log).

## HTML content & layout

Self-contained dark document. CSS variables echo the viewer: `--bg #1a1d21`,
`--panel #23272e`, `--ink #e6e6e6`, `--muted #9aa0a6`. Centered readable column
(max-width ~860px), section cards on `--panel`, slug/type rendered as small chips.

Sections in order (each omitted when empty):

1. **Header** — feature title from `sources.description`, the `date`, the `slug`; an
   issue link when `sources.issue` is present.
2. **Conversation summary** — `conversationSummary` rendered as paragraphs (split on
   blank lines), escaped.
3. **Findings:**
   - **Subjects / Events / Actors** — each item: name, slug chip, optional definition.
   - **Rules** — name, statement, optional `subject` slug.
   - **Affected capabilities** — list of slug chips.
   - **Capability candidates** — name, slug, context, definition.
   - **Dependencies** — `from → to`, reason, feature filenames (optional section).
   - **Glossary additions** — term, type badge, definition, `aliasesToAvoid`.
   - **ADR candidates** — title, rationale, related contexts/capabilities.
   - **Placement** — kind, slug, optional context.
   - **Open questions** — question, optional context (optional section).

Each findings section header shows a count. Sections whose array is empty/absent are not
rendered.

## Testing (TDD)

`test/survey-html.test.js` against `renderSurveyHtml` with a representative fixture
discovery doc:

- **Escaping:** a value containing `<script>alert(1)</script>` appears escaped
  (`&lt;script&gt;`), never raw.
- **Section presence:** every populated section's heading and its content appear.
- **Empty omission:** a doc with empty `subjects`/absent `openQuestions` does not render
  those section headings.
- **Document skeleton:** output starts with `<!doctype html>` and contains the feature
  description and date.

A small CLI smoke check (write a temp JSON, run the script, assert the sibling `.html`
exists and is non-empty) may be added to the same test file.

## Versioning

`.discovery.html` is committed alongside the JSON (no `.gitignore` entry). On release,
bump the version in **both** `plugin.json` and `package.json`.

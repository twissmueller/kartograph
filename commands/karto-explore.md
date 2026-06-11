---
description: Survey a feature with you, then discover what it adds to the map — writes a reviewable survey, nothing else (read-only).
---

Run the **explore** phase of Kartograph for: `$ARGUMENTS`

Explore is **read-only**: it never modifies `kartograph.json`, the glossary, `.feature`
files, or code. Its only output is a survey file you review before charting.

## Phase A — Survey conversation (interactive)

1. Use the **`superpowers:brainstorming`** skill to open up and expand the feature idea with
   the user.
2. Then use the **`karto-grill`** skill to converge: interview the user one question at a
   time, challenge new terms against the existing project glossary in `kartograph.json`,
   sharpen fuzzy language, probe Given/When/Then scenarios, and flag ADR candidates. Pull in a
   GitHub issue if `$ARGUMENTS` references one.
3. Produce a concise **conversation summary** of what was discussed and decided.

## Phase B — Discovery workflow (background)

4. Determine today's date as `YYYY-MM-DD`, and a `slug` from the feature description
   (lowercase, hyphenated, e.g. "Watering schedule" → `watering-schedule`).
5. Invoke the **Workflow** tool with:
   - `scriptPath: ${CLAUDE_PLUGIN_ROOT}/workflows/internal/discovery.js`
   - `args: { date, slug, description: "<the feature description>", conversationSummary: "<the summary>", mapPath: "kartograph.json" }` (add `issue` if one was referenced)
   - Pass `args` as a real JSON **object**, never a JSON-stringified string — a stringified
     payload reaches the workflow as one string and yields an empty survey.
6. When it returns, **validate** the discovery document before saving it:
   - Write it to a temp file, then run
     `node ${CLAUDE_PLUGIN_ROOT}/scripts/validate-discovery.js <tempfile>`.
   - If validation fails, show the errors and fix the document (or re-run the workflow); do
     not save an invalid survey.
7. On success, save it to `kartograph/surveys/<date>-<slug>.discovery.json` (create the
   `kartograph/surveys/` directory if needed). This file is the append-only expedition log.
8. Render a readable HTML view next to the JSON:
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/survey-to-html.js kartograph/surveys/<date>-<slug>.discovery.json`.
   This writes `kartograph/surveys/<date>-<slug>.discovery.html` deterministically from the
   JSON — a self-contained, structured survey you can open in a browser.

## Phase C — Handoff

9. Summarize the findings for the user, then **pause and ask**: continue with `/karto-chart`
   now, or review the survey first? Point them at the readable
   `kartograph/surveys/<date>-<slug>.discovery.html` (the `.discovery.json` next to it is the
   canonical append-only log). Do not chart automatically.

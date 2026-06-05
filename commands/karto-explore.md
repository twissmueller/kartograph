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
6. When it returns, **validate** the discovery document before saving it:
   - Write it to a temp file, then run
     `node ${CLAUDE_PLUGIN_ROOT}/scripts/validate-discovery.js <tempfile>`.
   - If validation fails, show the errors and fix the document (or re-run the workflow); do
     not save an invalid survey.
7. On success, save it to `kartograph/surveys/<date>-<slug>.discovery.json` (create the
   `kartograph/surveys/` directory if needed). This file is the append-only expedition log.

## Phase C — Handoff

8. Summarize the findings for the user, then **pause and ask**: continue with `/karto-chart`
   now, or review `kartograph/surveys/<date>-<slug>.discovery.json` first? Do not chart
   automatically.

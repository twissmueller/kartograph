---
description: Survey a feature with you, then discover what it adds to the map — writes a reviewable survey, nothing else (read-only).
---

Run the **explore** phase of Kartograph for: `$ARGUMENTS`

Explore is **read-only**: it never modifies `.kartograph/kartograph.json`, the glossary,
`.feature` files, or code. Its only output is a survey file you review before charting — plus
`.kartograph/automation.json`, the automation policy Phase C asks you to confirm.

Explore is also where the pipeline's automation is decided. Phase C puts a short questionnaire
to you — which of chart, build, the acceptance suite, commits, the re-walk check and the walk
should happen on their own — and stores the answers. If you answer that charting is automatic,
explore continues into `/karto-chart` itself.

## Phase A — Survey conversation (interactive)

1. If the **`superpowers`** plugin is installed, use the **`superpowers:brainstorming`** skill
   to open up and expand the feature idea with the user. Otherwise follow this condensed
   guidance:
   - Understand the purpose, the users, and what success looks like **before** proposing any
     solution.
   - Ask **one question per message**, and prefer multiple-choice options over open-ended
     prompts.
   - Explore **2–3 alternative** approaches rather than committing to the first idea.
   - Keep steady **YAGNI** pressure — cut anything not needed to meet the stated success criteria.
   - **Summarize** the decisions made so far before converging on a direction.
2. Then use the **`karto-grill`** skill to converge: interview the user one question at a
   time, challenge new terms against the existing project glossary in `.kartograph/kartograph.json`,
   sharpen fuzzy language, probe Given/When/Then scenarios, and flag ADR candidates. Pull in a
   GitHub issue if `$ARGUMENTS` references one.
3. Produce a concise **conversation summary** of what was discussed and decided.

## Phase B — Discovery workflow (background)

4. Determine today's date as `YYYY-MM-DD`, and a `slug` from the feature description
   (lowercase, hyphenated, e.g. "Watering schedule" → `watering-schedule`).
5. Invoke the **Workflow** tool with:
   - `scriptPath: ${CLAUDE_PLUGIN_ROOT}/workflows/internal/discovery.js`
   - `args: { date, slug, description: "<the feature description>", conversationSummary: "<the summary>", mapPath: ".kartograph/kartograph.json" }` (add `issue` if one was referenced)
   - Pass `args` as a real JSON **object**, never a JSON-stringified string — a stringified
     payload reaches the workflow as one string and yields an empty survey.
6. When it returns, **validate** the discovery document before saving it:
   - Write it to a temp file, then run
     `node ${CLAUDE_PLUGIN_ROOT}/scripts/validate-discovery.js <tempfile>`.
   - If validation fails, show the errors and fix the document (or re-run the workflow); do
     not save an invalid survey.
7. On success, save it to `.kartograph/surveys/<date>-<slug>.discovery.json` (create the
   `.kartograph/surveys/` directory if needed). This file is the append-only expedition log.

## Phase C — Automation questionnaire, then handoff

8. Summarize the findings for the user.

9. **Ask which of the remaining steps should run on their own.** Print the questionnaire,
   already filled in with the project's current policy:

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/automation.js . questions
   ```

   It prints a JSON array of questions; every option carries the `step` and `mode` it stands
   for, and each step's current mode is listed first and marked `(current)`. Put them to the
   user in **one AskUserQuestion call**, exactly as printed — do not invent steps, reword the
   options, or bolt on questions of your own. Then persist the answers in a single call
   (every option *left unchecked* in the multi-select means `manual` — pass it explicitly):

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/automation.js . set <step> <mode> [<step> <mode> ...]
   ```

   This is the project's standing policy, stored in `.kartograph/automation.json` and tracked
   in git. Every later command reads it and acts **without asking again** — the next survey is
   where it gets revisited.

10. **Stamp the survey** with the answers, so this feature keeps the policy it was surveyed
    under even if the defaults change later: add an `automation` object to
    `.kartograph/surveys/<date>-<slug>.discovery.json` holding the same `"<step>": "<mode>"`
    pairs, then re-run `validate-discovery.js` on it.

11. Render the readable HTML view next to the JSON:
    `node ${CLAUDE_PLUGIN_ROOT}/scripts/survey-to-html.js .kartograph/surveys/<date>-<slug>.discovery.json`.
    This writes `.kartograph/surveys/<date>-<slug>.discovery.html` deterministically from the
    JSON — a self-contained, structured survey you can open in a browser. Point the user at it
    (the `.discovery.json` next to it is the canonical append-only log).

12. **Hand off according to `chart-after-explore`** — never on your own judgement:
    - `auto` → say that the automation policy charts automatically, then continue straight into
      **`/karto-chart`** on this survey.
    - `ask` → **pause and ask**: chart now, or review the survey first?
    - `manual` → stop here, and tell them `/karto-chart` folds the survey in when they are ready.

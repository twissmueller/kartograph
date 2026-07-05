---
description: Revise existing map behavior — retire an obsolete scenario or capability, or rename a capability/context — by assembling a reviewable survey, nothing else (read-only).
---

Run the **revise** phase of Kartograph for: `$ARGUMENTS`

Revise is the counterpart to explore: explore discovers *new* behavior, revise records that
some *existing* behavior is wrong or gone. Like explore it is **read-only** — it never touches
`.kartograph/kartograph.json`, the `.feature` files, or code. Its only output is a survey you
review, then chart. All map/file mutation happens later in `/karto-chart`.

**v1 scope (final):** `retire-scenario`, `retire-capability`, and display-name renames
(`rename-capability`, `rename-context`). **Out of scope — do not attempt here:** slug renames,
moving a capability to another context, and merging/splitting capabilities. A "change" is
modeled as retire-old **+** add-new: a revise survey may carry ordinary additive findings
alongside its `revisions`.

## Phase A — Identify the target (interactive)

1. Read the current map at `.kartograph/kartograph.json`. Ground the whole conversation in what
   is actually there — contexts, capabilities, and (for scenarios) the `.feature` files under
   `features/<context>/<capability>/`. Never invent slugs; every target must already exist.
2. From `$ARGUMENTS` and a short interview, pin down exactly **which** items to revise. One at
   a time, and for each one confirm it explicitly in the form **"retire/rename X because Y"**:
   - **retire-scenario** — name the capability, the `.feature` file, and the exact scenario
     name (copy it verbatim from the file). Ask for a one-line reason.
   - **retire-capability** — name the capability slug. Warn the user this also drops every
     dependency edge touching it and all its tracked scenarios; the `.feature` directory is
     removed during charting. Ask for a reason.
   - **rename-capability** / **rename-context** — this changes the **display name only**, never
     the slug or any cross-reference. Give the slug, the new name, and a reason.
3. If the same conversation also surfaced genuinely new behavior (the "add-new" half of a
   change), capture it as normal additive findings too — but keep revise focused; deep new
   discovery belongs in `/karto-explore`.

## Phase B — Assemble the survey (in-session, no workflow)

Revisions are precise, not creative, so there is **no LLM workflow** — build the JSON yourself.

4. Determine today's date as `YYYY-MM-DD` and a `slug` from the change (lowercase, hyphenated,
   e.g. "Drop the manual snooze" → `drop-manual-snooze`).
5. Construct the discovery document in memory:
   - Top-level: `date`, `slug`, `conversationSummary`, `sources.description`.
   - `findings`: include the object with its required arrays. For a pure revise they are all
     empty (`subjects`, `events`, `actors`, `rules`, `affectedCapabilities`,
     `capabilityCandidates`, `glossaryAdditions`, `adrCandidates`, `placement` = `[]`); fill
     any additive findings if this is a change.
   - `revisions`: one entry per confirmed revision, using the exact shapes:
     - `{ "type": "retire-scenario", "capability": <slug>, "feature": "<file>.feature", "scenario": "<exact name>", "reason": "<why>" }`
     - `{ "type": "retire-capability", "capability": <slug>, "reason": "<why>" }`
     - `{ "type": "rename-capability", "capability": <slug>, "newName": "<new display name>", "reason": "<why>" }`
     - `{ "type": "rename-context", "context": <slug>, "newName": "<new display name>", "reason": "<why>" }`
6. **Validate before saving.** Write it to a temp file and run
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/validate-discovery.js <tempfile>`. If it fails, show the
   errors and fix the document — do not save an invalid survey.
7. On success, save it to `.kartograph/surveys/<date>-<slug>.discovery.json` (create
   `.kartograph/surveys/` if needed). This is the same append-only expedition log explore
   writes to.
8. Render the readable HTML next to it:
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/survey-to-html.js .kartograph/surveys/<date>-<slug>.discovery.json`.

## Phase C — Handoff

9. Summarize the revisions (and any additive findings) for the user, then **pause and ask**:
   continue with `/karto-chart` now, or review the survey first? Point them at
   `.kartograph/surveys/<date>-<slug>.discovery.html`. Do not chart automatically — charting is
   where the map and `.feature` files actually change.

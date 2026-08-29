---
description: Bootstrap a draft Kartograph map from an existing codebase, for you to review.
---

Bootstrap a Kartograph map for this project by analyzing the **existing code**.
Optional focus subtree: `$ARGUMENTS`

1. Use the **`karto-analyze-repo`** skill for guidance on what to extract and how to derive
   maturity from real test coverage (never invent scenario tags).
2. Invoke the **Workflow** tool with:
   - `scriptPath: ${CLAUDE_PLUGIN_ROOT}/workflows/internal/init.js`
   - `args: { root: ".", scope: "<subtree from $ARGUMENTS, or omit>" }`
   For a very large repo, set `scope` to one subtree first to gauge cost, then widen.
3. The workflow returns `{ map, conceptFiles }`. It has already written the glossary as an OKF
   bundle at `knowledge/` — one markdown file per term, which is where definitions now live.
   **Validate both** before writing the map; this step is mandatory, never skip it:
   - `node ${CLAUDE_PLUGIN_ROOT}/scripts/validate-knowledge.js .` — OKF conformance plus the
     one-canonical-term rule. Fix the concept files and re-run until it reports OK. Warnings
     (broken cross-links, missing optional fields) are informational and never block.
   - Write `map` to a temp file, then run
     `node ${CLAUDE_PLUGIN_ROOT}/scripts/validate-kartograph.js <tempfile>`.
   - If it fails (schema, referential integrity, or a `glossaryRef` that does not resolve to a
     concept in the bundle), **fix the draft and re-run the validator until it passes** — do not
     write an invalid map. In particular, correct any wrong field names (e.g. a rule must use
     `statement` + a single `subject`, not `definition`/`appliesToSubjects`) and remember the map
     carries **no** `glossary` object at all — every definition belongs in `knowledge/`, and the
     map only points at it via `glossaryRef`. Only write `.kartograph/kartograph.json` once the
     validator reports OK.
4. If `.kartograph/kartograph.json` already exists and is **not** the seed map (its capabilities
   are more than just `start-here`), do **not** overwrite it without explicitly confirming with
   the user. Otherwise create the `.kartograph/` directory (`mkdir -p .kartograph`) and write the
   validated draft to `.kartograph/kartograph.json`.
5. **Pause and ask** the user to review the draft — both the map and the terms under
   `knowledge/` — and suggest running **`/karto-show`** to see it. Note that maturity was
   derived conservatively and can be refined by charting and building real scenarios, and that
   every term was written `status: draft`: they were inferred from code and stay unconfirmed
   until a human reviews them.

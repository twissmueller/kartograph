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
3. When it returns a draft map, **validate** it before writing:
   - Write the draft to a temp file, then run
     `node ${CLAUDE_PLUGIN_ROOT}/scripts/validate-kartograph.js <tempfile>`.
   - If it fails (schema or referential integrity), show the errors and fix the draft; do not
     write an invalid map.
4. If `kartograph.json` already exists and is **not** the seed map (its capabilities are more
   than just `start-here`), do **not** overwrite it without explicitly confirming with the
   user. Otherwise write the validated draft to `kartograph.json`.
5. **Pause and ask** the user to review the draft, and suggest running **`/karto-show`** to
   see it. Note that maturity was derived conservatively and can be refined by charting and
   building real scenarios.

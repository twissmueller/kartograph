---
description: Record an approved survey onto the map — update kartograph.json, grow the glossary, write tagged scenarios and ADRs, and reconcile maturity. Writing, but no code.
---

Run the **chart** phase: fold the latest (or specified) survey into the map. The map write is
**atomic** — on any failure nothing in `kartograph.json` changes.

1. **Pick the survey.** Use the file named in `$ARGUMENTS`, else the most recent
   `kartograph/surveys/*.discovery.json`. Validate it:
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/validate-discovery.js <survey>`. Stop if invalid.

2. **Apply it to a working copy of the map** (deterministic, idempotent):
   ```bash
   node -e "import('${CLAUDE_PLUGIN_ROOT}/workflows/lib/apply-discovery.js').then(async m=>{const fs=require('fs');const map=fs.existsSync('kartograph.json')?JSON.parse(fs.readFileSync('kartograph.json')):JSON.parse(fs.readFileSync('${CLAUDE_PLUGIN_ROOT}/examples/kartograph.seed.json'));const disc=JSON.parse(fs.readFileSync('<survey>'));fs.writeFileSync('kartograph.tmp.json', JSON.stringify(m.applyDiscovery(map,disc),null,2)+'\n');})"
   ```
   This adds capability candidates (born `vision`), subjects/actors/events, glossary
   additions, rules, and proposed-ADR metadata to `kartograph.tmp.json`.

3. **Groom** the working copy: use **`karto-groom-glossary`** to canonicalize the new glossary
   terms (synonyms → `aliasesToAvoid`) and **`karto-groom-adr`** to finalize ADR numbering and
   status. Apply their proposed edits to `kartograph.tmp.json`.

4. **Generate the prose** via the **Workflow** tool:
   - `scriptPath: ${CLAUDE_PLUGIN_ROOT}/workflows/chart.js`
   - `args: { discoveryPath: "<survey>", mapPath: "kartograph.tmp.json" }`
   It writes `.feature` files (tagged `@happy`/`@edge`/`@error`) under
   `features/<context>/<capability>/` and ADR `.md` files under `kartograph/decisions/`.

5. **Reconcile maturity** from the freshly written scenarios and validate, writing the result
   back into the working copy:
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/reconcile.js kartograph.tmp.json`
   (reconcile recomputes every `derived` block and fails if the result is not schema-valid).

6. **Atomic swap.** Only if reconcile succeeded, move `kartograph.tmp.json` → `kartograph.json`.
   On any earlier failure, delete `kartograph.tmp.json` and report — `kartograph.json` is
   untouched. (The generated `.feature`/`.md` files are additive and harmless if a run aborts.)

7. **Pause and ask:** continue with `/karto-build <capability>` now, or review the diff
   (`git diff`, or `/karto-show`) first? Do not build automatically.

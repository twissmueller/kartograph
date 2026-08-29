---
description: Record an approved survey — update kartograph.json, grow the knowledge/ glossary bundle, write tagged scenarios and ADRs, and reconcile maturity. Writing, but no code.
---

Run the **chart** phase: fold the latest (or specified) survey into the map. The map lives at
`.kartograph/kartograph.json`; the working copy is `.kartograph/kartograph.tmp.json`. The map
write is **atomic** — on any failure nothing in `.kartograph/kartograph.json` changes.

1. **Pick the survey.** Use the file named in `$ARGUMENTS`, else the most recent
   `.kartograph/surveys/*.discovery.json`. Validate it:
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/validate-discovery.js <survey>`. Stop if invalid.

2. **Apply it to a working copy of the map** (deterministic, idempotent). Ensure the
   `.kartograph/` directory exists first (`mkdir -p .kartograph`):
   ```bash
   mkdir -p .kartograph && node -e "import('${CLAUDE_PLUGIN_ROOT}/workflows/lib/apply-discovery.js').then(async m=>{const fs=require('fs');const map=fs.existsSync('.kartograph/kartograph.json')?JSON.parse(fs.readFileSync('.kartograph/kartograph.json')):JSON.parse(fs.readFileSync('${CLAUDE_PLUGIN_ROOT}/examples/kartograph.seed.json'));const disc=JSON.parse(fs.readFileSync('<survey>'));fs.writeFileSync('.kartograph/kartograph.tmp.json', JSON.stringify(m.applyDiscovery(map,disc),null,2)+'\n');})"
   ```
   This adds capability candidates (born `vision`), subjects/actors/events, rules, and
   proposed-ADR metadata to `.kartograph/kartograph.tmp.json`. Glossary additions do **not**
   become map data: each one only leaves a `glossaryRef` pointer (`<kontext>/<slug>`, or
   `shared/<slug>`) on the node it defines. The definition itself is written as a concept file
   in the `knowledge/` bundle in step 4.

   If the survey carries a `revisions` array (from `/karto-revise`), `applyDiscovery` also folds the
   **map-side** effects into the working copy after the additive findings: retire-scenario
   drops the scenario's `tracking`/`scenarioNotes`; retire-capability deletes the capability,
   every dependency edge touching it, and its tracking/notes; renames update the display
   `name` only (see `workflows/lib/apply-revisions.js`).

2a. **If the survey has `revisions`, apply the file-side effects too** (the map side was
   handled in step 2). These are deterministic scripts, no LLM:
   - For each **retire-scenario** `{ capability, feature, scenario }` — resolve the capability's
     context from the working-copy map, then remove the scenario block from its `.feature` file:
     ```bash
     node ${CLAUDE_PLUGIN_ROOT}/scripts/retire-scenario.js . <context> <capability> <feature.feature> "<scenario>"
     ```
   - **retire-capability** feature-dir removal is deferred to **after the atomic swap** (step 6)
     so a failed run leaves the files on disk. Renames touch no files.

3. **Groom the ADR metadata** in the working copy (no files written yet): use
   **`karto-groom-adr`** to tidy ADR status/supersession. The ADR ids were already assigned in
   step 2 — **reuse them**, do not renumber. Apply the proposed metadata edits to
   `.kartograph/kartograph.tmp.json`. The ADR `.md` files are written in step 4. (The glossary
   is groomed in step 4a, after its concept files exist.)

4. **Generate the prose** via the **Workflow** tool:
   - `scriptPath: ${CLAUDE_PLUGIN_ROOT}/workflows/internal/chart.js`
   - `args: { discoveryPath: "<survey>", mapPath: ".kartograph/kartograph.tmp.json" }`
   It writes the glossary concept files under `knowledge/<kontext>/`, `.feature` files (tagged
   `@happy`/`@edge`/`@error`) under `features/<context>/<capability>/`, and ADR `.md` files
   under `.kartograph/decisions/`.

4a. **Groom the glossary** with **`karto-groom-glossary`**: canonicalize the newly written
   concepts (synonyms → `aliases_to_avoid`, collisions merged, ambiguities split), then
   regenerate `knowledge/index.md` and append a dated `knowledge/log.md` entry. Validate the
   bundle: `node ${CLAUDE_PLUGIN_ROOT}/scripts/validate-knowledge.js .` — fix and re-run until
   it reports OK. Warnings never block. If grooming renamed or moved a concept, update the
   matching `glossaryRef` in `.kartograph/kartograph.tmp.json` so the pointer still resolves.

   The concept files are **not** part of the map's atomic swap: they are the truth, they are
   written directly, and they stand on their own if a later step fails.

5. **Reconcile maturity** from the freshly written scenarios and validate, writing the result
   back into the working copy:
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/reconcile.js .kartograph/kartograph.tmp.json`
   (reconcile recomputes every `derived` block, re-checks every `glossaryRef` against the
   `knowledge/` bundle, and fails if the result is not schema-valid).

6. **Atomic swap.** Only if reconcile succeeded, move `.kartograph/kartograph.tmp.json` →
   `.kartograph/kartograph.json`. On any earlier failure, delete `.kartograph/kartograph.tmp.json`
   and report — `.kartograph/kartograph.json` is untouched. (The generated `.feature`/`.md`
   files are additive and harmless if a run aborts.) **After** the swap succeeds, for each
   **retire-capability** revision remove its now-orphaned feature directory and report it:
   `git rm -r features/<context>/<capability>/` (resolve `<context>` from the pre-swap map;
   fall back to `rm -rf` if the path was never committed). Retiring scenarios can lower a
   capability's maturity — that is correct; maturity is earned, not declared.

7. **Pause and ask:** continue with `/karto-build <capability>` now, or review the diff
   (`git diff`, or `/karto-show`) first? Do not build automatically.

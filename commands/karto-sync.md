---
description: Keep the Kartograph map current with the code — detect structural drift, run grooming, then validate and write atomically. Non-destructive: proposes additions and flags missing entries, never deletes.
---

Keep `kartograph.json` in sync with the codebase. Optional focus from `$ARGUMENTS`
(`code`, `glossary`, `adr`, `dependencies` — alias `deps`; runs all when empty). Sync only
**proposes** — nothing is written until you approve — and entries missing from the code are
**flagged, never deleted**.

1. Confirm `kartograph.json` exists. If it does not, suggest `/karto-init` to bootstrap first.
   Start a working copy: `cp kartograph.json kartograph.tmp.json`.

2. **Code drift** (when `$ARGUMENTS` is empty or `code`): use the **`karto-analyze-repo`**
   skill for guidance on what to extract, then invoke the **Workflow** tool with:
   - `scriptPath: ${CLAUDE_PLUGIN_ROOT}/workflows/internal/sync.js`
   - `args: { root: ".", scope: "<a subtree if $ARGUMENTS names one, else omit>", mapPath: "kartograph.json" }`
   It returns a discovery-style `findings` object describing what the code contains.
   - **Additions** — fold the findings into the working copy (adds/dedups only; never
     overwrites existing fields):
     ```bash
     FINDINGS='<the workflow findings as JSON>' node -e "import('${CLAUDE_PLUGIN_ROOT}/workflows/lib/apply-discovery.js').then(m=>{const fs=require('fs');const map=JSON.parse(fs.readFileSync('kartograph.tmp.json'));fs.writeFileSync('kartograph.tmp.json',JSON.stringify(m.applyDiscovery(map,{date:'',slug:'sync',conversationSummary:'',sources:{description:''},findings:JSON.parse(process.env.FINDINGS)}),null,2)+'\n');})"
     ```
   - **Drift report** — compute additions and missing entries from the ORIGINAL map:
     ```bash
     FINDINGS='<the same findings JSON>' node -e "import('${CLAUDE_PLUGIN_ROOT}/workflows/lib/map-drift.js').then(m=>{const map=JSON.parse(require('fs').readFileSync('kartograph.json'));console.log(JSON.stringify(m.mapDrift(map,JSON.parse(process.env.FINDINGS)),null,2));})"
     ```
     Present it grouped: `+ additions` (will be added on approval), `⚠ missing from code
     (keep or remove? — nothing deleted)`, and `→ suggestions` (run `/karto-explore` on the
     `suggestExplore` capabilities — coded but unscenarioed). Do **not** edit or delete
     flagged entries.

3. **Glossary** (empty or `glossary`): apply the **`karto-groom-glossary`** skill's logic to
   the working copy `kartograph.tmp.json`.
4. **ADRs** (empty or `adr`): apply the **`karto-groom-adr`** skill's logic to the working
   copy and `kartograph/decisions/*.md`.
5. **Dependencies** (empty, `dependencies`, or `deps`): apply the
   **`karto-groom-dependencies`** skill to back-fill edge `reason`/`features`, then fold its
   returned array into the working copy (the skill returns a `dependencies` array; wrap it in
   a findings object whose other lists are empty):
   ```bash
   DEPS='<the skill dependencies array as JSON>' node -e "import('${CLAUDE_PLUGIN_ROOT}/workflows/lib/apply-discovery.js').then(m=>{const fs=require('fs');const map=JSON.parse(fs.readFileSync('kartograph.tmp.json'));const findings={subjects:[],events:[],actors:[],rules:[],affectedCapabilities:[],capabilityCandidates:[],glossaryAdditions:[],adrCandidates:[],placement:[],dependencies:JSON.parse(process.env.DEPS)};fs.writeFileSync('kartograph.tmp.json',JSON.stringify(m.applyDiscovery(map,{date:'',slug:'sync',conversationSummary:'',sources:{description:''},findings}),null,2)+'\n');})"
   ```

6. Show the user the full diff of `kartograph.tmp.json` vs `kartograph.json`, plus the drift
   report. Wait for approval.

7. **Validate** the working copy:
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/validate-kartograph.js kartograph.tmp.json`. If it
   fails, fix and re-validate — never write an invalid map.

8. **Reconcile and swap** — only on approval and a clean validate:
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/reconcile.js kartograph.tmp.json` (recomputes derived
   maturity/counts and re-validates), then move `kartograph.tmp.json` → `kartograph.json`. On
   any earlier failure, delete `kartograph.tmp.json`; `kartograph.json` is untouched. Report
   what was added and what remains flagged.

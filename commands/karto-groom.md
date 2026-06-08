---
description: Groom the project glossary, ADRs, and dependency edges on demand — canonicalize terms, kill synonyms, tidy decision records, back-fill dependency reasons/features — then validate and write atomically.
---

Groom the current Kartograph map. Optional focus from `$ARGUMENTS` (`glossary`, `adr`,
`dependencies` — alias `deps`; runs all three if empty).

1. Confirm `kartograph.json` exists.
2. **Glossary** (when `$ARGUMENTS` is empty or `glossary`): use the **`karto-groom-glossary`**
   skill to canonicalize terms, populate `aliasesToAvoid`, and flag ambiguities/collisions.
3. **ADRs** (when `$ARGUMENTS` is empty or `adr`): use the **`karto-groom-adr`** skill to tidy
   `kartograph/decisions/*.md`, fix numbering/supersession, and sync the `adrs` metadata.
4. **Dependencies** (when `$ARGUMENTS` is empty, `dependencies`, or `deps`): use the
   **`karto-groom-dependencies`** skill to back-fill existing dependency edges that lack a
   `reason` or justifying `features`, reading the `from` capability's scenarios for evidence.
   Fold the skill's returned `dependencies` findings into a working copy via `applyDiscovery`
   (it dedups by `from+to`, unions `features`, and sets `reason`):
   ```bash
   DEPS='<the skill's dependencies array as JSON>' node -e "import('${CLAUDE_PLUGIN_ROOT}/workflows/lib/apply-discovery.js').then(m=>{const fs=require('fs');const map=JSON.parse(fs.readFileSync('kartograph.json'));const findings={subjects:[],events:[],actors:[],rules:[],affectedCapabilities:[],capabilityCandidates:[],glossaryAdditions:[],adrCandidates:[],placement:[],dependencies:JSON.parse(process.env.DEPS)};fs.writeFileSync('kartograph.tmp.json',JSON.stringify(m.applyDiscovery(map,{date:'',slug:'groom',conversationSummary:'',sources:{description:''},findings}),null,2)+'\n');})"
   ```
   Surface any edges the skill flagged as stale/undocumented for the user to decide on — do
   **not** delete edges automatically.
5. Show the user a diff of the proposed changes.
6. Validate the updated map: write it to a temp file and run
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/validate-kartograph.js <tempfile>`. If it fails, fix and
   re-validate — do not write an invalid map.
7. On success, write `kartograph.json` (and any changed `.md` files) atomically, and report
   what changed.

---
description: Groom the project glossary and ADRs on demand — canonicalize terms, kill synonyms, tidy decision records — then validate and write atomically.
---

Groom the current Kartograph map's glossary and decisions. Optional focus from `$ARGUMENTS`
(`glossary`, `adr`, or both if empty).

1. Confirm `kartograph.json` exists.
2. **Glossary** (unless `$ARGUMENTS` is `adr`): use the **`karto-groom-glossary`** skill to
   canonicalize terms, populate `aliasesToAvoid`, and flag ambiguities/collisions.
3. **ADRs** (unless `$ARGUMENTS` is `glossary`): use the **`karto-groom-adr`** skill to tidy
   `kartograph/decisions/*.md`, fix numbering/supersession, and sync the `adrs` metadata.
4. Show the user a diff of the proposed changes.
5. Validate the updated map: write it to a temp file and run
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/validate-kartograph.js <tempfile>`. If it fails, fix and
   re-validate — do not write an invalid map.
6. On success, write `kartograph.json` (and any changed `.md` files) atomically, and report
   what changed.

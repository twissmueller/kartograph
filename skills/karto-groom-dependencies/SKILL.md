---
name: karto-groom-dependencies
user-invocable: false
description: Back-fill existing Kartograph dependency edges with a one-line reason and the justifying feature filenames, by reading the from-capability's scenarios. Flags edges no feature supports (possible stale dependency). Use on demand via /karto-groom.
---

# Karto-Groom-Dependencies

Make every `dependencies` edge in `kartograph.json` **explainable**. A dependency is a
directed capability→capability relation `{ from, to, reason?, features? }`. Many edges —
especially ones created by `/karto-init` or charted before annotations existed — have neither
a `reason` nor `features`. This skill back-fills them from evidence already in the repo. It is
**enrichment only**: never invent, remove, or re-point edges, and never change `from`/`to`.

## What to do

1. Load `kartograph.json`. List the edges needing work (missing a `reason` or any `features`):

   ```bash
   node -e "import('${CLAUDE_PLUGIN_ROOT}/workflows/lib/apply-discovery.js').then(m=>{const map=JSON.parse(require('fs').readFileSync('kartograph.json'));for(const d of m.unannotatedDependencies(map))console.log(d.from,'->',d.to);})"
   ```

2. For each such edge `from → to`, read the `from` capability's scenarios at
   `features/<from.context>/<from>/*.feature` (and the `to` capability's definition). Find the
   feature(s) whose behaviour actually needs `to`.
   - **features**: set to the exact `.feature` filename(s) in `from` that justify the edge
     (filenames only, e.g. `grant-license.feature` — not titles, not paths).
   - **reason**: one tight line describing HOW `from` uses `to` (e.g. "reads canonical plant
     records to size and space beds"). Present tense, concrete, no hedging.

3. **Do not fabricate evidence.** If no feature in `from` justifies the edge:
   - Still propose a `reason` only if the capability *definitions* clearly imply the coupling;
     otherwise leave `features` empty and **flag the edge to the user as a possible stale or
     undocumented dependency** (the `from` capability may have no charted scenario for it yet).
   - Never name a feature file that does not exist on disk.

4. Preserve everything already present: keep an existing `reason`/`features` unless it is
   clearly wrong; when adding to an edge that already has some features, **union** — do not drop
   prior entries.

## Output

Return a `dependencies` findings array of the edges you enriched, each
`{ from, to, reason?, features? }`. The `/karto-groom` command folds it into the map via
`applyDiscovery` (which dedups by `from+to`, unions `features`, and sets `reason`), then
validates and writes atomically. Separately, list any edges you flagged as stale/undocumented
so the user can decide whether to keep or remove them.

## Rules

- Enrichment only — no new edges, no deletions, no `from`/`to` changes.
- Evidence-based — a named feature MUST exist in the `from` capability's directory.
- Be opinionated and concise in each `reason`; one sentence, the actual mechanism.
- Idempotent — re-running adds nothing for already-annotated edges.

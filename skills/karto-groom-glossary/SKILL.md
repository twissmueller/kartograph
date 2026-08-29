---
name: karto-groom-glossary
user-invocable: false
description: Groom the Kartograph glossary — the OKF knowledge bundle at knowledge/. Enforce one canonical term per concept, list synonyms as aliases_to_avoid, flag ambiguities and collisions, keep definitions tight, and keep provenance and trust honest. Use during /karto-chart or on demand via /karto-sync.
---

# Karto-Groom-Glossary

Maintain the **semantic** quality of the project glossary, which lives as an
[Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
(OKF v0.2) bundle at **`knowledge/`** — one markdown file per term. The deterministic layer
guarantees the bundle's *structure* (`scripts/validate-knowledge.js`); this skill guarantees
its *meaning*. Synonyms are the enemy — they cause language drift between human and AI.

**The bundle is the single source of truth.** `.kartograph/kartograph.json` holds a
`knowledge` pointer and per-node `glossaryRef` concept IDs, and nothing else. Never copy a
term, definition, or alias back into the map — a definition exists in exactly one place.

## The bundle

```
knowledge/
  index.md                 bundle root index (generated), carries okf_version
  log.md                   dated update history, newest first
  <kontext>/
    <slug>.md              a term belonging to that Kontext
  shared/
    <slug>.md              a term genuinely used across more than one Kontext
```

A concept's **ID** is its path without `.md` (`garten/pflanze`) — that is what a
`glossaryRef` in the map points at. `index.md` and `log.md` are reserved and are never
concept documents.

## A concept document

```md
---
type: Subjekt                 # Subjekt | Akteur | Ereignis | Regel | Kontext | Capability | Begriff
title: Pflanze                # the canonical term
description: Eine kultivierte Pflanze im Garten.   # ONE tight sentence
status: draft                 # draft | stable | deprecated (absent means stable)
aliases_to_avoid: [Gewächs, Blume]
generated: { by: kartograph/karto-chart, at: 2026-08-29T10:00:00Z }
verified: { by: human:tobias, at: 2026-08-29T11:00:00Z }
sources:
  - id: survey-beete
    resource: ../.kartograph/surveys/2026-08-29-beete.discovery.json
    title: Survey — Beete anlegen
---

# Definition

Eine kultivierte Pflanze im Garten.

# Aliases to avoid

- **Gewächs** — say **Pflanze** instead.

# Related

- [Beet](/garten/beet.md)
```

`type` values are the meta-glossary's ten terms in canonical German — OKF does not register
types centrally (§4.1), so this list is Kartograph's own vocabulary and nothing else is valid.

## What to do

1. Read every concept under `knowledge/` (skip `index.md` and `log.md`) plus the terms being
   added.
2. For every concept, enforce **one canonical term**. When two files mean the same thing, pick
   the best title and fold the others in: the loser's wording moves to the winner's
   `aliases_to_avoid`, and the loser's file is marked `status: deprecated` — never deleted, so
   existing links and history keep resolving (§5.4).
3. **Flag collisions** (two terms, one meaning) and **ambiguities** (one term, two meanings):
   - Collision → merge as above.
   - Ambiguity → split into two precise concepts with distinct definitions and titles.
4. Keep each `description` to **one tight sentence** — what the thing *is*, not what it does.
   The body's `# Definition` may elaborate; the frontmatter line may not.
5. Place each term: in its Kontext's directory, or in `shared/` only when it is genuinely used
   across Kontexte. A term used in one Kontext does not belong in `shared/`.
6. **Keep provenance honest.** Every concept records where it came from in `sources` — the
   survey that discovered it, or the code `/karto-init` read. Never drop a `sources` entry;
   add one when a new survey re-derives the term.
7. **Never fabricate trust.** `generated.by` is the actor that wrote the content
   (`kartograph/karto-chart`, `kartograph/karto-init`, `human:<id>`). `verified` records who
   *confirmed* it, and only a human confirming a term may add a `human:` entry — you may
   never write one on the user's behalf. A term you wrote is `status: draft` until a human
   says otherwise.
8. Fix `# Related` links to the bundle-relative form (`/garten/beet.md`). A link to a concept
   that does not exist yet is a warning, not an error — it may be knowledge not yet written
   (§6.1) — so leave it if the relationship is real.
9. Regenerate `index.md` and add a dated `log.md` entry for what you changed.

## Rules

- Be **opinionated**: choose the canonical term, don't hedge.
- Prefer the term the existing code and team already use.
- Do **not** invent terms the survey/map didn't surface.
- Never write the same fact in two files, and never write it back into the map.
- The result must pass `node scripts/validate-knowledge.js`.

## Output

Report the merges, splits, deprecations and new `aliases_to_avoid` entries you made. When
invoked from `/karto-chart` the caller applies map-side changes and writes
`.kartograph/kartograph.json` atomically; the concept files themselves you write directly —
they are the truth, and they are not part of the map's atomic swap.

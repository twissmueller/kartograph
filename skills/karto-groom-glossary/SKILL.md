---
name: karto-groom-glossary
description: Groom the Kartograph project glossary — enforce one canonical term per concept, list synonyms as aliasesToAvoid, flag ambiguities and collisions, keep definitions tight. Use during /karto-chart or on demand via /karto-groom.
---

# Karto-Groom-Glossary

Maintain the **semantic** quality of the project glossary in `kartograph.json` (the `glossary`
object). The workflows guarantee the glossary's *structure*; this skill guarantees its
*meaning*. Synonyms are the enemy — they cause language drift between human and AI.

## What to do

1. Load the current `glossary` from `kartograph.json` and the new terms being added.
2. For every concept, enforce **one canonical term**. When two words mean the same thing,
   pick the best one and record the others under `aliasesToAvoid`.
3. **Flag collisions** (two terms, one meaning) and **ambiguities** (one term, two meanings):
   - Collision → merge into the canonical term; move the rejected wording to `aliasesToAvoid`.
   - Ambiguity → split into two precise terms with distinct definitions.
4. Keep each `definition` to **one tight sentence** — what the thing *is*, not what it does.
5. Preserve each entry's `type` (`subjekt | capability | kontext | akteur | ereignis | regel | term`).
6. On re-run, merge newly discovered terms into the existing set without losing prior
   `aliasesToAvoid` entries.

## Rules

- Be **opinionated**: choose the canonical term, don't hedge.
- Prefer the term the existing code and team already use.
- Do **not** invent terms the survey/map didn't surface.
- The result must stay valid against `schemas/v1/glossary.schema.json`.

## Output

Propose the groomed `glossary` object. You do **not** write `kartograph.json` yourself — the
caller (`/karto-chart` or `/karto-groom`) applies your changes, validates with
`scripts/validate-kartograph.js`, and writes atomically. Report the merges, splits, and new
`aliasesToAvoid` entries you made.

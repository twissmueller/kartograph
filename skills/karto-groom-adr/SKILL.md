---
name: karto-groom-adr
description: Create and maintain Kartograph ADRs — MADR-style decision records in kartograph/decisions, sequential numbering, supersession, the worthiness test, with kartograph.json adr metadata kept in sync. Use during /karto-chart or on demand via /karto-groom.
---

# Karto-Groom-ADR

Maintain the architecture decision records: the prose in `kartograph/decisions/NNNN-slug.md`
and the metadata in `kartograph.json` (the `adrs` object). Prose and metadata must stay in sync.

## Worthiness test

Record an ADR only when **all three** hold:

1. **Hard to reverse** — changing your mind later is expensive.
2. **Surprising without context** — a future reader will wonder "why was it done this way?".
3. **The result of a real trade-off** — there were genuine alternatives and one was chosen.

If any is missing, it is a plain feature, not an ADR. Don't record it.

## Format (MADR)

`kartograph/decisions/NNNN-slug.md`:

```md
# {Short title of the decision}

{1–3 sentences: the context, what was decided, and why.}
```

Optional sections only when they add value: **Status** (`proposed | accepted | superseded by
ADR-NNNN | deprecated | rejected`), **Considered Options**, **Consequences**.

## Numbering & supersession

- **Number** by scanning `kartograph/decisions/` for the highest `NNNN` and incrementing
  (zero-padded to four digits). Slug is a lowercase-hyphen of the title.
- When a new decision replaces an old one, set the new ADR's `supersedes` to the old id and
  mark the old one `superseded` (in both its `.md` and its `kartograph.json` metadata).

## Metadata sync

Each `.md` has a matching entry in `kartograph.json.adrs`:
`{ id, title, status, date, contexts, capabilities, supersedes }`. The `id` equals the
filename without `.md` and must match the map key. Keep them identical.

## Output

Propose the `.md` files and the `adrs` metadata. The caller writes the files, validates the
map with `scripts/validate-kartograph.js`, and writes `kartograph.json` atomically.

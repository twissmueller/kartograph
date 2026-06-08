# Open Questions — Design

**Date:** 2026-06-08
**Status:** Approved (design)

## Problem

During `/karto-explore` the grill interview asks valid, sharp questions that the user
sometimes cannot answer yet ("which retention period?", "who owns this data?"). Today those
questions are lost — they live only in the transient conversation. The user needs them:

1. **Recorded against the feature** they arose from (so the context is never lost), and
2. **Aggregated into one complete list** they can open in a customer meeting and walk through.

## Goals

- Capture unanswered questions as they surface in the grill interview.
- Carry them through the existing pipeline (survey → chart → map → viewer) with no new
  storage location or side-channel.
- Surface a complete, feature-grouped list in the viewer.

## Non-goals (decided during brainstorming)

- **No lifecycle / status.** Questions are a plain list — no `open`/`answered`/`dropped`
  state, no `answer` field, no automatic re-surfacing in the next explore. "Collect & show"
  only. When a question is settled the user removes it (or it simply stays as a record).
- **No automatic back-flow** of answers into a later `/karto-explore`. Manual.
- **No grouping by capability/map-node.** Grouping is by the *explored feature* (the survey:
  slug + description + date).

## Approach

Open questions are a new **finding type**, modelled exactly like `dependencies`: an **optional**
field everywhere, so existing surveys and maps stay valid. They travel the normal path —
grill captures → discovery workflow extracts into the survey → `/karto-chart` folds them
atomically into `kartograph.json` → the viewer reads them from the map. No new pipeline.

This means open questions become visible **after charting** (consistent with every other
finding), which the user accepted. The survey file itself is the per-feature record;
the map's aggregated `openQuestions` is the complete list.

## Components

### 1. Grill skill — `skills/karto-grill/SKILL.md`

Add guidance: when the user cannot answer a valid question yet, the interviewer does **not**
loop on it — it **records it as an open question** and moves on. These questions are written
verbatim into the conversation summary under a dedicated **"Offene Fragen / Open questions"**
section, so the discovery workflow can extract them.

### 2. Discovery workflow — `workflows/internal/discovery.js`

- Add `openQuestions` to `FINDINGS_SCHEMA` (optional array; items `{ question, context? }`).
- Extend the Extract prompt: pull unanswered/open questions out of the conversation summary
  into `openQuestions`. `context` is an optional related capability/context slug when obvious.
- Cross-check phase passes them through unchanged.

### 3. Discovery schema — `schemas/v1/discovery.schema.json`

Add to `findings` (and a `$defs/openQuestion`):

```json
"openQuestions": {
  "type": "array",
  "items": {
    "type": "object", "additionalProperties": false,
    "required": ["question"],
    "properties": {
      "question": { "type": "string", "minLength": 1 },
      "context":  { "$ref": "#/$defs/slug" }
    }
  }
}
```

`openQuestions` is **NOT** added to the `findings.required` list (matches how `dependencies`
is optional). Existing surveys remain valid.

### 4. apply-discovery — `workflows/lib/apply-discovery.js`

Fold `f.openQuestions || []` into a new top-level `next.openQuestions` array. Each map entry
is stamped with its origin:

```json
{
  "question": "How long do we retain irrigation logs?",
  "feature": { "slug": "bewaesserungsplan", "description": "Bewässerungsplan" },
  "date": "2026-06-08",
  "context": "watering"
}
```

- `feature.slug` ← `discovery.slug`; `feature.description` ← `discovery.sources.description`;
  `date` ← `discovery.date`; `context` carried over only if present.
- **Idempotent:** dedupe on normalized `question` + `feature.slug`, so re-charting the same
  survey adds nothing. (Mirrors the existing dependency/ADR dedupe style.)
- Initialise `next.openQuestions ||= []` alongside the other collection guards.

### 5. Map schema — `schemas/v1/kartograph.schema.json`

Add an optional top-level `openQuestions` array (not in `required`):

```json
"openQuestions": {
  "type": "array",
  "items": {
    "type": "object", "additionalProperties": false,
    "required": ["question", "feature", "date"],
    "properties": {
      "question": { "type": "string", "minLength": 1 },
      "feature": {
        "type": "object", "additionalProperties": false,
        "required": ["slug", "description"],
        "properties": {
          "slug": { "$ref": "#/$defs/slug" },
          "description": { "type": "string", "minLength": 1 }
        }
      },
      "date": { "type": "string", "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" },
      "context": { "$ref": "#/$defs/slug" }
    }
  }
}
```

No `status`, no `answer` — pure list per the user's decision.

### 6. Viewer — `viewer/`

Add an **"Open Questions"** accordion `<section>` to the sidebar in `index.html` (alongside
Maturity / Glossary / Decisions), and render it in `viewer/kartograph.js`:

- Read `map.openQuestions` (default `[]`).
- **Group by feature** (`feature.description`), feature heading shows the description and the
  most recent date; questions listed beneath, each with its own date.
- Show a total count (e.g. in the section head or header stats).
- Empty state: hide the section or show "No open questions".
- Sort: newest feature first; within a feature, by date.

This grouped panel is the complete list the user opens in a customer meeting.

### 7. Tests — `test/`

- **Schema:** a valid map/survey with `openQuestions` passes; a malformed entry (missing
  `question`, extra property, bad date) fails. A map/survey **without** `openQuestions` still
  passes (backward-compat).
- **apply-discovery:** folding a survey with open questions produces stamped, feature-grouped
  entries; re-applying the same survey is idempotent (no duplicates).
- **Viewer:** light render/grouping check consistent with existing viewer tests.

## Data flow

```
grill interview
  └─ unanswered question → conversation summary ("Offene Fragen")
        └─ discovery.js (Extract) → survey.findings.openQuestions[]   (kartograph/surveys/*.json)
              └─ /karto-chart → apply-discovery → kartograph.json .openQuestions[]  (stamped w/ feature+date)
                    └─ viewer "Open Questions" panel (grouped by feature)
```

## Backward compatibility

`openQuestions` is optional in both schemas and guarded with `|| []` in code. Existing surveys,
maps, the seed, and the demo remain valid and unchanged.

## Release

Per repo convention, bump both version manifests (`plugin.json` + `package.json`) when shipping.

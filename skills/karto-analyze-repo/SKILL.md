---
name: karto-analyze-repo
user-invocable: false
description: Reverse-engineer a draft Kartograph map from an existing codebase — infer Kontexte, Capabilities, Subjekte, Akteure, dependencies, a glossary seed, and existing ADRs, deriving maturity from real test coverage. Use as the guidance behind /karto-init.
---

# Karto-Analyze-Repo — bootstrap a map from existing code

Guidance for the `/karto-init` workflow: read an existing codebase and produce a **draft**
`.kartograph/kartograph.json` for the human to review. This is the reverse of `explore` — you read code
instead of a feature description.

## What to extract

- **Kontexte (Contexts):** the top-level areas of the system — bounded modules, top-level
  source folders, deployment units, or clear domain areas. Each becomes a region.
- **Capabilities:** cohesive units of behavior within a context (a feature area, a service, a
  controller+usecase cluster). One context holds several capabilities.
- **Subjekte (Subjects):** the core domain data types — entities, persisted models, value
  objects that carry identity and rules.
- **Akteure (Actors):** humans-in-roles and external systems that drive the app.
- **Dependencies:** capability→capability data dependencies (the roads). Infer from imports
  and call graphs between capability clusters.
- **Glossary seed:** recurring domain nouns worth defining, with one canonical term each.
- **Existing ADRs:** if the repo already has `docs/adr/` (or similar), carry those decisions
  in as ADR metadata.

## Maturity is earned from Kartograph coverage, never declared

A capability's `derived.maturity` reflects **only** the Kartograph `.feature`/scenario
coverage it actually has — never your judgement of the project's own test suite, and never
fabricated `@happy/@edge/@error` tags. Reverse-engineering a codebase produces no Kartograph
scenarios, so honest counts are usually `0/0`.

Maturity follows STRICTLY from the counts you record:

- `featureCount` 0 → **`vision`** (set `declaredStage: "vision"`). This is the normal result
  for code that hasn't been charted yet — a well-built, well-tested feature with no Kartograph
  scenarios is still `vision` here.
- `featureCount` > 0 but `scenarioCount` 0 → **`sketched`**.
- `scenarioCount` > 0 → **`building`**.

**Never `usable` or `stable` at init.** Those require charted `@edge`/`@error` scenarios and
are earned later through `/karto-chart` + reconcile. Claiming them with zero coverage is a
contradiction the validator now rejects. When unsure, choose the **lower** maturity.

## Scope & cost

For a very large repo, analyze a **subtree first** (one context) to gauge cost and calibrate,
then widen. Slugs must be stable, lowercase-hyphenated, and unique. The draft is a *proposal*:
it goes through the same schema + referential-integrity gate and a human review before it
becomes the project's `.kartograph/kartograph.json`.

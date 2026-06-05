---
name: karto-analyze-repo
description: Reverse-engineer a draft Kartograph map from an existing codebase — infer Kontexte, Capabilities, Subjekte, Akteure, dependencies, a glossary seed, and existing ADRs, deriving maturity from real test coverage. Use as the guidance behind /karto-init.
---

# Karto-Analyze-Repo — bootstrap a map from existing code

Guidance for the `/karto-init` workflow: read an existing codebase and produce a **draft**
`kartograph.json` for the human to review. This is the reverse of `explore` — you read code
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

## Maturity is derived, never invented

Set each capability's maturity from what actually exists on disk — do **not** fabricate
`@happy/@edge/@error` scenario tags:

- Has real tests / `.feature` coverage → derive per the maturity table (`building`/`usable`/`stable`).
- Code exists but no meaningful tests → `sketched`.
- Named/stubbed only → `vision` (set `declaredStage: "vision"`).

When unsure, choose the **lower** maturity. The map should under-claim, never over-claim.

## Scope & cost

For a very large repo, analyze a **subtree first** (one context) to gauge cost and calibrate,
then widen. Slugs must be stable, lowercase-hyphenated, and unique. The draft is a *proposal*:
it goes through the same schema + referential-integrity gate and a human review before it
becomes the project's `kartograph.json`.

// Kartograph chart workflow (the creative half of /karto-chart).
//
// Runs as a Claude Code dynamic workflow (globals: agent, phase, args). It writes
// the knowledge/ concept files (the glossary), the .feature scenario files, and the ADR
// markdown files for an approved survey. The deterministic map mutation (apply-discovery),
// maturity reconciliation, schema validation, and the atomic write of kartograph.json are
// done by the /karto-chart command around this workflow — keeping the map write atomic.
//
// args: { discoveryPath, mapPath }

export const meta = {
  name: 'karto-chart',
  description: 'Write tagged Gherkin scenarios and ADR markdown for an approved Kartograph survey.',
  phases: [
    { title: 'Knowledge', detail: 'write OKF concept files for the survey\'s glossary additions' },
    { title: 'Scenarios', detail: 'write .feature files for new and affected capabilities' },
    { title: 'Decisions', detail: 'write MADR files for accepted ADR candidates' },
  ],
};

// Tolerate a JSON-stringified args object (a common Workflow mis-call), not just an object.
let a = args || {};
if (typeof a === 'string') { try { a = JSON.parse(a) || {}; } catch { a = {}; } }
const discoveryPath = a.discoveryPath;
const mapPath = a.mapPath || '.kartograph/kartograph.json';
const bundle = a.bundle || 'knowledge';

phase('Knowledge');
const conceptFiles = await agent(
  `Read the survey at "${discoveryPath}". Every definition it carries becomes a concept file — the map holds none of them.

Write a concept for each of:
- findings.glossaryAdditions — the domain terms (type from the addition, placed by its "kontext").
- findings.capabilityCandidates — one Capability concept each, at <capability context>/<capability slug>, description = the candidate's "definition".
- each NEW context a candidate introduces — one Kontext concept at <context>/<context>.md, description = one sentence naming what that area of the system covers.
- findings.rules — one Regel concept each at shared/<rule slug>, description = the rule's "statement" verbatim.

Write each as a concept document in the Open Knowledge Format (OKF v0.2) bundle at "${bundle}/".

This bundle is the SINGLE SOURCE OF TRUTH for what this project's words mean —
the map at "${mapPath}" only points into it and never repeats a definition.

File path: ${bundle}/<kontext>/<slug>.md. For a glossary addition use its "kontext"; when it has
none the term spans Kontexte, so write ${bundle}/shared/<slug>.md instead. Capabilities and
contexts are placed by their own context slug; rules go in shared/.
Create directories as needed. NEVER write to index.md or log.md — those are reserved.

The map's "glossaryRef" for each node already names the exact path you must write. Read
"${mapPath}" and honour it: a concept file the map points at but that does not exist fails the
write gate.

Each file is YAML frontmatter, then a markdown body:

---
type: <Subjekt | Akteur | Ereignis | Regel | Kontext | Capability | Begriff>
title: <the canonical term, exactly as the survey wrote it>
description: <ONE tight sentence: what the thing IS, not what it does>
status: draft
aliases_to_avoid: [<synonym>, ...]        # omit when the addition has none
generated: { by: kartograph/karto-chart, at: <this moment, ISO 8601 with a Z offset> }
sources:
  - id: <survey slug>
    resource: ../.kartograph/surveys/<the survey filename>
    title: <the survey's sources.description>
---

# Definition

<The definition sentence, then any elaboration the survey supports.>

# Aliases to avoid

- **<synonym>** — say **<canonical term>** instead.

# Related

- [<Other term>](/<kontext>/<slug>.md)

Rules:
- The "type" values above are the ONLY permitted ones. Map the survey's type slug to it:
  subjekt→Subjekt, akteur→Akteur, ereignis→Ereignis, regel→Regel, kontext→Kontext,
  capability→Capability, term→Begriff.
- "status: draft" is mandatory on every term you write. A term becomes "stable" only when a
  human confirms it; you may never write "stable" or a "verified" key yourself.
- ONE CANONICAL TERM PER CONCEPT. Before writing, read the existing files under "${bundle}/".
  If a term already has a concept file, do NOT write a second one — and if the survey's wording
  differs from the existing title, add the survey's wording to that file's aliases_to_avoid
  instead. Two files may never share a title, and no file's title may appear in another's
  aliases_to_avoid.
- Links between concepts use the bundle-relative form starting with "/", e.g.
  [Beet](/garten/beet.md). Only add a "# Related" section for terms that genuinely relate.
- Omit the "status" key entirely if and only if the term is stable — which, for you, is never.

Return a plain list of the file paths you wrote.`,
  { label: 'knowledge', phase: 'Knowledge' }
);

phase('Scenarios');
const featureFiles = await agent(
  `Read the survey at "${discoveryPath}" and the map at "${mapPath}".

For each capability candidate, and each affected capability that still has no scenarios,
write a Gherkin .feature file at:
  features/<context-slug>/<capability-slug>/<feature-slug>.feature
(create directories as needed).

Rules:
- Write for a NON-TECHNICAL stakeholder. Anyone sitting in front of the running system — with
  little prior knowledge — must be able to walk through each scenario by hand and confirm it.
  Feature and scenario titles, and every step, use plain DOMAIN language — the canonical terms
  from the knowledge bundle at "${bundle}/" (read the concept files' "title" fields; a term
  listed under any concept's aliases_to_avoid must NEVER appear), never developer jargon.
- Describe ONLY observable behaviour — what an actor does and what they can see or get back.
  Given = a situation the user can recognise; When = an action the user takes; Then = an outcome
  the user can directly observe and confirm.
- NO internal/implementation detail may leak. Do not mention databases/tables/columns, API
  endpoints or HTTP status codes, function/class/file names, internal IDs, queues, env vars, log
  entries, frameworks, or code structure. If a step cannot be observed and confirmed by the
  person at the screen, rewrite it in terms of what they can.
- Every Scenario MUST carry exactly one tag on the line above it: @happy, @edge, or @error.
- Start with at least the happy path; add @edge and @error scenarios where the survey's
  subjects, rules, and edge cases imply them — phrased as situations the user could actually
  encounter and recognise.
- Use Given/When/Then steps. Keep one Feature per file; the Feature describes a capability in
  user terms; name files with a lowercase-hyphen feature slug.
- If the survey's findings.dependencies reference a feature filename for a capability you are
  writing (the "features" list on a dependency whose "from" is that capability), name that
  capability's .feature file with the EXACT filename referenced, so the recorded dependency
  resolves to a real file.

Return a plain list of the file paths you wrote.`,
  { label: 'scenarios', phase: 'Scenarios' }
);

phase('Decisions');
const adrFiles = await agent(
  `Read the survey at "${discoveryPath}" and the ADR metadata (the "adrs" object) in the map at "${mapPath}".

For each ADR recorded in the map (status "proposed", sourced from the survey's adrCandidates),
write a MADR file at:
  .kartograph/decisions/<id>.md
where <id> exactly matches the map's adr key (e.g. 0001-use-firebase). Each file:
  # <Title>

  <1–3 sentences: context, decision, and why.>

Only keep decisions that are genuinely hard-to-reverse AND surprising AND the result of a real
trade-off. Do not write a file for anything that fails that test.

Return a plain list of the file paths you wrote.`,
  { label: 'decisions', phase: 'Decisions' }
);

return { conceptFiles, featureFiles, adrFiles };

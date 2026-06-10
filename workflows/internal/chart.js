// Kartograph chart workflow (the creative half of /karto-chart).
//
// Runs as a Claude Code dynamic workflow (globals: agent, phase, args). It writes
// the .feature scenario files and the ADR markdown files for an approved survey.
// The deterministic map mutation (apply-discovery), maturity reconciliation, schema
// validation, and the atomic write of kartograph.json are done by the /karto-chart
// command around this workflow — keeping the map write atomic.
//
// args: { discoveryPath, mapPath }

export const meta = {
  name: 'karto-chart',
  description: 'Write tagged Gherkin scenarios and ADR markdown for an approved Kartograph survey.',
  phases: [
    { title: 'Scenarios', detail: 'write .feature files for new and affected capabilities' },
    { title: 'Decisions', detail: 'write MADR files for accepted ADR candidates' },
  ],
};

// Tolerate a JSON-stringified args object (a common Workflow mis-call), not just an object.
let a = args || {};
if (typeof a === 'string') { try { a = JSON.parse(a) || {}; } catch { a = {}; } }
const discoveryPath = a.discoveryPath;
const mapPath = a.mapPath || 'kartograph.json';

phase('Scenarios');
const featureFiles = await agent(
  `Read the survey at "${discoveryPath}" and the map at "${mapPath}".

For each capability candidate, and each affected capability that still has no scenarios,
write a Gherkin .feature file at:
  features/<context-slug>/<capability-slug>/<feature-slug>.feature
(create directories as needed).

Rules:
- Every Scenario MUST carry exactly one tag on the line above it: @happy, @edge, or @error.
- Start with at least the happy path; add @edge and @error scenarios where the survey's
  subjects, rules, and edge cases imply them.
- Use Given/When/Then steps and the project glossary's canonical terms (read them from the map).
- Keep one Feature per file; name files with a lowercase-hyphen feature slug.
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
  kartograph/decisions/<id>.md
where <id> exactly matches the map's adr key (e.g. 0001-use-firebase). Each file:
  # <Title>

  <1–3 sentences: context, decision, and why.>

Only keep decisions that are genuinely hard-to-reverse AND surprising AND the result of a real
trade-off. Do not write a file for anything that fails that test.

Return a plain list of the file paths you wrote.`,
  { label: 'decisions', phase: 'Decisions' }
);

return { featureFiles, adrFiles };

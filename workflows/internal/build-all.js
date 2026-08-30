// workflows/internal/build-all.js
//
// Kartograph autonomous build orchestrator (the creative half of /karto-build-all).
// Runs as a Claude Code dynamic workflow (globals: agent, phase, args). It walks a
// pre-computed, dependency-ordered build plan and spawns ONE build subagent per
// capability, sequentially, each in its own context window. The deterministic plan
// (scripts/build-plan.js), the map writes (scripts/set-tracking.js, run by the
// subagents), and the final maturity reconcile + validate are done by the
// /karto-build-all command around this workflow — this workflow never writes the map.
//
// args: { plan, projectRoot, pluginRoot, automation }
//
// `automation` is the project's automation policy (workflows/lib/automation.js), read by
// the command and passed in — this script cannot touch the filesystem. Only two of its
// steps mean anything here, since build-all is autonomous by definition: `acceptance-suite`
// (how much of the outer loop each subagent runs) and `commit`.

export const meta = {
  name: 'karto-build-all',
  description: 'Autonomously build every open scenario in a scope, one capability per subagent, in dependency order.',
  phases: [
    { title: 'Build', detail: 'one subagent per capability, dependency-ordered, sequential' },
  ],
};

// Tolerate a JSON-stringified args object (a common Workflow mis-call), not just an object.
let a = args || {};
if (typeof a === 'string') { try { a = JSON.parse(a) || {}; } catch { a = {}; } }
const plan = a.plan || { order: [], skippedEmpty: [] };
const projectRoot = a.projectRoot || '.';
const pluginRoot = a.pluginRoot || '.';
const automation = a.automation || {};
const suite = ['full', 'scenario', 'off'].includes(automation['acceptance-suite'])
  ? automation['acceptance-suite'] : 'scenario';
const commitMode = automation.commit === 'manual' ? 'manual' : 'auto';

const OUTER_LOOP = {
  full: "Outer loop: run the project's WHOLE acceptance/e2e suite for each scenario if a runner exists; else rely on unit tests.",
  scenario: "Outer loop: run ONLY the scenario being built through the project's acceptance runner (select it by name or tag, e.g. --name/--tags), if a runner exists; else rely on unit tests. Do NOT run the whole suite.",
  off: 'Outer loop: DISABLED by the project automation policy — do not run the acceptance suite at all; unit tests are your only signal.',
}[suite];

const COMMIT_LINE = commitMode === 'auto'
  ? '- Commit your work for this capability.'
  : '- Do NOT commit: the project automation policy leaves committing to the human. Leave your work in the working tree.';

const BUILD_RESULT = {
  type: 'object',
  additionalProperties: false,
  required: ['status'],
  properties: {
    status: { enum: ['built', 'partial', 'failed'] },
    scenariosDeveloped: { type: 'array', items: { type: 'string' } },
    scenariosLeftOpen: { type: 'array', items: { type: 'string' } },
    note: { type: 'string' },
  },
};

function buildPrompt(cap) {
  const scenarios = cap.openScenarios.map((s) => `  - [${s.class || 'happy'}] ${s.feature} :: "${s.name}"`).join('\n');
  return `You are autonomously building ONE Kartograph capability end-to-end. Decide everything
yourself — do NOT ask anyone anything; there is no user to answer.

Project root: ${projectRoot}
Capability: ${cap.capability}   Context: ${cap.context}
Open scenarios to build (path class in brackets):
${scenarios}

How to build (double-loop, outside-in TDD):
- Work scenarios in order @happy -> @edge -> @error.
- ${OUTER_LOOP}
- Inner loop: write a failing unit test, watch it fail, minimal code to pass, refactor
  while green. No production code without a failing test you saw fail.
- Build the WHOLE VERTICAL SLICE: every layer the scenario crosses (frontend, backend/API, worker,
  persistence) must be wired together so the scenario is walkable END-TO-END through the real UI /
  entry point the user actually uses. Inspect the project (package.json, Makefile, etc.) to learn its
  test runners and source layout; use what it already uses.

Definition of done per scenario — the user can walk it:
- Only when the scenario is reachable end-to-end through the final interface (all layers connected,
  tests green) do you mark it Developed:
  node ${pluginRoot}/scripts/set-tracking.js ${projectRoot} ${cap.context} ${cap.capability} <feature.feature> "<scenario>" developed
- NEVER mark anything accepted — Accepted is the human's call after they walk it.
- If you cannot make a scenario walkable end-to-end, LEAVE IT OPEN (do not mark it Developed) and
  list it under scenariosLeftOpen with a one-line reason.

Finish:
${COMMIT_LINE}
- Return ONLY the result object: status 'built' (all scenarios Developed), 'partial' (some), or
  'failed' (none); scenariosDeveloped and scenariosLeftOpen arrays of scenario names; note = one-line
  reason when partial/failed.`;
}

phase('Build');
const failed = new Set();
const results = [];
for (const cap of plan.order) {
  const blockedBy = (cap.dependsOn || []).filter((d) => failed.has(d));
  if (blockedBy.length) {
    failed.add(cap.capability);
    results.push({ capability: cap.capability, status: 'skipped-blocked', blockedBy });
    log(`skip ${cap.capability}: blocked by ${blockedBy.join(', ')}`);
    continue;
  }
  const r = await agent(buildPrompt(cap), { schema: BUILD_RESULT, phase: 'Build', label: cap.capability });
  // a 'partial' (or null/failed) result is treated as failed: dependents need a complete foundation
  if (!r || r.status !== 'built') failed.add(cap.capability);
  results.push({ capability: cap.capability, ...(r || { status: 'failed', note: 'subagent returned no result' }) });
}

return { results, skippedEmpty: plan.skippedEmpty || [] };

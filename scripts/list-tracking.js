import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildBoard } from '../workflows/lib/board-data.js';
import { getScenarioNote } from '../workflows/lib/notes.js';
import { scenarioId } from '../workflows/lib/ids.js';
import { isState } from '../workflows/lib/tracking.js';
import { mapPath as defaultMapPath } from '../workflows/lib/paths.js';

// The state /karto-walk cares about by default: scenarios the agent has taken to
// `developed` and that now await a human's acceptance walkthrough.
export const DEFAULT_LIST_STATE = 'developed';

// Pure: from a board's scenarios (see workflows/lib/board-data.js buildBoard) and
// the map, return every scenario whose tracking `state` matches, as a flat,
// deterministic list. Each entry is
//   { context, capability, feature, scenario, state, class, note? }
// where `note` (the { reason, date, source } object from scenarioNotes) is present
// only when one is recorded for that scenario. Never mutates its inputs.
export function listTracking(scenarios, map, state = DEFAULT_LIST_STATE) {
  const out = [];
  for (const s of scenarios || []) {
    if (s.progress !== state) continue;
    const entry = {
      context: s.context,
      capability: s.capability,
      feature: s.feature,
      scenario: s.name,
      state: s.progress,
      class: s.class,
    };
    const note = getScenarioNote(map, scenarioId(s.capability, s.feature, s.name));
    if (note) entry.note = note;
    out.push(entry);
  }
  return out;
}

// CLI: node scripts/list-tracking.js <projectRoot> [open|developed|accepted]
// Prints the tracked scenarios in the given state (default `developed`) as JSON.
// Read-only — this lister never writes the map (state changes go through set-tracking.js).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] || process.cwd();
  const state = process.argv[3] || DEFAULT_LIST_STATE;
  if (!isState(state)) {
    console.error(`usage: list-tracking.js <projectRoot> [open|developed|accepted]  (default: ${DEFAULT_LIST_STATE})`);
    process.exit(2);
  }
  let map;
  try { map = JSON.parse(await readFile(defaultMapPath(root), 'utf8')); }
  catch { map = {}; }
  const { scenarios } = await buildBoard(root);
  console.log(JSON.stringify(listTracking(scenarios, map, state), null, 2));
}

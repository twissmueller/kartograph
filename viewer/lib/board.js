// Pure helpers for the scenario board. No DOM access — unit-tested in test/board.test.js;
// the DOM wiring lives in viewer/lib/board-view.js.

// The four progress columns, in display order.
export const BOARD_COLUMNS = ['open', 'wip', 'test', 'done'];

// Group scenarios into ordered columns keyed by their `progress` field (provided by the
// server's GET /board). An unknown or missing progress falls into 'open'.
export function boardColumns(scenarios) {
  const cols = { open: [], wip: [], test: [], done: [] };
  for (const s of scenarios || []) {
    (cols[s.progress] || cols.open).push(s);
  }
  return cols;
}

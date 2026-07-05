// Scenario notes: durable "why this scenario is stuck" context, stored in
// kartograph.json under a top-level `scenarioNotes` object keyed by the same
// canonical scenario ID as `tracking` (see workflows/lib/ids.js scenarioId:
// `<capability>/<feature.feature>#"<scenarioName>"`). Each value is
// { reason, date: "YYYY-MM-DD", source: "walk" | "build" }.
//
// Lifecycle (orchestrated by callers, e.g. scripts/set-tracking.js): a note is
// written when a scenario is set to `open` with a reason, and CLEARED when the
// scenario advances to `developed` or `accepted`. An empty block is dropped from
// the map (mirrors `tracking`). These are PURE helpers — they never mutate the
// input; callers build the ID and persist the map.

export const NOTE_SOURCES = ['walk', 'build'];

export function isNoteSource(s) { return NOTE_SOURCES.includes(s); }

// The note for a scenario by its full ID; missing -> null.
export function getScenarioNote(map, id) {
  const n = (map && map.scenarioNotes) || {};
  return n[id] || null;
}

// Return a NEW map with the scenario's note set. `reason` (non-empty), `date`
// ("YYYY-MM-DD") and `source` ('walk'|'build') are all required. Pure — never
// mutates `map`.
export function setScenarioNote(map, id, { reason, date, source } = {}) {
  if (typeof reason !== 'string' || reason.length < 1) throw new Error('note reason is required');
  if (typeof date !== 'string' || date.length < 1) throw new Error('note date is required');
  if (!isNoteSource(source)) throw new Error(`invalid note source: ${source}`);
  const next = structuredClone(map || {});
  const notes = { ...(next.scenarioNotes || {}) };
  notes[id] = { reason, date, source };
  next.scenarioNotes = notes;
  return next;
}

// Return a NEW map with the scenario's note removed (dropping `scenarioNotes`
// entirely once empty). Clearing an absent note is a no-op. Pure.
export function clearScenarioNote(map, id) {
  const next = structuredClone(map || {});
  const notes = { ...(next.scenarioNotes || {}) };
  delete notes[id];
  if (Object.keys(notes).length) next.scenarioNotes = notes;
  else delete next.scenarioNotes;
  return next;
}

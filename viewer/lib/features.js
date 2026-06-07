// Pure helpers for the feature browser. No DOM access — unit-tested in
// test/features.test.js; the DOM wiring lives in kartograph.js.

// Which scenario classes a feature covers (true when >= 1 scenario of that class).
export function coverage(scenarios) {
  const has = (c) => scenarios.some((s) => s.class === c);
  return { happy: has('happy'), edge: has('edge'), error: has('error') };
}

// Features sorted by scenario count, most first. Stable for equal counts
// (preserves input order). Does not mutate the input array.
export function sortByScenarioCount(files) {
  return files
    .map((f, i) => [f, i])
    .sort((a, b) => (b[0].scenarios.length - a[0].scenarios.length) || (a[1] - b[1]))
    .map(([f]) => f);
}

// Keep scenarios whose class is active; untagged scenarios (class null/undefined)
// are always kept. `active` is { happy, edge, error } of booleans.
export function filterScenarios(scenarios, active) {
  return scenarios.filter((s) => s.class == null || active[s.class]);
}

// Split a free-text feature description into narrative prose and labeled metadata
// rows. A line shaped like "Label: value" (a short capitalised label, then a colon
// and value — e.g. "Issue: …", "Spec: …") becomes a metadata row; every other
// non-empty line is narrative prose (e.g. the "As a … / So that …" user story).
// Prose keeps its order and line breaks; blank lines are dropped.
export function parseDescription(text) {
  const prose = [];
  const meta = [];
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^([A-Z][A-Za-z][A-Za-z ]{0,22}):\s+(.+)$/.exec(line);
    if (m) meta.push({ label: m[1], value: m[2] });
    else prose.push(line);
  }
  return { prose: prose.join('\n'), meta };
}

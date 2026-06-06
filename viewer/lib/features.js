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

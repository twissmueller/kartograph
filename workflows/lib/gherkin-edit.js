// Deterministic edits to a .feature file's text. The reader (gherkin.js) parses;
// this writes. Both are pure — callers do the file IO. Editing a .feature file is
// only ever done through the revise → chart flow (never during build), and only to
// RETIRE a scenario: kartograph's map changes flow through explore/revise → chart.

// Return NEW feature text with the named scenario's block removed — its path tag
// lines (the contiguous `@…` lines directly above it) plus the `Scenario:` line and
// all of its steps, up to (but not including) the next scenario/tag/Feature/Background
// or end of file. Everything else is preserved byte-for-byte (line endings included):
// the returned text is the original with exactly that block excised. Throws if no
// scenario with that exact name exists.
export function removeScenario(featureText, scenarioName) {
  const text = String(featureText);
  // Physical lines, each retaining its own trailing newline, so join('') === text.
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) || [];

  const isTag = (l) => /^\s*@/.test(l);
  const isScenario = (l) => /^\s*Scenario(\s+Outline)?:/i.test(l);
  const isBlock = (l) => /^\s*(Feature|Background):/i.test(l);
  const nameOf = (l) => l.replace(/^\s*Scenario(\s+Outline)?:\s*/i, '').replace(/\r?\n?$/, '').trim();

  let scenarioLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (isScenario(lines[i]) && nameOf(lines[i]) === scenarioName) { scenarioLine = i; break; }
  }
  if (scenarioLine === -1) throw new Error(`scenario not found: ${scenarioName}`);

  // Extend upward over the scenario's own contiguous tag lines.
  let start = scenarioLine;
  while (start - 1 >= 0 && isTag(lines[start - 1])) start--;

  // Extend downward over the scenario's steps, stopping at the next scenario/tag
  // block or a Feature/Background line, or EOF.
  let end = scenarioLine + 1;
  while (end < lines.length && !isScenario(lines[end]) && !isTag(lines[end]) && !isBlock(lines[end])) end++;

  return lines.slice(0, start).concat(lines.slice(end)).join('');
}

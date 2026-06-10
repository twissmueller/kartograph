// Minimal Gherkin reader: parses a feature title, an optional free-text
// description (lines between the Feature: line and the first tag/scenario), an
// optional Background block (shared setup steps that run before every scenario),
// and each scenario's tags and steps.  Tags accumulate on lines above a
// Scenario and attach to the next one; the Feature line resets pending tags
// so feature-level tags don't leak into scenarios.
export function parseFeature(text) {
  const scenarios = [];
  let pending = [];
  let feature = null;
  const descriptionLines = [];
  let background = null;     // steps array once a Background: line is seen
  let current = null;        // scenario currently collecting steps
  let inDescription = false; // between the Feature: line and the first tag/scenario
  let inBackground = false;  // collecting the Background block's steps
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('@')) {
      pending.push(...line.split(/\s+/).filter((t) => t.startsWith('@')));
      current = null;
      inDescription = false;
      inBackground = false;
    } else if (/^Feature:/i.test(line)) {
      feature = line.replace(/^Feature:\s*/i, '').trim();
      pending = [];
      current = null;
      inDescription = true;
      inBackground = false;
    } else if (/^Background:/i.test(line)) {
      background = [];
      current = null;
      inDescription = false;
      inBackground = true;
    } else if (/^Scenario(\s+Outline)?:/i.test(line)) {
      current = { name: line.replace(/^Scenario(\s+Outline)?:\s*/i, '').trim(), tags: pending, steps: [] };
      scenarios.push(current);
      pending = [];
      inDescription = false;
      inBackground = false;
    } else if (line && !line.startsWith('#')) {
      if (current) current.steps.push(line);
      else if (inBackground) background.push(line);
      else if (inDescription) descriptionLines.push(line);
    }
  }
  return {
    feature,
    description: descriptionLines.join('\n') || undefined,
    background: background && background.length ? background : undefined,
    scenarios,
  };
}

export function scenarioClass(tags) {
  const t = tags || [];
  if (t.includes('@error')) return 'error';
  if (t.includes('@edge')) return 'edge';
  if (t.includes('@happy')) return 'happy';
  return null;
}

const PROGRESS_TAGS = ['@wip', '@test', '@done'];
const PROGRESS_TAG = { open: null, wip: '@wip', test: '@test', done: '@done' };

// Progress state of a scenario from its tags. Precedence: done > test > wip, else open.
// Canonical, server-side; the GET /board endpoint stamps each scenario with this.
export function scenarioProgress(tags) {
  const t = tags || [];
  if (t.includes('@done')) return 'done';
  if (t.includes('@test')) return 'test';
  if (t.includes('@wip')) return 'wip';
  return 'open';
}

// Rewrite the tag line(s) of the FIRST scenario named `scenarioName` so its progress tag
// becomes `progress` ('open'|'wip'|'test'|'done'). Existing progress tags are removed; class
// tags (@happy/@edge/@error) and every other line are preserved. A scenario with no tag line
// gains one (unless progress is 'open'). Returns the new file text. Pure — no IO.
// Note: consecutive multi-line tag blocks above a scenario are collapsed into a single
// tag line (the tags are preserved; only their line layout changes).
export function setScenarioProgress(source, scenarioName, progress) {
  if (!(progress in PROGRESS_TAG)) throw new Error(`invalid progress: ${progress}`);
  const newTag = PROGRESS_TAG[progress];
  const lines = String(source).split('\n');
  const scenRe = /^(\s*)Scenario(?:\s+Outline)?:\s*(.*)$/i;
  const isTagLine = (l) => l.trim().startsWith('@');

  let scenIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = scenRe.exec(lines[i]);
    if (m && m[2].trim() === scenarioName) { scenIdx = i; break; }
  }
  if (scenIdx === -1) throw new Error(`scenario not found: ${scenarioName}`);

  let start = scenIdx;
  while (start > 0 && isTagLine(lines[start - 1])) start--;

  const tags = lines.slice(start, scenIdx).join(' ').split(/\s+/).filter((t) => t.startsWith('@'));
  const kept = tags.filter((t) => !PROGRESS_TAGS.includes(t));
  if (newTag) kept.push(newTag);

  const indent = scenRe.exec(lines[scenIdx])[1] || '';
  const replacement = kept.length ? [indent + kept.join(' ')] : [];
  lines.splice(start, scenIdx - start, ...replacement);
  return lines.join('\n');
}

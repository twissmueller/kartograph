// Minimal Gherkin reader: parses a feature title, an optional free-text
// description (lines between the Feature: line and the first tag/scenario), an
// optional Background block (shared setup steps that run before every scenario),
// and each scenario's tags and steps.  Tags accumulate on lines above a
// Scenario and attach to the next one; the Feature line resets pending tags
// so feature-level tags don't leak into scenarios.
//
// Inside a DocString (the triple-quote block that carries a step's payload)
// nothing is interpreted. Tools that read feature files are tested by FEEDING
// them feature files, so those blocks are full of lines that look like Gherkin —
// they belong to the step, not to this file. Reading them as scenarios would
// inflate every count downstream: maturity, build plans, tracking.
export function parseFeature(text) {
  const scenarios = [];
  let pending = [];
  let feature = null;
  const descriptionLines = [];
  let background = null;     // steps array once a Background: line is seen
  let current = null;        // scenario currently collecting steps
  let inDescription = false; // between the Feature: line and the first tag/scenario
  let inBackground = false;  // collecting the Background block's steps
  let inDocString = false;   // inside a triple-quote block: payload, not syntax
  const FENCE = ['"' + '""', "'" + "''"];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (FENCE.some((f) => line.startsWith(f))) {
      // The fence itself is scaffolding and belongs to no step.
      inDocString = !inDocString;
      continue;
    }
    if (inDocString) {
      if (current) current.steps.push(line);
      else if (inBackground) background.push(line);
      continue;
    }
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

// A scenario's PATH class from its tags. This is the only kind of tag that lives in
// the .feature file now; progress/tracking state lives in kartograph.json (see
// workflows/lib/tracking.js).
export function scenarioClass(tags) {
  const t = tags || [];
  if (t.includes('@error')) return 'error';
  if (t.includes('@edge')) return 'edge';
  if (t.includes('@happy')) return 'happy';
  return null;
}

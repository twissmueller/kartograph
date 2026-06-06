// Minimal Gherkin reader: parses a feature title, an optional free-text
// description (lines between the Feature: line and the first tag/scenario),
// and each scenario's tags and steps.  Tags accumulate on lines above a
// Scenario and attach to the next one; the Feature line resets pending tags
// so feature-level tags don't leak into scenarios.
export function parseFeature(text) {
  const scenarios = [];
  let pending = [];
  let feature = null;
  const descriptionLines = [];
  let current = null;        // scenario currently collecting steps
  let inDescription = false; // between the Feature: line and the first tag/scenario
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('@')) {
      pending.push(...line.split(/\s+/).filter((t) => t.startsWith('@')));
      current = null;
      inDescription = false;
    } else if (/^Feature:/i.test(line)) {
      feature = line.replace(/^Feature:\s*/i, '').trim();
      pending = [];
      current = null;
      inDescription = true;
    } else if (/^Scenario(\s+Outline)?:/i.test(line)) {
      current = { name: line.replace(/^Scenario(\s+Outline)?:\s*/i, '').trim(), tags: pending, steps: [] };
      scenarios.push(current);
      pending = [];
      inDescription = false;
    } else if (line && !line.startsWith('#')) {
      if (current) current.steps.push(line);
      else if (inDescription) descriptionLines.push(line);
    }
  }
  return { feature, description: descriptionLines.join('\n') || undefined, scenarios };
}

export function scenarioClass(tags) {
  const t = tags || [];
  if (t.includes('@error')) return 'error';
  if (t.includes('@edge')) return 'edge';
  if (t.includes('@happy')) return 'happy';
  return null;
}

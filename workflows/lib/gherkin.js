// Minimal Gherkin reader: feature title + scenarios with their tags.
// Tags accumulate on lines above a Scenario and attach to the next one;
// the Feature line resets pending tags so feature-level tags don't leak.
export function parseFeature(text) {
  const scenarios = [];
  let pending = [];
  let feature = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('@')) {
      pending.push(...line.split(/\s+/).filter((t) => t.startsWith('@')));
    } else if (/^Feature:/i.test(line)) {
      feature = line.replace(/^Feature:\s*/i, '').trim();
      pending = [];
    } else if (/^Scenario(\s+Outline)?:/i.test(line)) {
      scenarios.push({ name: line.replace(/^Scenario(\s+Outline)?:\s*/i, '').trim(), tags: pending });
      pending = [];
    }
  }
  return { feature, scenarios };
}

export function scenarioClass(tags) {
  const t = tags || [];
  if (t.includes('@error')) return 'error';
  if (t.includes('@edge')) return 'edge';
  if (t.includes('@happy')) return 'happy';
  return null;
}

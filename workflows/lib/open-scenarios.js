// A scenario is "open" until it's tagged @done.
export function openScenarios(features) {
  const open = [];
  for (const f of features || []) for (const s of f.scenarios || []) {
    if (!(s.tags || []).includes('@done')) open.push({ feature: f.feature, ...s });
  }
  return open;
}

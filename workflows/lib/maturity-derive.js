// The maturity ladder, derived from on-disk feature/scenario state.
// vision is the only declared seed; everything else is computed here.
export function deriveMaturity({ featureCount, scenarioCount, classes }) {
  if (!featureCount) return 'vision';
  if (!scenarioCount) return 'sketched';
  if (classes.has('error')) return 'stable';
  if (classes.has('edge')) return 'usable';
  return 'building';
}

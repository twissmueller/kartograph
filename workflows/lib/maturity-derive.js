// The maturity ladder, derived from on-disk feature/scenario state.
// vision is the only declared seed; everything else is computed here.
// Coverage is CUMULATIVE: stable requires edge AND error paths, not just error.
export function deriveMaturity({ featureCount, scenarioCount, classes }) {
  if (!featureCount) return 'vision';
  if (!scenarioCount) return 'sketched';
  if (classes.has('edge') && classes.has('error')) return 'stable';
  if (classes.has('edge')) return 'usable';
  return 'building';
}

// Maturity derivable from counts ALONE — i.e. without the @happy/@edge/@error
// scenario classes. This is what /karto-init may claim: it must not invent class
// tags, so it can never legitimately reach usable/stable. Those are EARNED later by
// charting real edge/error scenarios and letting reconcile recompute via
// deriveMaturity. Without class info the honest ceiling is 'building'.
export function maturityFromCounts({ featureCount, scenarioCount }) {
  if (!featureCount) return 'vision';
  if (!scenarioCount) return 'sketched';
  return 'building';
}

// The gate behind the validator: is a stored maturity consistent with its counts?
// Stops a map from claiming what the criteria don't support (e.g. 'stable' with zero
// features). Mirrors the ladder's bounds while still accepting reconcile's class-based
// usable/stable when scenarios actually exist:
//   featureCount 0           -> must be vision
//   features, 0 scenarios    -> must be sketched
//   scenarios present        -> must be building | usable | stable
export function maturityMatchesCounts(maturity, { featureCount, scenarioCount }) {
  if (!featureCount) return maturity === 'vision';
  if (!scenarioCount) return maturity === 'sketched';
  return maturity === 'building' || maturity === 'usable' || maturity === 'stable';
}

export const WEIGHTS = { vision: 0, sketched: 0.1, building: 0.3, usable: 0.7, stable: 1 };
export const BRIGHTNESS = { vision: 0.35, sketched: 0.5, building: 0.65, usable: 0.8, stable: 1 };
export const MATURITY_LABEL = { vision: 'Vision', sketched: 'Sketched', building: 'Building', usable: 'Usable', stable: 'Stable' };

export function maturityLabel(maturity) {
  return MATURITY_LABEL[maturity] ?? maturity;
}

export function effectiveMaturity(cap) {
  return cap?.derived?.maturity ?? cap?.declaredStage ?? 'vision';
}

export function aggregateMaturity(capabilities, weights = WEIGHTS) {
  const caps = Object.values(capabilities || {});
  if (caps.length === 0) return 0;
  const sum = caps.reduce((acc, c) => acc + (weights[effectiveMaturity(c)] ?? 0), 0);
  return sum / caps.length;
}

export function nodeBrightness(maturity) {
  return BRIGHTNESS[maturity] ?? BRIGHTNESS.vision;
}

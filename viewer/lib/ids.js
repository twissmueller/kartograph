// Canonical, capability-rooted locator IDs for map items, used as human-quotable
// references (e.g. to point an AI at an exact scenario). Pure — no DOM/IO.
// Capability slugs are globally unique in kartograph.json, so IDs are capability-rooted.
//   context    -> <contextSlug>
//   capability -> <capabilitySlug>
//   feature    -> <capabilitySlug>/<featureFile>
//   scenario   -> <capabilitySlug>/<featureFile>#"<scenarioName>"
export function contextId(contextSlug) { return String(contextSlug ?? ''); }
export function capabilityId(capabilitySlug) { return String(capabilitySlug ?? ''); }
export function featureId(capabilitySlug, featureFile) {
  return `${capabilityId(capabilitySlug)}/${String(featureFile ?? '')}`;
}
export function scenarioId(capabilitySlug, featureFile, scenarioName) {
  return `${featureId(capabilitySlug, featureFile)}#"${String(scenarioName ?? '')}"`;
}

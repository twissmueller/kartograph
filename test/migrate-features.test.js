import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { hasHeader, germanise, addHeader, declareGerman, featureInfo, capabilityMarkdown, migrationIntent, migrateProject } from "../scripts/migrate-features.js";
import { validateCapability, validateFeature } from "../skills/kartograph-features/validate-features.js";
import { validateIntent } from "../skills/kartograph-explore/validate-intent.js";

const INTENT = "intents/2026-09-18-1200-migrated-feature-tree.md";

const english = `@role:athlete
Feature: Move session
  As the athlete I move a session to another day.

  Background:
    Given a plan started on Monday 7 September 2026

  @happy
  Scenario: Moving a session one day later
    When I move the session of Wednesday 9 September 2026 to Thursday 10 September 2026
    Then the session calendar shows that session on Thursday 10 September 2026
`;

const german = `Feature: Einstiegsseite
  Nach dem Entsperren landet der Tagebuchschreiber auf der Einstiegsseite.

  @happy
  Scenario: Nach dem Entsperren öffnet sich die Einstiegsseite
    Angenommen der Tagebuchschreiber hat die App per Touch ID entsperrt
    Wenn er auf den Bildschirm schaut
    Dann steht die Einstiegsseite da
    Und es gibt keinen Knopf „Heute schreiben“ mehr
`;

test("hasHeader recognises migrated files", () => {
  assert.equal(hasHeader(english), false);
  assert.equal(hasHeader(`# Source intent: ${INTENT}\n# Capability: x\n` + english), true);
  assert.equal(hasHeader(`# language: de\n# Source intent: ${INTENT}\n# Capability: x\n` + german), true);
});

test("addHeader prepends the two comments and leaves the body byte-identical", () => {
  const out = addHeader(english, { intent: INTENT, capabilityPath: "scheduling/move-session" });
  assert.equal(out, `# Source intent: ${INTENT}\n# Capability: features/scheduling/move-session/capability.md\n` + english);
  assert.deepEqual(validateFeature(out, { path: "x", capabilityDir: "scheduling/move-session" }).errors, []);
});

test("a German file gets the language line and German block keywords, steps untouched", () => {
  const out = addHeader(german, { intent: INTENT, capabilityPath: "schreiben/hauptmenue" });
  assert.ok(out.startsWith(`# language: de\n# Source intent: ${INTENT}\n# Capability: features/schreiben/hauptmenue/capability.md\nFunktionalität: Einstiegsseite\n`));
  assert.ok(out.includes("  Szenario: Nach dem Entsperren öffnet sich die Einstiegsseite\n    Angenommen der Tagebuchschreiber hat die App per Touch ID entsperrt\n"));
  assert.deepEqual(validateFeature(out, { path: "x", capabilityDir: "schreiben/hauptmenue" }).errors, []);
  assert.equal(germanise("    Scenario Outline: X\n      Examples:\n  Background:\n  Rule: R\n"), "    Szenariogrundriss: X\n      Beispiele:\n  Grundlage:\n  Regel: R\n");
  assert.equal(germanise("    When Scenario: not at line start"), "    When Scenario: not at line start");
  // A file that already declares its language keeps the line first and is not germanised again.
  const declared = addHeader("# language: de\n" + germanise(german), { intent: INTENT, capabilityPath: "a" });
  assert.ok(declared.startsWith(`# language: de\n# Source intent: ${INTENT}\n`));
});

test("a file with a header but mixed dialects gets the language line and German block keywords", () => {
  const mixed = `# Source intent: ${INTENT}\n# Capability: features/mac/capability.md\n` + german;
  const out = declareGerman(mixed);
  assert.ok(out.startsWith(`# language: de\n# Source intent: ${INTENT}\n# Capability: features/mac/capability.md\nFunktionalität: Einstiegsseite\n`));
  assert.deepEqual(validateFeature(out, { path: "x", capabilityDir: "mac" }).errors, []);
  assert.equal(declareGerman(out), out);
  const englishWithHeader = `# Source intent: ${INTENT}\n# Capability: features/a/capability.md\n` + english;
  assert.equal(declareGerman(englishWithHeader), englishWithHeader);
});

test("featureInfo reads the title and the first description line", () => {
  assert.deepEqual(featureInfo(english), { title: "Move session", description: "As the athlete I move a session to another day." });
  assert.deepEqual(featureInfo("Feature: Bare\n\n  Scenario: S\n"), { title: "Bare", description: "" });
  assert.deepEqual(featureInfo("# language: de\nFunktionalität: Einstiegsseite\n  Text.\n"), { title: "Einstiegsseite", description: "Text." });
});

test("capabilityMarkdown produces a capability.md the validator accepts", () => {
  const leaf = capabilityMarkdown({ name: "Move session", lead: "Move a session to another day.", intent: INTENT, features: [{ file: "move-session.feature", title: "Move session", text: "As the athlete I move a session to another day." }], capabilities: [] });
  assert.deepEqual(validateCapability(leaf, { path: "x", featureFiles: ["move-session.feature"], subCapabilities: [] }).errors, []);
  assert.ok(leaf.includes("## Open questions\n- Purpose, scope and constraints of this capability were never written down"));
  const parent = capabilityMarkdown({ name: "Scheduling", lead: "Migrated from the Kartograph v0 feature tree; not yet described.", intent: INTENT, features: [], capabilities: [{ slug: "move-session", name: "Move session", text: "Move a session to another day." }] });
  assert.deepEqual(validateCapability(parent, { path: "x", featureFiles: [], subCapabilities: ["move-session"] }).errors, []);
  assert.ok(!parent.includes("## Features"));
});

test("migrationIntent passes validate-intent", () => {
  const text = migrationIntent({ project: "beatrep", date: "2026-09-18", time: "1200", sources: [".kartograph/kartograph.json"], contexts: ["scheduling", "training"] });
  const r = validateIntent(text, { filename: "2026-09-18-1200-migrated-feature-tree.md" });
  assert.deepEqual(r.errors, []);
});

function v0Project() {
  const root = mkdtempSync(join(tmpdir(), "karto-migrate-"));
  mkdirSync(join(root, "features", "scheduling", "move-session"), { recursive: true });
  mkdirSync(join(root, "features", "training"), { recursive: true });
  mkdirSync(join(root, ".kartograph"), { recursive: true });
  writeFileSync(join(root, ".kartograph", "kartograph.json"), JSON.stringify({ contexts: { scheduling: { name: "Scheduling" } }, capabilities: { "move-session": { name: "Move a session", context: "scheduling" } } }));
  writeFileSync(join(root, "features", "scheduling", "move-session", "move-session.feature"), english);
  writeFileSync(join(root, "features", "training", "general-fitness.feature"), english.replace("Move session", "General fitness"));
  writeFileSync(join(root, "features", "README.md"), "# old layout\n");
  mkdirSync(join(root, "features", ".claude", ".cc-writes"), { recursive: true });
  mkdirSync(join(root, "features", "scheduling", "start-plan"), { recursive: true }); // empty leftover
  mkdirSync(join(root, "features", "leftover"), { recursive: true });
  return root;
}

test("migrateProject turns a v0 tree into a passing v2 tree and is idempotent", (t) => {
  const root = v0Project();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const r = migrateProject(root, { date: "2026-09-18", time: "1200" });
  assert.deepEqual(r.errors, []);
  assert.equal(r.intent, "intents/2026-09-18-1200-migrated-feature-tree.md");
  assert.ok(existsSync(join(root, r.intent)));
  assert.deepEqual(validateIntent(readFileSync(join(root, r.intent), "utf8"), { filename: join(root, r.intent) }).errors, []);
  assert.ok(existsSync(join(root, "docs", "features-README.md")) && !existsSync(join(root, "features", "README.md")));
  assert.ok(!existsSync(join(root, "features", ".claude", "capability.md")));
  assert.ok(!existsSync(join(root, "features", "scheduling", "start-plan")));
  assert.ok(!existsSync(join(root, "features", "leftover")));
  assert.deepEqual(r.removed, ["/leftover", "/scheduling/start-plan"]);
  assert.ok(!readFileSync(join(root, "features", "scheduling", "capability.md"), "utf8").includes("start-plan"));
  const parent = readFileSync(join(root, "features", "scheduling", "capability.md"), "utf8");
  assert.ok(parent.startsWith("# Capability: Scheduling\n"));
  assert.ok(parent.includes("- [Move a session](move-session/capability.md):"));
  const leaf = readFileSync(join(root, "features", "scheduling", "move-session", "capability.md"), "utf8");
  assert.ok(leaf.startsWith("# Capability: Move a session\n\nAs the athlete I move a session to another day.\n"), leaf);
  const training = readFileSync(join(root, "features", "training", "capability.md"), "utf8");
  assert.ok(training.startsWith("# Capability: General fitness\n"));
  const feature = readFileSync(join(root, "features", "scheduling", "move-session", "move-session.feature"), "utf8");
  assert.ok(feature.startsWith(`# Source intent: ${r.intent}\n# Capability: features/scheduling/move-session/capability.md\n@role:athlete\nFeature: Move session\n`));
  const again = migrateProject(root, { date: "2026-09-18", time: "1300" });
  assert.deepEqual(again.written, []);
  assert.deepEqual(again.errors, []);
  assert.equal(readFileSync(join(root, "features", "scheduling", "move-session", "move-session.feature"), "utf8"), feature);
  assert.equal(readFileSync(join(root, "features", "scheduling", "move-session", "capability.md"), "utf8"), leaf);
});

test("an existing capability.md is never overwritten and gets the migration intent only when a feature there names it", (t) => {
  const root = v0Project();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const own = capabilityMarkdown({ name: "Kept", lead: "Kept lead.", intent: "intents/2026-09-01-0900-earlier.md", features: [{ file: "move-session.feature", title: "Move session", text: "kept" }], capabilities: [] });
  writeFileSync(join(root, "features", "scheduling", "move-session", "capability.md"), own);
  mkdirSync(join(root, "intents")); writeFileSync(join(root, "intents", "2026-09-01-0900-earlier.md"), "# earlier\n");
  const r = migrateProject(root, { date: "2026-09-18", time: "1200" });
  const kept = readFileSync(join(root, "features", "scheduling", "move-session", "capability.md"), "utf8");
  assert.ok(kept.startsWith("# Capability: Kept\n"));
  assert.ok(kept.includes("- Intent: `intents/2026-09-01-0900-earlier.md`\n- Intent: `intents/2026-09-18-1200-migrated-feature-tree.md`"));
  assert.deepEqual(r.errors, []);
  // The parent lists the existing description by its own name and lead sentence.
  assert.ok(readFileSync(join(root, "features", "scheduling", "capability.md"), "utf8").includes("- [Kept](move-session/capability.md): Kept lead."));
});

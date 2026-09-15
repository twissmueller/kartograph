import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateConcept, validateBundle, validateIndex, validateLog, parseFrontmatter } from "../skills/kartograph-knowledge/validate-knowledge.js";

const INTENT = "2026-09-15-1042-offline-watering";

function concept({ type = "Command", title = "Water plant", slug = "water-plant", description = "Mark one watering task of the day as done.", aliases = "[tick off, complete]", extraFm = "", relations = "- Issued by [Gardener](/actors/gardener.md)\n- Produces [Plant watered](/events/plant-watered.md)", sections = "" } = {}) {
  return `---
type: ${type}
title: ${title}
description: ${description}
status: draft
aliases_to_avoid: ${aliases}
tags: []
generated: { by: kartograph-knowledge/1.2.0, at: 2026-09-15T10:50:00Z }
sources:
  - id: ${INTENT}
    resource: ../intents/${INTENT}.md
    title: Offline watering schedule
${extraFm}---

# Definition

Mark one watering task of the day as done, also while offline.

# Relations

${relations}

# From the intent

> A task ticked offline shows as done after reconnecting[^${INTENT}]

[^${INTENT}]: Offline watering schedule
${sections}`;
}

test("the YAML subset parser handles the concept frontmatter", () => {
  const fm = parseFrontmatter(`type: Actor\ntitle: Gardener\naliases_to_avoid: [user, "the customer"]\ngenerated: { by: kartograph-knowledge/1.2.0, at: 2026-09-15T10:50:00Z }\nsources:\n  - id: a\n    resource: ../intents/x.md\n`);
  assert.equal(fm.type, "Actor");
  assert.deepEqual(fm.aliases_to_avoid, ["user", "the customer"]);
  assert.equal(fm.generated.by, "kartograph-knowledge/1.2.0");
  assert.equal(fm.sources[0].resource, "../intents/x.md");
});

test("a well-formed concept passes", () => {
  const r = validateConcept(concept(), { path: "commands/water-plant.md" });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.links, ["/actors/gardener.md", "/events/plant-watered.md"]);
});

test("type must be one of six and match its directory", () => {
  assert.ok(validateConcept(concept({ type: "Thing" }), { path: "commands/water-plant.md" }).errors.some((e) => /type must be one of/.test(e)));
  assert.ok(validateConcept(concept(), { path: "events/water-plant.md" }).errors.some((e) => /belongs in commands\//.test(e)));
});

test("frontmatter keys are exact and ordered; spec keys are tolerated", () => {
  const missing = concept().replace("tags: []\n", "");
  assert.ok(validateConcept(missing).errors.some((e) => /missing 'tags'/.test(e)));
  const unknown = concept({ extraFm: "owner: me\n" });
  assert.ok(validateConcept(unknown).errors.some((e) => /unknown key 'owner'/.test(e)));
  const spec = concept({ extraFm: "stale_after: 2027-01-01T00:00:00Z\n" });
  assert.deepEqual(validateConcept(spec, { path: "commands/water-plant.md" }).errors, []);
  const reordered = concept().replace("type: Command\ntitle: Water plant\n", "title: Water plant\ntype: Command\n");
  assert.ok(validateConcept(reordered).errors.some((e) => /order/.test(e)));
});

test("actor convention, ISO timestamps, statuses and sources are checked", () => {
  assert.ok(validateConcept(concept().replace("kartograph-knowledge/1.2.0", "me")).errors.some((e) => /actor convention/.test(e)));
  assert.ok(validateConcept(concept().replace("2026-09-15T10:50:00Z", "yesterday")).errors.some((e) => /ISO 8601/.test(e)));
  assert.ok(validateConcept(concept().replace("status: draft", "status: final")).errors.some((e) => /status must be/.test(e)));
  assert.ok(validateConcept(concept().replace(`  - id: ${INTENT}\n    resource:`, "  - resource:")).errors.some((e) => /needs an 'id'/.test(e)));
});

test("a stub description is a warning, a multi-word alias list must be strings", () => {
  const r = validateConcept(concept({ description: "TODO — define this term." }));
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => /still a stub/.test(w)));
});

test("body sections are exact, ordered, non-empty; Collision is optional at the end", () => {
  assert.ok(validateConcept(concept().replace("# Relations\n", "# Links\n")).errors.some((e) => /missing '# Relations'/.test(e)));
  assert.ok(validateConcept(concept({ sections: "\n# Collision\n\nThe intent says a task can be un-ticked.\n" })).errors.length === 0);
  assert.ok(validateConcept(concept({ sections: "\n# Notes\n\nx\n" })).errors.some((e) => /unknown section '# Notes'/.test(e)));
  assert.ok(validateConcept(concept({ relations: "" })).errors.some((e) => /'# Relations' is empty/.test(e)));
});

test("footnotes must match sources ids and links must be bundle-relative", () => {
  const badFoot = concept().replace(`[^${INTENT}]: Offline`, "[^other]: Offline");
  const r = validateConcept(badFoot);
  assert.ok(r.errors.some((e) => /is used but never defined/.test(e)));
  assert.ok(r.errors.some((e) => /does not match any sources\[\]\.id/.test(e)));
  const relLink = concept({ relations: "- Issued by [Gardener](../actors/gardener.md)" });
  assert.ok(validateConcept(relLink).errors.some((e) => /must be bundle-relative/.test(e)));
  const badDir = concept({ relations: "- See [X](/things/x.md)" });
  assert.ok(validateConcept(badDir).errors.some((e) => /<type-dir>/.test(e)));
});

test("template placeholders are rejected", () => {
  assert.ok(validateConcept(concept({ title: "<the one canonical name>" })).errors.some((e) => /placeholder/.test(e)));
});

// --- bundle -----------------------------------------------------------------

function bundle(t, { withIndex = true, extraRoot = {}, concepts: cs } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "karto-knowledge-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const files = cs || {
    "commands/water-plant.md": concept(),
    "actors/gardener.md": concept({ type: "Actor", title: "Gardener", description: "The person who tends the garden.", aliases: "[user]", relations: "None." }),
    "events/plant-watered.md": concept({ type: "Event", title: "Plant watered", description: "A watering task has been done.", aliases: "[]", relations: "- Produced by [Water plant](/commands/water-plant.md)" }),
  };
  for (const [p, txt] of Object.entries(files)) { mkdirSync(join(dir, p, ".."), { recursive: true }); writeFileSync(join(dir, p), txt); }
  if (withIndex) {
    const index = `---\nokf_version: "0.2"\n---\n\n# Knowledge\n\n` +
      Object.keys(files).sort().map((p) => `* [${p}](${p}) - x _(T, draft)_`).join("\n") + "\n";
    writeFileSync(join(dir, "index.md"), index);
  }
  writeFileSync(join(dir, "log.md"), `# Knowledge Update Log\n\n## 2026-09-15\n* **Intent**: processed [Offline watering schedule](../intents/${INTENT}.md) — 3 new.\n`);
  for (const [p, txt] of Object.entries(extraRoot)) writeFileSync(join(dir, p), txt);
  return dir;
}

test("a well-formed bundle passes", (t) => {
  const { errors, warnings } = validateBundle(bundle(t));
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

test("unknown directories and stray root files are rejected", (t) => {
  const dir = bundle(t, { extraRoot: { "readme.md": "x" } });
  mkdirSync(join(dir, "things"));
  const { errors } = validateBundle(dir);
  assert.ok(errors.some((e) => /unknown directory/.test(e)));
  assert.ok(errors.some((e) => /only index.md, log.md and the type directories/.test(e)));
});

test("one canonical title: duplicates and titles that are another concept's alias fail", (t) => {
  const dir = bundle(t, { concepts: {
    "actors/gardener.md": concept({ type: "Actor", title: "Gardener", aliases: "[user]", relations: "None." }),
    "actors/user.md": concept({ type: "Actor", title: "User", aliases: "[]", relations: "None." }),
    "subjects/gardener.md": concept({ type: "Subject", title: "gardener", aliases: "[]", relations: "None." }),
  } });
  const { errors } = validateBundle(dir);
  assert.ok(errors.some((e) => /already used by actors\/gardener.md/.test(e)));
  assert.ok(errors.some((e) => /listed in aliases_to_avoid of actors\/gardener.md/.test(e)));
});

test("a link to a not-yet-written concept is a warning, never an error", (t) => {
  const dir = bundle(t, { concepts: { "commands/water-plant.md": concept() } });
  const { errors, warnings } = validateBundle(dir);
  assert.deepEqual(errors, []);
  assert.ok(warnings.some((w) => /\/actors\/gardener.md', which is not in the bundle yet/.test(w)));
});

test("index.md must list every concept exactly once and carry only okf_version", () => {
  const paths = ["actors/gardener.md", "commands/water-plant.md"];
  const ok = `---\nokf_version: "0.2"\n---\n\n# K\n\n* [a](actors/gardener.md) - x\n* [b](commands/water-plant.md) - y\n`;
  assert.deepEqual(validateIndex(ok, paths), []);
  assert.ok(validateIndex(ok.replace("* [b](commands/water-plant.md) - y\n", ""), paths).some((e) => /does not list commands\/water-plant.md/.test(e)));
  assert.ok(validateIndex(ok + "* [b](commands/water-plant.md) - y\n", paths).some((e) => /2 times/.test(e)));
  assert.ok(validateIndex(ok.replace('okf_version: "0.2"', 'okf_version: "0.2"\ntitle: K'), paths).some((e) => /may hold only okf_version/.test(e)));
  assert.ok(validateIndex(ok + "* [c](events/gone.md) - z\n", paths).some((e) => /not in the bundle/.test(e)));
});

test("log.md is date-grouped, newest first, with '* **Kind**:' entries", () => {
  assert.deepEqual(validateLog("# Log\n\n## 2026-09-15\n* **Intent**: a\n\n## 2026-09-01\n* **Intent**: b\n"), []);
  assert.ok(validateLog("# Log\n\n## 2026-09-01\n* **Intent**: b\n\n## 2026-09-15\n* **Intent**: a\n").some((e) => /newest first/.test(e)));
  assert.ok(validateLog("# Log\n\n## yesterday\n* **Intent**: a\n").some((e) => /YYYY-MM-DD/.test(e)));
  assert.ok(validateLog("# Log\n\n## 2026-09-15\n- added stuff\n").some((e) => /entries must look like/.test(e)));
  assert.ok(validateLog("Log\n").some((e) => /first line/.test(e)));
});

test("missing index.md or log.md is an error", (t) => {
  const dir = bundle(t, { withIndex: false });
  assert.ok(validateBundle(dir).errors.some((e) => /index.md: missing/.test(e)));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateKartograph } from "../skills/kartograph-migrate/validate-kartograph.js";

const C = "2026-09-24-1430-export-csv.conversation.md";
const I = "2026-09-24-1430-export-csv.intent.md";
const doc = (type, sources = "[]") => `---\ntype: ${type}\ntitle: Export CSV\ndescription: x.\nstatus: s\nsources: ${sources}\n---\n\n# Export CSV\n`;
const index = (lines) => `---\nokf_version: "0.2"\nkartograph_version: 3.0.0\n---\n\n# Kartograph\n\n${lines.join("\n")}\n`;
const LINES = [`* [Export CSV](${I}) - x. _(Intent, derived)_`, `* [Export CSV](${C}) - x. _(Conversation, recorded)_`];

function bundle(t, { files = {}, idx = LINES } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "karto-bundle-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const all = { [C]: doc("Conversation"), [I]: doc("Intent", `[${C}]`), "index.md": index(idx), "log.md": "# Kartograph Log\n\n## 2026-09-24\n* **Intent**: derived.\n\n## 2026-09-20\n* x\n", ...files };
  for (const [f, text] of Object.entries(all)) if (text !== null) writeFileSync(join(dir, f), text);
  return dir;
}
const has = (list, re) => list.some((e) => re.test(e));

test("a well-formed bundle passes and reports its version", (t) => {
  const r = validateKartograph(bundle(t));
  assert.deepEqual(r.errors, []);
  assert.equal(r.version, "3.0.0");
});

test("the bundle is flat and holds only index, log and typed documents", (t) => {
  const dir = bundle(t, { files: { "notes.md": "x" } });
  mkdirSync(join(dir, "intents"));
  const { errors } = validateKartograph(dir);
  assert.ok(has(errors, /intents\/: kartograph\/ is flat/));
  assert.ok(has(errors, /notes\.md: only index\.md, log\.md/));
});

test("the file-name suffix and the type agree", (t) => {
  assert.ok(has(validateKartograph(bundle(t, { files: { [C]: doc("Intent") } })).errors, /type must be Conversation/));
});

test("index.md lists every document exactly once with its type", (t) => {
  assert.ok(has(validateKartograph(bundle(t, { idx: [LINES[0]] })).errors, new RegExp(`lists '${C}' 0 times`)));
  assert.ok(has(validateKartograph(bundle(t, { idx: [...LINES, "* [Gone](2026-01-01-0000-gone.intent.md) - x. _(Intent, derived)_"] })).errors, /which does not exist/));
  assert.ok(has(validateKartograph(bundle(t, { idx: [LINES[0].replace("(Intent", "(Mapping"), LINES[1]] })).errors, /listed as Mapping/));
  assert.ok(has(validateKartograph(bundle(t, { files: { "index.md": index(LINES).replace("kartograph_version: 3.0.0", "kartograph_version: three") } })).errors, /must be x\.y\.z/));
});

test("log.md is dated newest first and sources resolve", (t) => {
  assert.ok(has(validateKartograph(bundle(t, { files: { "log.md": "# Kartograph Log\n\n## 2026-09-20\n\n## 2026-09-24\n" } })).errors, /newest first/));
  assert.ok(has(validateKartograph(bundle(t, { files: { [C]: null } , idx: [LINES[0]] })).errors, new RegExp(`sources names '${C}', which does not exist`)));
});

test("a revision is a typed document of the bundle", (t) => {
  const R = "2026-09-25-1000-archive-undo.revision.md";
  const line = `* [Archive undo](${R}) - x. _(Revision, recorded)_`;
  assert.deepEqual(validateKartograph(bundle(t, { files: { [R]: doc("Revision", `[${I}]`) }, idx: [line, ...LINES] })).errors, []);
  assert.ok(has(validateKartograph(bundle(t, { files: { [R]: doc("Intent", `[${I}]`) }, idx: [line, ...LINES] })).errors, /type must be Revision for a \.revision\.md file/));
  assert.ok(has(validateKartograph(bundle(t, { files: { [R]: doc("Revision", "[2026-01-01-0000-gone.intent.md]") }, idx: [line, ...LINES] })).errors, /sources names '2026-01-01-0000-gone\.intent\.md', which does not exist/));
});

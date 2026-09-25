import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const skills = readdirSync(new URL("skills/", root)).filter((d) => existsSync(new URL(`skills/${d}/SKILL.md`, root))).sort();

test("fourteen skills, explore retired", () => {
  assert.deepEqual(skills, [
    "kartograph-adapters", "kartograph-converse", "kartograph-deliver", "kartograph-domain",
    "kartograph-features", "kartograph-intent", "kartograph-knowledge", "kartograph-map",
    "kartograph-migrate", "kartograph-plan", "kartograph-release", "kartograph-revise",
    "kartograph-screens", "kartograph-walk",
  ]);
  assert.ok(!existsSync(new URL("skills/kartograph-explore", root)));
});

test("each SKILL.md's name is its directory", () => {
  for (const s of skills) assert.match(read(`skills/${s}/SKILL.md`), new RegExp(`^---\\nname: ${s}\\n`), s);
});

test("every skill but migrate carries the same version gate, right after Hard rules", () => {
  const gate = (text) => /\n## 0\. Version gate\n([\s\S]*?)\n## /.exec(text)?.[1];
  const gated = skills.filter((s) => s !== "kartograph-migrate");
  const first = gate(read(`skills/${gated[0]}/SKILL.md`));
  assert.ok(first, `${gated[0]} has no '## 0. Version gate'`);
  for (const s of gated) {
    const text = read(`skills/${s}/SKILL.md`);
    assert.equal(gate(text), first, `${s}'s version gate differs`);
    const heads = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    assert.equal(heads[heads.indexOf("Hard rules") + 1], "0. Version gate", `${s}: the gate follows Hard rules`);
  }
});

test("outside the version gate, no skill but migrate mentions intents/", () => {
  for (const s of skills.filter((x) => x !== "kartograph-migrate")) {
    const body = read(`skills/${s}/SKILL.md`).replace(/\n## 0\. Version gate\n[\s\S]*?\n(?=## )/, "\n");
    assert.ok(!/(^|[^a-z])intents\//.test(body), `${s} still mentions intents/ outside its version gate`);
  }
});

test("every skill is in the Claude Code manifest and has an OpenCode tool; npm ships migrations and scripts", () => {
  const manifest = JSON.parse(read(".claude-plugin/plugin.json"));
  assert.deepEqual(manifest.skills.map((s) => s.replace("./skills/", "")).sort(), skills);
  const opencode = read("opencode/index.js");
  for (const s of skills) assert.ok(opencode.includes(`skill: "${s}"`), `opencode/index.js has no tool for ${s}`);
  const pkg = JSON.parse(read("package.json"));
  for (const f of ["migrations/", "scripts/"]) assert.ok(pkg.files.includes(f), `package.json files lacks ${f}`);
});

test("revise and release are stack-neutral: every stack word comes from the project's files", () => {
  const stackWord = /\b(Koin|Gradle|gradlew|xcodebuild|SwiftUI|Compose|Room|SwiftData|ViewModel|AppEnvironment)\b/;
  for (const s of ["kartograph-revise", "kartograph-release"]) {
    const m = stackWord.exec(read(`skills/${s}/SKILL.md`));
    assert.equal(m, null, `${s} names '${m?.[0]}'`);
  }
});

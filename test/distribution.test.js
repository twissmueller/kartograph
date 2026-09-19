import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const stacks = readdirSync(join(root, "stacks")).filter((s) => s !== "common" && statSync(join(root, "stacks", s)).isDirectory());
const walk = (dir) => readdirSync(dir).filter((e) => e !== "__pycache__").flatMap((e) => (statSync(join(dir, e)).isDirectory() ? walk(join(dir, e)) : [join(dir, e)]));
const common = walk(join(root, "stacks/common/distribution"));
const perStack = Object.fromEntries(stacks.map((s) => [s, existsSync(join(root, "stacks", s, "distribution")) ? walk(join(root, "stacks", s, "distribution")) : []]));
const all = [...common, ...Object.values(perStack).flat()];

// The scripts each stack must ship, from the table in stacks/common/DISTRIBUTION.md.
const REQUIRED = {
  kmp: ["run-local.sh", "run-device.sh", "prepare-release.sh", "deploy-testflight.sh", "deploy-play-internal.sh", "push-store-metadata.sh", "release-stores.sh"],
  "apple-swift": ["run-local.sh", "run-device.sh", "prepare-release.sh", "deploy-testflight.sh", "push-store-metadata.sh", "release-stores.sh"],
  "android-compose": ["run-local.sh", "prepare-release.sh", "deploy-play-internal.sh", "push-store-metadata.sh", "release-stores.sh"],
  "angular-kotlin": ["run-local.sh", "prepare-release.sh", "deploy.sh"],
};

test("every stack ships its entry scripts and a config template", () => {
  for (const [stack, scripts] of Object.entries(REQUIRED)) {
    const names = perStack[stack].map((f) => basename(f));
    for (const s of scripts) assert.ok(names.includes(s), `${stack} lacks ${s}`);
    assert.ok(names.includes("config.sh.template"), `${stack} lacks config.sh.template`);
    const tpl = readFileSync(join(root, "stacks", stack, "distribution/config.sh.template"), "utf8");
    assert.match(tpl, new RegExp(`^STACK="${stack}"`, "m"));
    assert.match(tpl, /^LANES="/m);
  }
});

test("every shell script parses and every python tool compiles", () => {
  for (const f of all) {
    if (f.endsWith(".sh") || f.endsWith(".template")) {
      const r = spawnSync("bash", ["-n", f], { encoding: "utf8" });
      assert.equal(r.status, 0, `bash -n ${f}: ${r.stderr}`);
    }
    if (f.endsWith(".py")) {
      const r = spawnSync("python3", ["-c", `import ast,sys; ast.parse(open(sys.argv[1]).read(), sys.argv[1])`, f], { encoding: "utf8" });
      assert.equal(r.status, 0, `py_compile ${f}: ${r.stderr}`);
    }
  }
});

test("an entry script shared by several stacks is byte-identical in each", () => {
  const byName = new Map();
  for (const [stack, files] of Object.entries(perStack)) {
    for (const f of files) {
      const name = basename(f);
      if (!name.endsWith(".sh") || name === "config.sh.template") continue;
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push({ stack, text: readFileSync(f, "utf8") });
    }
  }
  for (const [name, copies] of byName) {
    for (const c of copies) assert.equal(c.text, copies[0].text, `${name} differs between ${copies[0].stack} and ${c.stack}`);
  }
});

test("entry scripts keep the conventions: strict mode, common.sh, load_config, a usage block", () => {
  for (const files of Object.values(perStack)) {
    for (const f of files) {
      if (!f.endsWith(".sh")) continue;
      const t = readFileSync(f, "utf8");
      assert.match(t, /^#!\/usr\/bin\/env bash\n#/, `${f}: shebang and usage comment`);
      assert.match(t, /set -euo pipefail/, `${f}: strict mode`);
      assert.match(t, /lib\/common\.sh/, `${f}: sources common.sh`);
      assert.match(t, /load_config/, `${f}: load_config`);
      assert.equal(statSync(f).mode & 0o111 ? true : false, true, `${f}: executable`);
    }
  }
});

test("the libraries load together and define every function the contract lists", () => {
  const contract = readFileSync(join(root, "stacks/common/DISTRIBUTION.md"), "utf8");
  const expected = new Set();
  for (const m of contract.matchAll(/### `(\w+)\.sh`\n\n```\n([\s\S]*?)```/g)) {
    for (const line of m[2].split("\n")) {
      // a function is the first token of a line; the log/warn/die line carries three, split by wide gaps
      const first = /^([a-z_]+)\s/.exec(line)?.[1];
      if (!first) continue;
      if (/^(log|warn|die) /.test(line)) for (const part of line.split(/\s{3,}/)) expected.add(part.split(/\s/)[0]);
      else expected.add(first);
    }
  }
  const libs = ["common.sh", "asc.sh", "xcode.sh", "play.sh", "gradle.sh", "docker.sh"].map((l) => join(root, "stacks/common/distribution/lib", l));
  for (const l of libs) assert.ok(existsSync(l), `missing ${l}`);
  const script = `set -euo pipefail; CONFIG_FILE=/dev/null; ${libs.map((l) => `. '${l}'`).join("; ")}; declare -F | sed 's/declare -f //'`;
  const defined = new Set(execFileSync("bash", ["-c", script], { encoding: "utf8" }).split("\n").filter(Boolean));
  const missing = [...expected].filter((f) => !defined.has(f));
  assert.deepEqual(missing, [], `contract functions not defined: ${missing.join(", ")}`);
});

test("no literal identifier from the source projects leaks into the shipped scripts", () => {
  const forbidden = [/L558UB558J/, /WQ7Q6PU734/, /69a6de7f-71ff/, /com\.ramus\./, /hyperid/i, /longpath/i, /mokuso/i, /beatrep/i, /afup/i, /kikitori/i, /midiaid|midi-aid/i];
  for (const f of all) {
    const t = readFileSync(f, "utf8");
    for (const p of forbidden) assert.doesNotMatch(t, p, `${f} contains ${p}`);
  }
});

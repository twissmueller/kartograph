import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
  "kmp-toolchain": ["run-local.sh", "run-device.sh", "prepare-release.sh", "deploy-testflight.sh", "deploy-play-internal.sh", "push-store-metadata.sh", "release-stores.sh"],
  "apple-swift": ["run-local.sh", "run-device.sh", "prepare-release.sh", "deploy-testflight.sh", "push-store-metadata.sh", "release-stores.sh"],
  "android-compose": ["run-local.sh", "prepare-release.sh", "deploy-play-internal.sh", "push-store-metadata.sh", "release-stores.sh"],
  "angular-kotlin": ["run-local.sh", "prepare-release.sh", "deploy.sh"],
  "python-fastapi": ["run-local.sh", "prepare-release.sh"],
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
  for (const m of contract.matchAll(/### `([\w-]+)\.sh`\n\n```\n([\s\S]*?)```/g)) {
    for (const line of m[2].split("\n")) {
      // a function is the first token of a line; the log/warn/die line carries three, split by wide gaps
      const first = /^([a-z_]+)\s/.exec(line)?.[1];
      if (!first) continue;
      if (/^(log|warn|die) /.test(line)) for (const part of line.split(/\s{3,}/)) expected.add(part.split(/\s/)[0]);
      else expected.add(first);
    }
  }
  const libs = ["common.sh", "asc.sh", "xcode.sh", "play.sh", "gradle.sh", "kotlin-toolchain.sh", "docker.sh"].map((l) => join(root, "stacks/common/distribution/lib", l));
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

// The entry scripts are shared byte for byte, so none may call a build library directly:
// the build is chosen by kotlin_build_lib from STACK, and they use only the interface.
test("entry scripts reach the Android and desktop builds only through kotlin_build_lib", () => {
  for (const files of Object.values(perStack)) {
    for (const f of files) {
      if (!f.endsWith(".sh")) continue;
      const t = readFileSync(f, "utf8");
      assert.doesNotMatch(t, /lib\/(gradle|kotlin-toolchain)\.sh/, `${f} sources a build library directly`);
      assert.doesNotMatch(t, /\b(gradle|toolchain)_(run|version_read|version_write|bundle_release|emulator_run|desktop_run)\b/, `${f} calls a build library function directly`);
    }
  }
});

const lib = (name) => join(root, "stacks/common/distribution/lib", name);
const sh = (script, env = {}) =>
  spawnSync("bash", ["-c", `set -euo pipefail; CONFIG_FILE=/dev/null; . '${lib("common.sh")}'; ${script}`], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });

test("kotlin_build_lib picks kotlin-toolchain.sh for kmp-toolchain and gradle.sh otherwise", () => {
  for (const [stack, own, other] of [["kmp-toolchain", "toolchain_run", "gradle_run"], ["kmp", "gradle_run", "toolchain_run"], ["android-compose", "gradle_run", "toolchain_run"]]) {
    const r = sh(`STACK=${stack}; kotlin_build_lib; declare -F ${own} >/dev/null; ! declare -F ${other} >/dev/null; for f in android_version_read android_version_write android_bundle_release emulator_run desktop_run; do declare -F $f >/dev/null; done`);
    assert.equal(r.status, 0, `${stack}: ${r.stderr}`);
  }
});

test("kotlin-toolchain.sh reads and writes versionName and versionCode in a module.yaml, touching nothing else", () => {
  const dir = mkdtempSync(join(tmpdir(), "kt-version-"));
  const file = join(dir, "module.yaml");
  const before = `product: android/app

dependencies:
  - //shared

settings:
  compose: enabled
  android:
    namespace: org.example.app
    applicationId: org.example.app
    versionCode: 41 # raised by deploy-play-internal.sh
    versionName: "1.4.2"
    signing:
      enabled: true
      propertiesFile: ../keystore.properties
`;
  writeFileSync(file, before);
  const env = { ANDROID_BUILD_FILE: file };
  const load = `. '${lib("kotlin-toolchain.sh")}';`;

  let r = sh(`${load} toolchain_version_read`, env);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "1.4.2 41\n");

  r = sh(`${load} android_version_write 1.5.0 42`, env);
  assert.equal(r.status, 0, r.stderr);
  const after = readFileSync(file, "utf8");
  assert.equal(after, before.replace("versionCode: 41 #", "versionCode: 42 #").replace('versionName: "1.4.2"', 'versionName: "1.5.0"'));
  assert.equal(sh(`${load} android_version_read`, env).stdout, "1.5.0 42\n");

  // Unquoted values keep their shape.
  writeFileSync(file, "settings:\n  android:\n    versionName: 2.0.0\n    versionCode: 7\n");
  sh(`${load} toolchain_version_write 2.1.0 8`, env);
  assert.equal(readFileSync(file, "utf8"), "settings:\n  android:\n    versionName: 2.1.0\n    versionCode: 8\n");

  // The Toolchain's defaults are never a release: reading stops, writing adds the keys.
  writeFileSync(file, "product: android/app\n\nsettings:\n  compose: enabled\n  android:\n    namespace: org.example.app\n");
  r = sh(`${load} toolchain_version_read`, env);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /versionName and versionCode not set/);
  r = sh(`${load} toolchain_version_write 1.0.0 1`, env);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(file, "utf8"), 'product: android/app\n\nsettings:\n  compose: enabled\n  android:\n    versionName: "1.0.0"\n    versionCode: 1\n    namespace: org.example.app\n');
  assert.equal(sh(`${load} toolchain_version_read`, env).stdout, "1.0.0 1\n");
});

test("toolchain_bundle_release refuses before building when module.yaml does not enable signing", () => {
  const dir = mkdtempSync(join(tmpdir(), "kt-bundle-"));
  const file = join(dir, "module.yaml");
  const props = join(dir, "keystore.properties");
  writeFileSync(file, "settings:\n  android:\n    versionName: 1.0.0\n    versionCode: 1\n");
  writeFileSync(props, "storeFile=x\n");
  writeFileSync(join(dir, "kotlin"), "#!/bin/sh\necho ran >&2\nexit 1\n", { mode: 0o755 });
  const r = sh(`. '${lib("kotlin-toolchain.sh")}'; toolchain_bundle_release`, {
    ANDROID_BUILD_FILE: file, KEYSTORE_PROPERTIES: props, KOTLIN_DIR: dir, ANDROID_MODULE: "androidApp", APP_NAME: "Demo", BUILD_DIR: join(dir, "build"),
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /signing is not enabled/);
  assert.doesNotMatch(r.stderr, /\bran\b/);
});

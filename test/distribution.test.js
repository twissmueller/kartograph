import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
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
    const r = sh(`STACK=${stack}; kotlin_build_lib; declare -F ${own} >/dev/null; ! declare -F ${other} >/dev/null; for f in android_release_check android_version_read android_version_write android_bundle_release emulator_run desktop_run; do declare -F $f >/dev/null; done`);
    assert.equal(r.status, 0, `${stack}: ${r.stderr}`);
  }
});

const toolchain = `. '${lib("kotlin-toolchain.sh")}';`;
const tmp = (prefix) => mkdtempSync(join(tmpdir(), prefix));
const zip = (path, entries) =>
  spawnSync("python3", ["-c", "import sys, zipfile\nz = zipfile.ZipFile(sys.argv[1], 'w')\nfor n in sys.argv[2:]: z.writestr(n, 'x')\nz.close()", path, ...entries]);

test("kotlin-toolchain.sh reads and writes versionName and versionCode under settings: android:, touching nothing else", () => {
  const dir = tmp("kt-version-");
  const file = join(dir, "module.yaml");
  const before = `product: android/app

settings@android:
  android:
    versionCode: 999

settings:
  compose: enabled
  android:
    namespace: org.example.app
    applicationId: org.example.app
    versionCode: 41 # raised by deploy-play-internal.sh
    versionName: "1.4.2"
    signing:
      enabled: true
`;
  writeFileSync(file, before);
  const env = { ANDROID_BUILD_FILE: file };

  let r = sh(`${toolchain} toolchain_version_read`, env);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "1.4.2 41\n");

  r = sh(`${toolchain} android_version_write 1.5.0 42`, env);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(file, "utf8"), before.replace("versionCode: 41 #", "versionCode: 42 #").replace('versionName: "1.4.2"', 'versionName: "1.5.0"'));
  assert.equal(sh(`${toolchain} android_version_read`, env).stdout, "1.5.0 42\n");

  // Unquoted values keep their shape; CRLF files stay CRLF.
  writeFileSync(file, "settings:\r\n  android:\r\n    versionName: 2.0.0\r\n    versionCode: 7\r\n");
  r = sh(`${toolchain} toolchain_version_write 2.1.0 8`, env);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(file, "utf8"), "settings:\r\n  android:\r\n    versionName: 2.1.0\r\n    versionCode: 8\r\n");
  assert.equal(sh(`${toolchain} toolchain_version_read`, env).stdout, "2.1.0 8\n");

  // The Toolchain's defaults are never a release: both reading and writing stop, naming the key.
  const bare = "product: android/app\n\nsettings:\n  compose: enabled\n  android:\n    namespace: org.example.app\n    versionName: 1.0.0\n";
  writeFileSync(file, bare);
  r = sh(`${toolchain} toolchain_version_read`, env);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /versionCode not set under settings: android: in .*module\.yaml/);
  r = sh(`${toolchain} toolchain_version_write 1.0.0 1`, env);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /versionCode not set under settings: android: in .*module\.yaml/);
  assert.equal(readFileSync(file, "utf8"), bare);
});

// A project with a stub wrapper: the check must pass or fail before the wrapper ever runs.
const toolchainProject = (signing, { props = true } = {}) => {
  const dir = tmp("kt-check-");
  const mod = join(dir, "androidApp");
  mkdirSync(mod);
  writeFileSync(join(mod, "module.yaml"), `product: android/app\n\nsettings:\n  android:\n    versionCode: 1\n    versionName: "1.0.0"\n${signing}\n`);
  if (props) writeFileSync(join(dir, "keystore.properties"), "storeFile=x\n");
  writeFileSync(join(dir, "kotlin"), "#!/bin/sh\necho ran >&2\nexit 1\n", { mode: 0o755 });
  return {
    dir,
    env: { KOTLIN_DIR: dir, ANDROID_MODULE: "androidApp", ANDROID_BUILD_FILE: join(mod, "module.yaml"), KEYSTORE_PROPERTIES: join(dir, "keystore.properties"), APP_NAME: "Demo", BUILD_DIR: join(dir, "out") },
  };
};

test("android_release_check on the Toolchain: the wrapper, signing enabled in module.yaml, and the properties file it names", () => {
  const ok = [
    "    signing: { enabled: true, propertiesFile: ../keystore.properties }",
    "    signing:\n      enabled: true\n      propertiesFile: ../keystore.properties",
  ];
  for (const s of ok) {
    const p = toolchainProject(s);
    const r = sh(`${toolchain} android_release_check`, p.env);
    assert.equal(r.status, 0, `${s}: ${r.stderr}`);
  }
  // `signing: enabled` reads keystore.properties beside module.yaml.
  const scalar = toolchainProject("    signing: enabled");
  writeFileSync(join(scalar.dir, "androidApp", "keystore.properties"), "storeFile=x\n");
  assert.equal(sh(`${toolchain} android_release_check`, scalar.env).status, 0);

  const notEnabled = [
    "    signing:\n      enabled: false\n    lint:\n      enabled: true",
    "    signing: { enabled: false }",
    "    namespace: org.example.app",
  ];
  for (const s of notEnabled) {
    const p = toolchainProject(s);
    const r = sh(`${toolchain} android_release_check`, p.env);
    assert.notEqual(r.status, 0, s);
    assert.match(r.stderr, /signing is not enabled/, s);
    assert.doesNotMatch(r.stderr, /\bran\b/);
  }
  // The Toolchain only warns when the properties file is missing and builds unsigned.
  const missing = toolchainProject("    signing: { enabled: true, propertiesFile: ../nowhere.properties }");
  let r = sh(`${toolchain} android_release_check`, missing.env);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /nowhere\.properties.*does not exist/);

  const noDir = toolchainProject("    signing: enabled");
  r = sh(`${toolchain} android_release_check`, { ...noDir.env, KOTLIN_DIR: "" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /KOTLIN_DIR is empty/);
});

test("toolchain_bundle_release ships only a bundle jarsigner calls verified, never an intermediate", () => {
  const work = tmp("kt-sign-");
  const unsigned = join(work, "unsigned.aab");
  const signed = join(work, "signed.aab");
  zip(unsigned, ["base/manifest/AndroidManifest.xml"]);
  zip(signed, ["base/manifest/AndroidManifest.xml"]);
  const ks = join(work, "k.jks");
  execFileSync("keytool", ["-genkeypair", "-keystore", ks, "-storepass", "secret1", "-keypass", "secret1", "-alias", "k", "-keyalg", "RSA", "-dname", "CN=Test", "-validity", "2"], { stdio: "ignore" });
  execFileSync("jarsigner", ["-keystore", ks, "-storepass", "secret1", signed, "k"], { stdio: "ignore" });

  const wrapper = (bundle) =>
    `#!/bin/sh\nout=build/tasks/_androidApp_bundleAndroid\nmkdir -p $out/gradle-project/intermediates\ncp '${bundle}' $out/gradle-project-release.aab\nsleep 1\ncp '${unsigned}' $out/gradle-project/intermediates/intermediary-bundle.aab\n`;

  const bad = toolchainProject("    signing: { enabled: true, propertiesFile: ../keystore.properties }");
  writeFileSync(join(bad.dir, "kotlin"), wrapper(unsigned), { mode: 0o755 });
  let r = sh(`mkdir -p "$BUILD_DIR"; ${toolchain} toolchain_bundle_release`, bad.env);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /is not signed/);
  assert.doesNotMatch(r.stderr, /signed bundle/);

  const good = toolchainProject("    signing: { enabled: true, propertiesFile: ../keystore.properties }");
  writeFileSync(join(good.dir, "kotlin"), wrapper(signed), { mode: 0o755 });
  r = sh(`mkdir -p "$BUILD_DIR"; ${toolchain} toolchain_bundle_release`, good.env);
  assert.equal(r.status, 0, r.stderr);
  const dest = r.stdout.trim();
  assert.match(dest, /Demo-1\.0\.0-1\.aab$/);
  assert.match(execFileSync("jarsigner", ["-verify", dest], { encoding: "utf8" }), /jar verified\./);
});

test("gradle_bundle_release refuses a bundle jarsigner calls unsigned", () => {
  const dir = tmp("gr-sign-");
  const mod = join(dir, "androidApp");
  mkdirSync(mod);
  writeFileSync(join(mod, "build.gradle.kts"), 'android {\n    defaultConfig {\n        versionCode = 3\n        versionName = "1.0.0"\n    }\n}\n');
  writeFileSync(join(dir, "keystore.properties"), "storeFile=x\n");
  const unsigned = join(dir, "unsigned.aab");
  zip(unsigned, ["base/manifest/AndroidManifest.xml"]);
  writeFileSync(join(dir, "gradlew"), `#!/bin/sh\nmkdir -p androidApp/build/outputs/bundle/release\ncp '${unsigned}' androidApp/build/outputs/bundle/release/androidApp-release.aab\n`, { mode: 0o755 });
  const r = sh(`. '${lib("gradle.sh")}'; mkdir -p "$BUILD_DIR"; gradle_bundle_release`, {
    GRADLE_DIR: dir, ANDROID_MODULE: ":androidApp", ANDROID_BUILD_FILE: join(mod, "build.gradle.kts"), KEYSTORE_PROPERTIES: join(dir, "keystore.properties"), APP_NAME: "Demo", BUILD_DIR: join(dir, "out"),
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /is not signed/);
  assert.doesNotMatch(r.stderr, /signed bundle/);
});

// deploy-play-internal.sh bumps the versionCode; a configuration it cannot build with must
// stop it before that write, or every retry bumps again.
const deployProject = (stack, config) => {
  const dir = tmp("deploy-");
  const dist = join(dir, "distribution");
  mkdirSync(join(dist, "lib"), { recursive: true });
  for (const f of readdirSync(join(root, "stacks/common/distribution/lib"))) {
    if (f.endsWith(".sh") || f.endsWith(".py")) writeFileSync(join(dist, "lib", f), readFileSync(lib(f)));
  }
  writeFileSync(join(dist, "deploy-play-internal.sh"), readFileSync(join(root, "stacks", stack, "distribution/deploy-play-internal.sh")), { mode: 0o755 });
  writeFileSync(join(dir, "sa.json"), "{}");
  writeFileSync(join(dir, "keystore.properties"), "storeFile=x\n");
  writeFileSync(join(dist, "config.sh"), `APP_NAME="Demo"\nSTACK="${stack}"\nLANES="android"\nPLAY_PACKAGE_NAME="org.example.demo"\nPLAY_SERVICE_ACCOUNT="${join(dir, "sa.json")}"\nKEYSTORE_PROPERTIES="${join(dir, "keystore.properties")}"\n${config(dir)}\n`);
  return { dir, run: () => spawnSync("bash", [join(dist, "deploy-play-internal.sh"), "--yes"], { encoding: "utf8", cwd: dir }) };
};

test("deploy-play-internal.sh checks the build configuration before it bumps the versionCode", () => {
  const moduleYaml = 'settings:\n  android:\n    versionCode: 5\n    versionName: "1.0.0"\n    signing: { enabled: true, propertiesFile: ../keystore.properties }\n';
  const tc = deployProject("kmp-toolchain", (dir) => {
    mkdirSync(join(dir, "androidApp"));
    writeFileSync(join(dir, "androidApp", "module.yaml"), moduleYaml);
    return `KOTLIN_DIR=""\nANDROID_MODULE="androidApp"\nANDROID_BUILD_FILE="${join(dir, "androidApp", "module.yaml")}"`;
  });
  let r = tc.run();
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /KOTLIN_DIR is empty/);
  assert.equal(readFileSync(join(tc.dir, "androidApp", "module.yaml"), "utf8"), moduleYaml);

  const gradleFile = 'android {\n    defaultConfig {\n        versionCode = 5\n        versionName = "1.0.0"\n    }\n}\n';
  const gr = deployProject("kmp", (dir) => {
    mkdirSync(join(dir, "androidApp"));
    writeFileSync(join(dir, "androidApp", "build.gradle.kts"), gradleFile);
    return `GRADLE_DIR=""\nANDROID_MODULE=":androidApp"\nANDROID_BUILD_FILE="${join(dir, "androidApp", "build.gradle.kts")}"`;
  });
  r = gr.run();
  assert.notEqual(r.status, 0);
  assert.equal(r.stderr.trim().split("\n").length, 1, r.stderr);
  assert.match(r.stderr, /GRADLE_DIR is empty/);
  assert.equal(readFileSync(join(gr.dir, "androidApp", "build.gradle.kts"), "utf8"), gradleFile);
});

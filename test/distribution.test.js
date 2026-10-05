import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
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
  kmp: ["run-local.sh", "run-device.sh", "prepare-release.sh", "deploy-testflight.sh", "deploy-play-internal.sh", "push-store-metadata.sh", "release-check.sh", "first-release-check.sh", "release-stores.sh"],
  "kmp-toolchain": ["run-local.sh", "run-device.sh", "prepare-release.sh", "deploy-testflight.sh", "deploy-play-internal.sh", "push-store-metadata.sh", "release-check.sh", "first-release-check.sh", "release-stores.sh"],
  "apple-swift": ["run-local.sh", "run-device.sh", "prepare-release.sh", "deploy-testflight.sh", "push-store-metadata.sh", "release-check.sh", "first-release-check.sh", "release-stores.sh"],
  "android-compose": ["run-local.sh", "prepare-release.sh", "deploy-play-internal.sh", "push-store-metadata.sh", "release-check.sh", "first-release-check.sh", "release-stores.sh"],
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
    const r = sh(`STACK=${stack}; kotlin_build_lib; declare -F ${own} >/dev/null; ! declare -F ${other} >/dev/null; for f in android_release_check android_version_read android_version_write android_version_files android_bundle_release emulator_run desktop_run; do declare -F $f >/dev/null; done`);
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

// --- release-check.sh and the screenshot documents kartograph-release reads -------

test("release-check.sh prints its usage, and exits 2 with a sentence when no store lane ships", () => {
  const dir = tmp("release-check-");
  mkdirSync(join(dir, "distribution"));
  execFileSync("cp", ["-R", join(root, "stacks/common/distribution/lib"), join(dir, "distribution/lib")]);
  execFileSync("cp", [join(root, "stacks/kmp/distribution/release-check.sh"), join(dir, "distribution/")]);
  writeFileSync(join(dir, "distribution/config.sh"), 'LANES="docker"\n');
  const help = spawnSync("bash", [join(dir, "distribution/release-check.sh"), "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stderr, /release-check\.sh \[--apple\] \[--play\]/);
  const none = spawnSync("bash", [join(dir, "distribution/release-check.sh")], { encoding: "utf8" });
  assert.equal(none.status, 2);
  assert.match(none.stderr, /ships neither an Apple nor a Play lane/);
});

test("release-check.sh compares versions numerically; nothing on sale is older than any version", () => {
  const script = join(root, "stacks/kmp/distribution/release-check.sh");
  const newer = (a, b) => spawnSync("bash", ["-c", `eval "$(sed -n '/^newer() {/,/^}/p' '${script}')"; newer '${a}' '${b}'`]).status === 0;
  assert.ok(newer("1.10.0", "1.9.0"));
  assert.ok(newer("2.0.0", "1.99.99"));
  assert.ok(newer("1.0.0", ""));
  assert.ok(!newer("1.2.0", "1.2.0"));
  assert.ok(!newer("1.2.0", "1.3.0"));
  assert.ok(!newer("", "1.0.0"));
});

// release-check.sh against stubbed store reads: lib/asc.sh and lib/play.sh are replaced by
// functions that answer from environment variables, so nothing calls a real API.
const releaseCheck = () => {
  const dir = tmp("release-check-stub-");
  mkdirSync(join(dir, "distribution"));
  execFileSync("cp", ["-R", join(root, "stacks/common/distribution/lib"), join(dir, "distribution/lib")]);
  execFileSync("cp", [join(root, "stacks/kmp/distribution/release-check.sh"), join(dir, "distribution/")]);
  writeFileSync(join(dir, "distribution/config.sh"), 'LANES="ios mac android"\nASC_APP_ID=1\nASC_KEY_ID=k\nASC_ISSUER_ID=i\nPLAY_PACKAGE_NAME=p\n');
  writeFileSync(join(dir, "distribution/lib/asc.sh"), `asc_get() {
  [ "\${ASC_FAIL:-}" = "$1" ] && { echo "HTTP 500 from App Store Connect" >&2; return 1; }
  case "$1" in
    /builds) case "$2" in *MAC_OS*) printf '%s' "$BUILDS_MAC_OS" ;; *) printf '%s' "$BUILDS_IOS" ;; esac ;;
    *) printf '%s' "$VERSIONS" ;;
  esac
}
`);
  writeFileSync(join(dir, "distribution/lib/play.sh"), `play_track_versions() {
  [ "\${PLAY_FAIL:-}" = 1 ] && { echo "could not read the '$1' track" >&2; exit 1; }
  case "$1" in internal) echo "\${INTERNAL:-}" ;; production) echo "\${PRODUCTION:-}" ;; esac
}
`);
  const build = (version, number) => JSON.stringify({ data: [{ attributes: { version: number }, relationships: { preReleaseVersion: { data: { id: "p" } } } }], included: [{ id: "p", type: "preReleaseVersions", attributes: { version } }] });
  const env = { BUILDS_IOS: build("1.3.0", "41"), BUILDS_MAC_OS: build("1.3.0", "41"), VERSIONS: JSON.stringify({ data: [{ attributes: { versionString: "1.2.0", appStoreState: "READY_FOR_SALE" } }] }), INTERNAL: "41", PRODUCTION: "40" };
  return { build, run: (over = {}) => spawnSync("bash", [join(dir, "distribution/release-check.sh")], { encoding: "utf8", env: { ...process.env, ...env, ...over } }) };
};

test("release-check.sh exits 0 with the version to release when every lane is ahead", () => {
  const r = releaseCheck().run();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^ios: tested 1\.3\.0 \(41\), on sale 1\.2\.0 — newer$/m);
  assert.match(r.stdout, /^android: internal versionCode 41, production 40 — newer$/m);
  assert.match(r.stdout, /^release 1\.3\.0$/m);
});

test("release-check.sh exits 3 when a store cannot be read, never 1 (which means a new build is needed)", () => {
  const rc = releaseCheck();
  for (const over of [{ ASC_FAIL: "/builds" }, { ASC_FAIL: "/apps/1/appStoreVersions" }, { PLAY_FAIL: "1" }]) {
    const r = rc.run(over);
    assert.equal(r.status, 3, `${JSON.stringify(over)}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /could not read/);
    assert.doesNotMatch(r.stdout + r.stderr, /new build is needed/);
  }
});

test("release-check.sh names the first platform's version when Apple platforms test different ones", () => {
  const rc = releaseCheck();
  const r = rc.run({ BUILDS_MAC_OS: rc.build("1.4.0", "42") });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /^mac: tests 1\.4\.0, but another Apple platform tests 1\.3\.0/m);
  assert.match(r.stdout, /^release 1\.3\.0$/m);
});

const SCREENSHOT_SECTIONS = ["1. Where the renderer lives", "2. Devices and sizes", "3. Seed", "4. Run", "5. Output"];

test("every stack that releases to a store documents its screenshot renderer in screenshots.md", () => {
  for (const stack of stacks) {
    if (!existsSync(join(root, "stacks", stack, "distribution/release-stores.sh"))) continue;
    const file = join(root, "stacks", stack, "screenshots.md");
    assert.ok(existsSync(file), `${stack} lacks screenshots.md`);
    const text = readFileSync(file, "utf8");
    assert.deepEqual([...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]), SCREENSHOT_SECTIONS, `${stack}/screenshots.md sections`);
    const status = /^status: (\w+)$/m.exec(readFileSync(join(root, "stacks", stack, "STACK.md"), "utf8"))[1];
    text.split(/^## .+$/m).slice(1).forEach((body, i) => {
      if (status === "scaffold") assert.match(body, /UNFILLED/, `${stack}: '${SCREENSHOT_SECTIONS[i]}' needs an UNFILLED marker`);
      else assert.doesNotMatch(body, /UNFILLED/, `${stack}: '${SCREENSHOT_SECTIONS[i]}' is unfilled in a ready stack`);
    });
  }
});

// --- push-store-metadata.sh --version: the fix for a first push landing on no editable
// App Store version. Everything below stubs the App Store Connect boundary (asc_get /
// asc_version_exists / asc_version_editable); nothing calls a real API.

const asc = `. '${lib("asc.sh")}';`;

test("asc_version_exists is true only for an editable version whose versionString matches exactly", () => {
  const answer = (state) => JSON.stringify({ data: [{ id: "v1", attributes: { platform: "IOS", versionString: "1.2.0", appStoreState: state } }] });
  const stub = (json) => `asc_get() { printf '%s' '${json}'; }`;

  let r = sh(`${asc} ${stub(answer("PREPARE_FOR_SUBMISSION"))}; ASC_APP_ID=1 asc_version_exists IOS 1.2.0`);
  assert.equal(r.status, 0, r.stderr);

  // a different version string, even in an editable state, is not a match
  r = sh(`${asc} ${stub(answer("PREPARE_FOR_SUBMISSION"))}; ASC_APP_ID=1 asc_version_exists IOS 1.3.0`);
  assert.notEqual(r.status, 0);

  // the right version string, but a non-editable state (e.g. on sale), is not a match
  r = sh(`${asc} ${stub(answer("READY_FOR_SALE"))}; ASC_APP_ID=1 asc_version_exists IOS 1.2.0`);
  assert.notEqual(r.status, 0);

  // nothing at all
  r = sh(`${asc} ${stub(JSON.stringify({ data: [] }))}; ASC_APP_ID=1 asc_version_exists IOS 1.2.0`);
  assert.notEqual(r.status, 0);
});

const ensureAppleVersionFn = () =>
  spawnSync("bash", ["-c", `sed -n '/^ensure_apple_version() {/,/^}/p' '${join(root, "stacks/apple-swift/distribution/push-store-metadata.sh")}'`], { encoding: "utf8" }).stdout;

test("push-store-metadata.sh's ensure_apple_version creates the missing App Store version only after confirming (or --yes), never touches one that already exists, and writes nothing on --dry-run", () => {
  const fn = ensureAppleVersionFn();
  assert.match(fn, /confirm_typed create/, "ensure_apple_version must confirm before creating (an outward action)");

  const run = (env, input) => spawnSync("bash", ["-c", `
    set -euo pipefail; CONFIG_FILE=/dev/null
    . '${lib("common.sh")}'
    asc_version_exists() { [ "\${EXISTS:-0}" = 1 ]; }
    asc_version_editable() { [ -n "\${2:-}" ] || return 1; echo "CREATE $1 $2" >&2; echo fake-id; }
    asc_version_in_submission() { :; }; asc_version_editable_string() { :; }
    ${fn}
    ensure_apple_version IOS
  `], { encoding: "utf8", input, env: { ...process.env, version: "1.2.0", dry: "", ...env } });

  // already editable: nothing is created, nothing is confirmed
  let r = run({ EXISTS: "1" });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /CREATE/);

  // missing, --dry-run: says what it would do, creates nothing, asks nothing
  r = run({ EXISTS: "0", dry: "--dry-run" });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /CREATE/);
  assert.match(r.stderr, /would create/);

  // missing, --yes (ASSUME_YES): creates without a prompt
  r = run({ EXISTS: "0", ASSUME_YES: "1" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /CREATE IOS 1\.2\.0/);

  // missing, no --yes, the wrong word typed: aborts, creates nothing
  r = run({ EXISTS: "0" }, "no\n");
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Aborted\. Nothing was published\./);
  assert.doesNotMatch(r.stderr, /CREATE/);

  // missing, no --yes, 'create' typed: creates
  r = run({ EXISTS: "0" }, "create\n");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /CREATE IOS 1\.2\.0/);
});

// --- a first store release: Apple refuses What's New before a version is on sale (ASC10).
// asc_version_on_sale tells a first release from a follow-up; release-stores.sh skips What's
// New on the first and sets it, exactly as before, on every later one.

test("asc_version_on_sale prints the highest version on sale, nothing on a first release, and fails only when the versions cannot be read", () => {
  const versions = (list) => JSON.stringify({ data: list.map(([versionString, state], i) => ({ id: `v${i}`, attributes: { platform: "IOS", versionString, [i % 2 ? "appVersionState" : "appStoreState"]: state } })) });
  const stub = (json) => `asc_get() { printf '%s' '${json}'; }`;

  let r = sh(`${asc} ${stub(versions([["1.9.0", "READY_FOR_SALE"], ["1.10.0", "READY_FOR_DISTRIBUTION"], ["2.0.0", "PREPARE_FOR_SUBMISSION"]]))}; ASC_APP_ID=1 asc_version_on_sale IOS`);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "1.10.0\n");

  r = sh(`${asc} ${stub(versions([["1.0", "PREPARE_FOR_SUBMISSION"]]))}; ASC_APP_ID=1 asc_version_on_sale IOS`);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "");

  r = sh(`${asc} asc_get() { echo "HTTP 500" >&2; return 1; }; ASC_APP_ID=1 asc_version_on_sale IOS`);
  assert.notEqual(r.status, 0);
});

// release-stores.sh against stubbed libraries: every store call is a function that logs what
// it was asked to do, so the order and the What's New decision are visible without an API.
const releaseStores = (stack = "kmp", { lanes = "ios", args = ["--apple"] } = {}) => {
  const dir = tmp("release-stores-");
  const dist = join(dir, "distribution");
  mkdirSync(dist);
  execFileSync("cp", ["-R", join(root, "stacks/common/distribution/lib"), join(dist, "lib")]);
  execFileSync("cp", [join(root, "stacks", stack, "distribution/release-stores.sh"), join(dist, "/")]);
  writeFileSync(join(dist, "config.sh"), `APP_NAME="Demo"\nLANES="${lanes}"\nLOCALES="en-US de-DE"\nASC_APP_ID=1\nASC_KEY_ID=k\nASC_ISSUER_ID=i\nPLAY_PACKAGE_NAME=p\n`);
  writeFileSync(join(dist, "lib/play.sh"), `play_track_versions() { echo 41; }
play_promote() { echo "PROMOTE $1 $2" >&2; }
play_verify() { echo "VERIFY $1 $2" >&2; }
`);
  writeFileSync(join(dist, "lib/xcode.sh"), "version_read() { echo 1.3.0; }\n");
  writeFileSync(join(dist, "lib/asc.sh"), `asc_build_latest() { echo "BUILD $1 $2" >&2; echo build-1; }
asc_version_on_sale() { [ "\${ON_SALE_FAIL:-}" = 1 ] && { echo "HTTP 500" >&2; return 1; }; printf '%s\\n' "\${ON_SALE:-}"; }
asc_version_editable() { echo "EDITABLE $1 $2" >&2; echo version-1; }
asc_version_attach() { echo "ATTACH $1 $2" >&2; }
asc_version_whats_new() { echo "WHATSNEW $1 $2 $3" >&2; }
asc_review_submit() { echo "SUBMIT $1" >&2; }
asc_review_prepare() { echo "PREPARE $1" >&2; echo submission-1; }
asc_version_carries() { case "\${CARRIES:-0}" in 0) return 0 ;; 1) echo "! build 27 is attached, the newest is 28" >&2; return 1 ;; *) return 2 ;; esac; }
asc_version_in_submission() { [ "\${IN_SUBMISSION_FAIL:-}" = 1 ] && { echo "HTTP 500" >&2; return 1; }; case "$1" in IOS) printf '%s\\n' "\${IN_SUBMISSION_IOS:-}" ;; *) printf '%s\\n' "\${IN_SUBMISSION_MAC:-}" ;; esac; }
`);
  writeFileSync(join(dist, "notes.md"), "# v1.3.0\n\n## Store text\n\n### play_short\n\nPlay text.\n\n### asc_short\n\nApple text.\n");
  return (env = {}) => spawnSync("bash", [join(dist, "release-stores.sh"), ...args, ...(env.EXTRA ? [env.EXTRA] : []), "--notes", join(dist, "notes.md"), "--version", "1.3.0", "--yes"], { encoding: "utf8", env: { ...process.env, ...env } });
};

test("release-stores.sh on a follow-up release sets What's New per locale, then submits, as before", () => {
  const r = releaseStores()({ ON_SALE: "1.2.0" });
  assert.equal(r.status, 0, r.stderr);
  const calls = r.stderr.split("\n").filter((l) => /^(BUILD|EDITABLE|ATTACH|WHATSNEW|SUBMIT) /.test(l));
  assert.deepEqual(calls, ["BUILD IOS 1.3.0", "EDITABLE IOS 1.3.0", "ATTACH version-1 build-1", "WHATSNEW version-1 en-US Apple text.", "WHATSNEW version-1 de-DE Apple text.", "SUBMIT IOS"]);
  assert.match(r.stderr, /has its build and What's New/);
});

test("release-stores.sh on a first release sets no What's New, which Apple refuses, and still submits", () => {
  for (const stack of ["kmp", "kmp-toolchain", "apple-swift"]) {
    const r = releaseStores(stack)({ ON_SALE: "" });
    assert.equal(r.status, 0, `${stack}: ${r.stderr}`);
    assert.doesNotMatch(r.stderr, /WHATSNEW/, stack);
    assert.match(r.stderr, /ATTACH version-1 build-1/, stack);
    assert.match(r.stderr, /first release.*no What's New/i, stack);
    assert.match(r.stderr, /SUBMIT IOS/, stack);
  }
});

test("release-stores.sh stops before touching the version when it cannot read what is on sale", () => {
  const r = releaseStores()({ ON_SALE_FAIL: "1" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /could not read/);
  assert.doesNotMatch(r.stderr, /EDITABLE|ATTACH|WHATSNEW|SUBMIT/);
});

// first-release-check.sh against stubbed store reads, like release-check.sh: lib/asc.sh and
// lib/play.sh are replaced by functions answering from environment variables.
const firstReleaseCheck = (config = 'LANES="ios mac android"') => {
  const dir = tmp("first-release-check-");
  const dist = join(dir, "distribution");
  mkdirSync(join(dist, "store/apple"), { recursive: true });
  execFileSync("cp", ["-R", join(root, "stacks/common/distribution/lib"), join(dist, "lib")]);
  execFileSync("cp", [join(root, "stacks/kmp/distribution/first-release-check.sh"), join(dist, "/")]);
  writeFileSync(join(dist, "config.sh"), `${config}\nLOCALES="en-US de-DE"\nASC_APP_ID=1\nASC_KEY_ID=k\nASC_ISSUER_ID=i\nPLAY_PACKAGE_NAME=p\n`);
  writeFileSync(join(dist, "lib/asc.sh"), `asc_get() {
  [ "\${ASC_FAIL:-}" = "$1" ] && { echo "HTTP 500 from App Store Connect" >&2; return 1; }
  case "$1" in
    /apps/1) printf '%s' "$APP" ;;
    /apps/1/appInfos) printf '%s' "$INFOS" ;;
    /appInfos/info-1/primaryCategory) printf '%s' "$CATEGORY" ;;
    /appInfos/info-1/ageRatingDeclaration) printf '%s' "$AGE" ;;
    /apps/1/appPriceSchedule) printf '%s' "$PRICE" ;;
    /apps/1/appAvailabilityV2) printf '%s' "$AVAILABILITY" ;;
    /apps/1/appStoreVersions) case "$2" in *MAC_OS*) printf '%s' "$VERSIONS_MAC" ;; *) printf '%s' "$VERSIONS_IOS" ;; esac ;;
    /apps/1/subscriptionGroups) printf '%s' "$SUBSCRIPTIONS" ;;
    /apps/1/inAppPurchasesV2) printf '%s' "$PURCHASES" ;;
    /builds) case "$2" in *MAC_OS*) printf '%s' "\${BUILDS_MAC:-}" ;; *) printf '%s' "\${BUILDS_IOS:-}" ;; esac ;;
    *) echo "unexpected GET $1" >&2; return 1 ;;
  esac
}
asc_post() { echo "WRITE" >&2; }; asc_patch() { echo "WRITE" >&2; }; asc_delete() { echo "WRITE" >&2; }
`);
  writeFileSync(join(dist, "lib/play.sh"), `play_edit_open() { [ "\${PLAY_FAIL:-}" = open ] && die "HTTP 403 — grant the service account access"; echo edit-1; }
play_edit_delete() { echo "DISCARD $1" >&2; }
play_edit_commit() { echo "WRITE" >&2; }
play_api() {
  [ "$1" = GET ] || { echo "WRITE" >&2; return 1; }
  [ "\${PLAY_FAIL:-}" = "$2" ] && { echo "HTTP 500" >&2; return 1; }
  case "$2" in */details) printf '%s' "$DETAILS" ;; */listings) printf '%s' "$LISTINGS" ;; *) echo "unexpected GET $2" >&2; return 1 ;; esac
}
`);
  const versions = (...list) => JSON.stringify({ data: list.map(([versionString, appStoreState], i) => ({ id: `v${i}`, attributes: { versionString, appStoreState } })) });
  const ready = {
    APP: JSON.stringify({ data: { id: "1", attributes: { name: "Demo", bundleId: "org.example.demo", contentRightsDeclaration: "DOES_NOT_USE_THIRD_PARTY_CONTENT" } } }),
    INFOS: JSON.stringify({ data: [{ id: "info-1", attributes: { appStoreState: "PREPARE_FOR_SUBMISSION" } }] }),
    CATEGORY: JSON.stringify({ data: { type: "appCategories", id: "EDUCATION" } }),
    AGE: JSON.stringify({ data: { id: "age-1", attributes: { violenceRealistic: "NONE", gambling: false, kidsAgeBand: null, ageRatingOverride: null } } }),
    PRICE: JSON.stringify({ data: { id: "1" }, included: [{ type: "appPrices", id: "p1" }] }),
    AVAILABILITY: JSON.stringify({ data: { id: "1", attributes: { availableInNewTerritories: true } } }),
    VERSIONS_IOS: versions(["1.0.0", "PREPARE_FOR_SUBMISSION"]),
    VERSIONS_MAC: versions(),
    SUBSCRIPTIONS: JSON.stringify({ data: [] }),
    PURCHASES: JSON.stringify({ data: [] }),
    BUILDS_IOS: JSON.stringify({ data: [{ id: "b1", attributes: { version: "41", usesNonExemptEncryption: false } }] }),
    BUILDS_MAC: JSON.stringify({ data: [{ id: "b2", attributes: { version: "41", usesNonExemptEncryption: false } }] }),
    DETAILS: JSON.stringify({ defaultLanguage: "en-US", contactEmail: "a@example.org", contactWebsite: "https://example.org" }),
    LISTINGS: JSON.stringify({ listings: [{ language: "en-US" }, { language: "de-DE" }] }),
  };
  const run = (over = {}, args = ["--version", "1.0.0"]) => spawnSync("bash", [join(dist, "first-release-check.sh"), ...args], { encoding: "utf8", env: { ...process.env, ...ready, ...over } });
  return { dist, versions, run };
};

test("first-release-check.sh marks every readable gate ✓, every web-only gate ?, and exits 0 when nothing is ✗", () => {
  const r = firstReleaseCheck().run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const line of [
    /^apple ✓ app record: Demo \(org\.example\.demo\)$/m,
    /^apple ✓ content rights: DOES_NOT_USE_THIRD_PARTY_CONTENT$/m,
    /^apple ✓ category: EDUCATION$/m,
    /^apple ✓ age rating: every question answered$/m,
    /^apple ✓ price: set$/m,
    /^apple ✓ availability: set$/m,
    /^ios ✓ version: the editable version is 1\.0\.0$/m,
    /^mac ✓ version: none editable yet; push-store-metadata\.sh --version 1\.0\.0 creates it$/m,
    /^apple ✓ in-app purchases: none waiting for a first review$/m,
    /^apple ✓ subscriptions: none$/m,
    /^apple \? App Privacy: /m,
    /^android ✓ defaultLanguage: en-US$/m,
    /^android ✓ contact: a@example\.org, https:\/\/example\.org$/m,
    /^android ✓ listings: en-US de-DE$/m,
    /^android \? Data safety: /m,
    /^android \? content rating: /m,
    /^android \? app access: /m,
    /^android \? ads: /m,
  ]) assert.match(r.stdout, line);
  assert.doesNotMatch(r.stdout, / ✗ /);
  assert.doesNotMatch(r.stderr, /WRITE/, "it only reads");
  assert.match(r.stderr, /DISCARD edit-1/, "the read-only Play edit is discarded");
});

test("first-release-check.sh marks what the stores lack ✗ and exits 1", () => {
  const frc = firstReleaseCheck();
  const r = frc.run({
    APP: JSON.stringify({ data: { id: "1", attributes: { name: "Demo", bundleId: "org.example.demo", contentRightsDeclaration: null } } }),
    CATEGORY: JSON.stringify({ data: null }),
    AGE: JSON.stringify({ data: { id: "age-1", attributes: { violenceRealistic: null, gambling: null, kidsAgeBand: null } } }),
    PRICE: JSON.stringify({ data: { id: "1" }, included: [] }),
    VERSIONS_IOS: frc.versions(["1.0", "PREPARE_FOR_SUBMISSION"]),
    PURCHASES: JSON.stringify({ data: [{ id: "iap-1", attributes: { productId: "org.example.demo.pro", state: "MISSING_METADATA" } }] }),
    SUBSCRIPTIONS: JSON.stringify({ data: [{ id: "g1" }], included: [{ type: "subscriptions", id: "s1", attributes: { productId: "org.example.demo.monthly", state: "MISSING_METADATA" } }] }),
    DETAILS: JSON.stringify({ defaultLanguage: "", contactEmail: "", contactWebsite: "" }),
    LISTINGS: JSON.stringify({ listings: [{ language: "en-US" }] }),
  });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  for (const line of [
    /^apple ✗ content rights: not declared/m,
    /^apple ✗ category: none/m,
    /^apple ✗ age rating: 2 questions unanswered: gambling, violenceRealistic/m,
    /^apple ✗ price: none/m,
    /^ios ✗ version: the editable version is 1\.0, the build is 1\.0\.0; .*ASC29/m,
    /^apple ✗ in-app purchases: org\.example\.demo\.pro is incomplete \(MISSING_METADATA\)/m,
    /^apple ✗ subscriptions: org\.example\.demo\.monthly is incomplete \(MISSING_METADATA\)/m,
    /^apple ✗ EULA link: no store\/apple\/en-US\.json/m,
    /^android ✗ defaultLanguage: not set/m,
    /^android ✗ contact: /m,
    /^android ✗ listings: none for de-DE/m,
  ]) assert.match(r.stdout, line);
});

test("first-release-check.sh checks the EULA link in each description only when a subscription is sold (ASC25)", () => {
  const frc = firstReleaseCheck();
  const sold = { SUBSCRIPTIONS: JSON.stringify({ data: [{ id: "g1" }], included: [{ type: "subscriptions", id: "s1", attributes: { productId: "org.example.demo.monthly", state: "APPROVED" } }] }) };
  writeFileSync(join(frc.dist, "store/apple/en-US.json"), JSON.stringify({ description: "Practice daily.\n\nTerms of Use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" }));
  writeFileSync(join(frc.dist, "store/apple/de-DE.json"), JSON.stringify({ description: "Täglich üben." }));
  let r = frc.run(sold);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^apple ✓ subscriptions: 1 sold, none waiting for a first review$/m);
  assert.match(r.stdout, /^apple ✓ EULA link: en-US$/m);
  assert.match(r.stdout, /^apple ✗ EULA link: none in the de-DE description \(ASC25\)/m);
  r = frc.run();
  assert.doesNotMatch(r.stdout, /EULA link/);
});

test("first-release-check.sh exits 3 when a store cannot be read, and 2 without a store lane", () => {
  const frc = firstReleaseCheck();
  for (const over of [{ ASC_FAIL: "/apps/1" }, { ASC_FAIL: "/apps/1/appStoreVersions" }, { PLAY_FAIL: "open" }, { PLAY_FAIL: "/edits/edit-1/details" }]) {
    const r = frc.run(over);
    assert.equal(r.status, 3, `${JSON.stringify(over)}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /could not read/);
  }
  // a gate whose own read fails is '?', never a guessed ✓ or ✗
  const r = frc.run({ ASC_FAIL: "/apps/1/appPriceSchedule" });
  assert.match(r.stdout, /^apple \? price: could not be read/m);
  const none = firstReleaseCheck('LANES="docker"').run();
  assert.equal(none.status, 2);
  assert.match(none.stderr, /ships neither an Apple nor a Play lane/);
  const help = spawnSync("bash", [join(frc.dist, "first-release-check.sh"), "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stderr, /first-release-check\.sh \[--apple\] \[--play\] \[--version X\.Y\.Z\]/);
});

// --- fix round 1: products waiting for their first review are a hand-over (ASC24), a removed
// app is not a first release, the other editable version stops before the question, and
// defaultLanguage is chosen, never derived (GP2).

test("first-release-check.sh hands products waiting for their first review over as ?, naming Add for Review (ASC24)", () => {
  const r = firstReleaseCheck().run({
    PURCHASES: JSON.stringify({ data: [{ id: "iap-1", attributes: { productId: "org.example.demo.pro", state: "READY_TO_SUBMIT" } }] }),
    SUBSCRIPTIONS: JSON.stringify({ data: [{ id: "g1" }], included: [{ type: "subscriptions", id: "s1", attributes: { productId: "org.example.demo.monthly", state: "READY_TO_SUBMIT" } }] }),
  });
  assert.match(r.stdout, /^apple \? in-app purchases: org\.example\.demo\.pro waits for a first review: .*--no-submit.*Add for Review.*\(ASC24\)/m);
  assert.match(r.stdout, /^apple \? subscriptions: org\.example\.demo\.monthly waits for a first review: .*--no-submit.*Add for Review/m);
});

test("first-release-check.sh accepts a localized Terms of Use link, and still marks a description without one ✗", () => {
  const frc = firstReleaseCheck();
  writeFileSync(join(frc.dist, "store/apple/en-US.json"), JSON.stringify({ description: "EULA: https://example.org/eula" }));
  writeFileSync(join(frc.dist, "store/apple/de-DE.json"), JSON.stringify({ description: "Nutzungsbedingungen: https://example.org/de/agb" }));
  const sold = { SUBSCRIPTIONS: JSON.stringify({ data: [{ id: "g1" }], included: [{ type: "subscriptions", id: "s1", attributes: { productId: "m", state: "APPROVED" } }] }) };
  let r = frc.run(sold);
  assert.match(r.stdout, /^apple ✓ EULA link: en-US de-DE$/m);
  writeFileSync(join(frc.dist, "store/apple/de-DE.json"), JSON.stringify({ description: "Nutzungsbedingungen gelten." }));
  r = frc.run(sold);
  assert.match(r.stdout, /^apple ✗ EULA link: none in the de-DE description/m);
});

test("an app removed from sale is not a first release: asc_version_on_sale, release-check.sh and first-release-check.sh agree on the shipped states", () => {
  const removed = JSON.stringify({ data: [{ id: "v1", attributes: { platform: "IOS", versionString: "1.2.0", appVersionState: "DEVELOPER_REMOVED_FROM_SALE" } }, { id: "v2", attributes: { platform: "IOS", versionString: "1.1.0", appStoreState: "REPLACED_WITH_NEW_VERSION" } }] });
  let r = sh(`${asc} asc_get() { printf '%s' '${removed}'; }; ASC_APP_ID=1 asc_version_on_sale IOS`);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "1.2.0\n");

  const rc = releaseCheck();
  r = rc.run({ VERSIONS: removed, BUILDS_IOS: rc.build("1.2.0", "41"), BUILDS_MAC_OS: rc.build("1.2.0", "41") });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^ios: tested 1\.2\.0 \(41\), on sale 1\.2\.0 — not newer$/m);

  const frc = firstReleaseCheck();
  r = frc.run({ VERSIONS_IOS: removed });
  assert.match(r.stdout, /^ios ✓ on sale: 1\.2\.0/m);

  // one vocabulary: every script that inlines the states names exactly asc.sh's
  const states = /^ASC_SHIPPED_STATES="([^"]+)"/m.exec(readFileSync(lib("asc.sh"), "utf8"))[1].split(" ").sort();
  for (const f of ["release-check.sh", "first-release-check.sh"]) {
    const text = readFileSync(join(root, "stacks/kmp/distribution", f), "utf8");
    const inline = /shipped = \{([^}]+)\}/.exec(text)?.[1].match(/[A-Z_]+/g).sort();
    assert.deepEqual(inline, states, f);
  }
});

test("release-stores.sh --no-submit attaches the build, sets What's New where allowed and prepares the open submission, but does not submit it; Play is unaffected", () => {
  let r = releaseStores()({ ON_SALE: "1.2.0", EXTRA: "--no-submit" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /ATTACH version-1 build-1/);
  assert.match(r.stderr, /WHATSNEW version-1 en-US/);
  assert.match(r.stderr, /PREPARE IOS/, "the open submission Add for Review joins must exist (ASC24)");
  assert.doesNotMatch(r.stderr, /SUBMIT/);
  assert.match(r.stderr, /not submitted.*Add for Review/);
  r = releaseStores()({ ON_SALE: "", EXTRA: "--no-submit" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /PREPARE IOS/);
  assert.doesNotMatch(r.stderr, /WHATSNEW|SUBMIT/);

  const play = releaseStores("kmp", { lanes: "android", args: ["--play"] });
  r = play({ EXTRA: "--no-submit" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /PROMOTE internal production/);
  assert.match(r.stderr, /VERIFY production 41/);
});

test("push-store-metadata.sh stops, even on --dry-run, when an editable Apple version with another number exists (ASC29)", () => {
  const fn = ensureAppleVersionFn();
  for (const dry of ["", "--dry-run"]) {
    const r = spawnSync("bash", ["-c", `
      set -euo pipefail; CONFIG_FILE=/dev/null
      . '${lib("common.sh")}'
      asc_version_exists() { return 1; }
      asc_version_editable() { if [ -z "\${2:-}" ]; then echo other-id; else echo "CREATE $1 $2" >&2; echo fake-id; fi; }
      asc_version_in_submission() { :; }; asc_version_editable_string() { echo 1.0; }
      ${fn}
      ensure_apple_version IOS
    `], { encoding: "utf8", env: { ...process.env, version: "1.0.0", dry, ASSUME_YES: "1" } });
    assert.notEqual(r.status, 0, `${dry}: ${r.stderr}`);
    assert.match(r.stderr, /another editable IOS version.*ASC29/);
    assert.doesNotMatch(r.stderr, /CREATE/);
  }
});

test("play_listing.py's template leaves defaultLanguage empty: it is chosen, never derived (GP2)", () => {
  const dir = tmp("play-template-");
  const r = spawnSync("python3", [lib("play_listing.py"), "--dry-run"], { encoding: "utf8", env: { ...process.env, PLAY_PACKAGE_NAME: "p", STORE_DIR: dir, LOCALES: "de-DE en-US" } });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  const listing = JSON.parse(readFileSync(join(dir, "play/listing.json"), "utf8"));
  assert.equal(listing.defaultLanguage, "");
  assert.deepEqual(Object.keys(listing.listings), ["de-DE", "en-US"]);
});

// asc_review_prepare against a stubbed HTTP layer: every write is logged, so the test sees
// exactly which submission calls go out — and that none of them marks it submitted.
const reviewCalls = (fn, submissions, items = []) => {
  const r = sh(`${asc}
    asc_version_editable() { echo version-1; }
    asc_get() {
      echo "GET $1" >&2
      case "$1" in
        /appStoreVersions/version-1/build) printf '%s' '{"data":{"attributes":{"version":"41"}}}' ;;
        /reviewSubmissions) printf '%s' '${JSON.stringify({ data: submissions })}' ;;
        */items) printf '%s' '${JSON.stringify({ data: items })}' ;;
        */subscriptionGroups) printf '%s' '{"data":[],"included":[]}' ;;
      esac
    }
    asc_post() { echo "POST $1" >&2; printf '%s' '{"data":{"id":"submission-new"}}'; }
    asc_patch() { echo "PATCH $1 $2" >&2; printf '%s' '{"data":{"attributes":{"state":"WAITING_FOR_REVIEW"}}}'; }
    ASC_APP_ID=1 ${fn} IOS 1.3.0`);
  return { ...r, writes: r.stderr.split("\n").filter((l) => /^(POST|PATCH) /.test(l)) };
};

test("asc_review_prepare creates the submission and adds the version, and never marks it submitted", () => {
  const r = reviewCalls("asc_review_prepare", []);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "submission-new");
  assert.deepEqual(r.writes, ["POST /reviewSubmissions", "POST /reviewSubmissionItems"]);
  assert.doesNotMatch(r.stderr, /submitted/);
});

test("asc_review_prepare reuses an open submission that already holds the version: no second submission, no second item (ASC31)", () => {
  const open = [{ id: "submission-open", attributes: { state: "READY_FOR_REVIEW" } }];
  const r = reviewCalls("asc_review_prepare", open, [{ relationships: { appStoreVersion: { data: { id: "version-1" } } } }]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "submission-open");
  assert.deepEqual(r.writes, []);
});

test("asc_review_submit makes the same calls as before: prepare, then the submitted PATCH", () => {
  const r = reviewCalls("asc_review_submit", []);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.writes.length, 3, r.stderr);
  assert.deepEqual(r.writes.slice(0, 2), ["POST /reviewSubmissions", "POST /reviewSubmissionItems"]);
  assert.match(r.writes[2], /^PATCH \/reviewSubmissions\/submission-new .*"submitted":true/);
});

test("asc_review_prepare refuses, writing nothing, when the version already sits in a submission in review (a re-run after Add for Review)", () => {
  for (const state of ["WAITING_FOR_REVIEW", "IN_REVIEW"]) {
    const r = reviewCalls("asc_review_prepare", [{ id: "submission-sent", attributes: { state } }], [{ relationships: { appStoreVersion: { data: { id: "version-1" } } } }]);
    assert.notEqual(r.status, 0, state);
    assert.match(r.stderr, /already submitted; nothing to prepare/, state);
    assert.deepEqual(r.writes, [], state);
  }
  // a submission in review that holds another version is no reason to stop
  const other = reviewCalls("asc_review_prepare", [{ id: "submission-sent", attributes: { state: "IN_REVIEW" } }], [{ relationships: { appStoreVersion: { data: { id: "version-0" } } } }]);
  assert.equal(other.status, 0, other.stderr);
  assert.deepEqual(other.writes, ["POST /reviewSubmissions", "POST /reviewSubmissionItems"]);
});

// ensure_profile's install step once read the profile JSON from a pipe while its Python script
// came from a heredoc; the heredoc took stdin, json.load saw EOF, and every run with an existing
// profile died with JSONDecodeError. The JSON is an argument now, never stdin.
test("xcode_profile_install writes the profile as <uuid>.<extension> into both directories", () => {
  const home = mkdtempSync(join(tmpdir(), "karto-profile-"));
  try {
    const content = Buffer.from("fake profile bytes");
    const answer = JSON.stringify({ data: { attributes: {
      name: "Demo Mac App Store", profileState: "ACTIVE", expirationDate: "2027-09-25T10:00:00.000+0000",
      uuid: "1234ABCD-0000-4000-8000-00000000BEEF", profileContent: content.toString("base64"),
    } } });
    const run = (call) => sh(`. '${lib("xcode.sh")}'; ${call}`, { HOME: home, ANSWER: answer });
    const r = run(`xcode_profile_install provisionprofile "$ANSWER"`);
    assert.equal(r.status, 0, r.stderr);
    for (const dir of ["Library/MobileDevice/Provisioning Profiles", "Library/Developer/Xcode/UserData/Provisioning Profiles"]) {
      const file = join(home, dir, "1234ABCD-0000-4000-8000-00000000BEEF.provisionprofile");
      assert.ok(existsSync(file), `missing ${file}`);
      assert.deepEqual(readFileSync(file), content);
    }
    assert.match(r.stderr, /name=Demo Mac App Store {2}state=ACTIVE {2}expires=2027-09-25/);
    // The answer arriving on stdin as well must not matter: the old piped-heredoc shape failed exactly here.
    const piped = run(`printf '%s' "$ANSWER" | xcode_profile_install mobileprovision "$ANSWER"`);
    assert.equal(piped.status, 0, piped.stderr);
    assert.ok(existsSync(join(home, "Library/MobileDevice/Provisioning Profiles", "1234ABCD-0000-4000-8000-00000000BEEF.mobileprovision")));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// --- Beatrep's first App Store release (2026-09): ASC8, ASC11, ASC20, ASC27, ASC29, ASC31,
// ASC36, ASC37, ASC38. Every store call is stubbed; nothing reaches App Store Connect.

// curl replaced by a function: the real _asc_request runs, and the answer per "METHOD path"
// comes from the environment (BODY_<n>/CODE_<n> matched against ROUTE_<n>).
const curlStub = String.raw`asc_token() { echo token; }
curl() {
  local m="" u="" prev="" a route
  for a in "$@"; do [ "$prev" = -X ] && m="$a"; case "$a" in http*) u="$a" ;; esac; prev="$a"; done
  u="$(printf '%s' "$u" | sed -e 's#^https://api.appstoreconnect.apple.com/v1##' -e 's#[?].*##')"
  echo "CALL $m $u" >&2
  for route in 1 2 3; do
    if [ -n "$(printenv ROUTE_$route)" ] && [ "$m $u" = "$(printenv ROUTE_$route)" ]; then
      printf '%s\n%s' "$(printenv BODY_$route)" "$(printenv CODE_$route)"; return 0
    fi
  done
  printf '%s\n%s' '{"errors":[{"title":"not stubbed","detail":"no route"}]}' 404
}`;

test("an API refusal prints every associated error's code and detail, not only the top-level detail (ASC20)", () => {
  const refusal = JSON.stringify({ errors: [{ status: "409", code: "STATE_ERROR.ENTITY_STATE_INVALID", title: "The request cannot be fulfilled.", detail: "This resource cannot be reviewed, please check associated errors to see why.",
    meta: { associatedErrors: {
      "/v1/appStoreVersions/v-ios": [{ code: "STATE_ERROR.APP_DATA_USAGES_REQUIRED", detail: "You must provide App Privacy details." },
                                     { code: "STATE_ERROR.CANNOT_SUBMIT_MISSING_REGULATED_MEDICAL_DEVICE_APP_DECLARATION", detail: "Declare whether the app is a regulated medical device." }],
      "/v1/builds/b-mac": [{ code: "ENTITY_ERROR.ATTRIBUTE.REQUIRED", detail: "usesNonExemptEncryption is required." }] } } }] });
  let r = sh(`${asc} ${curlStub}; asc_post /reviewSubmissionItems '{}'`, { ROUTE_1: "POST /reviewSubmissionItems", BODY_1: refusal, CODE_1: "409" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /This resource cannot be reviewed/);
  assert.match(r.stderr, /\/v1\/appStoreVersions\/v-ios/);
  assert.match(r.stderr, /STATE_ERROR\.APP_DATA_USAGES_REQUIRED: You must provide App Privacy details\./);
  assert.match(r.stderr, /STATE_ERROR\.CANNOT_SUBMIT_MISSING_REGULATED_MEDICAL_DEVICE_APP_DECLARATION: Declare whether/);
  assert.match(r.stderr, /\/v1\/builds\/b-mac/);
  assert.match(r.stderr, /ENTITY_ERROR\.ATTRIBUTE\.REQUIRED: usesNonExemptEncryption is required\./);

  // no associated errors listed: then, and only then, the version page is the place to look
  const bare = JSON.stringify({ errors: [{ status: "409", title: "The request cannot be fulfilled.", detail: "This resource cannot be reviewed, please check associated errors to see why." }] });
  r = sh(`${asc} ${curlStub}; asc_post /reviewSubmissionItems '{}'`, { ROUTE_1: "POST /reviewSubmissionItems", BODY_1: bare, CODE_1: "409" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /no associated errors listed.*version page.*ASC20/);
});

test("asc_version_attach reports a locked version's 409 as 'left alone', and still fails on any other refusal (ASC27)", () => {
  const conflict = JSON.stringify({ errors: [{ status: "409", title: "The request cannot be fulfilled.", detail: "The build cannot be changed." }] });
  const version = (state) => JSON.stringify({ data: { id: "v1", attributes: { versionString: "1.0.0", appVersionState: state } } });
  for (const state of ["READY_FOR_REVIEW", "WAITING_FOR_REVIEW", "IN_REVIEW"]) {
    const r = sh(`${asc} ${curlStub}; asc_version_attach v1 b1`, { ROUTE_1: "PATCH /appStoreVersions/v1/relationships/build", BODY_1: conflict, CODE_1: "409", ROUTE_2: "GET /appStoreVersions/v1", BODY_2: version(state), CODE_2: "200" });
    assert.equal(r.status, 0, `${state}: ${r.stderr}`);
    assert.match(r.stderr, new RegExp(`${state}.*left alone.*ASC27`), state);
  }
  // an editable version that refuses the build is a real failure (a number mismatch, ASC29)
  let r = sh(`${asc} ${curlStub}; asc_version_attach v1 b1`, { ROUTE_1: "PATCH /appStoreVersions/v1/relationships/build", BODY_1: conflict, CODE_1: "409", ROUTE_2: "GET /appStoreVersions/v1", BODY_2: version("PREPARE_FOR_SUBMISSION"), CODE_2: "200" });
  assert.notEqual(r.status, 0);
  assert.doesNotMatch(r.stderr, /left alone/);
  // anything but a 409 never asks about the state
  r = sh(`${asc} ${curlStub}; asc_version_attach v1 b1`, { ROUTE_1: "PATCH /appStoreVersions/v1/relationships/build", BODY_1: conflict, CODE_1: "500" });
  assert.notEqual(r.status, 0);
  assert.doesNotMatch(r.stderr, /CALL GET/);
  // success is unchanged
  r = sh(`${asc} ${curlStub}; asc_version_attach v1 b1`, { ROUTE_1: "PATCH /appStoreVersions/v1/relationships/build", BODY_1: "{}", CODE_1: "204" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /build b1 attached to version v1/);
});

const versionsJson = (...list) => JSON.stringify({ data: list.map(([versionString, state, key = "appStoreState"], i) => ({ id: `v${i}`, attributes: { platform: "IOS", versionString, [key]: state } })) });

test("asc_version_in_submission prints the state of the version that already sits in a review submission, nothing otherwise (ASC31)", () => {
  const stub = (json) => `asc_get() { printf '%s' '${json}'; }`;
  for (const state of ["READY_FOR_REVIEW", "WAITING_FOR_REVIEW", "IN_REVIEW"]) {
    const r = sh(`${asc} ${stub(versionsJson(["1.0.0", state, "appVersionState"]))}; ASC_APP_ID=1 asc_version_in_submission IOS 1.0.0`);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, `${state}\n`);
  }
  let r = sh(`${asc} ${stub(versionsJson(["1.0.0", "PREPARE_FOR_SUBMISSION"]))}; ASC_APP_ID=1 asc_version_in_submission IOS 1.0.0`);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "");
  r = sh(`${asc} ${stub(versionsJson(["0.9.0", "WAITING_FOR_REVIEW"]))}; ASC_APP_ID=1 asc_version_in_submission IOS 1.0.0`);
  assert.equal(r.stdout, "");
  r = sh(`${asc} asc_get() { echo "HTTP 500" >&2; return 1; }; ASC_APP_ID=1 asc_version_in_submission IOS 1.0.0`);
  assert.notEqual(r.status, 0);
});

test("release-stores.sh counts a version already in a review submission as done and goes on with the next platform (ASC31)", () => {
  for (const state of ["READY_FOR_REVIEW", "WAITING_FOR_REVIEW"]) {
    const r = releaseStores("kmp", { lanes: "ios mac" })({ ON_SALE: "", EXTRA: "--no-submit", IN_SUBMISSION_IOS: state });
    assert.equal(r.status, 0, `${state}: ${r.stderr}`);
    assert.match(r.stderr, new RegExp(`IOS.*1\\.3\\.0.*already in a review submission \\(${state}\\)`), state);
    assert.doesNotMatch(r.stderr, /EDITABLE IOS|PREPARE IOS/, state);
    assert.match(r.stderr, /EDITABLE MAC_OS 1\.3\.0/, state);
    assert.match(r.stderr, /PREPARE MAC_OS/, state);
  }
  // it reads before it writes: an unreadable state stops before anything is attached
  const r = releaseStores("kmp", { lanes: "ios mac" })({ ON_SALE: "", IN_SUBMISSION_FAIL: "1" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /could not read/);
  assert.doesNotMatch(r.stderr, /EDITABLE|ATTACH|SUBMIT|PREPARE/);
});

// ensure_apple_version on the real asc.sh, only asc_get stubbed: the shape Beatrep met.
const ensureReal = (json, env = {}) => spawnSync("bash", ["-c", `
    set -euo pipefail; CONFIG_FILE=/dev/null
    . '${lib("common.sh")}'; . '${lib("asc.sh")}'
    asc_get() { [ "\${READ_FAIL:-}" = 1 ] && { echo "HTTP 500" >&2; return 1; }; printf '%s' "$VERSIONS"; }
    asc_post() { echo "CREATE $1" >&2; printf '%s' '{"data":{"id":"new"}}'; }
    ${ensureAppleVersionFn()}
    ensure_apple_version IOS
  `], { encoding: "utf8", env: { ...process.env, ASC_APP_ID: "1", version: "1.0.0", dry: "--dry-run", VERSIONS: json, ...env } });

test("push-store-metadata.sh --dry-run --version names the other editable version and the build's number, and never says 'would create' beside it (ASC29)", () => {
  for (const key of ["appStoreState", "appVersionState"]) {
    const r = ensureReal(versionsJson(["1.0", "PREPARE_FOR_SUBMISSION", key]));
    assert.notEqual(r.status, 0, `${key}: ${r.stderr}`);
    assert.match(r.stderr, /editable IOS version is 1\.0, the build is 1\.0\.0.*ASC29/, key);
    assert.doesNotMatch(r.stderr, /would create|CREATE/, key);
  }
  // an unreadable store is no licence to create: it stops, naming the read
  const r = ensureReal(versionsJson(), { READ_FAIL: "1" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /could not read the IOS App Store versions/);
  assert.doesNotMatch(r.stderr, /would create|CREATE/);
  // nothing editable at all: the dry run still says what it would create
  const none = ensureReal(versionsJson(["0.9.0", "READY_FOR_SALE"]));
  assert.equal(none.status, 0, none.stderr);
  assert.match(none.stderr, /would create the editable IOS version 1\.0\.0/);
});

test("push-store-metadata.sh --version creates nothing for a version already in a review submission (ASC31)", () => {
  for (const dry of ["", "--dry-run"]) {
    const r = ensureReal(versionsJson(["1.0.0", "READY_FOR_REVIEW", "appVersionState"]), { dry, ASSUME_YES: "1" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /IOS version 1\.0\.0 is already in a review submission \(READY_FOR_REVIEW\)/);
    assert.doesNotMatch(r.stderr, /would create|CREATE/);
  }
});

test("first-release-check.sh leaves gracRatingClassificationNumber null for an app that is not a game (ASC11)", () => {
  const r = firstReleaseCheck().run({ AGE: JSON.stringify({ data: { id: "age-1", attributes: { violenceRealistic: "NONE", gambling: false, gracRatingClassificationNumber: null, koreaAgeRatingOverride: null } } }) });
  assert.match(r.stdout, /^apple ✓ age rating: every question answered$/m, r.stdout);
});

test("first-release-check.sh hands over the EU medical-device declaration (ASC37) and a first subscription's group Add for Review (ASC36)", () => {
  let r = firstReleaseCheck().run();
  assert.match(r.stdout, /^apple \? medical device: web only — .*regulated medical device.*App Information.*\(ASC37\)$/m);
  r = firstReleaseCheck().run({
    SUBSCRIPTIONS: JSON.stringify({ data: [{ id: "g1" }], included: [{ type: "subscriptions", id: "s1", attributes: { productId: "org.example.demo.monthly", state: "READY_TO_SUBMIT" } }] }),
  });
  assert.match(r.stdout, /^apple \? subscriptions: .*group's own Add for Review.*every locale.*\(ASC36\)/m);
});

test("first-release-check.sh gates export compliance per platform on the build's own declaration (ASC8)", () => {
  const build = (value) => JSON.stringify({ data: [{ id: "b1", attributes: { version: "41", usesNonExemptEncryption: value } }] });
  const frc = firstReleaseCheck();
  let r = frc.run({ BUILDS_IOS: build(false), BUILDS_MAC: build(null) });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^ios ✓ export compliance: build 41 declares it$/m);
  assert.match(r.stdout, /^mac ✗ export compliance: build 41 declares none .*ITSAppUsesNonExemptEncryption.*mac target.*\(ASC8\)/m);
  assert.doesNotMatch(r.stderr, /WRITE/, "it only reads; setting it is not a check's to do");
  r = frc.run({ BUILDS_IOS: build(true), BUILDS_MAC: JSON.stringify({ data: [] }) });
  assert.match(r.stdout, /^ios ✓ export compliance: build 41 declares it$/m);
  assert.match(r.stdout, /^mac \? export compliance: no processed build for 1\.0\.0/m);
  r = frc.run({}, []);
  assert.match(r.stdout, /^ios \? export compliance: run with --version/m);
});

test("first-release-check.sh counts a version already in a review submission as in place, not as missing (ASC31)", () => {
  const frc = firstReleaseCheck();
  const r = frc.run({ VERSIONS_IOS: frc.versions(["1.0.0", "READY_FOR_REVIEW"]) });
  assert.match(r.stdout, /^ios ✓ version: 1\.0\.0 is already in a review submission \(READY_FOR_REVIEW\)$/m);
});

test("asc_review_cancel withdraws the platform's submission waiting for review, and only that, after confirming (ASC38)", () => {
  const run = (submissions, env = {}, input = "", patchState = "CANCELING") => sh(`${asc}
    asc_get() { echo "GET $1" >&2; printf '%s' '${JSON.stringify({ data: submissions })}'; }
    asc_patch() { echo "PATCH $1 $2" >&2; printf '%s' '{"data":{"attributes":{"state":"${patchState}"}}}'; }
    ASC_APP_ID=1 asc_review_cancel IOS`, { ...env, INPUT: input });
  const waiting = [{ id: "sub-old", attributes: { state: "COMPLETE" } }, { id: "sub-1", attributes: { state: "WAITING_FOR_REVIEW" } }];
  let r = run(waiting, { ASSUME_YES: "1" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /^PATCH \/reviewSubmissions\/sub-1 .*"canceled":\s*true/m);
  assert.match(r.stderr, /withdrawn.*CANCELING/);
  // nothing waiting for review (a draft, or one in review): nothing is written
  for (const state of ["READY_FOR_REVIEW", "IN_REVIEW", "UNRESOLVED_ISSUES"]) {
    r = run([{ id: "sub-1", attributes: { state } }], { ASSUME_YES: "1" });
    assert.notEqual(r.status, 0, state);
    assert.doesNotMatch(r.stderr, /PATCH/, state);
    assert.match(r.stderr, /no IOS submission is WAITING_FOR_REVIEW/, state);
  }
  // an outward action: without --yes, anything but the word aborts before the PATCH
  const refused = spawnSync("bash", ["-c", `set -euo pipefail; CONFIG_FILE=/dev/null; . '${lib("common.sh")}'; ${asc}
    asc_get() { printf '%s' '${JSON.stringify({ data: waiting })}'; }
    asc_patch() { echo "PATCH $1" >&2; }
    ASC_APP_ID=1 asc_review_cancel IOS`], { encoding: "utf8", input: "no\n" });
  assert.notEqual(refused.status, 0);
  assert.doesNotMatch(refused.stderr, /PATCH/);
  // the PATCH answered, but the submission did not move: say so, never claim it withdrawn
  r = run(waiting, { ASSUME_YES: "1" }, "", "WAITING_FOR_REVIEW");
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /not withdrawn/);
});

// --- review of the above: a prepared draft is still submitted by a normal run, a newer build
// never slips past a version in a submission, and export compliance says what it did (ASC8).

test("release-stores.sh submits a READY_FOR_REVIEW draft on a run without --no-submit, reusing it; WAITING_FOR_REVIEW stays done (ASC31)", () => {
  let r = releaseStores("kmp", { lanes: "ios" })({ ON_SALE: "", IN_SUBMISSION_IOS: "READY_FOR_REVIEW" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /SUBMIT IOS/);
  assert.doesNotMatch(r.stderr, /EDITABLE IOS|ATTACH/);
  r = releaseStores("kmp", { lanes: "ios" })({ ON_SALE: "", IN_SUBMISSION_IOS: "WAITING_FOR_REVIEW" });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /SUBMIT IOS|PREPARE IOS|EDITABLE IOS|ATTACH/);
  assert.match(r.stderr, /already in a review submission \(WAITING_FOR_REVIEW\)/);
});

test("release-stores.sh stops, publishing nothing, when a version in a review submission carries an older build than the newest processed one (ASC38)", () => {
  for (const [state, extra] of [["READY_FOR_REVIEW", ""], ["READY_FOR_REVIEW", "--no-submit"], ["WAITING_FOR_REVIEW", ""]]) {
    const r = releaseStores("kmp", { lanes: "ios mac" })({ ON_SALE: "", IN_SUBMISSION_IOS: state, CARRIES: "1", EXTRA: extra });
    assert.equal(r.status, 1, `${state} ${extra}: ${r.stderr}`);
    assert.match(r.stderr, /build 27 is attached, the newest is 28/);
    assert.match(r.stderr, /withdraw it \(ASC38\) or remove it from the draft.*nothing was published/);
    assert.doesNotMatch(r.stderr, /SUBMIT|PREPARE|ATTACH|EDITABLE/);
  }
});

test("asc_version_carries compares the version's attached build with the newest one, naming both numbers", () => {
  const run = (attached) => sh(`${asc}
    asc_get() {
      case "$1" in
        /apps/1/appStoreVersions) printf '%s' '${versionsJson(["1.0.0", "READY_FOR_REVIEW", "appVersionState"])}' ;;
        /appStoreVersions/v0/build) printf '%s' '${JSON.stringify({ data: attached })}' ;;
        /builds/b28) printf '%s' '{"data":{"id":"b28","attributes":{"version":"28"}}}' ;;
        *) return 1 ;;
      esac
    }
    ASC_APP_ID=1 asc_version_carries IOS 1.0.0 b28`);
  let r = run({ id: "b28", attributes: { version: "28" } });
  assert.equal(r.status, 0, r.stderr);
  r = run({ id: "b27", attributes: { version: "27" } });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /build 27 is attached, the newest is 28/);
  r = run(null);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /no build is attached, the newest is 28/);
  r = sh(`${asc} asc_get() { return 1; }; ASC_APP_ID=1 asc_version_carries IOS 1.0.0 b28`);
  assert.equal(r.status, 2);
});

test("asc_review_submit takes the READY_FOR_REVIEW version of the open draft: no new submission, no second item, then the submitted PATCH (ASC31)", () => {
  const r = sh(`${asc}
    asc_version_editable() { echo "EDITABLE" >&2; return 1; }
    asc_get() {
      case "$1" in
        /apps/1/appStoreVersions) printf '%s' '${versionsJson(["1.0.0", "READY_FOR_REVIEW", "appVersionState"])}' ;;
        /appStoreVersions/v0/build) printf '%s' '{"data":{"attributes":{"version":"28"}}}' ;;
        /reviewSubmissions) printf '%s' '{"data":[{"id":"draft-1","attributes":{"state":"READY_FOR_REVIEW"}}]}' ;;
        */items) printf '%s' '{"data":[{"relationships":{"appStoreVersion":{"data":{"id":"v0"}}}}]}' ;;
        */subscriptionGroups) printf '%s' '{"data":[],"included":[]}' ;;
      esac
    }
    asc_post() { echo "POST $1" >&2; printf '%s' '{"data":{"id":"new"}}'; }
    asc_patch() { echo "PATCH $1 $2" >&2; printf '%s' '{"data":{"attributes":{"state":"WAITING_FOR_REVIEW"}}}'; }
    ASC_APP_ID=1 asc_review_submit IOS`);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /POST|EDITABLE/);
  assert.match(r.stderr, /PATCH \/reviewSubmissions\/draft-1 .*"submitted":true/);
});

test("asc_export_compliance says what happened: a 2xx is a missing Info.plist key, only a 409 is the key, anything else is warned (ASC8)", () => {
  const run = (code) => sh(`${asc} ${curlStub}; asc_export_compliance b1 mac 28`, { ROUTE_1: "PATCH /builds/b1", BODY_1: code === "200" ? "{}" : '{"errors":[{"title":"t","detail":"d"}]}', CODE_1: code });
  let r = run("200");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /the mac target's Info\.plist lacks ITSAppUsesNonExemptEncryption; set false through the API for build 28 only — add the key to every app target \(ASC8\)/);
  r = run("409");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /already set from the Info\.plist key/);
  assert.doesNotMatch(r.stderr, /lacks/);
  r = run("500");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /export compliance not set \(HTTP 500\)/);
  assert.doesNotMatch(r.stderr, /already set/);
});

// longpath's Mac app has its own Config.xcconfig; without MAC_VERSION_FILE every release
// needed a manual Mac bump. Reads stay on VERSION_FILE; writes go to both; unset, nothing changes.
test("MAC_VERSION_FILE receives every version and build write; unset, only VERSION_FILE changes", () => {
  const dir = mkdtempSync(join(tmpdir(), "karto-macvf-"));
  try {
    const ios = join(dir, "ios.xcconfig"), mac = join(dir, "mac.xcconfig");
    const reset = () => {
      writeFileSync(ios, "MARKETING_VERSION = 1.4.0\nCURRENT_PROJECT_VERSION = 7\n");
      writeFileSync(mac, "MARKETING_VERSION = 1.3.0\nCURRENT_PROJECT_VERSION = 5\nOTHER = x\n");
    };
    const run = (call, env) => sh(`. '${lib("xcode.sh")}'; ${call}`, env);

    reset();
    let r = run(`version_write 1.5.0; build_write 8; version_files; version_read; build_read`, { VERSION_FILE: ios, MAC_VERSION_FILE: mac });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, `${ios}\n${mac}\n1.5.0\n8\n`);
    assert.equal(readFileSync(mac, "utf8"), "MARKETING_VERSION = 1.5.0\nCURRENT_PROJECT_VERSION = 8\nOTHER = x\n");
    assert.match(r.stderr, new RegExp(`version 1\\.5\\.0 written to ${ios} ${mac}`));

    for (const unset of [{}, { MAC_VERSION_FILE: "" }, { MAC_VERSION_FILE: ios }]) {
      reset();
      r = run(`version_write 1.5.0; build_write 8; version_files`, { VERSION_FILE: ios, MAC_VERSION_FILE: undefined, ...unset });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout, `${ios}\n`);
      assert.equal(readFileSync(ios, "utf8"), "MARKETING_VERSION = 1.5.0\nCURRENT_PROJECT_VERSION = 8\n");
      assert.equal(readFileSync(mac, "utf8"), "MARKETING_VERSION = 1.3.0\nCURRENT_PROJECT_VERSION = 5\nOTHER = x\n");
    }

    // a missing or YAML MAC_VERSION_FILE stops before VERSION_FILE is touched
    for (const bad of [join(dir, "absent.xcconfig"), join(dir, "project.yml")]) {
      reset();
      if (bad.endsWith(".yml")) writeFileSync(bad, "MARKETING_VERSION: \"1.0.0\"\n");
      r = run(`version_write 1.5.0`, { VERSION_FILE: ios, MAC_VERSION_FILE: bad });
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /MAC_VERSION_FILE/);
      assert.equal(readFileSync(ios, "utf8"), "MARKETING_VERSION = 1.4.0\nCURRENT_PROJECT_VERSION = 7\n");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// longpath's build.gradle.kts reads versionName/versionCode via findProperty, so the bump
// lands in gradle.properties; prepare-release.sh --tag used to commit only the build file.
test("android_version_files names the file android_version_write changes: build file, gradle.properties, or module.yaml", () => {
  const dir = mkdtempSync(join(tmpdir(), "karto-avf-"));
  try {
    const build = join(dir, "build.gradle.kts"), props = join(dir, "gradle.properties"), yaml = join(dir, "module.yaml");
    const gradle = (call) => sh(`. '${lib("gradle.sh")}'; ${call}`, { ANDROID_BUILD_FILE: build, GRADLE_DIR: dir });

    // literals: the build file only, and gradle.properties stays untouched
    writeFileSync(build, 'android {\n    defaultConfig {\n        versionCode = 3\n        versionName = "1.0.0"\n    }\n}\n');
    writeFileSync(props, "org.gradle.jvmargs=-Xmx2g\n");
    let r = gradle("android_version_write 1.1.0 4; android_version_files");
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, `${build}\n`);
    assert.match(readFileSync(build, "utf8"), /versionCode = 4\n        versionName = "1\.1\.0"/);
    assert.equal(readFileSync(props, "utf8"), "org.gradle.jvmargs=-Xmx2g\n");

    // findProperty: gradle.properties only, and the build file stays untouched
    const viaProps = 'android {\n    defaultConfig {\n        versionCode = (findProperty("app.versionCode") as String).toInt()\n        versionName = findProperty("app.versionName") as String\n    }\n}\n';
    writeFileSync(build, viaProps);
    writeFileSync(props, "app.versionName=1.0.0\napp.versionCode=3\n");
    r = gradle("android_version_write 1.1.0 4; android_version_files");
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, `${props}\n`);
    assert.equal(readFileSync(build, "utf8"), viaProps);
    assert.equal(readFileSync(props, "utf8"), "app.versionName=1.1.0\napp.versionCode=4\n");

    // one of each: both files
    writeFileSync(build, 'android {\n    defaultConfig {\n        versionCode = 3\n        versionName = findProperty("app.versionName") as String\n    }\n}\n');
    assert.equal(gradle("android_version_files").stdout, `${build}\n${props}\n`);

    // kmp-toolchain: the module.yaml holds both fields
    writeFileSync(yaml, 'settings:\n  android:\n    versionCode: 3\n    versionName: "1.0.0"\n');
    r = sh(`${toolchain} android_version_files`, { ANDROID_BUILD_FILE: yaml });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, `${yaml}\n`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("prepare-release.sh --tag commits the gradle.properties a findProperty build writes the version to", () => {
  const dir = mkdtempSync(join(tmpdir(), "karto-prt-"));
  try {
    const dist = join(dir, "distribution");
    mkdirSync(join(dist, "lib"), { recursive: true });
    for (const f of readdirSync(join(root, "stacks/common/distribution/lib"))) {
      if (f.endsWith(".sh") || f.endsWith(".py")) writeFileSync(join(dist, "lib", f), readFileSync(lib(f)));
    }
    writeFileSync(join(dist, "prepare-release.sh"), readFileSync(join(root, "stacks/kmp/distribution/prepare-release.sh")), { mode: 0o755 });
    mkdirSync(join(dir, "app"));
    const build = 'android {\n    defaultConfig {\n        versionCode = (findProperty("app.versionCode") as String).toInt()\n        versionName = findProperty("app.versionName") as String\n    }\n}\n';
    writeFileSync(join(dir, "app", "build.gradle.kts"), build);
    writeFileSync(join(dir, "gradle.properties"), "app.versionName=1.0.0\napp.versionCode=3\n");
    writeFileSync(join(dist, "config.sh"), `APP_NAME="Demo"\nSTACK="kmp"\nLANES="android"\nGRADLE_DIR="."\nANDROID_BUILD_FILE="app/build.gradle.kts"\n`);
    const git = (...a) => execFileSync("git", ["-C", dir, ...a], { encoding: "utf8" });
    git("init", "-q");
    git("-c", "user.name=t", "-c", "user.email=t@example.org", "add", "-A");
    git("-c", "user.name=t", "-c", "user.email=t@example.org", "commit", "-q", "-m", "feat: first");
    const r = spawnSync("bash", [join(dist, "prepare-release.sh"), "minor", "--tag"], {
      encoding: "utf8", cwd: dir,
      env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.org", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.org" },
    });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(git("status", "--porcelain"), "");
    assert.match(git("show", "--name-only", "--format=", "v1.1.0"), /^gradle\.properties$/m);
    assert.equal(git("show", "v1.1.0:gradle.properties"), "app.versionName=1.1.0\napp.versionCode=4\n");
    assert.equal(readFileSync(join(dir, "app", "build.gradle.kts"), "utf8"), build);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

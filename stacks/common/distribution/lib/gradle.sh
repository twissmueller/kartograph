#!/usr/bin/env bash
# Gradle: version fields, the signed release bundle, the emulator, the desktop app.
# Sourced, never executed; expects lib/common.sh to be sourced first.
# Contract: stacks/common/DISTRIBUTION.md in the Kartograph plugin.
set -euo pipefail

# ---------- running gradle ----------

# gradle_run TASK...: ./gradlew in $GRADLE_DIR. --console=plain because the rich console
# writes control characters into a log file and hides the one line that matters.
# Gradle's own output goes to stderr, so that the stdout of a function that calls this one
# carries only its result — gradle_bundle_release prints a path a caller captures.
gradle_run() {
  require_var GRADLE_DIR
  [ -x "$GRADLE_DIR/gradlew" ] || die "no executable gradlew in $GRADLE_DIR — check GRADLE_DIR in ${CONFIG_FILE:-distribution/config.sh}"
  log "gradle $*"
  ( cd "$GRADLE_DIR" && ./gradlew --console=plain "$@" ) >&2
}

# The module's directory: ":app:androidApp" → $GRADLE_DIR/app/androidApp.
_gradle_module_dir() {
  local module="${1#:}" rel
  rel="$(printf '%s' "$module" | tr ':' '/')"
  printf '%s/%s\n' "$GRADLE_DIR" "$rel"
}

# applicationId from the build file, falling back to the package Play knows.
_gradle_application_id() {
  local id=""
  if [ -f "${ANDROID_BUILD_FILE:-}" ]; then
    id="$(sed -n 's/^[[:space:]]*applicationId[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' "$ANDROID_BUILD_FILE" | head -1)"
    [ -n "$id" ] || id="$(sed -n 's/^[[:space:]]*applicationId[[:space:]]*([[:space:]]*"\([^"]*\)".*/\1/p' "$ANDROID_BUILD_FILE" | head -1)"
  fi
  [ -n "$id" ] || id="${PLAY_PACKAGE_NAME:-}"
  [ -n "$id" ] || die "no applicationId in ${ANDROID_BUILD_FILE:-the build file} and no PLAY_PACKAGE_NAME in ${CONFIG_FILE:-distribution/config.sh}"
  printf '%s\n' "$id"
}

# ---------- version fields ----------

# gradle_version_read: prints "NAME CODE" and says on stderr where the two came from.
# Two shapes are in the wild: literals in the build file (versionCode = 62), and the build
# file reading Gradle properties so an upload can override them on the command line
# (versionCode = (findProperty("app.versionCode") as String?)?.toInt() ?: 1). The second
# shape means the real numbers live in gradle.properties, not in the build file.
gradle_version_read() {
  require_var ANDROID_BUILD_FILE GRADLE_DIR
  require_cmd python3
  [ -f "$ANDROID_BUILD_FILE" ] || die "no build file at $ANDROID_BUILD_FILE — check ANDROID_BUILD_FILE in ${CONFIG_FILE:-distribution/config.sh}"
  local out name code source
  out="$(python3 - "$ANDROID_BUILD_FILE" "$GRADLE_DIR/gradle.properties" <<'PY'
import os, re, sys

build_path, props_path = sys.argv[1], sys.argv[2]
text = open(build_path, encoding="utf-8").read()


def expression(field):
    # versionName = ... | versionName("...") | versionName.set("...")
    m = re.search(r'^[ \t]*' + field + r'[ \t]*(?:=|\.set\(|\()[ \t]*(.*)$', text, re.M)
    return m.group(1).strip() if m else None


def properties(path):
    out = {}
    if os.path.isfile(path):
        with open(path, encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line or line[0] in "#!" or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                out[key.strip()] = value.strip()
    return out


props = properties(props_path)


def resolve(field, numeric):
    expr = expression(field)
    if expr is None:
        sys.exit("%s not found in %s" % (field, os.path.basename(build_path)))
    key = re.search(r'findProperty\(\s*"([^"]+)"\s*\)', expr)
    # The default (?: 1, ?: "1.0") is what Gradle uses when the property is unset.
    bare = re.sub(r'findProperty\(\s*"[^"]*"\s*\)', "", expr)
    if numeric:
        found = re.findall(r"\d+", bare)
    else:
        found = re.findall(r'"([^"]*)"', bare)
    default = found[-1] if found else None
    if key:
        name = key.group(1)
        if name in props and props[name]:
            return props[name], "gradle.properties (%s)" % name
        if default is None:
            sys.exit("%s reads the Gradle property %s, which is unset and has no default" % (field, name))
        return default, "the build-file default (%s is unset in gradle.properties)" % name
    if default is None:
        sys.exit("could not read a %s out of: %s" % (field, expr))
    return default, "the build file"


name, name_source = resolve("versionName", False)
code, code_source = resolve("versionCode", True)
if name_source == code_source:
    source = "from %s" % name_source
else:
    source = "versionName from %s, versionCode from %s" % (name_source, code_source)
print("%s\t%s\t%s" % (name, code, source))
PY
)" || die "could not read versionName and versionCode from $ANDROID_BUILD_FILE"
  IFS="$(printf '\t')" read -r name code source <<EOF
$out
EOF
  log "version $name ($code) — $source"
  printf '%s %s\n' "$name" "$code"
}

# gradle_version_write NAME CODE: rewrite the two fields in place, leaving the file
# otherwise byte-identical, so the bumped numbers land in the diff. When the build file
# reads them from Gradle properties, the properties file is what changes.
gradle_version_write() {
  local name="$1" code="$2"
  [ -n "$name" ] && [ -n "$code" ] || die "gradle_version_write needs a versionName and a versionCode"
  require_var ANDROID_BUILD_FILE GRADLE_DIR
  require_cmd python3
  [ -f "$ANDROID_BUILD_FILE" ] || die "no build file at $ANDROID_BUILD_FILE"
  python3 - "$ANDROID_BUILD_FILE" "$GRADLE_DIR/gradle.properties" "$name" "$code" <<'PY' || die "could not write versionName $name and versionCode $code"
import os, re, sys

build_path, props_path, new_name, new_code = sys.argv[1:5]
text = open(build_path, encoding="utf-8").read()


def match(field, body):
    return re.search(r'^[ \t]*' + field + r'[ \t]*(?:=|\.set\(|\()[ \t]*.*$', body, re.M)


touched_build = False
props_updates = {}

for field, value, numeric in (("versionName", new_name, False), ("versionCode", new_code, True)):
    m = match(field, text)
    if not m:
        sys.exit("%s not found in %s" % (field, os.path.basename(build_path)))
    line = m.group(0)
    key = re.search(r'findProperty\(\s*"([^"]+)"\s*\)', line)
    if key:
        props_updates[key.group(1)] = value
        continue
    pattern = r"\d+" if numeric else r'"[^"]*"'
    replacement = value if numeric else '"%s"' % value
    new_line, n = re.subn(pattern, lambda _m: replacement, line, count=1)
    if n != 1:
        sys.exit("no %s value to replace in: %s" % (field, line.strip()))
    text = text[:m.start()] + new_line + text[m.end():]
    touched_build = True

if touched_build:
    open(build_path, "w", encoding="utf-8").write(text)
    print("wrote %s %s into %s" % (new_name, new_code, os.path.basename(build_path)), file=sys.stderr)

if props_updates:
    lines = []
    if os.path.isfile(props_path):
        lines = open(props_path, encoding="utf-8").read().splitlines()
    for key, value in props_updates.items():
        for i, line in enumerate(lines):
            if line.split("=", 1)[0].strip() == key and not line.lstrip().startswith("#"):
                lines[i] = "%s=%s" % (key, value)
                break
        else:
            lines.append("%s=%s" % (key, value))
    open(props_path, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print("wrote %s into %s" % (", ".join("%s=%s" % kv for kv in props_updates.items()), os.path.basename(props_path)), file=sys.stderr)
PY
}

# ---------- the release bundle ----------

# gradle_bundle_release: build the signed AAB, verify the signature, archive it under
# $BUILD_DIR/android/<App>-<versionName>-<versionCode>.aab and print that path.
gradle_bundle_release() {
  require_var GRADLE_DIR ANDROID_MODULE ANDROID_BUILD_FILE KEYSTORE_PROPERTIES APP_NAME
  require_cmd jarsigner
  # Without the upload-key credentials Gradle silently skips the release signingConfig,
  # and the failure only surfaces at the upload. Refuse here, where it can be explained.
  [ -f "$KEYSTORE_PROPERTIES" ] || die "no $KEYSTORE_PROPERTIES — the bundle would be unsigned and Play rejects that. The file is gitignored and holds storeFile, storePassword, keyAlias, keyPassword for the upload keystore."

  local name code
  read -r name code <<EOF
$(gradle_version_read)
EOF

  gradle_run "$ANDROID_MODULE:bundleRelease"

  local out_dir aab dest app
  out_dir="$(_gradle_module_dir "$ANDROID_MODULE")/build/outputs/bundle/release"
  [ -d "$out_dir" ] || die "no bundle output at $out_dir — did $ANDROID_MODULE:bundleRelease run?"
  # The newest, not a hardcoded name: the file is called <module>-release.aab in most
  # projects but the module name is the project's, not ours.
  aab="$(ls -t "$out_dir"/*.aab 2>/dev/null | head -1 || true)"
  [ -n "$aab" ] || die "no .aab under $out_dir"
  jarsigner -verify "$aab" >/dev/null 2>&1 || die "$aab is not signed — check the credentials in $KEYSTORE_PROPERTIES"

  app="$(printf '%s' "$APP_NAME" | tr -d ' ')"
  mkdir -p "$BUILD_DIR/android"
  dest="$BUILD_DIR/android/$app-$name-$code.aab"
  cp "$aab" "$dest"
  log "signed bundle $(du -h "$dest" | awk '{print $1}'): $dest"
  printf '%s\n' "$dest"
}

# ---------- development lanes ----------

# emulator_run: install and launch the debug build on an emulator, starting one when
# nothing is running. Play's own AVD list is the source of the name when EMULATOR is empty.
emulator_run() {
  require_var GRADLE_DIR ANDROID_MODULE
  require_cmd adb
  mkdir -p "$BUILD_DIR/android"

  if adb devices | awk 'NR > 1 && $2 == "device" { n++ } END { exit !(n >= 1) }'; then
    log "a device or emulator is already attached"
  else
    require_cmd emulator
    local avd log_file waited=0
    avd="${EMULATOR:-}"
    [ -n "$avd" ] || avd="$(emulator -list-avds 2>/dev/null | head -1 || true)"
    [ -n "$avd" ] || die "no AVD found — create one in Android Studio (Device Manager), or name one in EMULATOR in ${CONFIG_FILE:-distribution/config.sh}"
    log_file="$BUILD_DIR/android/emulator.log"
    log "starting the emulator '$avd' (log: $log_file)"
    emulator -avd "$avd" >"$log_file" 2>&1 &
    adb wait-for-device
    # wait-for-device returns while Android is still booting; installing then fails with
    # "device offline". sys.boot_completed is the only honest signal.
    until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' | tr -d '[:space:]')" = "1" ]; do
      sleep 2
      waited=$((waited + 2))
      [ "$waited" -lt 300 ] || die "the emulator '$avd' did not finish booting within five minutes — see $log_file"
    done
    log "emulator booted after ${waited}s"
  fi

  gradle_run "$ANDROID_MODULE:installDebug"
  local app_id
  app_id="$(_gradle_application_id)"
  log "launching $app_id"
  # monkey with the LAUNCHER category starts whatever the manifest declares as the entry
  # point, so the activity class never has to be configured or kept in sync.
  adb shell monkey -p "$app_id" -c android.intent.category.LAUNCHER 1 >/dev/null
}

# desktop_run: the Compose desktop app, straight from Gradle.
desktop_run() {
  require_var DESKTOP_MODULE
  gradle_run "$DESKTOP_MODULE:run"
}

# ---------- the Kotlin build interface (see DISTRIBUTION.md) ----------
# The entry scripts call these through kotlin_build_lib; kotlin-toolchain.sh defines the
# same five (emulator_run and desktop_run above are already two of them).

android_version_read()   { gradle_version_read; }
android_version_write()  { gradle_version_write "$@"; }
android_bundle_release() { gradle_bundle_release; }

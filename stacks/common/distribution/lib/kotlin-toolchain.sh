#!/usr/bin/env bash
# Kotlin Toolchain: version fields in module.yaml, the signed release bundle, the emulator,
# the desktop app — for projects built with the `kotlin` wrapper (project.yaml, module.yaml).
# Sourced, never executed; expects lib/common.sh to be sourced first.
# Contract: stacks/common/DISTRIBUTION.md in the Kartograph plugin.
#
# The Kotlin Toolchain is Alpha. Facts this file relies on were checked on 2026-09-25 with
# the wrapper pinned at 0.13.0-dev-4435: the module.yaml keys settings.android.versionCode,
# versionName and signing; `kotlin package -m <module> -f aab -v release` producing a signed
# bundle under build/tasks/; `kotlin run -m <desktop module>` with Compose Hot Reload.
# `kotlin run` on an Android device is documented but was not exercised.
set -euo pipefail

# ---------- running the toolchain ----------

# toolchain_run ARGS...: ./kotlin in $KOTLIN_DIR. The wrapper is the source of truth for the
# Toolchain version, so it is always the project's own wrapper, never a `kotlin` on PATH.
# The Toolchain's output goes to stderr, so that the stdout of a function calling this one
# carries only its result — toolchain_bundle_release prints a path a caller captures.
toolchain_run() {
  require_var KOTLIN_DIR
  [ -x "$KOTLIN_DIR/kotlin" ] || die "no executable kotlin wrapper in $KOTLIN_DIR — check KOTLIN_DIR in ${CONFIG_FILE:-distribution/config.sh} (the directory holding project.yaml)"
  log "kotlin $*"
  ( cd "$KOTLIN_DIR" && KOTLIN_CLI_NO_WELCOME_BANNER=1 ./kotlin "$@" ) >&2
}

# applicationId from the Android module.yaml, falling back to the package Play knows.
# `applicationId: org.example.app`, quoted or not; first hit wins.
_toolchain_yaml_application_id() {
  sed -n -e 's/^[[:space:]]*applicationId[[:space:]]*:[[:space:]]*//p' "$ANDROID_BUILD_FILE" | head -1 | tr -d '"' | tr -d "'" | awk '{ print $1 }'
}

_toolchain_application_id() {
  local id=""
  if [ -f "${ANDROID_BUILD_FILE:-}" ]; then
    id="$(_toolchain_yaml_application_id)"
  fi
  [ -n "$id" ] || id="${PLAY_PACKAGE_NAME:-}"
  [ -n "$id" ] || die "no applicationId in ${ANDROID_BUILD_FILE:-the Android module.yaml} and no PLAY_PACKAGE_NAME in ${CONFIG_FILE:-distribution/config.sh}"
  printf '%s\n' "$id"
}

# ---------- version fields ----------

# The two fields as "NAME CODE"; a python heredoc kept out of any command substitution,
# because bash 3.2 balances quotes inside a heredoc that sits in $( ).
_toolchain_version_fields() {
  python3 - "$ANDROID_BUILD_FILE" <<'PY'
import re, sys
text = open(sys.argv[1], encoding="utf-8").read()
name = re.search(r'^[ \t]*versionName[ \t]*:[ \t]*["\']?([^"\'#\s]+)["\']?[ \t]*(?:#.*)?$', text, re.M)
code = re.search(r'^[ \t]*versionCode[ \t]*:[ \t]*(\d+)[ \t]*(?:#.*)?$', text, re.M)
missing = [k for k, m in (("versionName", name), ("versionCode", code)) if not m]
if missing:
    sys.exit("%s not set under settings.android in %s" % (" and ".join(missing), sys.argv[1]))
print("%s %s" % (name.group(1), code.group(1)))
PY
}

# toolchain_version_read: prints "NAME CODE" from settings.android.versionName and
# versionCode in $ANDROID_BUILD_FILE (the Android app's module.yaml). The Toolchain's
# defaults (1 and "unspecified") are never what a release wants, so a missing key stops.
toolchain_version_read() {
  require_var ANDROID_BUILD_FILE
  require_cmd python3
  [ -f "$ANDROID_BUILD_FILE" ] || die "no module.yaml at $ANDROID_BUILD_FILE — check ANDROID_BUILD_FILE in ${CONFIG_FILE:-distribution/config.sh}"
  local out name code
  out="$(_toolchain_version_fields)" || die "could not read versionName and versionCode from $ANDROID_BUILD_FILE — add both under settings: android: (versionCode: 1, versionName: \"1.0.0\")"
  read -r name code <<EOF
$out
EOF
  log "version $name ($code) — from $ANDROID_BUILD_FILE"
  printf '%s %s\n' "$name" "$code"
}

# toolchain_version_write NAME CODE: rewrite the two values in place, leaving the file
# otherwise byte-identical, so the bumped numbers land in the diff. A key that is missing
# is added under the `android:` block of `settings:`.
toolchain_version_write() {
  local name="${1:-}" code="${2:-}"
  [ -n "$name" ] && [ -n "$code" ] || die "toolchain_version_write needs a versionName and a versionCode"
  require_var ANDROID_BUILD_FILE
  require_cmd python3
  [ -f "$ANDROID_BUILD_FILE" ] || die "no module.yaml at $ANDROID_BUILD_FILE"
  python3 - "$ANDROID_BUILD_FILE" "$name" "$code" <<'PY' || die "could not write versionName $name and versionCode $code into $ANDROID_BUILD_FILE"
import re, sys
path, new_name, new_code = sys.argv[1:4]
text = open(path, encoding="utf-8").read()


def put(text, key, value):
    pattern = re.compile(r'^(?P<head>[ \t]*' + key + r'[ \t]*:[ \t]*)(?P<q>["\']?)[^"\'#\n]*?(?P=q)(?P<tail>[ \t]*(?:#.*)?)$', re.M)
    m = pattern.search(text)
    if m:
        q = m.group("q")  # keep the quoting the file already uses
        line = m.group("head") + q + value + q + m.group("tail")
        return text[:m.start()] + line + text[m.end():]
    # Missing: insert as the first child of the android: block under settings:.
    block = re.search(r'^settings:[ \t]*\n(?:(?:[ \t]+.*|[ \t]*)\n)*?(?P<indent>[ \t]+)android:[ \t]*\n', text, re.M)
    if not block:
        sys.exit("no settings: android: block in %s to hold %s" % (path, key))
    indent = block.group("indent") * 2
    rendered = '"%s"' % value if key == "versionName" else value
    return text[:block.end()] + "%s%s: %s\n" % (indent, key, rendered) + text[block.end():]


text = put(text, "versionCode", new_code)
text = put(text, "versionName", new_name)
open(path, "w", encoding="utf-8").write(text)
print("wrote %s %s into %s" % (new_name, new_code, path), file=sys.stderr)
PY
}

# ---------- the release bundle ----------

# toolchain_bundle_release: `kotlin package -f aab -v release` (R8 and signing included),
# verify the signature, archive it under $BUILD_DIR/android/<App>-<name>-<code>.aab and
# print that path.
toolchain_bundle_release() {
  require_var KOTLIN_DIR ANDROID_MODULE ANDROID_BUILD_FILE KEYSTORE_PROPERTIES APP_NAME
  require_cmd jarsigner python3
  [ -f "$KEYSTORE_PROPERTIES" ] || die "no $KEYSTORE_PROPERTIES — the bundle would be unsigned and Play rejects that. The file is gitignored and holds storeFile, storePassword, keyAlias, keyPassword for the upload keystore (./kotlin tool generate-keystore writes one)."
  # Signing is off by default in the Toolchain; without it `package` still succeeds and the
  # failure would only surface at the upload. Refuse here, where it can be explained.
  python3 - "$ANDROID_BUILD_FILE" <<'PY' || die "signing is not enabled in $ANDROID_BUILD_FILE — add under settings: android: signing: { enabled: true, propertiesFile: <path to $KEYSTORE_PROPERTIES relative to the module> }"
import re, sys
text = open(sys.argv[1], encoding="utf-8").read()
ok = re.search(r'^[ \t]*signing[ \t]*:[ \t]*enabled[ \t]*(?:#.*)?$', text, re.M) or \
     re.search(r'^[ \t]*signing[ \t]*:[ \t]*\n(?:[ \t]+.*\n)*?[ \t]+enabled[ \t]*:[ \t]*true\b', text, re.M)
sys.exit(0 if ok else 1)
PY

  local name code
  read -r name code <<EOF
$(toolchain_version_read)
EOF

  # The output path is not documented; it was build/tasks/_<module>_bundleAndroid/ in the
  # check. Take the newest .aab under build/tasks written by this run, whatever it is called.
  local marker found aab="" dest app
  mkdir -p "$BUILD_DIR/android"
  marker="$BUILD_DIR/android/.package-start"
  : >"$marker"
  toolchain_run package -m "$ANDROID_MODULE" -f aab -v release
  found="$(find "$KOTLIN_DIR/build/tasks" -name '*.aab' -newer "$marker" 2>/dev/null || true)"
  rm -f "$marker"
  [ -n "$found" ] && aab="$(printf '%s\n' "$found" | python3 -c 'import os, sys; print(max((l.rstrip("\n") for l in sys.stdin if l.strip()), key=os.path.getmtime))')"
  [ -n "$aab" ] || die "no .aab under $KOTLIN_DIR/build/tasks after kotlin package -m $ANDROID_MODULE — see the output above"
  jarsigner -verify "$aab" >/dev/null 2>&1 || die "$aab is not signed — check signing in $ANDROID_BUILD_FILE and the credentials in $KEYSTORE_PROPERTIES"

  app="$(printf '%s' "$APP_NAME" | tr -d ' ')"
  dest="$BUILD_DIR/android/$app-$name-$code.aab"
  cp "$aab" "$dest"
  log "signed bundle $(du -h "$dest" | awk '{print $1}'): $dest"
  printf '%s\n' "$dest"
}

# ---------- development lanes ----------

# toolchain_emulator_run: boot $EMULATOR (or the first AVD) when nothing is attached, then
# `kotlin run` on it, which installs and launches the debug build. Booting ourselves keeps
# the AVD choice in config.sh; the Toolchain would otherwise start one of its own.
toolchain_emulator_run() {
  require_var KOTLIN_DIR ANDROID_MODULE
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

  local serial
  serial="$(adb devices | awk 'NR > 1 && $2 == "device" { print $1; exit }')"
  log "running $ANDROID_MODULE ($(_toolchain_application_id)) on $serial"
  toolchain_run run -m "$ANDROID_MODULE" -d "$serial"
}

# toolchain_desktop_run: the Compose desktop app. Compose Hot Reload is on by default for
# `kotlin run` (the JetBrains Runtime is provisioned); edits reload into the open window.
toolchain_desktop_run() {
  require_var DESKTOP_MODULE
  toolchain_run run -m "$DESKTOP_MODULE"
}

# ---------- the Kotlin build interface (see DISTRIBUTION.md) ----------
# The entry scripts call these five through kotlin_build_lib; gradle.sh defines the same.

android_version_read()   { toolchain_version_read; }
android_version_write()  { toolchain_version_write "$@"; }
android_bundle_release() { toolchain_bundle_release; }
emulator_run()           { toolchain_emulator_run; }
desktop_run()            { toolchain_desktop_run; }

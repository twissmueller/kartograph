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

# ---------- the Android module.yaml ----------

# _toolchain_android_yaml MODE [ARGS]: the one reader and writer of $ANDROID_BUILD_FILE.
# Everything it touches sits in the `android:` block of the top-level `settings:` block,
# never under `settings@android:` or anywhere else. Modes:
#   read              print "NAME CODE"
#   write NAME CODE   rewrite both values in place, the rest byte-identical (CRLF kept)
#   signing           print the properties file signing reads, resolved against the
#                     module's directory; exit 3 when signing is not enabled
# A missing versionName or versionCode stops with the key and the file named. A python
# heredoc inside a function, never inside $( ): bash 3.2 balances quotes in such a heredoc.
_toolchain_android_yaml() {
  python3 - "$ANDROID_BUILD_FILE" "$@" <<'PY'
import os, re, sys

path, mode, args = sys.argv[1], sys.argv[2], sys.argv[3:]
raw = open(path, "rb").read().decode("utf-8")
crlf = "\r\n" in raw
lines = raw.replace("\r\n", "\n").split("\n")


def indent(line):
    return len(line) - len(line.lstrip(" \t"))


def blank(line):
    s = line.strip()
    return not s or s.startswith("#")


def block_end(i):
    # The block opened by lines[i] ends at the first later line indented no deeper.
    for j in range(i + 1, len(lines)):
        if not blank(lines[j]) and indent(lines[j]) <= indent(lines[i]):
            return j
    return len(lines)


def child(start, end, key):
    # A direct child `key:` of the block lines[start:end], by the block's own indentation.
    level = None
    for i in range(start, end):
        if blank(lines[i]):
            continue
        if level is None:
            level = indent(lines[i])
        if indent(lines[i]) == level and re.match(r"[ \t]*" + re.escape(key) + r"[ \t]*:", lines[i]):
            return i
    return None


def top(key):
    for i, line in enumerate(lines):
        if re.match(re.escape(key) + r"[ \t]*:[ \t]*(#.*)?$", line):
            return i
    return None


VALUE = re.compile(r"^(?P<head>[ \t]*[A-Za-z]+[ \t]*:[ \t]*)(?P<q>[\"']?)(?P<val>[^\"'#]*?)(?P=q)(?P<tail>[ \t]*(?:#.*)?)$")

settings = top("settings")
android = child(settings + 1, block_end(settings), "android") if settings is not None else None
if android is None:
    sys.exit("no android: block under settings: in %s" % path)
a_start, a_end = android + 1, block_end(android)

if mode in ("read", "write"):
    found = {}
    for key in ("versionName", "versionCode"):
        i = child(a_start, a_end, key)
        m = VALUE.match(lines[i]) if i is not None else None
        if m is None or not m.group("val").strip():
            sys.exit("%s not set under settings: android: in %s" % (key, path))
        found[key] = (i, m)
    if mode == "read":
        print("%s %s" % (found["versionName"][1].group("val").strip(), found["versionCode"][1].group("val").strip()))
        sys.exit(0)
    for key, value in (("versionName", args[0]), ("versionCode", args[1])):
        i, m = found[key]
        lines[i] = m.group("head") + m.group("q") + value + m.group("q") + m.group("tail")
    out = "\n".join(lines)
    open(path, "wb").write((out.replace("\n", "\r\n") if crlf else out).encode("utf-8"))
    print("wrote %s %s into %s" % (args[0], args[1], path), file=sys.stderr)
    sys.exit(0)

if mode == "signing":
    enabled, props = False, "keystore.properties"
    i = child(a_start, a_end, "signing")
    if i is not None:
        inline = re.sub(r"\s+#.*$", "", lines[i].split(":", 1)[1]).strip()
        pairs = {}
        if inline.startswith("{"):
            # flow form: signing: { enabled: true, propertiesFile: ../keystore.properties }
            for part in inline.strip("{} ").split(","):
                if ":" in part:
                    k, v = part.split(":", 1)
                    pairs[k.strip()] = v.strip().strip("\"'")
        elif inline:
            pairs["enabled"] = "true" if inline == "enabled" else inline
        else:
            for j in range(i + 1, block_end(i)):
                m = VALUE.match(lines[j])
                if m and not blank(lines[j]):
                    pairs[m.group("head").split(":")[0].strip()] = m.group("val").strip()
        enabled = pairs.get("enabled", "false") == "true"
        props = pairs.get("propertiesFile", props)
    if not enabled:
        sys.exit(3)
    print(os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(path)), props)))
    sys.exit(0)

sys.exit("unknown mode %s" % mode)
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
  out="$(_toolchain_android_yaml read)" || die "add versionCode and versionName under settings: android: in $ANDROID_BUILD_FILE"
  read -r name code <<EOF
$out
EOF
  log "version $name ($code) — from $ANDROID_BUILD_FILE"
  printf '%s %s\n' "$name" "$code"
}

# toolchain_version_write NAME CODE: rewrite the two values in place, leaving the file
# otherwise byte-identical, so the bumped numbers land in the diff. Both keys must exist.
toolchain_version_write() {
  local name="${1:-}" code="${2:-}"
  [ -n "$name" ] && [ -n "$code" ] || die "toolchain_version_write needs a versionName and a versionCode"
  require_var ANDROID_BUILD_FILE
  require_cmd python3
  [ -f "$ANDROID_BUILD_FILE" ] || die "no module.yaml at $ANDROID_BUILD_FILE"
  _toolchain_android_yaml write "$name" "$code" || die "could not write versionName $name and versionCode $code into $ANDROID_BUILD_FILE"
}

# ---------- the release bundle ----------

# toolchain_release_check: everything a release build needs, checked before any script
# writes a version: KOTLIN_DIR and its wrapper, signing enabled in the Android module.yaml,
# and the properties file it names present. The Toolchain itself only WARNS when that file
# is missing and then builds an unsigned bundle, so the check has to be ours.
toolchain_release_check() {
  require_var KOTLIN_DIR ANDROID_MODULE ANDROID_BUILD_FILE KEYSTORE_PROPERTIES
  require_cmd python3
  [ -x "$KOTLIN_DIR/kotlin" ] || die "no executable kotlin wrapper in $KOTLIN_DIR — check KOTLIN_DIR in ${CONFIG_FILE:-distribution/config.sh} (the directory holding project.yaml)"
  [ -f "$ANDROID_BUILD_FILE" ] || die "no module.yaml at $ANDROID_BUILD_FILE — check ANDROID_BUILD_FILE in ${CONFIG_FILE:-distribution/config.sh}"
  local props
  props="$(_toolchain_android_yaml signing)" || die "signing is not enabled in $ANDROID_BUILD_FILE — add under settings: android: signing: { enabled: true, propertiesFile: <path to $KEYSTORE_PROPERTIES relative to the module> }"
  [ -f "$props" ] || die "signing.propertiesFile in $ANDROID_BUILD_FILE resolves to $props, which does not exist — the Toolchain would build an unsigned bundle. Point it at $KEYSTORE_PROPERTIES (relative to the module directory)."
  [ -f "$KEYSTORE_PROPERTIES" ] || die "no $KEYSTORE_PROPERTIES — the bundle would be unsigned and Play rejects that. The file is gitignored and holds storeFile, storePassword, keyAlias, keyPassword for the upload keystore (./kotlin tool generate-keystore writes one)."
  local a b
  a="$(cd "$(dirname "$props")" && pwd)/$(basename "$props")"
  b="$(cd "$(dirname "$KEYSTORE_PROPERTIES")" && pwd)/$(basename "$KEYSTORE_PROPERTIES")"
  [ "$a" = "$b" ] || warn "module.yaml signs with $props, config.sh names $KEYSTORE_PROPERTIES — the build uses the first"
}

# toolchain_bundle_release: `kotlin package -f aab -v release` (R8 and signing included),
# verify the signature, archive it under $BUILD_DIR/android/<App>-<name>-<code>.aab and
# print that path.
toolchain_bundle_release() {
  require_var APP_NAME
  require_cmd jarsigner
  toolchain_release_check

  local name code
  read -r name code <<EOF
$(toolchain_version_read)
EOF

  # The output path is not documented; in the check it was build/tasks/_<module>_bundleAndroid/.
  # That directory first; else the newest .aab this run wrote under build/tasks, never one
  # under intermediates/ (the Toolchain's Gradle leaves an unsigned intermediary-bundle.aab).
  local marker found aab="" dest app verify
  mkdir -p "$BUILD_DIR/android"
  marker="$BUILD_DIR/android/.package-start"
  : >"$marker"
  toolchain_run package -m "$ANDROID_MODULE" -f aab -v release
  found="$(find "$KOTLIN_DIR/build/tasks/_${ANDROID_MODULE}_bundleAndroid" -maxdepth 1 -name '*.aab' -newer "$marker" 2>/dev/null || true)"
  [ -n "$found" ] || found="$(find "$KOTLIN_DIR/build/tasks" -name '*.aab' -newer "$marker" -not -path '*/intermediates/*' 2>/dev/null || true)"
  rm -f "$marker"
  [ -n "$found" ] && aab="$(printf '%s\n' "$found" | python3 -c 'import os, sys; print(max((l.rstrip("\n") for l in sys.stdin if l.strip()), key=os.path.getmtime))')"
  [ -n "$aab" ] || die "no .aab under $KOTLIN_DIR/build/tasks after kotlin package -m $ANDROID_MODULE — see the output above"
  # jarsigner -verify exits 0 on an unsigned jar ("jar is unsigned."); only "jar verified." is proof.
  verify="$(jarsigner -verify "$aab" 2>&1 || true)"
  case "$verify" in
    *"jar verified."*) ;;
    *) die "$aab is not signed (jarsigner: $(printf '%s\n' "$verify" | head -1)) — check signing in $ANDROID_BUILD_FILE and the credentials in $KEYSTORE_PROPERTIES" ;;
  esac

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
# The entry scripts call these six through kotlin_build_lib; gradle.sh defines the same.

android_release_check()  { toolchain_release_check; }
android_version_read()   { toolchain_version_read; }
android_version_write()  { toolchain_version_write "$@"; }
android_bundle_release() { toolchain_bundle_release; }
emulator_run()           { toolchain_emulator_run; }
desktop_run()            { toolchain_desktop_run; }

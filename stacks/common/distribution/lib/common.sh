#!/usr/bin/env bash
# Shared helpers for every delivery script. Sourced, never executed.
# Contract: stacks/common/DISTRIBUTION.md in the Kartograph plugin.
set -euo pipefail

log()  { printf '\033[1;34m»\033[0m %s\n' "$*" >&2; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m✗\033[0m %s\n' "$1" >&2; exit "${2:-1}"; }

# Stop when a configured variable is empty, naming the key and where to fill it.
require_var() {
  local name
  for name in "$@"; do
    if [ -z "${!name:-}" ]; then
      die "$name is empty — fill it in ${CONFIG_FILE:-distribution/config.sh} (see the comment beside the key)"
    fi
  done
}

# Stop when a command is missing, with the way to get it.
require_cmd() {
  local cmd
  for cmd in "$@"; do
    command -v "$cmd" >/dev/null 2>&1 && continue
    case "$cmd" in
      xcodebuild|xcrun|simctl|agvtool) die "$cmd not found — install Xcode and run: sudo xcode-select -s /Applications/Xcode.app" ;;
      xcodegen) die "xcodegen not found — brew install xcodegen" ;;
      adb|emulator) die "$cmd not found — install the Android SDK platform-tools and emulator, and put them on PATH" ;;
      docker) die "docker not found — install Docker Desktop" ;;
      flyctl) die "flyctl not found — brew install flyctl, then flyctl auth login" ;;
      vercel) die "vercel not found — npm i -g vercel, then vercel login" ;;
      gh) die "gh not found — brew install gh, then gh auth login" ;;
      jarsigner) die "jarsigner not found — install a JDK" ;;
      *) die "$cmd not found" ;;
    esac
  done
}

# A lane the project does not ship is not an error in the script, it is a sentence and exit 2.
require_lane() {
  local lane="$1"
  case " ${LANES:-} " in
    *" $lane "*) return 0 ;;
  esac
  printf '%s\n' "This project does not ship the '$lane' lane (LANES=\"${LANES:-}\" in ${CONFIG_FILE:-distribution/config.sh}). Nothing to do." >&2
  exit 2
}

# Typed confirmation before anything leaves the machine. --yes callers set ASSUME_YES=1.
confirm_typed() {
  local word="$1" prompt="${2:-Type '$1' to continue}"
  if [ "${ASSUME_YES:-0}" = "1" ]; then return 0; fi
  local answer
  printf '%s: ' "$prompt" >&2
  read -r answer
  if [ "$answer" != "$word" ]; then
    die "Aborted. Nothing was published." 3
  fi
}

# Source distribution/config.sh relative to this library and set the well-known paths.
load_config() {
  local lib_dir
  lib_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  DIST_DIR="$(cd "$lib_dir/.." && pwd)"
  PROJECT_ROOT="$(cd "$DIST_DIR/.." && pwd)"
  CONFIG_FILE="$DIST_DIR/config.sh"
  BUILD_DIR="$DIST_DIR/build"
  STORE_DIR="$DIST_DIR/store"
  NOTES_DIR="$DIST_DIR/release-notes"
  export DIST_DIR PROJECT_ROOT CONFIG_FILE BUILD_DIR STORE_DIR NOTES_DIR
  [ -f "$CONFIG_FILE" ] || die "no $CONFIG_FILE — run kartograph-deliver once, or copy config.sh.template to config.sh"
  # shellcheck disable=SC1090
  . "$CONFIG_FILE"
  mkdir -p "$BUILD_DIR"
}

# kotlin_build_lib: source the library that builds the Android and desktop apps and defines
# the Kotlin build interface (android_version_read, android_version_write,
# android_bundle_release, emulator_run, desktop_run): kotlin-toolchain.sh when STACK is
# kmp-toolchain, gradle.sh for every other stack. The entry scripts are shared byte for byte
# between stacks, so the choice is made here, from config.sh, never in a script.
kotlin_build_lib() {
  local lib_dir
  lib_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  case "${STACK:-}" in
    kmp-toolchain) . "$lib_dir/kotlin-toolchain.sh" ;;
    *)             . "$lib_dir/gradle.sh" ;;
  esac
}

# ---------- versions ----------

semver_valid() { [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; }

# semver_bump 1.4.2 minor → 1.5.0
semver_bump() {
  local current="$1" part="$2" major minor patch
  semver_valid "$current" || die "not a semver: '$current'"
  IFS=. read -r major minor patch <<<"$current"
  case "$part" in
    major) printf '%d.0.0\n' $((major + 1)) ;;
    minor) printf '%d.%d.0\n' "$major" $((minor + 1)) ;;
    patch) printf '%d.%d.%d\n' "$major" "$minor" $((patch + 1)) ;;
    *) semver_valid "$part" && printf '%s\n' "$part" || die "bump must be major, minor, patch or X.Y.Z, got '$part'" ;;
  esac
}

# Newest vX.Y.Z tag reachable from HEAD, or empty.
last_release_tag() {
  git -C "$PROJECT_ROOT" tag --list 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname 2>/dev/null | head -1
}

# One subject per line since REF (all commits when REF is empty), merges skipped.
commits_since() {
  local ref="${1:-}"
  if [ -n "$ref" ]; then
    git -C "$PROJECT_ROOT" log --no-merges --format='%s' "$ref..HEAD"
  else
    git -C "$PROJECT_ROOT" log --no-merges --format='%s'
  fi
}

# ---------- release notes ----------

# notes_write 1.5.0 [REF]: seeds release-notes/v1.5.0.md from the commits since REF.
# Subjects starting with fix go under Fixed, feat under New, everything else under Changed.
notes_write() {
  local version="$1" ref="${2:-}" file fixed="" new="" changed="" line
  file="$NOTES_DIR/v$version.md"
  mkdir -p "$NOTES_DIR"
  if [ -f "$file" ]; then log "release notes exist: $file (left untouched)"; printf '%s\n' "$file"; return 0; fi
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    case "$line" in
      fix*|Fix*)   fixed="$fixed- ${line#*: }"$'\n' ;;
      feat*|Feat*) new="$new- ${line#*: }"$'\n' ;;
      chore*|docs*|test*|ci*|build*|style*|refactor*) ;;
      *)           changed="$changed- $line"$'\n' ;;
    esac
  done < <(commits_since "$ref")
  {
    printf '# v%s\n\n' "$version"
    printf 'Released: %s\n' "$(date +%Y-%m-%d)"
    [ -n "$ref" ] && printf 'Since: %s\n' "$ref"
    printf '\n## New\n\n%s\n' "${new:-- }"
    printf '## Fixed\n\n%s\n' "${fixed:-- }"
    printf '## Changed\n\n%s\n' "${changed:-- }"
    printf '## Store text\n\n'
    printf '<!-- play_short: at most 500 characters, plain text, no platform names -->\n'
    printf '### play_short\n\n\n'
    printf '<!-- asc_short: at most 4000 characters, plain text, no platform names -->\n'
    printf '### asc_short\n\n\n'
  } >"$file"
  printf '%s\n' "$file"
}

# notes_slice FILE lane [CAP]: the text under "### <lane>" (play_short, asc_short, web, desktop, server),
# the whole file when the heading is absent, truncated to CAP characters.
notes_slice() {
  local file="$1" lane="$2" cap="${3:-0}"
  [ -f "$file" ] || die "release notes not found: $file"
  python3 - "$file" "$lane" "$cap" <<'PY'
import re, sys
text = open(sys.argv[1], encoding="utf-8").read()
lane, cap = sys.argv[2], int(sys.argv[3])
m = re.search(r"^### " + re.escape(lane) + r"\s*$\n(.*?)(?=^##|\Z)", text, re.S | re.M)
out = (m.group(1) if m else text).strip()
out = re.sub(r"<!--.*?-->", "", out, flags=re.S).strip()
if cap and len(out) > cap:
    sys.stderr.write(f"! {lane} is {len(out)} characters, cap is {cap}; truncating\n")
    out = out[:cap].rstrip()
print(out)
PY
}

# json_get FILE|- a.b.0.c : prints the value at the dotted path, empty when absent.
json_get() {
  local src="$1" expr="$2" tmp=""
  # The python program below occupies stdin, so a document on stdin is spooled to a file first.
  if [ "$src" = "-" ]; then tmp="$(mktemp)"; cat >"$tmp"; src="$tmp"; fi
  python3 - "$src" "$expr" <<'PY'
import json, sys
src, expr = sys.argv[1], sys.argv[2]
data = json.load(open(src, encoding="utf-8"))
for part in expr.split("."):
    if isinstance(data, list):
        data = data[int(part)]
    elif isinstance(data, dict):
        data = data.get(part)
    else:
        data = None
    if data is None:
        break
if data is None:
    print("")
elif isinstance(data, (dict, list)):
    print(json.dumps(data))
else:
    print(data)
PY
  [ -n "$tmp" ] && rm -f "$tmp"
  return 0
}

# ---------- small utilities ----------

# usage_exit: print the calling script's leading comment block as usage.
usage_exit() {
  local script="${1:-${BASH_SOURCE[1]}}"
  # One -e per part: BSD sed (macOS) rejects a `}` that is not the last thing on
  # its own script fragment, so the single-string form works only on GNU sed.
  sed -n -e '2,/^[^#]/ {' -e '/^#/s/^# \{0,1\}//p' -e '}' "$script" >&2
  exit "${2:-0}"
}

# timestamp for build directories and logs
stamp() { date +%Y%m%d-%H%M%S; }

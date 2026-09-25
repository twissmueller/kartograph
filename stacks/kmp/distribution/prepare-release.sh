#!/usr/bin/env bash
# prepare-release.sh <major|minor|patch|X.Y.Z> [--tag] [--no-bump-build]
#
# Prepares one release across every lane the project ships:
#   1. computes the next version from the current one (the Apple VERSION_FILE, else the
#      Android build file: build.gradle.kts, or module.yaml on the Kotlin Toolchain) or
#      takes X.Y.Z as given;
#   2. writes distribution/release-notes/vX.Y.Z.md seeded from the commits since the last
#      vX.Y.Z tag, with empty play_short and asc_short sections to fill;
#   3. writes the version into every lane's file and raises the build numbers
#      (CURRENT_PROJECT_VERSION, versionCode) by one, so the numbers land in the diff;
#   4. with --tag, commits those files and tags vX.Y.Z (annotated).
# The build numbers rise here once; deploy-testflight.sh and deploy-play-internal.sh do not
# bump again unless asked. Store texts stay in distribution/store; this script never uploads.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/lib/common.sh"
case "${1:-}" in --help|-h) usage_exit "${BASH_SOURCE[0]}" ;; esac
load_config
part="${1:-}"; [ -n "$part" ] || usage_exit "${BASH_SOURCE[0]}" 2
shift
tag=0; bump_build=1
for a in "$@"; do case "$a" in --tag) tag=1 ;; --no-bump-build) bump_build=0 ;; *) die "unknown option $a" 2 ;; esac; done

has_lane() { case " ${LANES:-} " in *" $1 "*) return 0 ;; esac; return 1; }
apple=0; android=0
{ has_lane ios || has_lane mac; } && apple=1
has_lane android && android=1
[ "$apple" = 1 ] && . "$HERE/lib/xcode.sh"
[ "$android" = 1 ] && kotlin_build_lib

# 1. current version
current=""
if [ "$apple" = 1 ]; then require_var VERSION_FILE; current="$(version_read)"; fi
if [ -z "$current" ] && [ "$android" = 1 ]; then require_var ANDROID_BUILD_FILE; current="$(android_version_read | cut -d' ' -f1)"; fi
if [ -z "$current" ]; then
  current="$(last_release_tag)"; current="${current#v}"
fi
[ -n "$current" ] || current="0.0.0"
# normalise a two-part version like 2.7 to 2.7.0 for the arithmetic
case "$current" in *.*.*) ;; *.*) current="$current.0" ;; *) current="$current.0.0" ;; esac
next="$(semver_bump "$current" "$part")"
log "version $current → $next"

# 2. release notes
prev="$(last_release_tag)"
notes="$(notes_write "$next" "$prev")"
log "release notes: $notes"

# 3. versions and build numbers
changed=()
if [ "$apple" = 1 ]; then
  version_write "$next"; changed+=("$VERSION_FILE")
  if [ "$bump_build" = 1 ]; then b="$(build_read)"; build_write $((b + 1)); log "CURRENT_PROJECT_VERSION $b → $((b + 1))"; fi
fi
if [ "$android" = 1 ]; then
  read -r _name code <<<"$(android_version_read)"
  newcode="$code"; [ "$bump_build" = 1 ] && newcode=$((code + 1))
  android_version_write "$next" "$newcode"; changed+=("$ANDROID_BUILD_FILE")
  log "versionName $next, versionCode $code → $newcode"
fi
if [ -f "$PROJECT_ROOT/package.json" ] && { has_lane frontend || has_lane web; }; then
  python3 - "$PROJECT_ROOT/package.json" "$next" <<'PY'
import json, sys
p, v = sys.argv[1], sys.argv[2]
d = json.load(open(p, encoding="utf-8")); d["version"] = v
json.dump(d, open(p, "w", encoding="utf-8"), indent=2, ensure_ascii=False); open(p, "a").write("\n")
PY
  changed+=("$PROJECT_ROOT/package.json"); log "package.json version $next"
fi

# 4. tag
if [ "$tag" = 1 ]; then
  git -C "$PROJECT_ROOT" add "$notes" ${changed[@]+"${changed[@]}"}
  git -C "$PROJECT_ROOT" commit -q -m "release: v$next" -- "$notes" ${changed[@]+"${changed[@]}"}
  git -C "$PROJECT_ROOT" tag -a "v$next" -m "v$next"
  log "committed and tagged v$next (push with: git push origin main v$next)"
else
  log "not committed; review $notes and the bumped files, then commit and tag v$next (or re-run with --tag)"
fi
printf '%s\n' "$next"

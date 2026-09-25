#!/usr/bin/env bash
# release-check.sh [--apple] [--play]
#
# Reads, never writes: is the build that was tested newer than what the stores sell?
#   apple  per Apple platform in LANES, the newest processed build (its marketing version
#          and build number) against the version on sale; every platform must carry the
#          same tested version, since one release ships one version.
#   play   the highest versionCode on the internal track against the highest on production.
# Prints one line per lane, then `release X.Y.Z` when an Apple lane named the version.
# Exit 0: every lane is ahead of the store. Exit 1: a lane is not; a new build is needed
# first and there is nothing to release. Exit 2: the project ships no store lane.
# A build attaches only to the App Store version whose versionString equals the build's
# marketing version, so a release ships the tested build's number; it never renames it.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/lib/common.sh"
case "${1:-}" in --help|-h) usage_exit "${BASH_SOURCE[0]}" ;; esac
load_config
apple=0; play=0
while [ $# -gt 0 ]; do
  case "$1" in
    --apple) apple=1 ;; --play) play=1 ;;
    *) die "unknown option $1" 2 ;;
  esac; shift
done
has_lane() { case " ${LANES:-} " in *" $1 "*) return 0 ;; esac; return 1; }
if [ "$apple" = 0 ] && [ "$play" = 0 ]; then
  { has_lane ios || has_lane mac; } && apple=1
  has_lane android && play=1
fi
if [ "$apple" = 0 ] && [ "$play" = 0 ]; then
  printf '%s\n' "This project ships neither an Apple nor a Play lane (LANES=\"${LANES:-}\" in ${CONFIG_FILE}). Nothing to release." >&2
  exit 2
fi

# newer A B: 0 when version A is strictly greater than B; an empty B (nothing on sale yet)
# is older than anything. Both are X.Y.Z.
newer() {
  [ -n "$1" ] || return 1
  [ -n "$2" ] || return 0
  [ "$1" != "$2" ] || return 1
  [ "$(printf '%s\n%s\n' "$1" "$2" | sort -t. -k1,1n -k2,2n -k3,3n | tail -1)" = "$1" ]
}

ahead=1; release=""
if [ "$apple" = 1 ]; then
  . "$HERE/lib/asc.sh"
  require_var ASC_APP_ID ASC_KEY_ID ASC_ISSUER_ID
  for platform in IOS MAC_OS; do
    case "$platform" in IOS) has_lane ios || continue; lane=ios ;; MAC_OS) has_lane mac || continue; lane=mac ;; esac
    # The build's attributes.version is its build number; the marketing version lives on
    # the related preReleaseVersion, so it is included and read from there.
    builds="$(asc_get /builds "filter[app]=$ASC_APP_ID&filter[processingState]=VALID&filter[preReleaseVersion.platform]=$platform&sort=-uploadedDate&limit=1&include=preReleaseVersion")"
    read -r tested build <<<"$(printf '%s' "$builds" | python3 -c '
import json, sys
d = json.load(sys.stdin)
if not d.get("data"):
    print("- -"); sys.exit(0)
b = d["data"][0]
rel = ((b.get("relationships") or {}).get("preReleaseVersion") or {}).get("data") or {}
pre = {i["id"]: i for i in d.get("included", []) if i.get("type") == "preReleaseVersions"}
v = pre.get(rel.get("id"), {}).get("attributes", {}).get("version", "")
parts = (v.split(".") + ["0", "0"])[:3] if v else []
print((".".join(parts) if parts else "-"), b["attributes"].get("version") or "-")
')"
    versions="$(asc_get "/apps/$ASC_APP_ID/appStoreVersions" "filter[platform]=$platform&limit=50")"
    # Older responses call the state appStoreState, newer ones appVersionState.
    live="$(printf '%s' "$versions" | python3 -c '
import json, sys
d = json.load(sys.stdin)
on_sale = {"READY_FOR_SALE", "READY_FOR_DISTRIBUTION"}
found = []
for v in d.get("data", []):
    a = v["attributes"]
    if (a.get("appStoreState") or a.get("appVersionState")) not in on_sale:
        continue
    parts = (a.get("versionString", "").split(".") + ["0", "0"])[:3]
    if all(p.isdigit() for p in parts):
        found.append(tuple(int(p) for p in parts))
print(".".join(map(str, max(found))) if found else "")
')"
    if [ "$tested" = "-" ]; then
      printf '%s: no processed build on TestFlight — not newer\n' "$lane"; ahead=0; continue
    fi
    if newer "$tested" "$live"; then
      printf '%s: tested %s (%s), on sale %s — newer\n' "$lane" "$tested" "$build" "${live:-none}"
    else
      printf '%s: tested %s (%s), on sale %s — not newer\n' "$lane" "$tested" "$build" "${live:-none}"; ahead=0
    fi
    if [ -n "$release" ] && [ "$release" != "$tested" ]; then
      printf '%s: tests %s, but another Apple platform tests %s — one release ships one version\n' "$lane" "$tested" "$release"; ahead=0
    fi
    release="$tested"
  done
fi

if [ "$play" = 1 ]; then
  . "$HERE/lib/play.sh"
  require_var PLAY_PACKAGE_NAME
  internal="$(play_track_versions internal | head -1)"
  production="$(play_track_versions production | head -1)"
  if [ -z "$internal" ]; then
    printf 'android: nothing on the internal track — not newer\n'; ahead=0
  elif [ -n "$production" ] && [ "$internal" -le "$production" ]; then
    printf 'android: internal versionCode %s, production %s — not newer\n' "$internal" "$production"; ahead=0
  else
    printf 'android: internal versionCode %s, production %s — newer\n' "$internal" "${production:-none}"
  fi
fi

[ -n "$release" ] && printf 'release %s\n' "$release"
if [ "$ahead" = 1 ]; then exit 0; fi
log "not every lane is ahead of the store: a new build is needed first; nothing to release"
exit 1

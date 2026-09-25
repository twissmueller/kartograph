#!/usr/bin/env bash
# deploy-play-internal.sh [--version-code N] [--notes FILE] [--no-bump] [--yes]
#
# Builds the signed release bundle and uploads it to the Play internal testing track inside
# one edit, committed last; a failure part-way leaves the live listing untouched. The
# versionCode in ANDROID_BUILD_FILE is raised by one and written back before the build
# unless --no-bump or --version-code N. Release notes come from the notes file's
# play_short section when given. A second edit reads the track back and verifies the
# versionCode landed.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/lib/common.sh"
case "${1:-}" in --help|-h) usage_exit "${BASH_SOURCE[0]}" ;; esac
load_config
code=""; notes=""; bump=1
while [ $# -gt 0 ]; do
  case "$1" in
    --version-code) code="$2"; bump=0; shift ;;
    --notes) notes="$2"; shift ;;
    --no-bump) bump=0 ;;
    --yes) ASSUME_YES=1 ;;
    *) die "unknown option $1" 2 ;;
  esac; shift
done
require_lane android
kotlin_build_lib; . "$HERE/lib/play.sh"
require_var PLAY_PACKAGE_NAME ANDROID_BUILD_FILE KEYSTORE_PROPERTIES
[ -f "$PLAY_SERVICE_ACCOUNT" ] || die "service account not found at $PLAY_SERVICE_ACCOUNT"
android_release_check   # the build can run and sign, before a versionCode is written

read -r name current <<<"$(android_version_read)"
if [ "$bump" = 1 ]; then code=$((current + 1)); android_version_write "$name" "$code"; log "versionCode $current → $code (written to $ANDROID_BUILD_FILE)"; fi
[ -n "$code" ] || code="$current"
[ "$code" = "$current" ] || [ "$bump" = 1 ] || { android_version_write "$name" "$code"; log "versionCode set to $code"; }
aab="$(android_bundle_release)"
log "bundle: $aab"
confirm_typed upload "Upload $APP_NAME $name ($code) to the Play internal track? Type 'upload'"
edit="$(play_edit_open)"
trap 'play_edit_delete "$edit" >/dev/null 2>&1 || true' ERR
uploaded="$(play_upload_bundle "$edit" "$aab")"
[ "$uploaded" = "$code" ] || warn "Play reports versionCode $uploaded, the build file says $code"
play_track_set "$edit" internal "$uploaded" "" "$notes"
play_edit_commit "$edit"
trap - ERR
play_verify internal "$uploaded"
log "Play internal: $APP_NAME $name ($uploaded). Testers see it through the opt-in link in the Play Console; Play sends nothing on its own."

#!/usr/bin/env bash
# push-store-metadata.sh [--apple] [--play] [--dry-run] [--screenshots] [--locale L]
#
# Pushes the store listings from distribution/store to App Store Connect and Google Play:
#   apple  store/apple/app.json and store/apple/<locale>.json → the app record, its
#          localizations and every editable version on each platform
#   play   store/play/listing.json → details and listings, in one edit committed last
# With --screenshots also uploads store/*/screenshots/<locale>/<type>/. With neither
# --apple nor --play, both lanes the project ships. When the JSON files are missing they
# are created as templates and the script stops so they can be filled.
# The app record itself is created in the web UI; the API cannot (and Play needs the
# service account granted per app). The script says what remains manual at the end.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/lib/common.sh"
case "${1:-}" in --help|-h) usage_exit "${BASH_SOURCE[0]}" ;; esac
load_config
apple=0; play=0; dry=""; shots=0; locale=""
while [ $# -gt 0 ]; do
  case "$1" in
    --apple) apple=1 ;; --play) play=1 ;; --dry-run) dry="--dry-run" ;; --screenshots) shots=1 ;;
    --locale) locale="$2"; shift ;;
    *) die "unknown option $1" 2 ;;
  esac; shift
done
has_lane() { case " ${LANES:-} " in *" $1 "*) return 0 ;; esac; return 1; }
if [ "$apple" = 0 ] && [ "$play" = 0 ]; then
  { has_lane ios || has_lane mac; } && apple=1
  has_lane android && play=1
fi
[ "$apple" = 1 ] || [ "$play" = 1 ] || die "this project ships neither an Apple nor a Play lane (LANES=\"$LANES\")" 2
export APP_NAME STORE_DIR LOCALES
# bash 3.2 treats an empty array as unbound under set -u, hence the ${arr[@]+…} idiom below
loc_arg=(); [ -n "$locale" ] && loc_arg=(--locale "$locale")
if [ "$apple" = 1 ]; then
  { has_lane ios || has_lane mac; } || die "no Apple lane in LANES" 2
  require_var ASC_APP_ID ASC_KEY_ID ASC_ISSUER_ID
  export ASC_APP_ID ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_PATH TEAM_ID APPLE_BUNDLE_ID
  python3 "$HERE/lib/asc_metadata.py" $dry ${loc_arg[@]+"${loc_arg[@]}"}
  [ "$shots" = 1 ] && python3 "$HERE/lib/upload_screenshots.py" --platform apple $dry ${loc_arg[@]+"${loc_arg[@]}"}
fi
if [ "$play" = 1 ]; then
  has_lane android || die "no android lane in LANES" 2
  require_var PLAY_PACKAGE_NAME
  export PLAY_PACKAGE_NAME PLAY_SERVICE_ACCOUNT
  python3 "$HERE/lib/play_listing.py" $dry
  [ "$shots" = 1 ] && python3 "$HERE/lib/upload_screenshots.py" --platform play $dry ${loc_arg[@]+"${loc_arg[@]}"}
fi

#!/usr/bin/env bash
# deploy-testflight.sh [--platform ios|mac] [--build N] [--no-bump] [--validate-only] [--yes]
#
# Archives, exports and uploads one platform to App Store Connect, then configures
# TestFlight: export compliance, the internal group TESTFLIGHT_GROUP, the beta localization.
#   ios  exports with destination=upload straight from xcodebuild.
#   mac  exports a .pkg to disk, validates it with altool (a rejected validation costs no
#        build number; App Store Connect never releases a number it accepted), then uploads.
# The build number is CURRENT_PROJECT_VERSION in VERSION_FILE: bumped by one and written
# back before archiving unless --no-bump or --build N. Signing is manual with the profile
# named in config.sh (created through the API when absent), else automatic.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/lib/common.sh"
case "${1:-}" in --help|-h) usage_exit "${BASH_SOURCE[0]}" ;; esac
load_config
platform=ios; build=""; bump=1; validate_only=0
while [ $# -gt 0 ]; do
  case "$1" in
    --platform) platform="$2"; shift ;;
    --build) build="$2"; bump=0; shift ;;
    --no-bump) bump=0 ;;
    --validate-only) validate_only=1 ;;
    --yes) ASSUME_YES=1 ;;
    *) die "unknown option $1" 2 ;;
  esac; shift
done
case "$platform" in ios|mac) ;; *) die "--platform must be ios or mac" 2 ;; esac
require_lane "$platform"
. "$HERE/lib/xcode.sh"; . "$HERE/lib/asc.sh"
require_var APPLE_BUNDLE_ID ASC_APP_ID ASC_KEY_ID ASC_ISSUER_ID VERSION_FILE
[ -f "$ASC_KEY_PATH" ] || die "API key file not found at $ASC_KEY_PATH"
require_cmd xcodebuild xcrun

if [ "$bump" = 1 ]; then b="$(build_read)"; build="$((b + 1))"; build_write "$build"; log "build number $b → $build (written to $VERSION_FILE)"; fi
[ -n "$build" ] || build="$(build_read)"
version="$(version_read)"
log "$APP_NAME $version ($build), platform $platform"
xcode_regenerate
ensure_profile "$platform"
archive="$BUILD_DIR/$platform/$APP_NAME-$version-$build.xcarchive"
xcode_archive "$platform" "$archive" "$build"

if [ "$platform" = mac ]; then
  pkg="$(xcode_export_pkg "$archive" "$BUILD_DIR/mac/export-$build")"
  altool_validate "$pkg"
  [ "$validate_only" = 1 ] && { log "validated only; $pkg not uploaded"; exit 0; }
  confirm_typed upload "Upload $APP_NAME $version ($build) for macOS to App Store Connect? Type 'upload'"
  altool_upload "$pkg"
else
  [ "$validate_only" = 1 ] && die "--validate-only applies to the mac platform; iOS uploads straight from the export" 2
  confirm_typed upload "Upload $APP_NAME $version ($build) for iOS to App Store Connect? Type 'upload'"
  xcode_export_upload "$archive" ios
fi

asc_platform=IOS; [ "$platform" = mac ] && asc_platform=MAC_OS
build_id="$(asc_build_wait "$asc_platform" "$version" "$build")"
asc_export_compliance "$build_id"
asc_beta_group_ensure >/dev/null
asc_beta_group_add "$build_id"
for locale in $LOCALES; do asc_beta_localization "$build_id" "$locale"; done
log "TestFlight: $APP_NAME $version ($build) is in group '$TESTFLIGHT_GROUP'"

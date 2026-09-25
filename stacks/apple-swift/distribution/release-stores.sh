#!/usr/bin/env bash
# release-stores.sh [--apple] [--play] [--rollout FRACTION] [--version X.Y.Z] [--no-submit] --notes FILE [--yes]
#
# Releases what TestFlight and the internal track already carry:
#   play   promotes the versionCodes on the internal track to production in one edit,
#          with the notes file's play_short section as release notes; --rollout 0.1 starts
#          a staged rollout (10 %), raise it later with a higher fraction.
#   apple  finds the newest processed build for the version, attaches it to the editable
#          App Store version (created when absent, released after approval), sets What's
#          New from the notes file's asc_short section per locale, and submits for review.
#          On a first release (nothing on sale on that platform yet) What's New is left
#          out: Apple refuses it there, since there is nothing for it to be new against.
#          Refuses while a subscription waits at READY_TO_SUBMIT unattached (Guideline 2.1(b)).
#          --no-submit stops after the build and What's New and creates no review
#          submission: an in-app purchase's first review can only be added from its own
#          page in App Store Connect, whose Add for Review joins the submission and submits
#          the version with it (ASC24). Play ignores --no-submit.
#   play   on an app that was never published, Play accepts only a draft production
#          release; it is staged, and sent for review from the Play Console.
# Nothing is rebuilt: the artefact that was tested is the artefact that ships.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/lib/common.sh"
case "${1:-}" in --help|-h) usage_exit "${BASH_SOURCE[0]}" ;; esac
load_config
apple=0; play=0; rollout=""; notes=""; version=""; submit=1
while [ $# -gt 0 ]; do
  case "$1" in
    --apple) apple=1 ;; --play) play=1 ;;
    --rollout) rollout="$2"; shift ;;
    --version) version="$2"; shift ;;
    --notes) notes="$2"; shift ;;
    --no-submit) submit=0 ;;
    --yes) ASSUME_YES=1 ;;
    *) die "unknown option $1" 2 ;;
  esac; shift
done
[ -n "$notes" ] || die "--notes FILE is required (write it with prepare-release.sh)" 2
[ -f "$notes" ] || die "notes file not found: $notes"
has_lane() { case " ${LANES:-} " in *" $1 "*) return 0 ;; esac; return 1; }
if [ "$apple" = 0 ] && [ "$play" = 0 ]; then
  { has_lane ios || has_lane mac; } && apple=1
  has_lane android && play=1
fi

if [ "$play" = 1 ]; then
  has_lane android || die "no android lane in LANES" 2
  . "$HERE/lib/play.sh"
  require_var PLAY_PACKAGE_NAME
  codes="$(play_track_versions internal)"
  [ -n "$codes" ] || die "nothing on the internal track to promote — run deploy-play-internal.sh first"
  log "Play: promoting versionCode(s) $codes from internal to production${rollout:+ at $rollout}"
  confirm_typed production "Promote to PRODUCTION on Google Play? Type 'production'"
  play_promote internal production "$rollout" "$notes"
  for c in $codes; do play_verify production "$c"; done
fi

if [ "$apple" = 1 ]; then
  { has_lane ios || has_lane mac; } || die "no Apple lane in LANES" 2
  . "$HERE/lib/xcode.sh"; . "$HERE/lib/asc.sh"
  require_var ASC_APP_ID ASC_KEY_ID ASC_ISSUER_ID
  [ -n "$version" ] || version="$(version_read)"
  for platform in IOS MAC_OS; do
    case "$platform" in IOS) has_lane ios || continue ;; MAC_OS) has_lane mac || continue ;; esac
    build_id="$(asc_build_latest "$platform" "$version")"
    [ -n "$build_id" ] || die "no processed $platform build for $version — run deploy-testflight.sh first"
    on_sale="$(asc_version_on_sale "$platform")" \
      || die "could not read the $platform App Store versions — nothing was changed"
    version_id="$(asc_version_editable "$platform" "$version")"
    asc_version_attach "$version_id" "$build_id"
    if [ -n "$on_sale" ]; then
      for locale in $LOCALES; do
        asc_version_whats_new "$version_id" "$locale" "$(notes_slice "$notes" asc_short 4000)"
      done
      log "App Store ($platform): $APP_NAME $version has its build and What's New"
    else
      log "App Store ($platform): $APP_NAME $version has its build; first release, so no What's New (Apple refuses it before a version is on sale)"
    fi
    if [ "$submit" = 0 ]; then
      log "App Store ($platform): not submitted (--no-submit) — click Add for Review on each in-app purchase's page in App Store Connect; that submits $version with them (ASC24)"
      continue
    fi
    confirm_typed submit "Submit $APP_NAME $version ($platform) for App Review? Type 'submit'"
    asc_review_submit "$platform"
  done
fi

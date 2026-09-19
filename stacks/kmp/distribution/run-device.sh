#!/usr/bin/env bash
# run-device.sh [udid]
#
# Builds the iOS app in Debug and installs and launches it on a paired iPhone or iPad over
# the cable, through xcrun devicectl. With no udid every paired device gets it. The team is
# taken from TEAM_ID in config.sh, else detected from the installed provisioning profiles.
# Lists the paired devices with --list.
#
# This is the default way to hand a finished change to the person; TestFlight is for
# explicit requests only (Apple caps uploads per app and day).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/lib/common.sh"
case "${1:-}" in --help|-h) usage_exit "${BASH_SOURCE[0]}" ;; esac
load_config
require_lane ios
. "$HERE/lib/xcode.sh"
if [ "${1:-}" = "--list" ]; then device_list; exit 0; fi
device_run "${1:-}"

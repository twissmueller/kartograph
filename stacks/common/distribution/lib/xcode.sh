#!/usr/bin/env bash
# The Apple lanes: the version file, xcodebuild archive and export, altool, provisioning
# profiles, the simulator, the Mac app and cabled devices. Sourced, never executed;
# common.sh must be sourced first (log, warn, die, require_var, require_cmd, stamp).
#
# Contract: stacks/common/DISTRIBUTION.md, section "xcode.sh".
#
# Every identifier — team, bundle id, key id, issuer — comes from config.sh through the
# environment. Never a literal in here, and never a token or a key's contents on stdout.
set -euo pipefail

# ---------------------------------------------------------------------------
# The version file
#
# $VERSION_FILE holds MARKETING_VERSION and CURRENT_PROJECT_VERSION and is either
#   * an .xcconfig   — KEY=VALUE, no spaces around the '='; or
#   * a project.yml  — YAML, `MARKETING_VERSION: "1.0.0"` under settings.base, read by
#                      xcodegen (then XCODEGEN=yes, and xcode_regenerate runs first).
# Both are read with awk/sed and written back with a python3 regex, so the number the
# upload consumed lands in the diff instead of being invented at build time.
# ---------------------------------------------------------------------------

_vf_kind() {
  require_var VERSION_FILE
  [ -f "$VERSION_FILE" ] || die "VERSION_FILE not found: $VERSION_FILE"
  case "$VERSION_FILE" in
    *.yml|*.yaml) printf 'yaml\n' ;;
    *)            printf 'xcconfig\n' ;;
  esac
}

_vf_read() {
  local key="$1"
  case "$(_vf_kind)" in
    yaml)
      # `KEY: "1.0.0"` or `KEY: 23`, at any indentation, first hit wins.
      sed -n "s/^[[:space:]]*${key}[[:space:]]*:[[:space:]]*[\"']\{0,1\}\([^\"']*\)[\"']\{0,1\}[[:space:]]*\$/\1/p" \
        "$VERSION_FILE" | head -1
      ;;
    *)
      awk -F= -v k="$key" '$0 ~ "^[ \t]*"k"[ \t]*=" { gsub(/[ \t"]/, "", $2); print $2; exit }' "$VERSION_FILE"
      ;;
  esac
}

_vf_write() {
  local key="$1" value="$2" kind
  kind="$(_vf_kind)"
  python3 - "$VERSION_FILE" "$key" "$value" "$kind" <<'PY'
import re, sys
path, key, value, kind = sys.argv[1:5]
text = open(path, encoding="utf-8").read()
if kind == "yaml":
    # Keep the quoting the file already uses. xcodegen wants CURRENT_PROJECT_VERSION as a
    # string; rewriting "23" as a bare 23 changes the type it emits into the project.
    pattern = re.compile(
        r'^(?P<indent>[ \t]*)' + re.escape(key) + r'[ \t]*:[ \t]*(?P<q>["\']?).*?(?P=q)[ \t]*$',
        re.M)
    replace = lambda m: "%s%s: %s%s%s" % (m.group("indent"), key, m.group("q"), value, m.group("q"))
else:
    pattern = re.compile(r'^(?P<head>[ \t]*' + re.escape(key) + r'[ \t]*=[ \t]*).*$', re.M)
    replace = lambda m: m.group("head") + value
new, count = pattern.subn(replace, text)
if count == 0:
    sys.exit("%s not found in %s" % (key, path))
open(path, "w", encoding="utf-8").write(new)
PY
}

version_read() { _vf_read MARKETING_VERSION; }
build_read()   { _vf_read CURRENT_PROJECT_VERSION; }

build_write() {
  local n="${1:?build_write N}"
  _vf_write CURRENT_PROJECT_VERSION "$n"
  log "build number $n written to $VERSION_FILE"
}

version_write() {
  local v="${1:?version_write X.Y.Z}"
  semver_valid "$v" || die "not a semver: '$v'"
  _vf_write MARKETING_VERSION "$v"
  log "version $v written to $VERSION_FILE"
}

# xcodegen turns project.yml into the .xcodeproj. Everything below assumes the project
# exists, so this runs first whenever the project is generated rather than committed.
xcode_regenerate() {
  case "${XCODEGEN:-no}" in yes|true|1) ;; *) return 0 ;; esac
  require_cmd xcodegen
  local dir
  case "${VERSION_FILE:-}" in
    *.yml|*.yaml) dir="$(cd "$(dirname "$VERSION_FILE")" && pwd)" ;;
    *)            dir="$PROJECT_ROOT" ;;
  esac
  log "xcodegen generate in $dir"
  ( cd "$dir" && xcodegen generate ) >/dev/null
}

# ---------------------------------------------------------------------------
# Lanes
# ---------------------------------------------------------------------------

# Sets XC_PROJECT, XC_PROJECT_FLAG, XC_SCHEME, XC_DESTINATION, XC_PROFILE_NAME, XC_LANE.
_lane_target() {
  local lane="$1"
  case "$lane" in
    ios)
      require_var IOS_PROJECT IOS_SCHEME
      XC_PROJECT="$IOS_PROJECT"
      XC_SCHEME="$IOS_SCHEME"
      XC_DESTINATION="generic/platform=iOS"
      XC_PROFILE_NAME="${IOS_PROFILE_NAME:-}"
      XC_LANE="ios"
      ;;
    mac|macos)
      require_var MAC_SCHEME
      XC_PROJECT="${MAC_PROJECT:-${IOS_PROJECT:-}}"
      XC_SCHEME="$MAC_SCHEME"
      XC_DESTINATION="generic/platform=macOS"
      XC_PROFILE_NAME="${MAC_PROFILE_NAME:-}"
      XC_LANE="mac"
      ;;
    *) die "unknown lane '$lane' — expected ios or mac" ;;
  esac
  [ -n "$XC_PROJECT" ] || die "no Xcode project for the $lane lane — fill IOS_PROJECT (and MAC_PROJECT when the Mac app is its own project) in ${CONFIG_FILE:-distribution/config.sh}"
  [ -e "$XC_PROJECT" ] || die "not found: $XC_PROJECT"
  case "$XC_PROJECT" in
    *.xcworkspace) XC_PROJECT_FLAG="-workspace" ;;
    *)             XC_PROJECT_FLAG="-project" ;;
  esac
}

_asc_key_ready() {
  require_var ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_PATH
  [ -f "$ASC_KEY_PATH" ] || die "App Store Connect key not found: $ASC_KEY_PATH (the path is printed, the contents never)"
}

# ---------------------------------------------------------------------------
# Archive
# ---------------------------------------------------------------------------

# xcode_archive LANE [ARCHIVE] [BUILD]
# Archives Release into $BUILD_DIR/<lane>/<App>-<stamp>.xcarchive (or ARCHIVE when given,
# '-' meaning "use the default") with a log file beside it, and prints the archive path.
xcode_archive() {
  local lane="${1:?xcode_archive LANE [ARCHIVE] [BUILD]}" archive="${2:-}" build="${3:-}"
  require_cmd xcodebuild
  _asc_key_ready
  _lane_target "$lane"
  local dir derived logfile
  dir="$BUILD_DIR/$XC_LANE"
  derived="$dir/DerivedData"          # per lane: never two xcodebuild runs on one path
  mkdir -p "$dir"
  if [ -z "$archive" ] || [ "$archive" = "-" ]; then
    archive="$dir/${APP_NAME:-App}-$(stamp).xcarchive"
  fi
  logfile="${archive%.xcarchive}.log"
  rm -rf "$archive"

  log "archiving $XC_SCHEME — $XC_LANE, Release${build:+, build $build}"
  log "  archive: $archive"
  log "  log:     $logfile"

  set -- "$XC_PROJECT_FLAG" "$XC_PROJECT" \
    -scheme "$XC_SCHEME" \
    -configuration Release \
    -destination "$XC_DESTINATION" \
    -archivePath "$archive" \
    -derivedDataPath "$derived" \
    -authenticationKeyPath "$ASC_KEY_PATH" \
    -authenticationKeyID "$ASC_KEY_ID" \
    -authenticationKeyIssuerID "$ASC_ISSUER_ID"

  # Automatic signing needs permission to fetch a profile; a lane that signs manually must
  # not be offered it (see xcode_export_upload for the cloud-signing trap).
  if [ -z "$XC_PROFILE_NAME" ]; then
    set -- "$@" -allowProvisioningUpdates
  fi

  # CURRENT_PROJECT_VERSION is the ONLY build setting this command line may carry. Signing
  # settings here apply to every target, SPM packages included, which then fail with
  # "Signing for <Package> requires a development team" — an error naming a dependency that
  # is not the cause.
  if [ -n "$build" ]; then
    set -- "$@" "CURRENT_PROJECT_VERSION=$build"
  fi

  if ! xcodebuild "$@" archive >"$logfile" 2>&1; then
    warn "archive failed — last 30 lines of $logfile:"
    tail -30 "$logfile" >&2
    die "xcodebuild archive failed for the $XC_LANE lane"
  fi
  [ -d "$archive" ] || die "no .xcarchive produced — see $logfile"
  log "archive built"
  printf '%s\n' "$archive"
}

# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

# _export_options FILE DESTINATION PROFILE_NAME INSTALLER_CERT
#
# Manual signing whenever a profile name is configured. Automatic signing makes xcodebuild
# create the distribution profile through "cloud signing", which an API key is usually not
# permitted to do; the export then fails with
#     error: exportArchive Cloud signing permission error
#     error: exportArchive No profiles for '<bundle id>' were found
# whose second line is misleading — the profile was never missing, the permission was.
# ensure_profile creates the profile through POST /v1/profiles instead, and this plist
# pins it by name.
_export_options() {
  local file="$1" destination="$2" profile="$3" installer="$4"
  require_var TEAM_ID APPLE_BUNDLE_ID
  {
    printf '%s\n' '<?xml version="1.0" encoding="UTF-8"?>'
    printf '%s\n' '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
    printf '%s\n' '<plist version="1.0">'
    printf '%s\n' '<dict>'
    printf '\t<key>method</key><string>app-store-connect</string>\n'
    printf '\t<key>destination</key><string>%s</string>\n' "$destination"
    printf '\t<key>teamID</key><string>%s</string>\n' "$TEAM_ID"
    printf '\t<key>uploadSymbols</key><true/>\n'
    if [ -n "$profile" ]; then
      printf '\t<key>signingStyle</key><string>manual</string>\n'
      # "Apple Distribution", not "3rd Party Mac Developer Application": Apple no longer
      # issues the latter, and the local keychain holds the private key for the former.
      printf '\t<key>signingCertificate</key><string>Apple Distribution</string>\n'
      if [ -n "$installer" ]; then
        printf '\t<key>installerSigningCertificate</key><string>%s</string>\n' "$installer"
      fi
      printf '\t<key>provisioningProfiles</key>\n'
      printf '\t<dict>\n'
      printf '\t\t<key>%s</key><string>%s</string>\n' "$APPLE_BUNDLE_ID" "$profile"
      printf '\t</dict>\n'
    else
      printf '\t<key>signingStyle</key><string>automatic</string>\n'
      if [ -n "$installer" ]; then
        printf '\t<key>installerSigningCertificate</key><string>%s</string>\n' "$installer"
      fi
    fi
    printf '%s\n' '</dict>'
    printf '%s\n' '</plist>'
  } >"$file"
}

# xcode_export_upload ARCHIVE LANE — export with destination=upload; the binary goes
# straight to App Store Connect and nothing lands on disk to validate first (the iOS way).
xcode_export_upload() {
  local archive="${1:?xcode_export_upload ARCHIVE LANE}" lane="${2:?xcode_export_upload ARCHIVE LANE}"
  require_cmd xcodebuild
  _asc_key_ready
  [ -d "$archive" ] || die "no .xcarchive at $archive"
  _lane_target "$lane"
  local dir plist exportdir output status
  dir="$BUILD_DIR/$XC_LANE"
  mkdir -p "$dir"
  plist="$dir/ExportOptions-upload.plist"
  exportdir="$dir/export"
  rm -rf "$exportdir"
  _export_options "$plist" upload "$XC_PROFILE_NAME" ""
  if [ -n "$XC_PROFILE_NAME" ]; then
    log "exporting and uploading $archive — manual signing, profile '$XC_PROFILE_NAME'"
  else
    log "exporting and uploading $archive — automatic signing"
  fi

  set -- -exportArchive \
    -archivePath "$archive" \
    -exportPath "$exportdir" \
    -exportOptionsPlist "$plist" \
    -authenticationKeyPath "$ASC_KEY_PATH" \
    -authenticationKeyID "$ASC_KEY_ID" \
    -authenticationKeyIssuerID "$ASC_ISSUER_ID"
  if [ -z "$XC_PROFILE_NAME" ]; then
    set -- "$@" -allowProvisioningUpdates
  fi

  set +e
  output="$(xcodebuild "$@" 2>&1)"
  status=$?
  set -e
  printf '%s\n' "$output" | tail -15 >&2
  # xcodebuild can print EXPORT FAILED and still exit 0, so both are checked.
  if [ "$status" -ne 0 ] || printf '%s\n' "$output" | grep -q "EXPORT FAILED"; then
    warn "If this says 'Cloud signing permission error', set IOS_PROFILE_NAME/MAC_PROFILE_NAME,"
    warn "run ensure_profile $XC_LANE, and repeat only the export — the archive stays valid."
    die "export/upload failed for the $XC_LANE lane"
  fi
  log "uploaded — App Store Connect processes it for ten to thirty minutes"
}

# xcode_export_pkg ARCHIVE OUTDIR — Mac: export a signed .pkg to disk and print its path.
#
# The Mac lane is not the iOS lane with a different flag. It exports to disk so the package
# can be validated BEFORE the upload: validation catches entitlement, category and signature
# defects without consuming a build number, and App Store Connect never releases a build
# number it has accepted. Two certificates are involved, not one: the app bundle is signed
# with the application certificate, the surrounding .pkg with the installer certificate.
xcode_export_pkg() {
  local archive="${1:?xcode_export_pkg ARCHIVE OUTDIR}" outdir="${2:?xcode_export_pkg ARCHIVE OUTDIR}"
  require_cmd xcodebuild
  _asc_key_ready
  [ -d "$archive" ] || die "no .xcarchive at $archive"
  _lane_target mac
  local plist output status pkg
  mkdir -p "$BUILD_DIR/mac"
  plist="$BUILD_DIR/mac/ExportOptions-pkg.plist"
  rm -rf "$outdir"
  _export_options "$plist" export "$XC_PROFILE_NAME" "3rd Party Mac Developer Installer"
  log "exporting the Mac package to $outdir"

  set -- -exportArchive \
    -archivePath "$archive" \
    -exportPath "$outdir" \
    -exportOptionsPlist "$plist" \
    -authenticationKeyPath "$ASC_KEY_PATH" \
    -authenticationKeyID "$ASC_KEY_ID" \
    -authenticationKeyIssuerID "$ASC_ISSUER_ID"
  if [ -z "$XC_PROFILE_NAME" ]; then
    set -- "$@" -allowProvisioningUpdates
  fi

  set +e
  output="$(xcodebuild "$@" 2>&1)"
  status=$?
  set -e
  printf '%s\n' "$output" | tail -15 >&2
  if [ "$status" -ne 0 ] || printf '%s\n' "$output" | grep -q "EXPORT FAILED"; then
    die "export failed — no .pkg was produced"
  fi
  # xcodebuild names the package after the product; take whatever it produced rather than
  # insisting on a name.
  pkg="$(find "$outdir" -maxdepth 1 -name '*.pkg' | head -1)"
  [ -n "$pkg" ] || die "no .pkg in $outdir"
  log "package: $pkg"
  printf '%s\n' "$pkg"
}

# ---------------------------------------------------------------------------
# altool
# ---------------------------------------------------------------------------

_altool_type() {
  case "$1" in
    *.ipa) printf 'ios\n' ;;
    *)     printf 'macos\n' ;;
  esac
}

_altool() {
  # altool reads the .p8 from a DIRECTORY it is told about, never from a file path.
  require_cmd xcrun
  _asc_key_ready
  API_PRIVATE_KEYS_DIR="$(cd "$(dirname "$ASC_KEY_PATH")" && pwd)" \
    xcrun altool "$@" --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"
}

# altool_validate PKG [ios|macos]
altool_validate() {
  local pkg="${1:?altool_validate PKG}" kind="${2:-}" logfile
  [ -f "$pkg" ] || die "no package to validate: $pkg"
  [ -n "$kind" ] || kind="$(_altool_type "$pkg")"
  mkdir -p "$BUILD_DIR"
  logfile="$BUILD_DIR/altool-validate-$(stamp).log"
  log "validating $pkg ($kind) — before the upload, always"
  set +e
  _altool --validate-app -f "$pkg" -t "$kind" >"$logfile" 2>&1
  set -e
  # Match altool's verdict, not the word "error": success reads "VERIFY SUCCEEDED with no
  # errors", so a naive `grep -i error` reports success as failure. Older altool builds on
  # the Mac lane say "No errors validating" instead.
  if grep -q "VERIFY SUCCEEDED" "$logfile" || grep -q "No errors validating" "$logfile"; then
    log "package validates — nothing was consumed at Apple"
    return 0
  fi
  warn "validation did not succeed — last 20 lines of $logfile:"
  tail -20 "$logfile" >&2
  die "altool validation failed for $pkg"
}

# altool_upload PKG [ios|macos]
altool_upload() {
  local pkg="${1:?altool_upload PKG}" kind="${2:-}" logfile status
  [ -f "$pkg" ] || die "no package to upload: $pkg"
  [ -n "$kind" ] || kind="$(_altool_type "$pkg")"
  mkdir -p "$BUILD_DIR"
  logfile="$BUILD_DIR/altool-upload-$(stamp).log"
  log "uploading $pkg ($kind)"
  set +e
  _altool --upload-app -f "$pkg" -t "$kind" >"$logfile" 2>&1
  status=$?
  set -e
  tail -5 "$logfile" >&2
  if [ "$status" -ne 0 ] && ! grep -q "No errors uploading" "$logfile" && ! grep -q "UPLOAD SUCCEEDED" "$logfile"; then
    warn "upload failed — last 20 lines of $logfile:"
    tail -20 "$logfile" >&2
    die "altool upload failed for $pkg. A build number App Store Connect has already accepted is never released again — bump it before retrying."
  fi
  log "uploaded — processing takes ten to thirty minutes"
}

# keychain_has "Apple Distribution: " — an identity whose PRIVATE KEY is on this machine.
# This library never creates certificates: their private keys have to be generated here,
# so a missing one is a task in the developer portal, not a step a script can take.
keychain_has() {
  local prefix="${1:?keychain_has IDENTITY_PREFIX}"
  require_cmd security
  security find-identity -v 2>/dev/null | grep -q "$prefix"
}

# ---------------------------------------------------------------------------
# Provisioning profiles
# ---------------------------------------------------------------------------

# ensure_profile needs the App Store Connect helpers; asc.sh is sourced on demand so that
# a script which only builds never pays for it.
_need_asc() {
  if ! declare -f asc_get >/dev/null 2>&1; then
    # shellcheck disable=SC1090
    . "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/asc.sh"
  fi
}

# ensure_profile LANE [--recreate]
#
# Creates the App Store profile through the API and installs it locally, when
# IOS_PROFILE_NAME / MAC_PROFILE_NAME is set and the profile is absent or not ACTIVE.
# An empty profile name means the lane signs automatically and there is nothing to do.
ensure_profile() {
  local lane="${1:?ensure_profile LANE}" recreate=0
  [ "${2:-}" = "--recreate" ] && recreate=1
  require_cmd curl python3 openssl security
  _lane_target "$lane"
  if [ -z "$XC_PROFILE_NAME" ]; then
    log "$XC_LANE signs automatically (no *_PROFILE_NAME configured) — no profile to create"
    return 0
  fi
  require_var APPLE_BUNDLE_ID
  _need_asc

  local profile_type extension
  case "$XC_LANE" in
    mac) profile_type="MAC_APP_STORE"; extension="provisionprofile" ;;
    *)   profile_type="IOS_APP_STORE"; extension="mobileprovision" ;;
  esac
  log "profile '$XC_PROFILE_NAME' — $profile_type for $APPLE_BUNDLE_ID"

  local existing profile_id state answer
  existing="$(asc_get /profiles "limit=200" \
    | _asc_py 'name, kind = sys.argv[2], sys.argv[3]
for p in d.get("data", []):
    a = p["attributes"]
    if a["name"] == name and a["profileType"] == kind:
        print(p["id"], a["profileState"]); break' "$XC_PROFILE_NAME" "$profile_type")" || existing=""

  profile_id=""
  if [ -n "$existing" ]; then
    profile_id="$(printf '%s\n' "$existing" | awk '{print $1}')"
    state="$(printf '%s\n' "$existing" | awk '{print $2}')"
    if [ "$recreate" -eq 1 ] || [ "$state" != "ACTIVE" ]; then
      log "replacing profile $profile_id ($state)"
      asc_delete "/profiles/$profile_id" >/dev/null 2>&1 || true
      profile_id=""
    else
      log "profile already exists and is ACTIVE"
    fi
  fi

  if [ -z "$profile_id" ]; then
    local bundle_resource local_serial cert_id payload
    bundle_resource="$(asc_get /bundleIds "filter[identifier]=$APPLE_BUNDLE_ID&limit=10" \
      | _asc_py 'want = sys.argv[2]
for b in d.get("data", []):
    if b["attributes"]["identifier"] == want:
        print(b["id"]); break' "$APPLE_BUNDLE_ID")"
    [ -n "$bundle_resource" ] || die "identifier $APPLE_BUNDLE_ID is not registered in the developer portal"

    local_serial="$(security find-certificate -c "Apple Distribution: " -p 2>/dev/null \
      | openssl x509 -noout -serial 2>/dev/null | cut -d= -f2 || true)"
    if [ -z "$local_serial" ]; then
      die "no 'Apple Distribution' identity in the keychain. Create one at developer.apple.com → Certificates → +, download it and double-click it; this script never creates certificates, because the private key has to be generated on this machine."
    fi

    # An account commonly holds several distribution certificates and only one has its
    # private key here. Match by serial: taking the first entry yields a profile that
    # validates server-side and then fails at codesign.
    cert_id="$(asc_get /certificates "limit=200" \
      | _asc_py 'import base64, subprocess
local = sys.argv[2].lower().lstrip("0")
for c in d.get("data", []):
    a = c["attributes"]
    if a.get("certificateType") not in ("DISTRIBUTION", "MAC_APP_DISTRIBUTION"):
        continue
    der = base64.b64decode(a["certificateContent"])
    out = subprocess.run(["openssl", "x509", "-inform", "DER", "-noout", "-serial"],
                         input=der, capture_output=True).stdout.decode()
    if out.strip().split("=")[1].lower().lstrip("0") == local:
        print(c["id"]); break' "$local_serial")"
    [ -n "$cert_id" ] || die "no account certificate matches the private key in this keychain"
    log "certificate $cert_id, identifier $bundle_resource"

    payload="$(python3 -c '
import json, sys
name, kind, bundle, cert = sys.argv[1:5]
print(json.dumps({"data": {"type": "profiles",
  "attributes": {"name": name, "profileType": kind},
  "relationships": {"bundleId": {"data": {"type": "bundleIds", "id": bundle}},
                    "certificates": {"data": [{"type": "certificates", "id": cert}]}}}}))
' "$XC_PROFILE_NAME" "$profile_type" "$bundle_resource" "$cert_id")"
    answer="$(asc_post /profiles "$payload")" || die "could not create the profile"
  else
    answer="$(asc_get "/profiles/$profile_id")"
  fi

  # Install into both directories xcodebuild consults — which one it reads depends on the
  # Xcode version, and writing both costs nothing.
  printf '%s' "$answer" | python3 - "$extension" <<'PY'
import base64, json, pathlib, sys
attributes = json.load(sys.stdin)["data"]["attributes"]
content = base64.b64decode(attributes["profileContent"])
name = "%s.%s" % (attributes["uuid"], sys.argv[1])
for directory in (pathlib.Path.home() / "Library/MobileDevice/Provisioning Profiles",
                  pathlib.Path.home() / "Library/Developer/Xcode/UserData/Provisioning Profiles"):
    directory.mkdir(parents=True, exist_ok=True)
    (directory / name).write_bytes(content)
    print("installed: %s" % (directory / name), file=sys.stderr)
print("  name=%s  state=%s  expires=%s" % (attributes["name"], attributes["profileState"],
                                           attributes.get("expirationDate", "")[:10]), file=sys.stderr)
PY
  log "profile installed"
}

# ---------------------------------------------------------------------------
# Running the app for development
# ---------------------------------------------------------------------------

# The .app a build left behind. Prefer the scheme's own product: after a rename the old
# bundle sits next to the new one and wins alphabetically, which installs last month's app
# while the run still reports success.
_product_app() {
  local products="$1" scheme="$2"
  if [ -d "$products/$scheme.app" ]; then
    printf '%s\n' "$products/$scheme.app"
    return 0
  fi
  ls -td "$products"/*.app 2>/dev/null | head -1
}

# simulator_run — build for $SIMULATOR, boot it, install, launch and tail the console.
simulator_run() {
  require_cmd xcodebuild xcrun
  require_var SIMULATOR APPLE_BUNDLE_ID
  xcode_regenerate
  _lane_target ios
  local derived products app logfile
  derived="$BUILD_DIR/simulator/DerivedData"
  logfile="$BUILD_DIR/simulator/build.log"
  mkdir -p "$BUILD_DIR/simulator"
  log "building $XC_SCHEME (Debug) for the simulator '$SIMULATOR'"
  if ! xcodebuild "$XC_PROJECT_FLAG" "$XC_PROJECT" \
      -scheme "$XC_SCHEME" \
      -configuration Debug \
      -destination "platform=iOS Simulator,name=$SIMULATOR" \
      -derivedDataPath "$derived" \
      build >"$logfile" 2>&1; then
    warn "build failed — last 30 lines of $logfile:"
    tail -30 "$logfile" >&2
    die "simulator build failed"
  fi
  products="$derived/Build/Products/Debug-iphonesimulator"
  app="$(_product_app "$products" "$XC_SCHEME")"
  [ -n "$app" ] || die "no .app under $products — see $logfile"

  log "booting '$SIMULATOR'"
  # "Unable to boot device in current state: Booted" is the normal case on a second run.
  xcrun simctl boot "$SIMULATOR" >/dev/null 2>&1 || true
  open -a Simulator >/dev/null 2>&1 || true
  log "installing $app"
  xcrun simctl install booted "$app"
  log "launching $APPLE_BUNDLE_ID"
  xcrun simctl launch --console-pty booted "$APPLE_BUNDLE_ID"
}

# mac_run — build the Mac scheme Debug and open the product.
mac_run() {
  require_cmd xcodebuild
  xcode_regenerate
  _lane_target mac
  local derived products app logfile
  derived="$BUILD_DIR/macos/DerivedData"
  logfile="$BUILD_DIR/macos/build.log"
  mkdir -p "$BUILD_DIR/macos"
  log "building $XC_SCHEME (Debug) for macOS"
  if ! xcodebuild "$XC_PROJECT_FLAG" "$XC_PROJECT" \
      -scheme "$XC_SCHEME" \
      -configuration Debug \
      -destination "platform=macOS" \
      -derivedDataPath "$derived" \
      build >"$logfile" 2>&1; then
    warn "build failed — last 30 lines of $logfile:"
    tail -30 "$logfile" >&2
    die "Mac build failed"
  fi
  products="$derived/Build/Products/Debug"
  app="$(_product_app "$products" "$XC_SCHEME")"
  [ -n "$app" ] || die "no .app under $products — see $logfile"
  log "opening $app"
  open "$app"
}

# device_list — one line per paired iPhone/iPad: <devicectl id> TAB <hardware udid> TAB <name>.
#
# devicectl and xcodebuild use DIFFERENT ids for the same device: devicectl installs and
# launches by the CoreDevice identifier, while `xcodebuild -destination id=…` wants the
# hardware UDID. Printing both is the whole point of this function.
device_list() {
  require_cmd xcrun python3
  local tmp
  tmp="$(mktemp -t kartograph-devices)"
  xcrun devicectl list devices --json-output "$tmp" >/dev/null 2>&1 || true
  python3 - "$tmp" <<'PY'
import json, sys
try:
    data = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    sys.exit(0)
for device in data.get("result", {}).get("devices", []):
    hardware = device.get("hardwareProperties", {})
    properties = device.get("deviceProperties", {})
    connection = device.get("connectionProperties", {})
    if (hardware.get("deviceType") or "").lower() not in ("iphone", "ipad"):
        continue
    if connection.get("pairingState") not in (None, "paired", "connected"):
        continue
    print("\t".join([device.get("identifier", ""),
                     hardware.get("udid", ""),
                     properties.get("name", "")]))
PY
  rm -f "$tmp"
}

# The signing team for a Debug device build. TEAM_ID wins; otherwise the team of an
# installed provisioning profile — proof that an Xcode account exists for it. A bare
# keychain certificate is NOT enough: automatic signing needs the account.
_signing_team() {
  local team="${TEAM_ID:-}" profile
  if [ -n "$team" ]; then printf '%s\n' "$team"; return 0; fi
  for profile in "$HOME/Library/MobileDevice/Provisioning Profiles/"*.mobileprovision; do
    [ -e "$profile" ] || continue
    team="$(security cms -D -i "$profile" 2>/dev/null | plutil -extract TeamIdentifier.0 raw -o - - 2>/dev/null || true)"
    [ -n "$team" ] && break
  done
  printf '%s\n' "$team"
}

_device_deploy() {
  local id="$1" udid="$2" name="$3" team="$4"
  local derived products app logfile
  # Per-device derived data: two devices would otherwise clobber each other's signed product.
  derived="$BUILD_DIR/ios-device/$udid"
  logfile="$BUILD_DIR/ios-device/$udid.log"
  mkdir -p "$BUILD_DIR/ios-device"

  log "building $XC_SCHEME (Debug, iphoneos) for $name — $udid"
  # Build against the SPECIFIC device so automatic signing registers this device's UDID and
  # embeds a profile containing it; a generic build does not, and the install then fails
  # with 0xe8008012.
  #
  # Signing is re-enabled here on the command line, for this Debug device build only: a
  # project.yml that turns CODE_SIGNING_ALLOWED off in settings.base (so simulator builds
  # need no team) leaves a device build unsigned and uninstallable. Release archives never
  # get these — there they would break the SPM package targets.
  if ! xcodebuild "$XC_PROJECT_FLAG" "$XC_PROJECT" \
      -scheme "$XC_SCHEME" \
      -configuration Debug \
      -destination "id=$udid" \
      -derivedDataPath "$derived" \
      -allowProvisioningUpdates \
      -allowProvisioningDeviceRegistration \
      CODE_SIGNING_ALLOWED=YES \
      CODE_SIGN_STYLE=Automatic \
      DEVELOPMENT_TEAM="$team" \
      build >"$logfile" 2>&1; then
    warn "build failed for $name — last 30 lines of $logfile:"
    tail -30 "$logfile" >&2
    return 1
  fi

  products="$derived/Build/Products/Debug-iphoneos"
  app="$(_product_app "$products" "$XC_SCHEME")"
  [ -n "$app" ] || { warn "no .app under $products — see $logfile"; return 1; }
  local bundle_id
  bundle_id="$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$app/Info.plist" 2>/dev/null || printf '%s' "${APPLE_BUNDLE_ID:-}")"
  log "built $app (bundle id $bundle_id)"

  log "installing on $name"
  if ! xcrun devicectl device install app --device "$id" "$app" >/dev/null; then
    warn "install failed for $name"
    return 1
  fi
  log "launching $bundle_id"
  # --terminate-existing: relaunching over a running copy otherwise just brings the old
  # process to the front and the change is nowhere to be seen.
  if xcrun devicectl device process launch --terminate-existing --device "$id" "$bundle_id" >/dev/null; then
    log "running on $name"
  else
    warn "auto-launch failed on $name (device locked?) — the app is installed; unlock and tap it"
  fi
  return 0
}

# device_run [UDID] — build, install and launch the Debug build on one paired device
# (matched by either id) or on every paired device when no argument is given.
device_run() {
  local want="${1:-${IOS_UDID:-}}"
  require_cmd xcodebuild xcrun python3
  xcode_regenerate
  _lane_target ios
  local team
  team="$(_signing_team)"
  [ -n "$team" ] || die "no signing team found (no Apple account in Xcode?) — set TEAM_ID in ${CONFIG_FILE:-distribution/config.sh} or run with TEAM_ID=XXXXXXXXXX"
  log "signing team (DEVELOPMENT_TEAM): $team"

  local listing count=0 ok_count=0 failed=""
  listing="$(device_list)"
  [ -n "$listing" ] || die "no paired iPhone or iPad found. Plug it in, unlock it and trust this Mac."

  local id udid name
  while IFS="$(printf '\t')" read -r id udid name; do
    [ -n "$id" ] || continue
    if [ -n "$want" ] && [ "$want" != "$id" ] && [ "$want" != "$udid" ]; then continue; fi
    [ -n "$udid" ] || { warn "could not read the hardware UDID of $name — skipped"; continue; }
    count=$((count + 1))
    printf '\n' >&2
    log "──── $name ($udid)"
    if _device_deploy "$id" "$udid" "$name" "$team"; then
      ok_count=$((ok_count + 1))
    else
      failed="$failed $name"
    fi
  done <<EOF
$listing
EOF

  [ "$count" -gt 0 ] || die "no paired device matched '${want}'. Run device_list to see what is visible."
  log "deployed to $ok_count of $count device(s)"
  if [ -n "$failed" ]; then
    die "failed:$failed"
  fi
}

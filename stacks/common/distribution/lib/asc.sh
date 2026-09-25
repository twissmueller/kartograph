#!/usr/bin/env bash
# App Store Connect: the API token, the HTTP verbs, builds, TestFlight, versions and the
# review submission. Sourced, never executed; common.sh must be sourced first.
#
# Contract: stacks/common/DISTRIBUTION.md, section "asc.sh".
#
# The key id, the issuer and the app id come from config.sh through the environment. The
# token is returned by asc_token and never printed anywhere else; the key file's path may
# be logged, its contents never.
set -euo pipefail

ASC_BASE="${ASC_BASE:-https://api.appstoreconnect.apple.com/v1}"

_ASC_TOKEN=""
_ASC_TOKEN_EXPIRES=0

# ---------------------------------------------------------------------------
# Token
# ---------------------------------------------------------------------------

_b64url() { base64 | tr '+/' '-_' | tr -d '=' | tr -d '\n'; }

# asc_token — an ES256 JWT for the App Store Connect API, valid 20 minutes, cached for the
# life of the process.
#
# openssl signs into a DER SEQUENCE of two INTEGERs, but JWS wants the raw r‖s pair, each
# left-padded to 32 bytes. Feeding the DER blob through unchanged produces a token Apple
# rejects with a 401 that says nothing about the signature format.
asc_token() {
  require_cmd openssl python3
  require_var ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_PATH
  local now
  now="$(date +%s)"
  if [ -n "$_ASC_TOKEN" ] && [ "$now" -lt "$_ASC_TOKEN_EXPIRES" ]; then
    printf '%s\n' "$_ASC_TOKEN"
    return 0
  fi
  local key="$ASC_KEY_PATH"
  case "$key" in "~/"*) key="$HOME/${key#~/}" ;; esac
  [ -f "$key" ] || die "App Store Connect key not found: $key (ASC_KEY_PATH in ${CONFIG_FILE:-distribution/config.sh})"

  local expires header payload signing_input signature
  expires=$((now + 1200))
  header="$(printf '%s' "{\"alg\":\"ES256\",\"kid\":\"$ASC_KEY_ID\",\"typ\":\"JWT\"}" | _b64url)"
  payload="$(printf '%s' "{\"iss\":\"$ASC_ISSUER_ID\",\"iat\":$now,\"exp\":$expires,\"aud\":\"appstoreconnect-v1\"}" | _b64url)"
  signing_input="$header.$payload"
  signature="$(printf '%s' "$signing_input" \
    | openssl dgst -sha256 -sign "$key" \
    | python3 -c '
import base64, sys

der = sys.stdin.buffer.read()

def read_tlv(buf, i):
    tag = buf[i]; i += 1
    length = buf[i]; i += 1
    if length & 0x80:                       # long form
        n = length & 0x7F
        length = int.from_bytes(buf[i:i + n], "big"); i += n
    return tag, buf[i:i + length], i + length

tag, seq, _ = read_tlv(der, 0)
assert tag == 0x30, "expected a DER SEQUENCE"
_, r, i = read_tlv(seq, 0)
_, s, _ = read_tlv(seq, i)

# INTEGERs are signed, so strip any leading 0x00 pad, then left-pad each half to 32 bytes.
raw = r.lstrip(b"\x00").rjust(32, b"\x00") + s.lstrip(b"\x00").rjust(32, b"\x00")
sys.stdout.write(base64.urlsafe_b64encode(raw).decode().rstrip("="))
')"
  [ -n "$signature" ] || die "could not sign the App Store Connect token with $key"
  _ASC_TOKEN="$signing_input.$signature"
  _ASC_TOKEN_EXPIRES=$((now + 1080))       # a couple of minutes of slack before Apple's 20
  printf '%s\n' "$_ASC_TOKEN"
}

# ---------------------------------------------------------------------------
# JSON without jq
#
# _asc_py SNIPPET [ARG...] — run SNIPPET with the JSON on stdin already parsed into `d`;
# `json` and `sys` are imported, SNIPPET's own arguments start at sys.argv[2].
# ---------------------------------------------------------------------------

_asc_py() {
  python3 -c '
import json, sys
raw = sys.stdin.read().strip()
d = json.loads(raw) if raw else {}
exec(sys.argv[1])
' "$@"
}

# _asc_str TEXT — TEXT as a JSON string, quotes and newlines included.
_asc_str() { python3 -c 'import json,sys; sys.stdout.write(json.dumps(sys.argv[1]))' "$1"; }

# ---------------------------------------------------------------------------
# HTTP
#
# Every verb prints the response body on stdout. On HTTP >= 400 it prints the errors
# array's title and detail on stderr — the fields that name the cause — and returns 1.
# `curl -sf` would swallow exactly that body.
# ---------------------------------------------------------------------------

_asc_request() {
  local method="$1" path="$2" query="${3:-}" body="${4:-}"
  require_cmd curl
  local token url response code out
  token="$(asc_token)"
  case "$path" in
    http*) url="$path" ;;
    *)     url="$ASC_BASE$path" ;;
  esac
  if [ -n "$query" ]; then url="$url?$query"; fi

  # -g: the filter[...] query syntax is not a glob.
  if [ -n "$body" ]; then
    response="$(curl -sS -g -w $'\n%{http_code}' -X "$method" "$url" \
      -H "Authorization: Bearer $token" \
      -H "Content-Type: application/json" \
      -d "$body")"
  else
    response="$(curl -sS -g -w $'\n%{http_code}' -X "$method" "$url" \
      -H "Authorization: Bearer $token")"
  fi
  code="$(printf '%s\n' "$response" | tail -n 1)"
  out="$(printf '%s\n' "$response" | sed '$d')"
  if [ "$code" -ge 200 ] && [ "$code" -lt 300 ]; then
    printf '%s\n' "$out"
    return 0
  fi
  warn "App Store Connect: $method ${url%%\?*} → HTTP $code"
  printf '%s' "$out" | _asc_py '
for e in d.get("errors", []):
    print("   %s: %s" % (e.get("title"), e.get("detail")))' >&2 2>/dev/null \
    || printf '%s\n' "$out" >&2
  return 1
}

asc_get()    { _asc_request GET    "${1:?asc_get PATH [QUERY]}"   "${2:-}"; }
asc_post()   { _asc_request POST   "${1:?asc_post PATH JSON}"  "" "${2:?asc_post PATH JSON}"; }
asc_patch()  { _asc_request PATCH  "${1:?asc_patch PATH JSON}" "" "${2:?asc_patch PATH JSON}"; }
asc_delete() { _asc_request DELETE "${1:?asc_delete PATH}"; }

_asc_app() {
  require_var ASC_APP_ID
  printf '%s\n' "$ASC_APP_ID"
}

# ---------------------------------------------------------------------------
# Builds
# ---------------------------------------------------------------------------

# asc_build_latest PLATFORM [VERSION] — the newest build whose processingState is VALID,
# optionally for one marketing version. Prints the build's id; the build number goes to the
# log, because in this API a build's attributes.version IS the build number and the
# marketing version lives on the related preReleaseVersion.
asc_build_latest() {
  local platform="${1:?asc_build_latest PLATFORM [VERSION]}" version="${2:-}" query answer id number
  query="filter[app]=$(_asc_app)&filter[processingState]=VALID&filter[preReleaseVersion.platform]=$platform&sort=-uploadedDate&limit=1"
  if [ -n "$version" ]; then query="$query&filter[preReleaseVersion.version]=$version"; fi
  answer="$(asc_get /builds "$query")" || return 1
  id="$(printf '%s' "$answer" | _asc_py 'print(d["data"][0]["id"] if d.get("data") else "")')"
  number="$(printf '%s' "$answer" | _asc_py 'print(d["data"][0]["attributes"].get("version", "") if d.get("data") else "")')"
  if [ -z "$id" ]; then
    warn "no VALID $platform build${version:+ for $version} — still processing, or the upload never arrived"
    return 1
  fi
  log "build $number ($id) — $platform${version:+ $version}"
  printf '%s\n' "$id"
}

# asc_build_wait PLATFORM VERSION BUILD — poll until Apple has processed that build number,
# with a deadline (ASC_WAIT_SECONDS, 30 minutes by default). Prints the build's id.
asc_build_wait() {
  local platform="${1:?asc_build_wait PLATFORM VERSION BUILD}" version="${2:?}" build="${3:?}"
  local limit="${ASC_WAIT_SECONDS:-1800}" waited=0 interval=30 answer id state query
  query="filter[app]=$(_asc_app)&filter[version]=$build&filter[preReleaseVersion.version]=$version&filter[preReleaseVersion.platform]=$platform&limit=1"
  log "waiting for $platform $version ($build) to finish processing — up to $((limit / 60)) minutes"
  while :; do
    answer="$(asc_get /builds "$query")" || answer='{}'
    id="$(printf '%s' "$answer" | _asc_py 'print(d["data"][0]["id"] if d.get("data") else "")')"
    state="$(printf '%s' "$answer" | _asc_py 'print(d["data"][0]["attributes"].get("processingState", "") if d.get("data") else "")')"
    case "$state" in
      VALID)
        log "build $build is processed"
        printf '%s\n' "$id"
        return 0
        ;;
      FAILED|INVALID)
        die "build $build is $state at Apple — it will never become valid; fix the cause, bump the build number and upload again (a number App Store Connect has accepted is never released)"
        ;;
      "")
        log "  not visible yet (${waited}s)"
        ;;
      *)
        log "  $state (${waited}s)"
        ;;
    esac
    if [ "$waited" -ge "$limit" ]; then
      die "build $build was still '${state:-unknown}' after $((limit / 60)) minutes — look at App Store Connect before uploading anything else"
    fi
    sleep "$interval"
    waited=$((waited + interval))
  done
}

# asc_export_compliance BUILD_ID — declare that the build uses no non-exempt encryption.
# A build whose Info.plist already declares it answers 409: that confirms the declaration
# rather than contradicting it, so this never aborts the run.
asc_export_compliance() {
  local build="${1:?asc_export_compliance BUILD_ID}"
  if asc_patch "/builds/$build" \
      "{\"data\":{\"type\":\"builds\",\"id\":\"$build\",\"attributes\":{\"usesNonExemptEncryption\":false}}}" >/dev/null 2>&1; then
    log "export compliance declared (no non-exempt encryption)"
  else
    log "export compliance already set from the Info.plist key (expected)"
  fi
  return 0
}

# ---------------------------------------------------------------------------
# TestFlight
# ---------------------------------------------------------------------------

# asc_beta_group_ensure — find or create the internal group named $TESTFLIGHT_GROUP.
# Prints its id.
asc_beta_group_ensure() {
  require_var TESTFLIGHT_GROUP
  local app answer id payload
  app="$(_asc_app)"
  answer="$(asc_get /betaGroups "filter[app]=$app&limit=200")" || return 1
  id="$(printf '%s' "$answer" | _asc_py 'want = sys.argv[2]
for g in d.get("data", []):
    a = g["attributes"]
    if a.get("isInternalGroup") and a.get("name") == want:
        print(g["id"]); break' "$TESTFLIGHT_GROUP")"
  if [ -n "$id" ]; then
    log "beta group '$TESTFLIGHT_GROUP' ($id)"
    printf '%s\n' "$id"
    return 0
  fi
  log "creating the internal beta group '$TESTFLIGHT_GROUP'"
  payload="$(python3 -c '
import json, sys
print(json.dumps({"data": {"type": "betaGroups",
  "attributes": {"name": sys.argv[1], "isInternalGroup": True},
  "relationships": {"app": {"data": {"type": "apps", "id": sys.argv[2]}}}}}))
' "$TESTFLIGHT_GROUP" "$app")"
  id="$(asc_post /betaGroups "$payload" | _asc_py 'print(d.get("data", {}).get("id", ""))')"
  [ -n "$id" ] || die "could not create the beta group '$TESTFLIGHT_GROUP'"
  printf '%s\n' "$id"
}

# asc_beta_group_add BUILD_ID — put the build in front of the internal testers.
asc_beta_group_add() {
  local build="${1:?asc_beta_group_add BUILD_ID}" group
  group="$(asc_beta_group_ensure)" || return 1
  if asc_post "/betaGroups/$group/relationships/builds" \
      "{\"data\":[{\"type\":\"builds\",\"id\":\"$build\"}]}" >/dev/null 2>&1; then
    log "build added to '$TESTFLIGHT_GROUP'"
  else
    log "build was already in '$TESTFLIGHT_GROUP'"
  fi
  return 0
}

# asc_beta_localization BUILD_ID LOCALE [DESCRIPTION]
#
# The tester-facing text. The description and the feedback address hang off the APP, not
# off the build (betaAppLocalizations), so the build id is only used to find the app's
# release notes slot: when a fourth argument is given it becomes the build's own What's New
# (betaBuildLocalizations). `locale` may only be set on create, never in a PATCH.
asc_beta_localization() {
  local build="${1:?asc_beta_localization BUILD_ID LOCALE [DESCRIPTION] [WHATS_NEW]}"
  local locale="${2:?asc_beta_localization BUILD_ID LOCALE [DESCRIPTION] [WHATS_NEW]}"
  local description="${3:-${APP_NAME:-This app} — internal test build.}"
  local whats_new="${4:-}"
  require_var BETA_FEEDBACK_EMAIL
  local app answer id payload

  app="$(_asc_app)"
  answer="$(asc_get "/apps/$app/betaAppLocalizations" "limit=50")" || return 1
  id="$(printf '%s' "$answer" | _asc_py 'want = sys.argv[2]
for l in d.get("data", []):
    if l["attributes"]["locale"] == want:
        print(l["id"]); break' "$locale")"
  if [ -n "$id" ]; then
    payload="$(python3 -c '
import json, sys
print(json.dumps({"data": {"type": "betaAppLocalizations", "id": sys.argv[1],
  "attributes": {"description": sys.argv[2], "feedbackEmail": sys.argv[3]}}}))
' "$id" "$description" "$BETA_FEEDBACK_EMAIL")"
    asc_patch "/betaAppLocalizations/$id" "$payload" >/dev/null || return 1
    log "beta app description updated ($locale)"
  else
    payload="$(python3 -c '
import json, sys
print(json.dumps({"data": {"type": "betaAppLocalizations",
  "attributes": {"locale": sys.argv[1], "description": sys.argv[2], "feedbackEmail": sys.argv[3]},
  "relationships": {"app": {"data": {"type": "apps", "id": sys.argv[4]}}}}}))
' "$locale" "$description" "$BETA_FEEDBACK_EMAIL" "$app")"
    asc_post /betaAppLocalizations "$payload" >/dev/null || return 1
    log "beta app description created ($locale)"
  fi

  if [ -n "$whats_new" ]; then
    answer="$(asc_get "/builds/$build/betaBuildLocalizations" "limit=50")" || return 0
    id="$(printf '%s' "$answer" | _asc_py 'want = sys.argv[2]
for l in d.get("data", []):
    if l["attributes"]["locale"] == want:
        print(l["id"]); break' "$locale")"
    if [ -n "$id" ]; then
      payload="$(python3 -c '
import json, sys
print(json.dumps({"data": {"type": "betaBuildLocalizations", "id": sys.argv[1],
  "attributes": {"whatsNew": sys.argv[2]}}}))
' "$id" "$whats_new")"
      asc_patch "/betaBuildLocalizations/$id" "$payload" >/dev/null || true
    else
      payload="$(python3 -c '
import json, sys
print(json.dumps({"data": {"type": "betaBuildLocalizations",
  "attributes": {"locale": sys.argv[1], "whatsNew": sys.argv[2]},
  "relationships": {"build": {"data": {"type": "builds", "id": sys.argv[3]}}}}}))
' "$locale" "$whats_new" "$build")"
      asc_post /betaBuildLocalizations "$payload" >/dev/null || true
    fi
    log "test notes set for build $build ($locale)"
  fi
  return 0
}

# ---------------------------------------------------------------------------
# App Store versions
# ---------------------------------------------------------------------------

# The states in which App Store Connect still lets a version be changed. Editable is not
# only PREPARE_FOR_SUBMISSION: a rejected version is editable too, and that is exactly the
# case in which a new build is wanted. A list that knew only the first state left a
# rejected version standing and resubmitted the very binary that had just been rejected.
# WAITING_FOR_REVIEW is in here because its metadata is still patchable — the binary is not.
# The states of a version that has been on sale at some point. An app removed from sale, or
# a version replaced by a newer one, has had its first release: What's New is accepted
# from then on, and the next version has to be newer than the highest of them.
ASC_SHIPPED_STATES="READY_FOR_SALE READY_FOR_DISTRIBUTION DEVELOPER_REMOVED_FROM_SALE REMOVED_FROM_SALE REPLACED_WITH_NEW_VERSION"

ASC_EDITABLE_STATES="PREPARE_FOR_SUBMISSION DEVELOPER_REJECTED REJECTED METADATA_REJECTED INVALID_BINARY WAITING_FOR_REVIEW"

# asc_version_exists PLATFORM VERSION — true when a version in an editable state already
# carries exactly VERSION; never creates one, so callers can decide whether creating one
# needs confirming before asc_version_editable does it.
asc_version_exists() {
  local platform="${1:?asc_version_exists PLATFORM VERSION}" version="${2:?asc_version_exists PLATFORM VERSION}" app answer id
  app="$(_asc_app)"
  answer="$(asc_get "/apps/$app/appStoreVersions" "filter[platform]=$platform&limit=50")" || return 1
  id="$(printf '%s' "$answer" | _asc_py 'want, states = sys.argv[2], set(sys.argv[3].split())
for v in d.get("data", []):
    a = v["attributes"]
    state = a.get("appStoreState") or a.get("appVersionState")
    if state in states and a.get("versionString") == want:
        print(v["id"]); break' "$version" "$ASC_EDITABLE_STATES")"
  [ -n "$id" ]
}

# asc_version_editable PLATFORM [X.Y.Z] — print the id of the version in an editable state,
# creating it with releaseType AFTER_APPROVAL when none exists and a version string is given.
# What is in review or on sale is never touched: a script that reroutes a running submission
# by accident would not be worth the convenience.
asc_version_editable() {
  local platform="${1:?asc_version_editable PLATFORM [X.Y.Z]}" version="${2:-}" app answer id payload
  app="$(_asc_app)"
  answer="$(asc_get "/apps/$app/appStoreVersions" "filter[platform]=$platform&limit=50")" || return 1
  id="$(printf '%s' "$answer" | _asc_py 'want, states = sys.argv[2], set(sys.argv[3].split())
for v in d.get("data", []):
    a = v["attributes"]
    # Older responses call it appStoreState, newer ones appVersionState.
    state = a.get("appStoreState") or a.get("appVersionState")
    if state not in states:
        continue
    if want and a.get("versionString") != want:
        continue
    print(v["id"]); break' "$version" "$ASC_EDITABLE_STATES")"
  if [ -n "$id" ]; then
    log "editable $platform version${version:+ $version}: $id"
    printf '%s\n' "$id"
    return 0
  fi
  if [ -z "$version" ]; then
    warn "no editable $platform version — create one, or pass the version string so it can be created"
    return 1
  fi
  log "creating $platform version $version (releaseType AFTER_APPROVAL)"
  payload="$(python3 -c '
import json, sys
print(json.dumps({"data": {"type": "appStoreVersions",
  "attributes": {"platform": sys.argv[1], "versionString": sys.argv[2], "releaseType": "AFTER_APPROVAL"},
  "relationships": {"app": {"data": {"type": "apps", "id": sys.argv[3]}}}}}))
' "$platform" "$version" "$app")"
  id="$(asc_post /appStoreVersions "$payload" | _asc_py 'print(d.get("data", {}).get("id", ""))')"
  [ -n "$id" ] || die "could not create the $platform version $version"
  printf '%s\n' "$id"
}

# asc_version_attach VERSION_ID BUILD_ID — the build the store page (and its icon) comes
# from. A rejected version keeps its rejected build until someone attaches a new one.
asc_version_attach() {
  local version="${1:?asc_version_attach VERSION_ID BUILD_ID}" build="${2:?asc_version_attach VERSION_ID BUILD_ID}"
  asc_patch "/appStoreVersions/$version/relationships/build" \
    "{\"data\":{\"type\":\"builds\",\"id\":\"$build\"}}" >/dev/null || return 1
  log "build $build attached to version $version"
}

# asc_version_whats_new VERSION_ID LOCALE TEXT
asc_version_whats_new() {
  local version="${1:?asc_version_whats_new VERSION_ID LOCALE TEXT}"
  local locale="${2:?asc_version_whats_new VERSION_ID LOCALE TEXT}"
  local text="${3:?asc_version_whats_new VERSION_ID LOCALE TEXT}"
  local answer id payload
  answer="$(asc_get "/appStoreVersions/$version/appStoreVersionLocalizations" "limit=50")" || return 1
  id="$(printf '%s' "$answer" | _asc_py 'want = sys.argv[2]
for l in d.get("data", []):
    if l["attributes"]["locale"] == want:
        print(l["id"]); break' "$locale")"
  if [ -n "$id" ]; then
    payload="$(python3 -c '
import json, sys
print(json.dumps({"data": {"type": "appStoreVersionLocalizations", "id": sys.argv[1],
  "attributes": {"whatsNew": sys.argv[2]}}}))
' "$id" "$text")"
    asc_patch "/appStoreVersionLocalizations/$id" "$payload" >/dev/null || return 1
  else
    payload="$(python3 -c '
import json, sys
print(json.dumps({"data": {"type": "appStoreVersionLocalizations",
  "attributes": {"locale": sys.argv[1], "whatsNew": sys.argv[2]},
  "relationships": {"appStoreVersion": {"data": {"type": "appStoreVersions", "id": sys.argv[3]}}}}}))
' "$locale" "$text" "$version")"
    asc_post /appStoreVersionLocalizations "$payload" >/dev/null || return 1
  fi
  log "what's new set for $locale"
}

# asc_version_on_sale PLATFORM — the highest versionString ever on sale on PLATFORM (a
# state in ASC_SHIPPED_STATES), or nothing when no version ever went on sale: a first
# release. Compared numerically, so the order of the response does not matter. That is the case in which Apple
# refuses What's New (409, worded like a malformed request), because there is nothing for
# it to be new against. Returns non-zero only when the versions cannot be read, so an
# empty answer always means "first release", never "unknown".
asc_version_on_sale() {
  local platform="${1:?asc_version_on_sale PLATFORM}" app answer
  app="$(_asc_app)"
  answer="$(asc_get "/apps/$app/appStoreVersions" "filter[platform]=$platform&limit=50")" || return 1
  printf '%s' "$answer" | _asc_py 'shipped = set(sys.argv[2].split())
found = []
for v in d.get("data", []):
    a = v["attributes"]
    # Older responses call it appStoreState, newer ones appVersionState.
    if (a.get("appStoreState") or a.get("appVersionState")) not in shipped:
        continue
    parts = (a.get("versionString", "").split(".") + ["0", "0"])[:3]
    if all(p.isdigit() for p in parts):
        found.append((tuple(int(p) for p in parts), a["versionString"]))
if found:
    print(max(found)[1])' "$ASC_SHIPPED_STATES"
}

# ---------------------------------------------------------------------------
# Review submission
# ---------------------------------------------------------------------------

# asc_subscriptions_pending — one line per subscription waiting for its first review:
# "<productId> <id>". READY_TO_SUBMIT means complete but attached to no submission, which
# is precisely the state that gets an app rejected under Guideline 2.1(b) ("one or more of
# the In-App Purchase products have not been submitted for review"). Nothing is printed
# when there is nothing waiting, so the caller can test for emptiness.
asc_subscriptions_pending() {
  local app answer
  app="$(_asc_app)"
  answer="$(asc_get "/apps/$app/subscriptionGroups" "include=subscriptions&limit=50")" || return 0
  printf '%s' "$answer" | _asc_py '
for s in d.get("included", []):
    if s.get("type") != "subscriptions":
        continue
    a = s["attributes"]
    if a.get("state") == "READY_TO_SUBMIT":
        print(a.get("productId", ""), s["id"])'
}

# asc_review_submit PLATFORM [X.Y.Z]
#
# Three steps that must all succeed, and the middle one is the one everybody forgets:
#   1. create or reuse a reviewSubmission for this app and platform (Apple allows one open
#      submission at a time; READY_FOR_REVIEW and UNRESOLVED_ISSUES are reusable),
#   2. add the appStoreVersion as a reviewSubmissionItem — without it the submission is
#      empty and never reaches a reviewer,
#   3. PATCH submitted=true, then check that the state really left the draft.
#
# It refuses when a subscription is still waiting: a subscription is not submitted by being
# finished, it has to hang off a review as its own item, and the API cannot put it there
# for a FIRST review (reviewSubmissionItems knows no `subscription` relationship for that
# case). Submitting the version without it would earn the same 2.1(b) rejection again.
asc_review_submit() {
  local platform="${1:?asc_review_submit PLATFORM [X.Y.Z]}" version_string="${2:-}"
  local app version_id build answer submission items payload state pending
  app="$(_asc_app)"

  version_id="$(asc_version_editable "$platform" "$version_string")" || return 1

  build="$(asc_get "/appStoreVersions/$version_id/build" \
    | _asc_py 'print((d.get("data") or {}).get("attributes", {}).get("version", ""))')" || build=""
  if [ -z "$build" ]; then
    die "the $platform version carries no build — attach one first, or Apple reviews an empty version"
  fi
  log "$platform version carries build $build"

  answer="$(asc_get /reviewSubmissions "filter[app]=$app&filter[platform]=$platform&limit=20")" || return 1
  submission="$(printf '%s' "$answer" | _asc_py '
for s in d.get("data", []):
    if s["attributes"].get("state") in ("READY_FOR_REVIEW", "UNRESOLVED_ISSUES"):
        print(s["id"]); break')"
  if [ -n "$submission" ]; then
    log "reusing the open review submission $submission"
  else
    log "creating a review submission for $platform"
    payload="$(python3 -c '
import json, sys
print(json.dumps({"data": {"type": "reviewSubmissions",
  "attributes": {"platform": sys.argv[1]},
  "relationships": {"app": {"data": {"type": "apps", "id": sys.argv[2]}}}}}))
' "$platform" "$app")"
    submission="$(asc_post /reviewSubmissions "$payload" | _asc_py 'print(d.get("data", {}).get("id", ""))')"
    [ -n "$submission" ] || die "could not create a review submission for $platform"
  fi

  items="$(asc_get "/reviewSubmissions/$submission/items" "limit=50" \
    | _asc_py '
for i in d.get("data", []):
    rel = i.get("relationships", {})
    for key in ("appStoreVersion", "subscription"):
        data = (rel.get(key) or {}).get("data")
        if data:
            print(data.get("id", ""))')" || items=""
  items="$(printf '%s' "$items" | tr '\n' ' ')"
  case " $items " in
    *" $version_id "*) log "the version is already attached to the submission" ;;
    *)
      payload="$(python3 -c '
import json, sys
print(json.dumps({"data": {"type": "reviewSubmissionItems",
  "relationships": {"reviewSubmission": {"data": {"type": "reviewSubmissions", "id": sys.argv[1]}},
                    "appStoreVersion": {"data": {"type": "appStoreVersions", "id": sys.argv[2]}}}}}))
' "$submission" "$version_id")"
      asc_post /reviewSubmissionItems "$payload" >/dev/null || die "could not attach the version to the submission"
      log "version attached to the submission"
      ;;
  esac

  pending="$(asc_subscriptions_pending)"
  if [ -n "$pending" ]; then
    warn "these subscriptions are still READY_TO_SUBMIT:"
    printf '%s\n' "$pending" | sed 's/^/   /' >&2
    warn "A subscription's FIRST review is ticked in App Store Connect while submitting the"
    warn "version — the API has no way to add it. Submitting without it repeats the"
    warn "Guideline 2.1(b) rejection, so nothing was submitted."
    return 1
  fi

  payload="{\"data\":{\"type\":\"reviewSubmissions\",\"id\":\"$submission\",\"attributes\":{\"submitted\":true}}}"
  state="$(asc_patch "/reviewSubmissions/$submission" "$payload" \
    | _asc_py 'print(d.get("data", {}).get("attributes", {}).get("state", ""))')" || state=""
  case "$state" in
    WAITING_FOR_REVIEW|IN_REVIEW|COMPLETING|COMPLETE)
      log "$platform submitted to App Store Review (state: $state)"
      ;;
    *)
      die "the submission did not enter review (state: ${state:-unknown}) — nothing was published"
      ;;
  esac
}

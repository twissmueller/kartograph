#!/usr/bin/env bash
# Google Play Developer API: token, edits, bundles, tracks, promotion, verification.
# Sourced, never executed; expects lib/common.sh to be sourced first.
# Contract: stacks/common/DISTRIBUTION.md in the Kartograph plugin.
#
# Everything a deploy does happens inside one edit that is committed last, so a
# failure part-way leaves the live listing untouched.
set -euo pipefail

PLAY_API_BASE="https://androidpublisher.googleapis.com/androidpublisher/v3/applications"
PLAY_UPLOAD_BASE="https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications"
PLAY_SCOPE="https://www.googleapis.com/auth/androidpublisher"
PLAY_TOKEN_URI_FALLBACK="https://oauth2.googleapis.com/token"
PLAY_RELEASE_NOTES_CAP=500          # Play truncates a longer "what's new" with an unnamed error
_PLAY_TOKEN=""                      # cached for this process; never logged, never printed
# The status of the last play_api call, so a caller can tell a 404 from a 403. It lives in a
# file, not a variable: play_api is almost always called inside $(...), and a variable set in
# that subshell never reaches the caller.
_PLAY_STATUS_FILE="${TMPDIR:-/tmp}/play-status.$$"

# play_http_code: the HTTP status of the last play_api call, empty when it never got a reply.
play_http_code() { cat "$_PLAY_STATUS_FILE" 2>/dev/null || true; }

# ---------- authentication ----------

# base64url without padding, the only encoding a JWT accepts.
# openssl base64 -A rather than base64: GNU base64 wraps at 76 columns, BSD base64 has no -w.
_play_b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

_play_sa_email() {
  json_get "$PLAY_SERVICE_ACCOUNT" client_email 2>/dev/null || printf '%s\n' "the service account"
}

# _play_json TEXT DOTTED.PATH: a field out of a response body.
# json_get's "-" form cannot be used here: its python script is itself a heredoc on
# stdin, so stdin is no longer free for the document. Process substitution gives it a path.
_play_json() { json_get <(printf '%s' "$1") "$2"; }

# play_token: mint an OAuth access token from the service-account key and cache it in
# $_PLAY_TOKEN for the rest of the process. Prints nothing — a token in a log, a
# transcript or a CI artefact is a published credential.
play_token() {
  [ -n "${_PLAY_TOKEN:-}" ] && return 0
  require_var PLAY_SERVICE_ACCOUNT
  require_cmd python3 openssl curl
  [ -f "$PLAY_SERVICE_ACCOUNT" ] || die "no service-account key at $PLAY_SERVICE_ACCOUNT — create one in the Google Cloud console for the project linked to the Play Console, download the JSON, and put it there (${CONFIG_FILE:-distribution/config.sh} holds the path, never the contents)"

  local client_email token_uri pem now exp header claims sig jwt response token reason
  client_email="$(json_get "$PLAY_SERVICE_ACCOUNT" client_email)"
  token_uri="$(json_get "$PLAY_SERVICE_ACCOUNT" token_uri)"
  [ -n "$client_email" ] || die "$PLAY_SERVICE_ACCOUNT has no client_email — that is not a service-account key"
  [ -n "$token_uri" ] || token_uri="$PLAY_TOKEN_URI_FALLBACK"

  # The private key only ever reaches openssl through a file of its own, deleted
  # immediately: a key on a command line is visible to every process on the machine.
  pem="$(mktemp "${TMPDIR:-/tmp}/play-key.XXXXXX")"
  chmod 600 "$pem"
  if ! python3 - "$PLAY_SERVICE_ACCOUNT" >"$pem" <<'PY'
import json, sys
print(json.load(open(sys.argv[1], encoding="utf-8"))["private_key"])
PY
  then rm -f "$pem"; die "could not read the private key from $PLAY_SERVICE_ACCOUNT"; fi

  now="$(date +%s)"; exp=$((now + 3600))
  header="$(printf '%s' '{"alg":"RS256","typ":"JWT"}' | _play_b64url)"
  claims="$(printf '%s' "{\"iss\":\"$client_email\",\"scope\":\"$PLAY_SCOPE\",\"aud\":\"$token_uri\",\"iat\":$now,\"exp\":$exp}" | _play_b64url)"
  if ! sig="$(printf '%s' "$header.$claims" | openssl dgst -sha256 -sign "$pem" | _play_b64url)"; then
    rm -f "$pem"; die "openssl could not sign the assertion with the key in $PLAY_SERVICE_ACCOUNT"
  fi
  rm -f "$pem"
  jwt="$header.$claims.$sig"

  log "authenticating as $client_email"
  response="$(curl -sS -X POST "$token_uri" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --data-urlencode "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer" \
    --data-urlencode "assertion=$jwt" || true)"
  token="$(_play_json "$response" access_token 2>/dev/null || true)"
  if [ -z "$token" ]; then
    # The body carries the reason (invalid_grant when the clock is off, disabled key, …)
    # and no token, so it is safe to show.
    reason="$(_play_json "$response" error_description 2>/dev/null || true)"
    die "the service account could not get an access token: ${reason:-${response:-no response}}"
  fi
  _PLAY_TOKEN="$token"
}

# ---------- the API ----------

# play_api METHOD PATH [JSON|@FILE] [CONTENT_TYPE]
# PATH is appended to .../applications/$PLAY_PACKAGE_NAME; an absolute https:// PATH is
# used as it is (the upload endpoint lives on a different base). Prints the response body.
# On HTTP >= 400 it prints the body to stderr and returns 1 — never curl -sf: Play's reason
# (a missing Advertising ID declaration, a policy form, a duplicate versionCode) is only
# ever in the body, and swallowing it leaves a failure that cannot be diagnosed.
play_api() {
  local method="$1" path="$2" body="${3:-}" content_type="${4:-application/json}"
  require_var PLAY_PACKAGE_NAME
  play_token

  local url
  case "$path" in
    https://*) url="$path" ;;
    /*)        url="$PLAY_API_BASE/$PLAY_PACKAGE_NAME$path" ;;
    *)         url="$PLAY_API_BASE/$PLAY_PACKAGE_NAME/$path" ;;
  esac

  local out code
  out="$(mktemp "${TMPDIR:-/tmp}/play-api.XXXXXX")"
  set -- -sS -X "$method" "$url" -H "Authorization: Bearer $_PLAY_TOKEN" -o "$out" -w '%{http_code}'
  if [ -n "$body" ]; then
    case "$body" in
      # A bundle is tens of megabytes: give it a real deadline instead of curl's none.
      @*) set -- "$@" -H "Content-Type: $content_type" --max-time 1800 --data-binary "$body" ;;
      *)  set -- "$@" -H "Content-Type: $content_type" --data-binary "$body" ;;
    esac
  else
    set -- "$@" -H "Content-Length: 0"
  fi

  if ! code="$(curl "$@")"; then
    rm -f "$out"
    : >"$_PLAY_STATUS_FILE" 2>/dev/null || true
    printf '%s\n' "the request did not reach Google ($method $url)" >&2
    return 1
  fi
  printf '%s' "$code" >"$_PLAY_STATUS_FILE" 2>/dev/null || true
  case "$code" in
    [45]*)
      printf '%s\n' "HTTP $code on $method ${url#"$PLAY_API_BASE/"}" >&2
      cat "$out" >&2
      printf '\n' >&2
      rm -f "$out"
      return 1 ;;
  esac
  cat "$out"
  rm -f "$out"
}

# ---------- edits ----------

# play_edit_open: prints the new edit id. 404 and 403 look alike from here and need
# opposite fixes, so they are named apart rather than reported as "could not open an edit".
play_edit_open() {
  local body edit
  # The body goes to stderr from play_api; the diagnosis below adds what to do about it.
  if body="$(play_api POST /edits '{}')"; then
    edit="$(_play_json "$body" id 2>/dev/null || true)"
    [ -n "$edit" ] || die "the Play API accepted the request but returned no edit id"
    log "edit $edit opened"
    printf '%s\n' "$edit"
    return 0
  fi
  local status
  status="$(play_http_code)"
  case "$status" in
    404) die "no Play Console entry for $PLAY_PACKAGE_NAME — create the app in the Play Console first; the API cannot" ;;
    403) die "the app exists but the service account has no access to it. Grant $(_play_sa_email) access under Users and permissions in the Play Console — permissions are per-app unless granted account-wide." ;;
    *)   die "could not open an edit for $PLAY_PACKAGE_NAME (HTTP ${status:-no response})" ;;
  esac
}

# play_edit_commit EDIT_ID: prints the commit response on success. On failure the body
# is shown and the "draft app" trap is named, because Play's wording does not say what to do.
play_edit_commit() {
  local edit="$1" out
  [ -n "$edit" ] || die "play_edit_commit needs an edit id"
  log "committing edit $edit"
  if out="$(play_api POST "/edits/$edit:commit" 2>&1)"; then
    log "committed"
    printf '%s\n' "$out"
    return 0
  fi
  printf '%s\n' "$out" >&2
  warn "the commit failed — nothing was published"
  case "$out" in
    *"draft app"*)
      warn "this app has never been published, so Play accepts only a release with status 'draft'. Stage one, then finish it in the console: countries and regions, then Publishing overview → Submit changes for review." ;;
    *"Advertising ID"*|*"advertising ID"*)
      warn "Play is waiting for the Advertising ID declaration under Policy → App content." ;;
  esac
  return 1
}

# play_edit_delete EDIT_ID: discard an edit. Never fatal — an abandoned edit expires by itself.
play_edit_delete() {
  local edit="${1:-}"
  [ -n "$edit" ] || return 0
  if play_api DELETE "/edits/$edit" >/dev/null 2>&1; then
    log "edit $edit discarded — nothing was published"
  else
    warn "could not discard edit $edit (it expires on its own)"
  fi
}

# ---------- bundles ----------

# play_upload_bundle EDIT_ID AAB: prints the versionCode Play assigned.
# The upload endpoint has its own host prefix, hence the absolute path.
play_upload_bundle() {
  local edit="$1" aab="$2" body code size
  [ -n "$edit" ] || die "play_upload_bundle needs an edit id"
  [ -f "$aab" ] || die "no bundle at $aab"
  require_var PLAY_PACKAGE_NAME
  size="$(du -h "$aab" | awk '{print $1}')"
  log "uploading $(basename "$aab") ($size) to edit $edit"
  if ! body="$(play_api POST "$PLAY_UPLOAD_BASE/$PLAY_PACKAGE_NAME/edits/$edit/bundles?uploadType=media" "@$aab" application/octet-stream)"; then
    play_edit_delete "$edit"
    die "the bundle was not accepted — nothing was published"
  fi
  code="$(_play_json "$body" versionCode 2>/dev/null || true)"
  if [ -z "$code" ]; then
    play_edit_delete "$edit"
    die "the upload returned no versionCode — Play refuses a versionCode it has already accepted, so raise it and try again"
  fi
  log "versionCode $code"
  printf '%s\n' "$code"
}

# ---------- tracks ----------

# The first entry of $LOCALES, in Play's language format.
_play_default_locale() {
  local first
  first="$(printf '%s\n' "${LOCALES:-en-US}" | awk '{print $1}')"
  play_locale "$first"
}

# play_locale en_us | en | en-US → en-US. Play wants language-REGION.
play_locale() {
  local raw lang region
  raw="$(printf '%s' "${1:-}" | tr '_' '-')"
  case "$raw" in
    "") printf 'en-US\n' ;;
    *-*)
      lang="${raw%%-*}"; region="${raw#*-}"
      printf '%s-%s\n' "$(printf '%s' "$lang" | tr 'A-Z' 'a-z')" "$(printf '%s' "$region" | tr 'a-z' 'A-Z')" ;;
    *)
      lang="$(printf '%s' "$raw" | tr 'A-Z' 'a-z')"
      case "$lang" in
        en) printf 'en-US\n' ;; de) printf 'de-DE\n' ;; fr) printf 'fr-FR\n' ;;
        es) printf 'es-ES\n' ;; it) printf 'it-IT\n' ;; nl) printf 'nl-NL\n' ;;
        pt) printf 'pt-PT\n' ;; pl) printf 'pl-PL\n' ;; ru) printf 'ru-RU\n' ;;
        tr) printf 'tr-TR\n' ;; ja) printf 'ja-JP\n' ;; ko) printf 'ko-KR\n' ;;
        zh) printf 'zh-CN\n' ;; *) printf '%s\n' "$lang" ;;
      esac ;;
  esac
}

_play_rollout_valid() {
  local fraction="${1:-}"
  [ -n "$fraction" ] || return 0
  python3 -c 'import sys; f = float(sys.argv[1]); sys.exit(0 if 0 < f <= 1 else 1)' "$fraction" 2>/dev/null \
    || die "the rollout fraction must be above 0 and at most 1 (0.2 means 20% of users), got '$fraction'"
}

# play_track_set EDIT_ID TRACK VERSION_CODE [ROLLOUT] [NOTES_FILE] [LOCALE]
# completed, or inProgress with a userFraction when a rollout is given. Release notes come
# from the notes file's play_short section, capped at Play's 500 characters.
# The body is assembled by python3, never by string concatenation: notes are free text
# in any language and a hand-built JSON string breaks on the first quote or umlaut.
play_track_set() {
  local edit="$1" track="$2" code="$3" rollout="${4:-}" notes_file="${5:-}" locale="${6:-}"
  [ -n "$edit" ] || die "play_track_set needs an edit id"
  [ -n "$track" ] || die "play_track_set needs a track"
  [ -n "$code" ] || die "play_track_set needs a versionCode"
  _play_rollout_valid "$rollout"

  local notes=""
  if [ -n "$notes_file" ]; then
    [ -f "$notes_file" ] || die "release notes not found: $notes_file"
    notes="$(notes_slice "$notes_file" play_short "$PLAY_RELEASE_NOTES_CAP")"
    [ -n "$locale" ] || locale="$(_play_default_locale)"
  fi
  [ -n "$locale" ] && locale="$(play_locale "$locale")"

  local body
  body="$(PLAY_B_TRACK="$track" PLAY_B_CODE="$code" PLAY_B_ROLLOUT="$rollout" \
          PLAY_B_NOTES="$notes" PLAY_B_LOCALE="$locale" python3 - <<'PY'
import json, os
release = {"versionCodes": [os.environ["PLAY_B_CODE"]]}
rollout = os.environ.get("PLAY_B_ROLLOUT", "").strip()
if rollout:
    release["status"] = "inProgress"
    release["userFraction"] = float(rollout)
else:
    release["status"] = "completed"
notes = os.environ.get("PLAY_B_NOTES", "").strip()
if notes:
    release["releaseNotes"] = [{"language": os.environ["PLAY_B_LOCALE"] or "en-US", "text": notes}]
print(json.dumps({"track": os.environ["PLAY_B_TRACK"], "releases": [release]}))
PY
)"

  if ! play_api PUT "/edits/$edit/tracks/$track" "$body" >/dev/null; then
    play_edit_delete "$edit"
    die "could not assign versionCode $code to '$track' — nothing was published"
  fi
  if [ -n "$rollout" ]; then
    log "versionCode $code assigned to '$track' at $(python3 -c 'import sys; print(f"{float(sys.argv[1]) * 100:g}")' "$rollout")% rollout"
  else
    log "versionCode $code assigned to '$track'"
  fi
}

# _play_codes_of TRACK_JSON: the versionCodes of the usable releases on a track, one per
# line, newest first. The response comes in as an argument, not on stdin — the python
# script itself is the heredoc on stdin.
_play_codes_of() {
  python3 - "$1" <<'PY'
import json, sys
try:
    data = json.loads(sys.argv[1])
except Exception:
    sys.exit(1)
codes = []
for release in data.get("releases", []):
    if release.get("status") in ("completed", "inProgress", "draft", "halted"):
        codes.extend(int(c) for c in release.get("versionCodes", []) or [])
for code in sorted(set(codes), reverse=True):
    print(code)
PY
}

# play_track_versions TRACK: the versionCodes currently on TRACK, one per line.
# A track can only be read inside an edit, so it opens a throw-away one and discards it.
play_track_versions() {
  local track="$1" edit body
  [ -n "$track" ] || die "play_track_versions needs a track"
  edit="$(play_edit_open)"
  if ! body="$(play_api GET "/edits/$edit/tracks/$track")"; then
    play_edit_delete "$edit"
    die "could not read the '$track' track"
  fi
  play_edit_delete "$edit"
  _play_codes_of "$body" || true
}

# ---------- promotion ----------

# _play_promote_body TARGET_TRACK ROLLOUT NOTES LOCALE FORCED_STATUS SOURCE_TRACK_JSON
# Prints the target track body carrying the source's own versionCodes — a promotion ships
# the exact artifact that was tested, never a fresh build of the same source.
_play_promote_body() {
  python3 - "$1" "$2" "$3" "$4" "$5" "$6" <<'PY'
import json, sys
track, rollout, notes, locale, forced, source = sys.argv[1:7]
try:
    data = json.loads(source)
except Exception:
    sys.exit(1)
best = None
for release in data.get("releases", []):
    codes = release.get("versionCodes") or []
    if release.get("status") not in ("completed", "inProgress") or not codes:
        continue
    if best is None or max(int(c) for c in codes) > max(int(c) for c in best["versionCodes"]):
        best = release
if best is None:
    sys.exit(1)
out = {"versionCodes": [str(c) for c in best["versionCodes"]]}
if best.get("name"):
    out["name"] = best["name"]
if forced:
    out["status"] = forced
elif rollout.strip():
    out["status"] = "inProgress"
    out["userFraction"] = float(rollout)
else:
    out["status"] = "completed"
if notes.strip():
    out["releaseNotes"] = [{"language": locale or "en-US", "text": notes.strip()}]
elif best.get("releaseNotes"):
    out["releaseNotes"] = best["releaseNotes"]
print(json.dumps({"track": track, "releases": [out]}))
PY
}

# play_promote FROM TO [ROLLOUT] [NOTES_FILE]: one edit — read FROM, set TO, commit last.
play_promote() {
  local from="$1" to="$2" rollout="${3:-}" notes_file="${4:-}"
  [ -n "$from" ] && [ -n "$to" ] || die "play_promote needs a source track and a target track"
  _play_rollout_valid "$rollout"

  local notes="" locale=""
  if [ -n "$notes_file" ]; then
    [ -f "$notes_file" ] || die "release notes not found: $notes_file"
    notes="$(notes_slice "$notes_file" play_short "$PLAY_RELEASE_NOTES_CAP")"
    locale="$(_play_default_locale)"
  fi

  local edit src body out
  log "promoting '$from' → '$to'"
  edit="$(play_edit_open)"
  if ! src="$(play_api GET "/edits/$edit/tracks/$from")"; then
    play_edit_delete "$edit"
    die "could not read the '$from' track"
  fi
  if ! body="$(_play_promote_body "$to" "$rollout" "$notes" "$locale" "" "$src")"; then
    play_edit_delete "$edit"
    die "no completed release on the '$from' track to promote — upload a bundle there first"
  fi
  if ! play_api PUT "/edits/$edit/tracks/$to" "$body" >/dev/null; then
    play_edit_delete "$edit"
    die "could not assign the release to '$to' — nothing was published"
  fi
  if out="$(play_edit_commit "$edit" 2>&1)"; then
    log "'$to' now carries the artifact that was tested on '$from'"
    return 0
  fi
  case "$out" in
    *"draft app"*)
      # An app that has never been published is a "draft app": Play accepts only a draft
      # release, and the first production release is sent for review from the console.
      # Say which of the two happened rather than failing with a swallowed error.
      warn "the app has never been published — staging a draft release instead"
      edit="$(play_edit_open)"
      if ! body="$(_play_promote_body "$to" "" "$notes" "$locale" draft "$src")"; then
        play_edit_delete "$edit"; die "could not build the draft release"
      fi
      if ! play_api PUT "/edits/$edit/tracks/$to" "$body" >/dev/null; then
        play_edit_delete "$edit"; die "could not stage the draft release"
      fi
      play_edit_commit "$edit" >/dev/null || die "could not stage the draft release"
      log "staged as a DRAFT on '$to' — open the Play Console, set countries and regions, then submit it for review"
      return 0 ;;
    *)
      printf '%s\n' "$out" >&2
      die "the promotion was not committed — nothing was published" ;;
  esac
}

# ---------- verification ----------

# play_verify TRACK VERSION_CODE: a second edit that reads the track back and compares.
# A commit can return 200 and still leave the track on the previous build; only reading
# it back in a fresh edit proves what users will get.
play_verify() {
  local track="$1" want="$2" edit body found
  [ -n "$track" ] && [ -n "$want" ] || die "play_verify needs a track and a versionCode"
  log "verifying the '$track' track"
  edit="$(play_edit_open)"
  if ! body="$(play_api GET "/edits/$edit/tracks/$track")"; then
    play_edit_delete "$edit"
    die "could not read the '$track' track back"
  fi
  play_edit_delete "$edit"
  found="$(_play_codes_of "$body" 2>/dev/null | head -1 || true)"
  if [ "$found" = "$want" ]; then
    log "verified: '$track' is on versionCode $found"
    return 0
  fi
  die "expected versionCode $want on '$track' but found ${found:-none} — the commit did not take effect"
}

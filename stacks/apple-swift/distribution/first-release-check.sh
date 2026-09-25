#!/usr/bin/env bash
# first-release-check.sh [--apple] [--play] [--version X.Y.Z]
#
# Reads, never writes: before an app's first store release, which of the gates a
# submission needs the stores already hold. One line per gate, `<lane> <mark> <gate>:
# <detail>`, where the mark is
#   ✓  read from the store and in place
#   ✗  read from the store and missing; the detail says where it is set
#   ?  no API can read it (or its read failed): the person checks it in the web UI
#   apple  the app record's content rights, category, age rating, price and availability;
#          per Apple platform the editable version against --version (a build attaches
#          only to the version of its own number); in-app purchases and subscriptions:
#          ✗ when incomplete, ? when one waits for its first review (release-stores.sh
#          then runs with --no-submit and the person clicks Add for Review, ASC24); the
#          EULA link in each locale's description when a subscription is sold (ASC25);
#          App Privacy and the agreements, web only.
#   play   defaultLanguage, the contact details and a listing per locale, in one edit that
#          is discarded; Data safety, content rating, target audience, ads, app access,
#          category, privacy policy and the first production review, web only (GP6).
# Exit 0: nothing is ✗. Exit 1: something is. Exit 2: the project ships no store lane.
# Exit 3: a store could not be read at all; that says nothing about the gates.
# Uses only asc_get, play_edit_open, play_api and play_edit_delete, so it works copied
# alone into a project whose library is older.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/lib/common.sh"
case "${1:-}" in --help|-h) usage_exit "${BASH_SOURCE[0]}" ;; esac
load_config
apple=0; play=0; version=""
while [ $# -gt 0 ]; do
  case "$1" in
    --apple) apple=1 ;; --play) play=1 ;;
    --version) version="$2"; shift ;;
    *) die "unknown option $1" 2 ;;
  esac; shift
done
has_lane() { case " ${LANES:-} " in *" $1 "*) return 0 ;; esac; return 1; }
if [ "$apple" = 0 ] && [ "$play" = 0 ]; then
  { has_lane ios || has_lane mac; } && apple=1
  has_lane android && play=1
fi
if [ "$apple" = 0 ] && [ "$play" = 0 ]; then
  printf '%s\n' "This project ships neither an Apple nor a Play lane (LANES=\"${LANES:-}\" in ${CONFIG_FILE}). Nothing to check." >&2
  exit 2
fi

missing=0
# gate LANE MARK NAME DETAIL — one line of the report; a ✗ makes the exit code 1.
gate() {
  printf '%s %s %s: %s\n' "$1" "$2" "$3" "$4"
  [ "$2" != "✗" ] || missing=1
}
# waits LIST — the verb for a comma-separated list of one or more products.
waits() { case "$1" in *,*) printf 'wait' ;; *) printf 'waits' ;; esac; }
# jpy SNIPPET [ARG...] — SNIPPET with the JSON on stdin parsed into `d`; its own
# arguments start at sys.argv[2].
jpy() {
  python3 -c '
import json, sys
raw = sys.stdin.read().strip()
d = json.loads(raw) if raw else {}
exec(sys.argv[1])
' "$@"
}

if [ "$apple" = 1 ]; then
  . "$HERE/lib/asc.sh"
  require_var ASC_APP_ID ASC_KEY_ID ASC_ISSUER_ID
  app="$(asc_get "/apps/$ASC_APP_ID")" || die "could not read the app record from App Store Connect" 3
  gate apple ✓ "app record" "$(printf '%s' "$app" | jpy 'a = (d.get("data") or {}).get("attributes") or {}
print("%s (%s)" % (a.get("name") or "", a.get("bundleId") or ""))')"
  rights="$(printf '%s' "$app" | jpy 'print(((d.get("data") or {}).get("attributes") or {}).get("contentRightsDeclaration") or "")')"
  if [ -n "$rights" ]; then gate apple ✓ "content rights" "$rights"
  else gate apple ✗ "content rights" "not declared — push-store-metadata.sh --apple sets it from contentRightsDeclaration in store/apple/app.json (ASC17)"; fi

  infos="$(asc_get "/apps/$ASC_APP_ID/appInfos")" || die "could not read the app information from App Store Connect" 3
  # The app information being prepared; on a first release it is the only one.
  info="$(printf '%s' "$infos" | jpy 'infos = d.get("data") or []
live = ("READY_FOR_SALE", "READY_FOR_DISTRIBUTION")
state = lambda i: i["attributes"].get("appStoreState") or i["attributes"].get("state")
pick = next((i for i in infos if state(i) not in live), infos[0] if infos else None)
print(pick["id"] if pick else "")')"
  [ -n "$info" ] || die "could not read the app information from App Store Connect: the app has none" 3

  if answer="$(asc_get "/appInfos/$info/primaryCategory")"; then
    category="$(printf '%s' "$answer" | jpy 'print((d.get("data") or {}).get("id") or "")')"
    if [ -n "$category" ]; then gate apple ✓ category "$category"
    else gate apple ✗ category "none — push-store-metadata.sh --apple sets it from primaryCategory in store/apple/app.json"; fi
  else
    gate apple "?" category "could not be read — look under App Information in App Store Connect"
  fi

  if answer="$(asc_get "/appInfos/$info/ageRatingDeclaration")"; then
    # Unanswered questions are null; the overrides and the kids band legitimately stay null.
    open_questions="$(printf '%s' "$answer" | jpy 'optional = {"kidsAgeBand", "ageRatingOverride", "ageRatingOverrideV2",
            "koreaAgeRatingOverride", "seventeenPlus", "developerAgeRatingInfoUrl"}
data = d.get("data")
if not data:
    print("all")
else:
    print(" ".join(sorted(k for k, v in (data.get("attributes") or {}).items() if v is None and k not in optional)))')"
    case "$open_questions" in
      "") gate apple ✓ "age rating" "every question answered" ;;
      all) gate apple ✗ "age rating" "no declaration — push-store-metadata.sh --apple answers it from ageRatingDeclaration in store/apple/app.json" ;;
      *) set -- $open_questions
         gate apple ✗ "age rating" "$# questions unanswered: $(printf '%s\n' "$@" | paste -sd, - | sed 's/,/, /g') — push-store-metadata.sh --apple answers them from ageRatingDeclaration in store/apple/app.json" ;;
    esac
  else
    gate apple "?" "age rating" "could not be read — look under App Information → Age Rating in App Store Connect"
  fi

  if answer="$(asc_get "/apps/$ASC_APP_ID/appPriceSchedule" "include=manualPrices")"; then
    priced="$(printf '%s' "$answer" | jpy 'print("yes" if d.get("data") and any(i.get("type") == "appPrices" for i in d.get("included") or []) else "")')"
    if [ -n "$priced" ]; then gate apple ✓ price set
    else gate apple ✗ price "none — choose it under Pricing and Availability in App Store Connect (Free is a price too)"; fi
  else
    gate apple "?" price "could not be read — look under Pricing and Availability in App Store Connect"
  fi

  if answer="$(asc_get "/apps/$ASC_APP_ID/appAvailabilityV2")"; then
    available="$(printf '%s' "$answer" | jpy 'print("yes" if d.get("data") else "")')"
    if [ -n "$available" ]; then gate apple ✓ availability set
    else gate apple ✗ availability "none — choose the countries and regions under Pricing and Availability in App Store Connect"; fi
  else
    gate apple "?" availability "could not be read — look under Pricing and Availability in App Store Connect"
  fi

  for platform in IOS MAC_OS; do
    case "$platform" in IOS) has_lane ios || continue; lane=ios ;; MAC_OS) has_lane mac || continue; lane=mac ;; esac
    versions="$(asc_get "/apps/$ASC_APP_ID/appStoreVersions" "filter[platform]=$platform&limit=50")" \
      || die "could not read the $lane App Store versions from App Store Connect" 3
    read -r on_sale editable <<<"$(printf '%s' "$versions" | jpy '# ASC_SHIPPED_STATES in asc.sh: a version that has been on sale at some point.
shipped = {"READY_FOR_SALE", "READY_FOR_DISTRIBUTION", "DEVELOPER_REMOVED_FROM_SALE", "REMOVED_FROM_SALE", "REPLACED_WITH_NEW_VERSION"}
editable = ("PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED",
            "INVALID_BINARY", "WAITING_FOR_REVIEW")
on_sale, open_version = [], "-"
for v in d.get("data", []):
    a = v["attributes"]
    state = a.get("appStoreState") or a.get("appVersionState")
    if state in shipped:
        on_sale.append(a.get("versionString") or "")
    elif state in editable and open_version == "-":
        open_version = a.get("versionString") or "-"
key = lambda s: [int(p) if p.isdigit() else 0 for p in s.split(".")]
print(max(on_sale, key=key) if on_sale else "-", open_version)')"
    [ "$on_sale" = "-" ] || gate "$lane" ✓ "on sale" "$on_sale (or once was) — this platform has had its first release"
    if [ "$editable" = "-" ]; then
      gate "$lane" ✓ version "none editable yet${version:+; push-store-metadata.sh --version $version creates it}"
    elif [ -z "$version" ]; then
      gate "$lane" "?" version "the editable version is $editable; run with --version X.Y.Z to compare it with the build"
    elif [ "$editable" = "$version" ]; then
      gate "$lane" ✓ version "the editable version is $version"
    else
      gate "$lane" ✗ version "the editable version is $editable, the build is $version; a build attaches only to the version of its own number (ASC29) — change the version number to $version on that version's page in App Store Connect"
    fi
  done

  # products_gate NAME INCOMPLETE WAITING — comma-separated product ids. Incomplete ones
  # cannot go to review at all (ASC23). Waiting ones are a hand-over, not a gap: the API
  # cannot add a product to a submission, and the product page's Add for Review joins the
  # open submission and submits it (ASC24), so the release attaches the build without
  # submitting and the person clicks it.
  products_gate() {
    local name="$1" incomplete="$2" waiting="$3"
    if [ "$incomplete" = "-" ] && [ "$waiting" = "-" ]; then
      gate apple ✓ "$name" "none waiting for a first review"; return 0
    fi
    [ "$incomplete" = "-" ] || gate apple ✗ "$name" "$(printf '%s' "$incomplete" | sed 's/,/, /g') is incomplete (MISSING_METADATA): add its localization and review screenshot in App Store Connect; it cannot go to review before that (ASC23)"
    [ "$waiting" = "-" ] || gate apple "?" "$name" "$(printf '%s' "$waiting" | sed 's/,/, /g') $(waits "$waiting") for a first review: release-stores.sh runs with --no-submit, and once it has attached the build, Add for Review on each product's page in App Store Connect joins it to the submission and submits the version with it (ASC24)"
  }
  # products data|subscriptions — the in-app purchases (a response's data) or the
  # subscriptions (a response's included); prints "COUNT INCOMPLETE WAITING".
  products() {
    jpy 'if sys.argv[2] == "data":
    products = d.get("data", [])
else:
    products = [s for s in d.get("included", []) if s.get("type") == "subscriptions"]
ids = lambda state: ",".join(p["attributes"].get("productId", p["id"]) for p in products if p["attributes"].get("state") == state)
print(len(products), ids("MISSING_METADATA") or "-", ids("READY_TO_SUBMIT") or "-")' "$1"
  }

  if answer="$(asc_get "/apps/$ASC_APP_ID/inAppPurchasesV2" "limit=200")"; then
    read -r count incomplete waiting <<<"$(printf '%s' "$answer" | products data)"
    products_gate "in-app purchases" "$incomplete" "$waiting"
  else
    gate apple "?" "in-app purchases" "could not be read — look under In-App Purchases in App Store Connect"
  fi

  sold=""
  if answer="$(asc_get "/apps/$ASC_APP_ID/subscriptionGroups" "include=subscriptions&limit=50")"; then
    read -r sold incomplete waiting <<<"$(printf '%s' "$answer" | products subscriptions)"
    if [ "$sold" = 0 ]; then gate apple ✓ subscriptions none
    elif [ "$incomplete" = "-" ] && [ "$waiting" = "-" ]; then gate apple ✓ subscriptions "$sold sold, none waiting for a first review"
    else products_gate subscriptions "$incomplete" "$waiting"; fi
  else
    gate apple "?" subscriptions "could not be read — look under Subscriptions in App Store Connect"
    sold="?"
  fi
  case "$sold" in
    ""|0) ;;
    "?") gate apple "?" "EULA link" "could not tell whether a subscription is sold; if one is, each description needs a Terms of Use (EULA) link (ASC25)" ;;
    *)
      linked=""
      for locale in ${LOCALES:-en-US}; do
        file="$STORE_DIR/apple/$locale.json"
        if [ ! -f "$file" ]; then
          gate apple ✗ "EULA link" "no store/apple/$locale.json yet, so no Terms of Use (EULA) link in its description (ASC25)"
          continue
        fi
        if python3 - "$file" <<'PY'
import json, re, sys
text = json.load(open(sys.argv[1], encoding="utf-8")).get("description") or ""
standard = "apple.com/legal/internet-services/itunes/dev/stdeula" in text
# The link's label in the locales the owner ships; the check still errs to ✗.
label = r"(eula|terms of use|terms and conditions|nutzungsbedingungen|lizenzvereinbarung|endbenutzer-lizenzvertrag|conditions d.utilisation|condiciones de uso|termini di utilizzo)"
custom = re.search(label, text, re.I) and "https://" in text
sys.exit(0 if standard or custom else 1)
PY
        then linked="$linked${linked:+ }$locale"
        else gate apple ✗ "EULA link" "none in the $locale description (ASC25): add Apple's standard EULA, https://www.apple.com/legal/internet-services/itunes/dev/stdeula/, or set a custom EULA in App Store Connect"
        fi
      done
      [ -z "$linked" ] || gate apple ✓ "EULA link" "$linked" ;;
  esac

  gate apple "?" "App Privacy" "web only — answer it and PUBLISH it under App Privacy in App Store Connect; it needs the Admin role, and no API reads it back (ASC18)"
  gate apple "?" agreements "web only — the DAC7 tax data and the trader status under Business → Agreements, Tax, and Banking block a new app's submission (ASC19)"
fi

if [ "$play" = 1 ]; then
  . "$HERE/lib/play.sh"
  require_var PLAY_PACKAGE_NAME
  edit="$(play_edit_open)" || die "could not read the app from Google Play" 3
  if ! details="$(play_api GET "/edits/$edit/details")"; then
    play_edit_delete "$edit"; die "could not read the app details from Google Play" 3
  fi
  if ! listings="$(play_api GET "/edits/$edit/listings")"; then
    play_edit_delete "$edit"; die "could not read the listings from Google Play" 3
  fi
  play_edit_delete "$edit"

  language="$(printf '%s' "$details" | jpy 'print(d.get("defaultLanguage") or "")')"
  if [ -n "$language" ]; then gate android ✓ defaultLanguage "$language"
  else gate android ✗ defaultLanguage "not set — push-store-metadata.sh --play sets it from listing.json, where it is chosen, never derived (GP2)"; fi
  contact="$(printf '%s' "$details" | jpy 'e, w = d.get("contactEmail") or "", d.get("contactWebsite") or ""
print("%s, %s" % (e, w) if e and w else "")')"
  if [ -n "$contact" ]; then gate android ✓ contact "$contact"
  else gate android ✗ contact "contactEmail or contactWebsite not set — push-store-metadata.sh --play sets both from listing.json"; fi
  have="$(printf '%s' "$listings" | jpy 'print(" ".join((l.get("language") or "") for l in d.get("listings", [])))')"
  present=""; absent=""
  for locale in ${LOCALES:-en-US}; do
    locale="$(printf '%s' "$locale" | tr '_' '-')"
    case " $have " in *" $locale "*) present="$present${present:+ }$locale" ;; *) absent="$absent${absent:+ }$locale" ;; esac
  done
  if [ -z "$absent" ]; then gate android ✓ listings "$present"
  else gate android ✗ listings "none for $absent — push-store-metadata.sh --play creates them from listing.json"; fi

  gate android "?" "Data safety" "web only — Policy → App content → Data safety in the Play Console (GP6)"
  gate android "?" "content rating" "web only — the IARC questionnaire under Policy → App content (GP6)"
  gate android "?" "target audience" "web only — Policy → App content → Target audience and content (GP6)"
  gate android "?" ads "web only — Policy → App content → Ads, and Advertising ID when the merged manifest carries com.google.android.gms.permission.AD_ID (GP11)"
  gate android "?" "app access" "web only — Policy → App content → App access: every function without sign-in, or the reviewer's credentials (GP8)"
  gate android "?" category "web only — app or game, category and tags under Grow → Store presence → Store settings (GP6)"
  gate android "?" "privacy policy" "web only — Policy → App content → Privacy policy (GP6)"
  gate android "?" "first review" "web only — an app never published gets a draft production release: choose the countries and regions, then send it for review under Publishing overview"
fi

if [ "$missing" = 0 ]; then
  log "nothing the stores can show is missing; the ? lines are the person's to check"
  exit 0
fi
log "some gates are missing (✗); each line says where it is set"
exit 1

#!/usr/bin/env python3
"""Push the App Store listing in store/apple/ to App Store Connect.

    asc_metadata.py [--dry-run] [--locale L] [--platform IOS|MAC_OS]

Reads store/apple/app.json (what is identical across locales and platforms) and
store/apple/<locale>.json (the texts), and applies them to every version of the app that
is still editable, on both platforms. Typed into the web form instead, the same data is
undiffable and has to be retyped per locale and per platform.

Besides the visible listing it sets the submission gates that are empty by default and
never surface while writing descriptions: content rights (app-level, set once) plus
usesIdfa, copyright and the review contact, which hang off the VERSION and are therefore
empty again on every new release.

Before the first write it refuses to continue when
  * a text exceeds Apple's field limit (the API's own error does not name the field),
  * a text names a platform Apple does not sell (Guideline 2.3.10),
  * a URL on the product page does not answer 200 (App Review clicks every one of them).

When store/apple/ holds no app.json it writes templates with every field present and
empty and stops with exit code 2.

Configuration comes from the environment, exported by the entry script from config.sh:
ASC_APP_ID, ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH, STORE_DIR, LOCALES.
Standard library only — no PyJWT: ES256 is signed by calling openssl.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import pathlib
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

API = "https://api.appstoreconnect.apple.com/v1"

# App Store Connect rejects anything longer, with errors that do not name the field.
LIMITS = {
    "name": 30,
    "subtitle": 30,
    "promotionalText": 170,
    "description": 4000,
    "keywords": 100,
    "whatsNew": 4000,
    "notes": 4000,
}

# Guideline 2.3.10: store metadata may not carry "irrelevant third-party platform
# information". One "Android: …" bullet in What's New is enough for a rejection.
FORBIDDEN = re.compile(r"\b(android|google play|play store|windows|linux)\b", re.IGNORECASE)

# The states in which App Store Connect still lets a version be changed. Not only
# PREPARE_FOR_SUBMISSION: a rejected version is editable too, and that is exactly when the
# metadata wants fixing. WAITING_FOR_REVIEW is here because its texts are still patchable.
EDITABLE = {"PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED",
            "INVALID_BINARY", "WAITING_FOR_REVIEW"}

PLATFORMS = ("IOS", "MAC_OS")

# The display types a screenshot set can have, per platform. Apple files the 6.9-inch
# iPhone under the 6.7-inch bucket: there is no APP_IPHONE_69 display type, and asking for
# one fails with an error that reads like a permissions problem.
DEFAULT_DISPLAY_TYPES = {
    "IOS": ["APP_IPHONE_67", "APP_IPAD_PRO_3GEN_129"],
    "MAC_OS": ["APP_DESKTOP"],
}

GREEN, YELLOW, RED, BLUE, OFF = "\033[0;32m", "\033[1;33m", "\033[0;31m", "\033[0;34m", "\033[0m"

TODO: list[str] = []


def ok(message): print(f"{GREEN}✓ {message}{OFF}")
def say(message): print(f"{YELLOW}→ {message}{OFF}")
def fail(message): sys.stdout.flush(); print(f"{RED}✗ {message}{OFF}", file=sys.stderr)
def head(message): print(f"\n{BLUE}── {message}{OFF}")


def die(message, code=1):
    fail(message)
    sys.exit(code)


def env(name, required=True, default=""):
    value = os.environ.get(name, default)
    if required and not value:
        die(f"{name} is empty — fill it in distribution/config.sh")
    return value


# ---------------------------------------------------------------------------
# Token
# ---------------------------------------------------------------------------

def token() -> str:
    """An ES256 JWT for the App Store Connect API, valid 20 minutes.

    hashlib and hmac cannot do ES256, and PyJWT is not a dependency worth having here, so
    openssl signs the input. openssl produces a DER SEQUENCE of two INTEGERs; JWS wants the
    raw r‖s pair, each left-padded to 32 bytes. Passing the DER blob through unchanged
    yields a token Apple rejects with a 401 that says nothing about signature formats.
    """
    key_path = pathlib.Path(os.path.expanduser(env("ASC_KEY_PATH")))
    if not key_path.exists():
        die(f"App Store Connect key not found: {key_path} (the path is printed, the contents never)")
    key_id, issuer = env("ASC_KEY_ID"), env("ASC_ISSUER_ID")

    def b64(raw: bytes) -> str:
        return base64.urlsafe_b64encode(raw).decode().rstrip("=")

    now = int(time.time())
    header = b64(json.dumps({"alg": "ES256", "kid": key_id, "typ": "JWT"},
                            separators=(",", ":")).encode())
    payload = b64(json.dumps({"iss": issuer, "iat": now, "exp": now + 1200,
                              "aud": "appstoreconnect-v1"}, separators=(",", ":")).encode())
    signing_input = f"{header}.{payload}".encode()
    der = subprocess.run(["openssl", "dgst", "-sha256", "-sign", str(key_path)],
                         input=signing_input, capture_output=True, check=True).stdout

    def read_tlv(buf, i):
        tag = buf[i]; i += 1
        length = buf[i]; i += 1
        if length & 0x80:                           # long form
            n = length & 0x7F
            length = int.from_bytes(buf[i:i + n], "big"); i += n
        return tag, buf[i:i + length], i + length

    tag, sequence, _ = read_tlv(der, 0)
    if tag != 0x30:
        die("openssl did not produce a DER SEQUENCE — cannot build the token")
    _, r, index = read_tlv(sequence, 0)
    _, s, _ = read_tlv(sequence, index)
    raw = r.lstrip(b"\x00").rjust(32, b"\x00") + s.lstrip(b"\x00").rjust(32, b"\x00")
    return f"{header}.{payload}.{b64(raw)}"


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

class Api:
    def __init__(self, jwt: str, dry_run: bool = False):
        self.jwt = jwt
        self.dry_run = dry_run

    def __call__(self, method: str, endpoint: str, payload: dict | None = None):
        if self.dry_run and method != "GET":
            say(f"dry-run: {method} {endpoint}")
            return {}
        data = json.dumps(payload).encode() if payload is not None else None
        request = urllib.request.Request(API + endpoint, data=data, method=method)
        request.add_header("Authorization", f"Bearer {self.jwt}")
        if data is not None:
            request.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(request) as answer:
                body = answer.read()
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as error:
            detail = error.read().decode()
            try:
                errors = json.loads(detail).get("errors", [])
                detail = "; ".join(
                    f"{e.get('code') or e.get('title')}: {e.get('detail')}" for e in errors)
            except Exception:
                pass
            raise RuntimeError(f"HTTP {error.code} on {method} {endpoint} — {detail}") from None

    def all(self, endpoint: str) -> list:
        items, page = [], self("GET", endpoint)
        items += page.get("data", [])
        while page.get("links", {}).get("next"):
            url = page["links"]["next"]
            page = self("GET", url[len(API):] if url.startswith(API) else url)
            items += page.get("data", [])
        return items


def locked(error: Exception) -> bool:
    """True when App Store Connect refuses the write because the resource is locked.

    A platform in review locks the shared App Information record (ASC30 —
    "The resource is currently locked"), and that must not fail a run whose only purpose is
    to fix the other platform's texts.
    """
    text = str(error)
    return "ASC30" in text or "currently locked" in text.lower() or "HTTP 409" in text


def http_status(url: str) -> int:
    try:
        request = urllib.request.Request(url, method="GET",
                                         headers={"User-Agent": "kartograph-distribution"})
        with urllib.request.urlopen(request, timeout=20) as answer:
            return answer.status
    except urllib.error.HTTPError as error:
        return error.code
    except Exception:
        return 0


# ---------------------------------------------------------------------------
# The files
# ---------------------------------------------------------------------------

APP_TEMPLATE = {
    "_comment": "App-level store metadata: identical across locales, versions and platforms.",
    "primaryCategory": "",
    "_primaryCategory": "An App Store category id, e.g. EDUCATION, UTILITIES, HEALTH_AND_FITNESS.",
    "secondaryCategory": "",
    "contentRightsDeclaration": "",
    "_contentRightsDeclaration": "DOES_NOT_USE_THIRD_PARTY_CONTENT or USES_THIRD_PARTY_CONTENT. Empty blocks submission.",
    "usesIdfa": False,
    "_usesIdfa": "true only when an ad or attribution SDK reads the advertising identifier.",
    "copyright": "",
    "_copyright": "e.g. 2026 Your Name — required per version, empty again on every new one.",
    "displayTypes": DEFAULT_DISPLAY_TYPES,
    "_displayTypes": "Screenshot display types per platform; the directory names under store/apple/screenshots/<locale>/. There is no APP_IPHONE_69 — Apple files the 6.9-inch iPhone under APP_IPHONE_67.",
    "_ageRatingDeclaration": "Every question answered; NONE/false throughout still yields 4+. Shared by both platforms and locked while either is in review.",
    "ageRatingDeclaration": {
        "violenceCartoonOrFantasy": "NONE",
        "violenceRealistic": "NONE",
        "violenceRealisticProlongedGraphicOrSadistic": "NONE",
        "profanityOrCrudeHumor": "NONE",
        "matureOrSuggestiveThemes": "NONE",
        "horrorOrFearThemes": "NONE",
        "medicalOrTreatmentInformation": "NONE",
        "alcoholTobaccoOrDrugUseOrReferences": "NONE",
        "sexualContentOrNudity": "NONE",
        "sexualContentGraphicAndNudity": "NONE",
        "gamblingSimulated": "NONE",
        "contests": "NONE",
        "gunsOrOtherWeapons": "NONE",
        "gambling": False,
        "unrestrictedWebAccess": False,
        "advertising": False,
        "healthOrWellnessTopics": False,
        "messagingAndChat": False,
        "parentalControls": False,
        "lootBox": False,
        "userGeneratedContent": False,
        "socialMedia": False,
        "socialMediaAgeRestricted": False,
        "ageAssurance": False,
    },
    "_reviewDetail": "The reviewer's contact and notes. The phone number is the one field a script cannot invent, which is why it lives here rather than being prompted for.",
    "reviewDetail": {
        "firstName": "",
        "lastName": "",
        "email": "",
        "phone": "",
        "demoAccountRequired": False,
        "demoAccountName": "",
        "demoAccountPassword": "",
        "notes": "",
    },
}

LOCALE_TEMPLATE = {
    "locale": "",
    "name": "",
    "_name": "at most 30 characters; reserved per locale and globally unique across accounts.",
    "subtitle": "",
    "privacyPolicyUrl": "",
    "supportUrl": "",
    "marketingUrl": "",
    "promotionalText": "",
    "description": "",
    "keywords": "",
    "_keywords": "comma-separated, at most 100 characters in total.",
    "whatsNew": "",
    "_whatsNew": "only accepted once the app has a released version; ignored on a first release.",
}


def write_templates(apple_dir: pathlib.Path, locales: list[str]) -> None:
    apple_dir.mkdir(parents=True, exist_ok=True)
    written = [apple_dir / "app.json"]
    (apple_dir / "app.json").write_text(json.dumps(APP_TEMPLATE, indent=2, ensure_ascii=False) + "\n",
                                        encoding="utf-8")
    for locale in locales:
        path = apple_dir / f"{locale}.json"
        if path.exists():
            continue
        body = dict(LOCALE_TEMPLATE)
        body["locale"] = locale
        path.write_text(json.dumps(body, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        written.append(path)
    head("Templates written")
    for path in written:
        print(f"  {path}")
    print()
    say("Fill these in — every field is a field App Review reads — and run this again; "
        "nothing was sent to Apple.")


def load(apple_dir: pathlib.Path, wanted: list[str] | None, locales_env: list[str]):
    app = json.loads((apple_dir / "app.json").read_text(encoding="utf-8"))
    files = sorted(p for p in apple_dir.glob("*.json") if p.name != "app.json")
    locales = []
    for path in files:
        data = json.loads(path.read_text(encoding="utf-8"))
        data.setdefault("locale", path.stem)
        locales.append(data)
    if not locales and locales_env:
        die("store/apple/ holds app.json but no <locale>.json — delete app.json to get the "
            "templates back, or add one file per locale in LOCALES")
    if wanted:
        locales = [l for l in locales if l["locale"] in wanted]
    if not locales:
        die("no locale file matched")
    return app, locales


# ---------------------------------------------------------------------------
# Validation — everything, before the first write
# ---------------------------------------------------------------------------

def check(app: dict, locales: list[dict]) -> None:
    head("Field lengths")
    clean = True
    for locale in locales:
        for field, limit in LIMITS.items():
            value = locale.get(field)
            if not isinstance(value, str) or not value:
                continue
            if len(value) > limit:
                fail(f"{locale['locale']}.{field}: {len(value)} characters, Apple allows {limit}")
                clean = False
            else:
                ok(f"{locale['locale']}.{field}: {len(value)}/{limit}")
    notes = (app.get("reviewDetail") or app.get("reviewContact") or {}).get("notes", "")
    if notes and len(notes) > LIMITS["notes"]:
        fail(f"reviewDetail.notes: {len(notes)} characters, Apple allows {LIMITS['notes']}")
        clean = False

    head("Other platforms in the texts")
    texts = [(f"{l['locale']}.{field}", value)
             for l in locales for field, value in l.items()
             if isinstance(value, str) and not field.startswith("_")]
    if notes:
        texts.append(("app.reviewDetail.notes", notes))
    named = False
    for label, value in texts:
        hit = FORBIDDEN.search(value)
        if hit:
            fail(f"{label} names another platform: {hit.group(0)!r} (Guideline 2.3.10)")
            clean, named = False, True
    if not named:
        ok("no other platform named")

    head("Every URL answers")
    for locale in locales:
        for field in ("privacyPolicyUrl", "supportUrl", "marketingUrl"):
            url = locale.get(field)
            if not url:
                continue
            status = http_status(url)
            if status == 200:
                ok(f"{locale['locale']} {field}: {url}")
            else:
                fail(f"{locale['locale']} {field} answers {status}, not 200: {url}")
                clean = False
    if not clean:
        die("nothing was sent — fix the findings above first")


# ---------------------------------------------------------------------------
# Writing
# ---------------------------------------------------------------------------

def upsert(api: Api, kind: str, existing, attributes: dict,
           parent_type: str, parent_id: str, parent_key: str):
    """Patch the localization when it exists, create it otherwise. Returns its id."""
    attributes = {k: v for k, v in attributes.items() if v is not None}
    if existing:
        # `locale` identifies the resource and may only appear on create; including it in
        # an update is rejected outright.
        patch = {k: v for k, v in attributes.items() if k != "locale"}
        api("PATCH", f"/{kind}/{existing['id']}",
            {"data": {"type": kind, "id": existing["id"], "attributes": patch}})
        return existing["id"]
    created = api("POST", f"/{kind}", {"data": {
        "type": kind,
        "attributes": attributes,
        "relationships": {parent_key: {"data": {"type": parent_type, "id": parent_id}}},
    }})
    return created.get("data", {}).get("id")


def push_app_record(api: Api, app: dict, app_id: str, locales: list[dict]) -> None:
    head("App record")
    if app.get("contentRightsDeclaration"):
        try:
            api("PATCH", f"/apps/{app_id}", {"data": {"type": "apps", "id": app_id, "attributes": {
                "contentRightsDeclaration": app["contentRightsDeclaration"]}}})
            ok(f"content rights: {app['contentRightsDeclaration']}")
        except RuntimeError as error:
            (say if locked(error) else fail)(f"content rights: {error}")
    else:
        say("contentRightsDeclaration is empty — it blocks submission; fill it in app.json")

    infos = api("GET", f"/apps/{app_id}/appInfos").get("data", [])
    if not infos:
        fail("the app record has no App Information — create the app in App Store Connect first")
        return
    def state_of(info):
        a = info["attributes"]
        return a.get("appStoreState") or a.get("state")
    info = next((i for i in infos if state_of(i) in EDITABLE), infos[0])
    info_id = info["id"]

    if app.get("primaryCategory"):
        relationships = {"primaryCategory": {
            "data": {"type": "appCategories", "id": app["primaryCategory"]}}}
        if app.get("secondaryCategory"):
            relationships["secondaryCategory"] = {
                "data": {"type": "appCategories", "id": app["secondaryCategory"]}}
        try:
            api("PATCH", f"/appInfos/{info_id}",
                {"data": {"type": "appInfos", "id": info_id, "relationships": relationships}})
            ok("categories: " + " / ".join(filter(None, [app.get("primaryCategory"),
                                                         app.get("secondaryCategory")])))
        except RuntimeError as error:
            (say if locked(error) else fail)(f"categories: {error}")

    if app.get("ageRatingDeclaration"):
        try:
            declaration = api("GET", f"/appInfos/{info_id}/ageRatingDeclaration").get("data")
            if declaration:
                attributes = {k: v for k, v in app["ageRatingDeclaration"].items()
                              if v is not None and not k.startswith("_")}
                api("PATCH", f"/ageRatingDeclarations/{declaration['id']}",
                    {"data": {"type": "ageRatingDeclarations", "id": declaration["id"],
                              "attributes": attributes}})
                ok("age rating declared")
        except RuntimeError as error:
            # Shared by both platforms and locked while either is in review; push again
            # once the reviews are through.
            (say if locked(error) else fail)(f"age rating: {error}")

    head("App info localizations")
    try:
        existing = {l["attributes"]["locale"]: l
                    for l in api.all(f"/appInfos/{info_id}/appInfoLocalizations")}
    except RuntimeError as error:
        say(f"app info is locked ({error}) — name, subtitle and privacy URL left alone")
        return
    for locale in locales:
        attributes = {"locale": locale["locale"], "name": locale.get("name"),
                      "subtitle": locale.get("subtitle"),
                      "privacyPolicyUrl": locale.get("privacyPolicyUrl")}
        try:
            upsert(api, "appInfoLocalizations", existing.get(locale["locale"]), attributes,
                   "appInfos", info_id, "appInfo")
            ok(f"{locale['locale']}: name, subtitle, privacy URL")
        except RuntimeError as error:
            if locked(error):
                say(f"{locale['locale']}: locked while a platform is in review; left alone")
            else:
                # The app name is reserved per locale and globally unique across accounts, so
                # a name free in one store can be taken in another. Keep going: the remaining
                # locales and all the version metadata are unaffected.
                fail(f"{locale['locale']}: {error}")
                TODO.append(f"The name {locale.get('name')!r} may be taken in the "
                            f"{locale['locale']} store; pick another one for that locale.")


def push_versions(api: Api, app: dict, app_id: str, locales: list[dict],
                  platforms: list[str]) -> None:
    versions = api("GET", f"/apps/{app_id}/appStoreVersions?limit=50").get("data", [])
    touched = False
    for version in versions:
        attributes = version["attributes"]
        platform = attributes.get("platform")
        state = attributes.get("appStoreState") or attributes.get("appVersionState")
        if platform not in platforms:
            continue
        if state not in EDITABLE:
            say(f"{platform} {attributes.get('versionString')} is {state}; left alone")
            continue
        touched = True
        head(f"Version {attributes.get('versionString')} — {platform}")
        version_id = version["id"]

        # Per-version submission gates. They are empty again on every new version, which is
        # exactly how a second release repeats a first release's blockers.
        gates = {}
        if app.get("copyright"):
            gates["copyright"] = app["copyright"]
        if app.get("usesIdfa") is not None:
            gates["usesIdfa"] = bool(app.get("usesIdfa"))
        if gates:
            try:
                api("PATCH", f"/appStoreVersions/{version_id}", {"data": {
                    "type": "appStoreVersions", "id": version_id, "attributes": gates}})
                ok("copyright and IDFA flag")
            except RuntimeError as error:
                (say if locked(error) else fail)(str(error))

        contact = app.get("reviewDetail") or app.get("reviewContact") or {}
        if contact.get("email"):
            detail_attributes = {
                "contactFirstName": contact.get("firstName"),
                "contactLastName": contact.get("lastName"),
                "contactEmail": contact.get("email"),
                "contactPhone": contact.get("phone"),
                "demoAccountRequired": bool(contact.get("demoAccountRequired")),
                "notes": contact.get("notes"),
            }
            if contact.get("demoAccountRequired"):
                detail_attributes["demoAccountName"] = contact.get("demoAccountName")
                detail_attributes["demoAccountPassword"] = contact.get("demoAccountPassword")
            detail_attributes = {k: v for k, v in detail_attributes.items() if v is not None}
            try:
                detail = api("GET", f"/appStoreVersions/{version_id}/appStoreReviewDetail").get("data")
                if detail:
                    api("PATCH", f"/appStoreReviewDetails/{detail['id']}", {"data": {
                        "type": "appStoreReviewDetails", "id": detail["id"],
                        "attributes": detail_attributes}})
                    ok("review contact and notes updated")
                else:
                    api("POST", "/appStoreReviewDetails", {"data": {
                        "type": "appStoreReviewDetails", "attributes": detail_attributes,
                        "relationships": {"appStoreVersion": {
                            "data": {"type": "appStoreVersions", "id": version_id}}}}})
                    ok("review contact and notes created")
            except RuntimeError as error:
                (say if locked(error) else fail)(str(error))
        else:
            say("reviewDetail.email is empty — App Review has no contact; it blocks submission")

        existing = {l["attributes"]["locale"]: l for l in
                    api.all(f"/appStoreVersions/{version_id}/appStoreVersionLocalizations")}
        for locale in locales:
            texts = {
                "locale": locale["locale"],
                "description": locale.get("description"),
                "keywords": locale.get("keywords"),
                "promotionalText": locale.get("promotionalText"),
                "supportUrl": locale.get("supportUrl"),
                "marketingUrl": locale.get("marketingUrl"),
            }
            try:
                localization_id = upsert(api, "appStoreVersionLocalizations",
                                         existing.get(locale["locale"]), texts,
                                         "appStoreVersions", version_id, "appStoreVersion")
                ok(f"{locale['locale']}: texts and URLs")
            except RuntimeError as error:
                (say if locked(error) else fail)(f"{locale['locale']}: {error}")
                continue

            # "What's New" is only accepted once the version is an update, so it goes in
            # separately and a rejection here is not an error.
            if locale.get("whatsNew") and localization_id:
                try:
                    api("PATCH", f"/appStoreVersionLocalizations/{localization_id}", {"data": {
                        "type": "appStoreVersionLocalizations", "id": localization_id,
                        "attributes": {"whatsNew": locale["whatsNew"]}}})
                    ok(f"{locale['locale']}: what's new")
                except RuntimeError as error:
                    say(f"{locale['locale']}: what's new not accepted "
                        f"(normal on a first release) — {error}")
    if not touched:
        say("no editable version on " + ", ".join(platforms) +
            " — everything is in review or on sale, so nothing was changed")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true",
                        help="validate and show what would change; write nothing")
    parser.add_argument("--locale", action="append", help="restrict to these locales")
    parser.add_argument("--platform", choices=PLATFORMS, action="append",
                        help="restrict to one platform (default: both)")
    args = parser.parse_args()

    store_dir = pathlib.Path(env("STORE_DIR"))
    apple_dir = store_dir / "apple"
    locales_env = os.environ.get("LOCALES", "en-US").split()

    if not (apple_dir / "app.json").exists():
        write_templates(apple_dir, locales_env)
        return 2

    app, locales = load(apple_dir, args.locale, locales_env)
    check(app, locales)

    app_id = env("ASC_APP_ID")
    api = Api(token(), args.dry_run)
    platforms = args.platform or list(PLATFORMS)

    push_app_record(api, app, app_id, locales)
    push_versions(api, app, app_id, locales, platforms)

    # What no API can do, so that it is not silently missing at submission time.
    head("Only the web UI can do this")
    TODO.append("Create the app record itself — App Store Connect has no API for it; "
                "ASC_APP_ID in config.sh comes from that page.")
    TODO.append("Answer and PUBLISH the App Privacy questionnaire "
                "(App Store Connect → App Privacy → Publish).")
    TODO.append("Set the trader status and check DAC7 under "
                "Business → Agreements, Tax, and Banking.")
    TODO.append("When a subscription goes to review for the FIRST time, tick it on the "
                "submission page — reviewSubmissionItems has no relationship for it.")
    for item in TODO:
        print(f"  • {item}")

    print()
    ok("metadata applied" if not args.dry_run else "dry run complete — nothing was sent")
    print(f"  https://appstoreconnect.apple.com/apps/{app_id}/distribution/info")
    return 0


if __name__ == "__main__":
    sys.exit(main())

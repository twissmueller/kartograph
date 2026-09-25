#!/usr/bin/env python3
"""Push the Google Play store listing — title, descriptions and contact details.

Everything the Play Developer API is willing to set happens here, inside one edit
committed at the end, so a failure part-way leaves the live listing untouched.
What the API does not expose is printed as a checklist when the run finishes.

Reads distribution/store/play/listing.json:

    {
      "defaultLanguage": "en-US",
      "contactEmail": "",
      "contactWebsite": "",
      "listings": {
        "en-US": {"title": "", "shortDescription": "", "fullDescription": ""}
      }
    }

Environment (from distribution/config.sh): PLAY_PACKAGE_NAME, PLAY_SERVICE_ACCOUNT,
STORE_DIR, LOCALES. Standard library only — no PyJWT, no fastlane, no gcloud.

Usage: play_listing.py [--dry-run]
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
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications"
SCOPE = "https://www.googleapis.com/auth/androidpublisher"
TOKEN_URI_FALLBACK = "https://oauth2.googleapis.com/token"

# Play caps these; exceeding them fails with a message that does not name the field.
LIMITS = {"title": 30, "shortDescription": 80, "fullDescription": 4000}
FIELDS = ("title", "shortDescription", "fullDescription")

# A listing never names another platform's store or devices. One "Android:" line in a
# What's New cost an App Store round-trip; the texts here are written from the same
# notes, so they are guarded the same way, with the other side's words. Case-sensitive
# on purpose: "windows" as a common noun is not a platform name.
OTHER_PLATFORMS = ("iOS", "iPhone", "iPad", "App Store", "macOS", "Windows", "Linux")

GREEN, YELLOW, RED, BLUE, OFF = "\033[0;32m", "\033[1;33m", "\033[0;31m", "\033[0;34m", "\033[0m"

BARE_LANGUAGE = {
    "en": "en-US", "de": "de-DE", "fr": "fr-FR", "es": "es-ES", "it": "it-IT",
    "nl": "nl-NL", "pt": "pt-PT", "pl": "pl-PL", "ru": "ru-RU", "tr": "tr-TR",
    "ja": "ja-JP", "ko": "ko-KR", "zh": "zh-CN",
}

MANUAL_STEPS = """These have no API and stay in the Play Console (Policy → App content,
and Grow → Store presence). They are decisions, not research:

  1. Data safety — what the app collects and shares. An app with no networking,
     no analytics and no ad SDK answers "no" to everything; adding any of the three
     makes this form and the store texts false in the same release.
  2. Content rating — the IARC questionnaire. Pick the category, answer the
     violence / sexuality / profanity / drugs / gambling / interaction / location /
     purchases / ads questions, and submit it.
  3. Target audience and content — the age groups, and whether the app appeals to
     children. Declaring a child audience pulls in the Families policy.
  4. Ads — its own declaration, and easy to miss: App content → Ads. It is separate
     from the ads question inside Target audience, and the dashboard can show "Ads"
     as done while this one is still open. Play's pre-submission checks only catch it
     after you assemble a submission, so a missed declaration costs a full cycle.
  5. App access — say explicitly that all functionality is available without
     restrictions, or give the reviewer credentials. Otherwise review waits for
     credentials that do not exist.
  6. Category — "app or game", the store category and the tags. edits/details knows
     exactly three fields (contactEmail, contactWebsite, defaultLanguage) and returns
     "Unknown name 'appCategory'" for anything else; the contact half of that console
     task is already done by this script, only the category is left to click.
  7. Testers — add the addresses under Testing → Internal testing → Testers and share
     the opt-in link the console shows there. Unlike TestFlight, Play sends nothing on
     its own: a tester who has not opened that link cannot see the app."""


def ok(message: str) -> None:
    print(f"{GREEN}✓ {message}{OFF}")


def warn(message: str) -> None:
    print(f"{YELLOW}→ {message}{OFF}")


def fail(message: str) -> None:
    # Flush first: piped stdout is block-buffered while stderr is not, and without this
    # every failure surfaces before the checks it belongs to.
    sys.stdout.flush()
    print(f"{RED}✗ {message}{OFF}", file=sys.stderr)
    sys.stderr.flush()


def head(message: str) -> None:
    print(f"\n{BLUE}── {message}{OFF}")


def env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        fail(f"{name} is empty — fill it in distribution/config.sh and run this through "
             f"the entry script, which sources it")
        raise SystemExit(1)
    return value


def play_locale(raw: str) -> str:
    """en_us | en | en-US → en-US. Play wants language-REGION."""
    raw = raw.strip().replace("_", "-")
    if not raw:
        return "en-US"
    if "-" in raw:
        language, region = raw.split("-", 1)
        return f"{language.lower()}-{region.upper()}"
    return BARE_LANGUAGE.get(raw.lower(), raw.lower())


# ---------- authentication ----------


def access_token(key_path: pathlib.Path) -> str:
    """RS256 service-account assertion → OAuth token. openssl signs it; the key only ever
    reaches openssl through a file of its own, deleted immediately. The token is returned,
    never printed."""
    try:
        key = json.loads(key_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise SystemExit(f"no service-account key at {key_path} — download the JSON key of the "
                         f"Play API service account and put it there")
    except json.JSONDecodeError as error:
        raise SystemExit(f"{key_path} is not valid JSON: {error}")
    for field in ("client_email", "private_key"):
        if not key.get(field):
            raise SystemExit(f"{key_path} has no {field} — that is not a service-account key")

    now = int(time.time())
    token_uri = key.get("token_uri") or TOKEN_URI_FALLBACK

    def b64(raw: bytes) -> str:
        return base64.urlsafe_b64encode(raw).decode().rstrip("=")

    header = b64(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    claims = b64(json.dumps({
        "iss": key["client_email"],
        "scope": SCOPE,
        "aud": token_uri,
        "iat": now,
        "exp": now + 3600,
    }).encode())

    pem = None
    try:
        with tempfile.NamedTemporaryFile("w", suffix=".pem", delete=False) as handle:
            handle.write(key["private_key"])
            pem = handle.name
        os.chmod(pem, 0o600)
        signed = subprocess.run(
            ["openssl", "dgst", "-sha256", "-sign", pem],
            input=f"{header}.{claims}".encode(), capture_output=True)
    finally:
        if pem:
            os.unlink(pem)
    if signed.returncode != 0 or not signed.stdout:
        raise SystemExit(f"openssl could not sign the assertion: "
                         f"{signed.stderr.decode(errors='replace').strip()}")

    body = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": f"{header}.{claims}.{b64(signed.stdout)}",
    }).encode()
    try:
        with urllib.request.urlopen(urllib.request.Request(token_uri, data=body)) as response:
            return json.load(response)["access_token"]
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors="replace")[:400]
        raise SystemExit(f"the service account could not get an access token: {detail}")


# ---------- the API ----------


class Api:
    def __init__(self, token: str, package: str) -> None:
        self._token = token
        self.package = package

    def __call__(self, method: str, path: str, payload=None) -> dict:
        url = f"{API}/{self.package}{path}"
        data = json.dumps(payload).encode() if payload is not None else None
        request = urllib.request.Request(url, data=data, method=method)
        request.add_header("Authorization", f"Bearer {self._token}")
        if data is None:
            request.add_header("Content-Length", "0")
        else:
            request.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(request) as response:
                raw = response.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as error:
            # The body is the only place Play says why; a bare status code is undiagnosable.
            body = error.read().decode(errors="replace")
            detail = body
            try:
                detail = json.loads(body)["error"]["message"]
            except Exception:
                detail = body[:600]
            if error.code == 404:
                detail += (f"\n  No Play Console entry for {self.package}, or the service "
                           f"account cannot see it — create the app in the console first; "
                           f"the API cannot.")
            if error.code == 403:
                detail += ("\n  Grant the service account access under Users and permissions "
                           "in the Play Console, including 'Edit store listing, pricing & "
                           "distribution' — permissions are per-app unless granted "
                           "account-wide.")
            raise RuntimeError(f"HTTP {error.code} on {method} {path} — {detail}") from None


# ---------- the listing file ----------


def write_template(path: pathlib.Path, locales: list) -> None:
    template = {
        # Chosen, never derived: the first locale of LOCALES is an order, not a decision,
        # and it becomes what every country without its own listing sees (GP2). Empty
        # fails the validation until someone sets it.
        "defaultLanguage": "",
        "contactEmail": "",
        "contactWebsite": "",
        "listings": {
            locale: {field: "" for field in FIELDS} for locale in locales
        },
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(template, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def validate(listing: dict, path: pathlib.Path) -> bool:
    """Every check runs before the first call: a listing is pushed whole or not at all."""
    clean = True

    head("Contact details")
    for field in ("defaultLanguage", "contactEmail", "contactWebsite"):
        value = (listing.get(field) or "").strip()
        if value:
            ok(f"{field}: {value}")
        else:
            fail(f"{field} is empty in {path.name}")
            clean = False

    for locale, texts in sorted(listing.get("listings", {}).items()):
        head(f"Listing — {locale}")
        for field in FIELDS:
            value = texts.get(field)
            if not isinstance(value, str) or not value.strip():
                fail(f"{locale}.{field} is empty in {path.name}")
                clean = False
                continue
            count, limit = len(value), LIMITS[field]
            if count <= limit:
                ok(f"{field}: {count}/{limit} characters")
            else:
                fail(f"{field}: {count}/{limit} characters — Play refuses it without naming the field")
                clean = False
            hits = [word for word in OTHER_PLATFORMS
                    if re.search(rf"\b{re.escape(word)}\b", value)]
            if hits:
                fail(f"{field} names another platform: {', '.join(hits)}")
                clean = False

    default = listing.get("defaultLanguage")
    if default and default not in listing.get("listings", {}):
        fail(f"defaultLanguage {default} has no entry under listings")
        clean = False
    return clean


# ---------- the run ----------


def main() -> int:
    parser = argparse.ArgumentParser(description="Push the Google Play store listing.")
    parser.add_argument("--dry-run", action="store_true",
                        help="check the texts and print what would be sent; touch nothing")
    args = parser.parse_args()

    package = env("PLAY_PACKAGE_NAME")
    store_dir = pathlib.Path(env("STORE_DIR"))
    locales = [play_locale(part) for part in env("LOCALES").split()] or ["en-US"]
    path = store_dir / "play" / "listing.json"

    if not path.is_file():
        write_template(path, locales)
        fail(f"no listing at {path} — a template with every field empty is now there; "
             f"fill in the texts for {', '.join(locales)} and run this again.")
        return 2

    try:
        listing = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        fail(f"{path} is not valid JSON: {error}")
        return 1

    if not validate(listing, path):
        print()
        fail("aborting — nothing was sent to Google Play")
        return 1

    texts = {play_locale(locale): values for locale, values in listing["listings"].items()}
    missing = [locale for locale in locales if locale not in texts]
    if missing:
        warn(f"{', '.join(missing)} in LOCALES has no entry in {path.name} and stays unchanged")

    if args.dry_run:
        head("Dry run")
        for locale in sorted(texts):
            print(f"  would set the {locale} listing: {texts[locale]['title']}")
        print(f"  would set defaultLanguage, contactEmail and contactWebsite on {package}")
        ok("dry run complete — nothing was sent")
        print(f"\n{BLUE}Still to do in the Play Console{OFF}\n\n{MANUAL_STEPS}")
        return 0

    api = Api(access_token(pathlib.Path(env("PLAY_SERVICE_ACCOUNT"))), package)

    head("Opening an edit")
    try:
        edit = api("POST", "/edits", {})["id"]
    except RuntimeError as error:
        fail(str(error))
        return 1
    ok(f"edit {edit}")

    try:
        head("Contact details")
        api("PATCH", f"/edits/{edit}/details", {
            "contactEmail": listing["contactEmail"],
            "contactWebsite": listing["contactWebsite"],
            # Explicit, never "whichever locale sorts first" — that quietly makes one
            # language the fallback for the whole world.
            "defaultLanguage": play_locale(listing["defaultLanguage"]),
        })
        ok(f"{listing['contactEmail']} / {listing['contactWebsite']}")

        for locale in sorted(texts):
            head(f"Listing — {locale}")
            api("PUT", f"/edits/{edit}/listings/{locale}", {
                "language": locale,
                "title": texts[locale]["title"].strip(),
                "shortDescription": texts[locale]["shortDescription"].strip(),
                "fullDescription": texts[locale]["fullDescription"].strip(),
            })
            ok("texts")

        head("Committing the edit")
        api("POST", f"/edits/{edit}:commit")
        ok("committed")
    except RuntimeError as error:
        fail(str(error))
        try:
            api("DELETE", f"/edits/{edit}")
            warn(f"edit {edit} discarded — nothing was published")
        except RuntimeError:
            warn(f"could not discard edit {edit} (it expires on its own) — nothing was published")
        return 1

    print()
    ok(f"listing pushed for {', '.join(sorted(texts))}")
    print(f"  https://play.google.com/console/u/0/developers/app/{package}")
    print(f"\n{BLUE}Still to do in the Play Console{OFF}\n\n{MANUAL_STEPS}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Upload the screenshots under store/ to the App Store or to Google Play.

    upload_screenshots.py --platform apple|play [--locale L] [--dry-run]

Apple reads store/apple/screenshots/<locale>/<displayType>/*.png and mirrors them onto
every version that is still editable, on both platforms, replacing what is there. Apple's
asset upload is a three-step protocol per file and cannot be shortened: reserve the asset
to obtain its upload operations, PUT each byte range to its own presigned URL, then commit
with the source file's MD5. Stopping after the second step leaves a half-uploaded asset in
the set that App Store Connect shows as broken, so a failure deletes the reservation.

Play reads store/play/screenshots/<locale>/<imageType>/*.png, opens ONE edit, deletes the
slot and uploads the files in order, and commits last — a failure part-way leaves the live
listing untouched.

Configuration comes from the environment, exported by the entry script from config.sh:
Apple ASC_APP_ID, ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH, STORE_DIR;
Play  PLAY_PACKAGE_NAME, PLAY_SERVICE_ACCOUNT, STORE_DIR.
Standard library only — openssl signs both tokens, so there is no PyJWT here either.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import mimetypes
import os
import pathlib
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.appstoreconnect.apple.com/v1"
PLAY_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications"
PLAY_UPLOAD = "https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications"

SUFFIXES = (".png", ".jpg", ".jpeg")

# Screenshot sets are per platform; a Mac set on an iOS version is rejected. There is no
# APP_IPHONE_69 display type — Apple files the 6.9-inch iPhone (1320×2868) under the
# 6.7-inch bucket, and asking for one fails with an error that reads like a permission
# problem.
DEFAULT_DISPLAY_TYPES = {
    "IOS": ["APP_IPHONE_67", "APP_IPAD_PRO_3GEN_129"],
    "MAC_OS": ["APP_DESKTOP"],
}

# Only the states whose screenshot sets App Store Connect lets us change. A submitted
# version (WAITING_FOR_REVIEW, IN_REVIEW) answers 409 on a set change — skip it rather than
# abort, so refreshing one platform's screenshots works while the other is in review.
EDITABLE = {"PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED",
            "INVALID_BINARY"}

# Play's image slots. A directory named anything else is a typo, not a new slot.
PLAY_SLOTS = ("phoneScreenshots", "sevenInchScreenshots", "tenInchScreenshots",
              "tvScreenshots", "wearScreenshots", "icon", "featureGraphic", "promoGraphic")

GREEN, YELLOW, RED, BLUE, OFF = "\033[0;32m", "\033[1;33m", "\033[0;31m", "\033[0;34m", "\033[0m"


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


def b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def images_in(directory: pathlib.Path) -> list[pathlib.Path]:
    """Every image in the directory, in name order — that is the order on the product page."""
    return sorted(p for p in directory.iterdir()
                  if p.is_file() and p.suffix.lower() in SUFFIXES)


# ---------------------------------------------------------------------------
# Apple
# ---------------------------------------------------------------------------

def asc_token() -> str:
    """ES256 for App Store Connect: openssl signs, and the DER signature becomes raw r‖s.

    openssl emits a DER SEQUENCE of two INTEGERs; JWS wants the two halves concatenated,
    each left-padded to 32 bytes. The DER blob passed through unchanged yields a token
    Apple rejects with a 401 that says nothing about signature formats.
    """
    key_path = pathlib.Path(os.path.expanduser(env("ASC_KEY_PATH")))
    if not key_path.exists():
        die(f"App Store Connect key not found: {key_path}")
    now = int(time.time())
    header = b64url(json.dumps({"alg": "ES256", "kid": env("ASC_KEY_ID"), "typ": "JWT"},
                               separators=(",", ":")).encode())
    payload = b64url(json.dumps({"iss": env("ASC_ISSUER_ID"), "iat": now, "exp": now + 1200,
                                 "aud": "appstoreconnect-v1"}, separators=(",", ":")).encode())
    der = subprocess.run(["openssl", "dgst", "-sha256", "-sign", str(key_path)],
                         input=f"{header}.{payload}".encode(),
                         capture_output=True, check=True).stdout

    def read_tlv(buf, i):
        tag = buf[i]; i += 1
        length = buf[i]; i += 1
        if length & 0x80:
            n = length & 0x7F
            length = int.from_bytes(buf[i:i + n], "big"); i += n
        return tag, buf[i:i + length], i + length

    tag, sequence, _ = read_tlv(der, 0)
    if tag != 0x30:
        die("openssl did not produce a DER SEQUENCE — cannot build the token")
    _, r, index = read_tlv(sequence, 0)
    _, s, _ = read_tlv(sequence, index)
    raw = r.lstrip(b"\x00").rjust(32, b"\x00") + s.lstrip(b"\x00").rjust(32, b"\x00")
    return f"{header}.{payload}.{b64url(raw)}"


class Asc:
    def __init__(self, jwt: str, dry_run: bool):
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
            raise RuntimeError(f"HTTP {error.code} {method} {endpoint} — {detail}") from None


def put_range(operation: dict, blob: bytes) -> None:
    chunk = blob[operation["offset"]:operation["offset"] + operation["length"]]
    request = urllib.request.Request(operation["url"], data=chunk, method=operation["method"])
    for header in operation.get("requestHeaders", []):
        request.add_header(header["name"], header["value"])
    with urllib.request.urlopen(request) as answer:
        if answer.status not in (200, 201, 204):
            raise RuntimeError(f"upload chunk failed: HTTP {answer.status}")


def upload_one(asc: Asc, set_id: str, path: pathlib.Path) -> None:
    blob = path.read_bytes()
    reservation = asc("POST", "/appScreenshots", {"data": {
        "type": "appScreenshots",
        "attributes": {"fileName": path.name, "fileSize": len(blob)},
        "relationships": {"appScreenshotSet": {
            "data": {"type": "appScreenshotSets", "id": set_id}}},
    }}).get("data")
    if not reservation:
        return
    shot_id = reservation["id"]
    try:
        for operation in reservation["attributes"]["uploadOperations"]:
            put_range(operation, blob)
        asc("PATCH", f"/appScreenshots/{shot_id}", {"data": {
            "type": "appScreenshots", "id": shot_id,
            "attributes": {"uploaded": True,
                           "sourceFileChecksum": hashlib.md5(blob).hexdigest()}}})
    except Exception:
        # Leave no half-uploaded asset behind — App Store Connect shows it as broken and it
        # cannot be committed later.
        try:
            asc("DELETE", f"/appScreenshots/{shot_id}")
        except Exception:
            pass
        raise
    ok(f"    {path.name} ({len(blob) // 1024} KB)")


def apple(args) -> int:
    store_dir = pathlib.Path(env("STORE_DIR"))
    shots = store_dir / "apple" / "screenshots"
    if not shots.is_dir():
        die(f"no screenshots directory at {shots} — the scripts upload what they find there "
            f"and never generate an image")

    display_types = DEFAULT_DISPLAY_TYPES
    app_json = store_dir / "apple" / "app.json"
    if app_json.exists():
        configured = json.loads(app_json.read_text(encoding="utf-8")).get("displayTypes")
        if configured:
            display_types = configured

    locales = sorted(p.name for p in shots.iterdir() if p.is_dir() and p.name != "raw")
    if args.locale:
        locales = [l for l in locales if l in args.locale]
    if not locales:
        die("no locale directory matched")

    app_id = env("ASC_APP_ID")
    asc = Asc(asc_token(), args.dry_run)

    versions = [v for v in asc("GET", f"/apps/{app_id}/appStoreVersions?limit=50").get("data", [])
                if (v["attributes"].get("appStoreState")
                    or v["attributes"].get("appVersionState")) in EDITABLE]
    if not versions:
        say("no editable version — everything is in review or on sale; nothing was changed")
        return 0

    for version in versions:
        platform = version["attributes"]["platform"]
        wanted = set(display_types.get(platform, []))
        head(f"Version {version['attributes'].get('versionString')} — {platform}")
        localizations = {l["attributes"]["locale"]: l["id"] for l in
                         asc("GET", f"/appStoreVersions/{version['id']}"
                                    f"/appStoreVersionLocalizations?limit=50").get("data", [])}

        for locale in locales:
            localization_id = localizations.get(locale)
            if not localization_id:
                say(f"{locale}: no version localization on this platform, skipped")
                continue
            existing = {s["attributes"]["screenshotDisplayType"]: s["id"] for s in
                        asc("GET", f"/appStoreVersionLocalizations/{localization_id}"
                                   f"/appScreenshotSets").get("data", [])}

            for type_dir in sorted((shots / locale).iterdir()):
                if not type_dir.is_dir():
                    continue
                display_type = type_dir.name
                if display_type not in wanted:
                    continue
                files = images_in(type_dir)
                if not files:
                    continue
                print(f"  {locale} / {display_type}: {len(files)} file(s)")
                if args.dry_run:
                    continue

                set_id = existing.get(display_type)
                if set_id:
                    # Empty the set rather than delete it: the set carries the display type
                    # and recreating it costs a round trip that can fail halfway.
                    for shot in asc("GET", f"/appScreenshotSets/{set_id}/appScreenshots").get("data", []):
                        asc("DELETE", f"/appScreenshots/{shot['id']}")
                else:
                    set_id = asc("POST", "/appScreenshotSets", {"data": {
                        "type": "appScreenshotSets",
                        "attributes": {"screenshotDisplayType": display_type},
                        "relationships": {"appStoreVersionLocalization": {
                            "data": {"type": "appStoreVersionLocalizations",
                                     "id": localization_id}}},
                    }}).get("data", {}).get("id")
                if not set_id:
                    fail(f"{locale} / {display_type}: no screenshot set, skipped")
                    continue
                for path in files:
                    upload_one(asc, set_id, path)

    print()
    ok("screenshots uploaded" if not args.dry_run else "dry run complete — nothing was sent")
    print(f"  https://appstoreconnect.apple.com/apps/{app_id}/distribution")
    return 0


# ---------------------------------------------------------------------------
# Google Play
# ---------------------------------------------------------------------------

def play_token() -> str:
    """A service-account RS256 JWT exchanged for an OAuth access token.

    RS256 is a plain PKCS#1 v1.5 signature, so openssl's output goes in unchanged — unlike
    the App Store's ES256 above, which needs the DER unpacked.
    """
    key_file = pathlib.Path(os.path.expanduser(env("PLAY_SERVICE_ACCOUNT")))
    if not key_file.exists():
        die(f"Play service account key not found: {key_file}")
    key = json.loads(key_file.read_text(encoding="utf-8"))
    now = int(time.time())
    header = b64url(json.dumps({"alg": "RS256", "typ": "JWT"}, separators=(",", ":")).encode())
    claims = b64url(json.dumps({
        "iss": key["client_email"],
        "scope": "https://www.googleapis.com/auth/androidpublisher",
        "aud": "https://oauth2.googleapis.com/token",
        "iat": now, "exp": now + 3600,
    }, separators=(",", ":")).encode())
    # openssl wants the key as a file and the data on stdin, so the key spends a moment in
    # a private temporary file — never on the command line, and removed straight away.
    import tempfile
    with tempfile.NamedTemporaryFile("w", suffix=".pem", delete=False) as handle:
        pem = handle.name
        os.chmod(pem, 0o600)
        handle.write(key["private_key"])
    try:
        signature = subprocess.run(["openssl", "dgst", "-sha256", "-sign", pem],
                                   input=f"{header}.{claims}".encode(),
                                   capture_output=True, check=True).stdout
    finally:
        pathlib.Path(pem).unlink()
    assertion = f"{header}.{claims}.{b64url(signature)}"
    body = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": assertion,
    }).encode()
    try:
        with urllib.request.urlopen("https://oauth2.googleapis.com/token", data=body) as answer:
            return json.load(answer)["access_token"]
    except urllib.error.HTTPError as error:
        die(f"Google refused the service account: HTTP {error.code} {error.read().decode()[:300]}")


class Play:
    def __init__(self, token: str, dry_run: bool):
        self.token = token
        self.dry_run = dry_run

    def __call__(self, method: str, url: str, payload=None, raw: bytes | None = None,
                 content_type: str | None = None):
        if self.dry_run and method != "GET":
            say(f"dry-run: {method} {url.split('/edits/')[-1] if '/edits/' in url else url}")
            return {}
        data = raw if raw is not None else (json.dumps(payload).encode() if payload else None)
        request = urllib.request.Request(url, data=data, method=method)
        request.add_header("Authorization", f"Bearer {self.token}")
        if content_type:
            request.add_header("Content-Type", content_type)
        elif payload is not None:
            request.add_header("Content-Type", "application/json")
        if data is None:
            request.add_header("Content-Length", "0")
        try:
            with urllib.request.urlopen(request) as answer:
                body = answer.read()
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as error:
            detail = error.read().decode()
            try:
                detail = json.loads(detail)["error"]["message"]
            except Exception:
                detail = detail[:300]
            # 404 and 403 mean different things and the message never says which.
            if error.code == 404:
                detail += " — create the app in the Play Console first"
            if error.code == 403:
                detail += " — grant the service account access to this app in the Play Console"
            raise RuntimeError(f"HTTP {error.code} on {method} — {detail}") from None


def play(args) -> int:
    store_dir = pathlib.Path(env("STORE_DIR"))
    shots = store_dir / "play" / "screenshots"
    if not shots.is_dir():
        die(f"no screenshots directory at {shots}")
    package = env("PLAY_PACKAGE_NAME")

    locales = sorted(p.name for p in shots.iterdir() if p.is_dir())
    if args.locale:
        locales = [l for l in locales if l in args.locale]
    if not locales:
        die("no locale directory matched")

    api = Play(play_token(), args.dry_run)

    head("Opening an edit")
    edit = "dry-run" if args.dry_run else api("POST", f"{PLAY_BASE}/{package}/edits").get("id")
    if not edit:
        die("no edit id — nothing was published")
    ok(f"edit {edit}")

    try:
        for locale in locales:
            head(f"Listing images — {locale}")
            for slot_dir in sorted((shots / locale).iterdir()):
                if not slot_dir.is_dir():
                    continue
                slot = slot_dir.name
                if slot not in PLAY_SLOTS:
                    say(f"{slot}: not a Play image slot, skipped "
                        f"(expected one of: {', '.join(PLAY_SLOTS)})")
                    continue
                files = images_in(slot_dir)
                if not files:
                    continue
                # Delete the slot first: uploading again without it stacks a second copy
                # into the slot and Play shows both.
                api("DELETE", f"{PLAY_BASE}/{package}/edits/{edit}/listings/{locale}/{slot}")
                for path in files:
                    api("POST",
                        f"{PLAY_UPLOAD}/{package}/edits/{edit}/listings/{locale}/{slot}"
                        f"?uploadType=media",
                        raw=path.read_bytes(),
                        content_type=mimetypes.guess_type(path.name)[0] or "image/png")
                ok(f"{slot}: {len(files)} image(s)")
    except RuntimeError as error:
        fail(str(error))
        if not args.dry_run:
            try:
                api("DELETE", f"{PLAY_BASE}/{package}/edits/{edit}")
            except Exception:
                pass
        die("the edit was deleted — nothing was published")

    if args.dry_run:
        print()
        ok("dry run complete — nothing was sent")
        return 0

    head("Committing the edit")
    try:
        api("POST", f"{PLAY_BASE}/{package}/edits/{edit}:commit")
    except RuntimeError as error:
        die(f"commit failed, nothing was published — {error}")
    ok("committed")
    print(f"  https://play.google.com/console/u/0/developers/app/{package}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--platform", choices=("apple", "play"), required=True)
    parser.add_argument("--locale", action="append", help="restrict to these locales")
    parser.add_argument("--dry-run", action="store_true",
                        help="list what would be uploaded; send nothing")
    args = parser.parse_args()
    return apple(args) if args.platform == "apple" else play(args)


if __name__ == "__main__":
    sys.exit(main())

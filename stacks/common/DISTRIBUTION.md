# Delivery scripts: the contract

Every stack ships a `distribution/` directory beside its three design documents. On the
first run of `kartograph-deliver` in a project, the skill copies `stacks/common/distribution/`
and then `stacks/<stack>/distribution/` into the project's `distribution/`, fills
`distribution/config.sh` from what the project's build files reveal, and commits. From then
on the scripts are the project's: a person runs them from a terminal, the skill runs them on
request, and edits to the copies steer every later run. This file is the contract the
scripts, the skill and the tests hold each other to.

## Layout in the project

```
distribution/
  config.sh                 the project's identifiers and paths; the only file a person edits
  lib/                      shared library, copied from stacks/common/distribution/lib/
    common.sh               logging, config loading, confirmations, semver, release notes
    xcode.sh                xcconfig, archive, export, altool, simulators, devices (Apple lanes)
    asc.sh                  App Store Connect API: token, builds, TestFlight, versions, review
    play.sh                 Google Play: token, edits, bundles, tracks, promotion
    gradle.sh               Gradle: version fields, bundleRelease, installDebug, run tasks
    kotlin-toolchain.sh     Kotlin Toolchain: version fields in module.yaml, package -f aab, kotlin run
    docker.sh               docker compose up/down/logs for a local backend and frontend
    asc_metadata.py         push store/apple/*.json to every editable version
    play_listing.py         push store/play/listing.json in one edit
    upload_screenshots.py   three-step asset upload (Apple) and image slots (Play)
  <entry scripts>           the stack's, see the table below
  store/                    listing texts and screenshots, versioned with the project
    apple/app.json, apple/<locale>.json, apple/screenshots/<locale>/<displayType>/
    play/listing.json, play/screenshots/<locale>/<imageType>/
  release-notes/vX.Y.Z.md   one file per release, the one place its notes live: written by prepare-release.sh
                            (or notes_write), its store slices filled by kartograph-release
  build/                    archives, bundles, logs; gitignored
```

## Entry scripts per stack

| script | kmp | kmp-toolchain | apple-swift | android-compose | angular-kotlin | python-fastapi | does |
|---|---|---|---|---|---|---|---|
| `run-local.sh <lane>` | desktop, ios, android, docker | desktop, ios, android, docker | macos, ios | android | docker | docker | builds and starts the app on that lane for development |
| `run-device.sh [udid]` | ios | ios | ios | – | – | – | installs and launches the debug build on a paired iPhone or iPad over the cable |
| `prepare-release.sh <major\|minor\|patch\|X.Y.Z> [--tag]` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | writes `release-notes/vX.Y.Z.md` from the commits since the last release, bumps every lane's version and build number, optionally tags |
| `deploy-testflight.sh [--platform ios\|mac] [--build N] [--no-bump]` | ✓ | ios | ✓ | – | – | – | archives, exports, uploads, configures the internal TestFlight group; the Mac platform validates a `.pkg` first |
| `deploy-play-internal.sh [--version-code N] [--notes FILE]` | ✓ | ✓ | – | ✓ | – | – | builds the release bundle and uploads it to the internal track in one edit |
| `push-store-metadata.sh [--apple] [--play] [--dry-run] [--screenshots] [--version X.Y.Z] [--yes]` | ✓ | ✓ | ✓ | play only | – | – | pushes listing texts and screenshots; `--version` first makes sure that Apple version is editable, creating it (confirmed, unless `--yes`) when none is; creates the JSON templates when missing; states what only the web UI can do |
| `release-check.sh [--apple] [--play]` | ✓ | ✓ | ✓ | play only | – | – | reads, never writes: the newest processed TestFlight build per Apple platform against the version on sale, the internal track's highest versionCode against production's; prints one line per lane and `release X.Y.Z` (the first Apple platform's); exit 0 when every lane is ahead, 1 when a new build is needed first, 2 when no store lane ships, 3 when a store could not be read |
| `release-stores.sh [--apple] [--play] [--rollout F] --notes FILE` | ✓ | ✓ | ✓ | play only | – | – | Play: promotes the internal track to production; Apple: attaches the processed build to the editable version, sets What's New, submits for review |
| `deploy.sh [backend\|frontend\|all]` | – | – | – | – | ✓ | – | backend to Fly, frontend to Vercel, each followed by a live health check |

A script whose lane the project does not ship (per `LANES` in `config.sh`) says so and exits 2.

**One script, every stack.** A script with the same name is byte-identical in every stack
that ships it. Where the build system matters (the Android and desktop lanes of
`run-local.sh`, `prepare-release.sh`, `deploy-play-internal.sh`), the script calls
`kotlin_build_lib`, which sources `kotlin-toolchain.sh` when `STACK="kmp-toolchain"` and
`gradle.sh` otherwise, and then only the **Kotlin build interface** both libraries define:
`android_release_check`, `android_version_read`, `android_version_write NAME CODE`,
`android_bundle_release`, `emulator_run`, `desktop_run`. `android_release_check` runs
before any version is written, so a configuration that cannot build never bumps a number.
A bundle counts as signed only when `jarsigner -verify` prints `jar verified.`: it exits 0
on an unsigned jar too. The iOS lanes are `xcode.sh` for every stack; on
`kmp-toolchain` they run on the generated `iosApp/module.xcodeproj`.

## `config.sh`

Every key is exported. Empty means "not configured"; a script that needs a key calls
`require_var` and stops with the key's name and the line in `config.sh` to fill. Secrets never
live here: only paths to key files under the home directory.

```bash
APP_NAME=""                      # display name, e.g. Longpath
STACK=""                         # kmp | kmp-toolchain | apple-swift | android-compose | angular-kotlin | python-fastapi
LANES=""                         # space-separated subset of: ios mac android desktop web server backend frontend
LOCALES="en-US"                  # store locales, space-separated

# Apple
TEAM_ID=""
APPLE_BUNDLE_ID=""               # one id for iOS and macOS (Universal Purchase)
ASC_APP_ID=""                    # numeric App Store Connect app id; created in the web UI, never by API
ASC_KEY_ID=""
ASC_ISSUER_ID=""
ASC_KEY_PATH="$HOME/.private_keys/AuthKey_${ASC_KEY_ID}.p8"
IOS_PROJECT=""                   # path to the .xcodeproj or .xcworkspace
IOS_SCHEME=""
MAC_PROJECT=""                   # empty when the Mac app is the same project
MAC_SCHEME=""
VERSION_FILE=""                  # the file holding MARKETING_VERSION and CURRENT_PROJECT_VERSION: an .xcconfig or project.yml
XCODEGEN="no"                    # yes when the Xcode project is generated from project.yml
IOS_PROFILE_NAME=""              # empty → automatic signing; else manual with this App Store profile
MAC_PROFILE_NAME=""
SIMULATOR="iPad Pro 13-inch (M4)"
TESTFLIGHT_GROUP="Internal Testing"
BETA_FEEDBACK_EMAIL=""

# Android
PLAY_PACKAGE_NAME=""
PLAY_SERVICE_ACCOUNT="$HOME/.google-play/service-account.json"
GRADLE_DIR=""                    # directory holding gradlew (Gradle stacks)
KOTLIN_DIR=""                    # directory holding the kotlin wrapper and project.yaml (kmp-toolchain)
ANDROID_MODULE=":androidApp"     # a Gradle path; on kmp-toolchain the module name, androidApp
ANDROID_BUILD_FILE=""            # the file holding versionCode and versionName: build.gradle.kts, or the Android module.yaml on kmp-toolchain
KEYSTORE_PROPERTIES=""           # gitignored file with storeFile, storePassword, keyAlias, keyPassword
EMULATOR=""                      # AVD name; empty → the first one listed

# Desktop, web, server (KMP; module names without the colon on kmp-toolchain)
DESKTOP_MODULE=":desktopApp"
WEB_MODULE=":webApp"
SERVER_MODULE=":server"

# Docker, Fly, Vercel (angular-kotlin; docker also for a KMP server)
COMPOSE_FILE=""                  # docker compose file for the local stack
BACKEND_DIR=""                   # directory holding fly.toml
FLY_APP=""
FRONTEND_DIR=""                  # directory holding the Angular project
PROD_URL=""                      # public URL checked after a frontend deploy
HEALTH_URL=""                    # backend health endpoint checked after a deploy
```

## Library API

All bash libraries: `set -euo pipefail`, `bash 3.2` compatible (macOS default), no `declare -A`,
`python3` from the system for JSON and JWT, `curl`, `openssl`. No PyJWT, no fastlane, no Ruby,
no Homebrew dependency beyond what Xcode and the Android SDK bring. Every function logs what it
is about to do with `log`, never prints a token or a password, and returns non-zero on failure
with a message that names the cause, not the symptom (the ASC "No profiles found" trap, the Play
403-versus-404 distinction, the ASC build number that is never released again).

### `common.sh`

```
log MSG            warn MSG            die MSG [CODE]
require_var NAME...                    stop when any named variable is empty, naming config.sh
require_cmd CMD...                     stop when a command is missing, naming how to get it
require_lane LANE                      exit 2 with a sentence when LANE is not in $LANES
confirm_typed WORD PROMPT              read a line; anything but WORD aborts with "nothing was published"
load_config                            source distribution/config.sh relative to the lib directory; sets DIST_DIR, PROJECT_ROOT, BUILD_DIR
semver_bump CURRENT major|minor|patch  print the next version
semver_valid X.Y.Z                     0 when strict semver
last_release_tag                       newest vX.Y.Z tag, or empty
commits_since REF                      one line per commit subject since REF (or all)
notes_write VERSION [REF]              write release-notes/vVERSION.md with Fixed / New / Changed sections seeded from commits
notes_slice FILE lane [CAP]            print the lane's section (play_short, asc_short, web, desktop, server) or the whole file, truncated at CAP
json_get FILE|- EXPR                   python3 one-liner: print value at dotted path
kotlin_build_lib                       source kotlin-toolchain.sh when STACK=kmp-toolchain, else gradle.sh
```

### `xcode.sh`

```
version_read                           MARKETING_VERSION from $VERSION_FILE (xcconfig or project.yml)
build_read                             CURRENT_PROJECT_VERSION
build_write N                          write it back so the number lands in the diff
version_write X.Y.Z
xcode_regenerate                       xcodegen generate when XCODEGEN=yes
xcode_archive LANE [ARCHIVE] [BUILD]   ios|mac; prints the archive path (default build/<lane>/<App>-<stamp>.xcarchive); API-key flags; only CURRENT_PROJECT_VERSION may be overridden on the CLI, never signing
xcode_export_upload ARCHIVE LANE       ExportOptions with destination=upload; manual signing when *_PROFILE_NAME is set, else automatic with -allowProvisioningUpdates
xcode_export_pkg ARCHIVE OUTDIR        Mac: export a .pkg to disk with Apple Distribution + 3rd Party Mac Developer Installer; prints the .pkg path
altool_validate PKG [ios|macos]        grep VERIFY SUCCEEDED, never the absence of "error"; the type is inferred from the extension
altool_upload PKG [ios|macos]
keychain_has IDENTITY_PREFIX
ensure_profile LANE [--recreate]       create the App Store profile through POST /v1/profiles and install it, when *_PROFILE_NAME is set and absent
simulator_run                          build for the simulator named $SIMULATOR, boot, install, launch, tail the log
mac_run                                build the Mac scheme Debug and open the product
device_list                            paired iPhones and iPads with hardware UDIDs (devicectl and xcodebuild use different ids)
device_run [UDID]                      build Debug against id=UDID with per-device derived data, devicectl install and launch; all paired devices when no UDID
```

### `asc.sh`

```
asc_token                              ES256 JWT, 20 min, raw r‖s signature (DER breaks it); cached for the process
asc_get PATH [QUERY]                   asc_post PATH JSON   asc_patch PATH JSON   asc_delete PATH
asc_build_latest PLATFORM [VERSION]    prints the id of the newest build with processingState VALID, optionally for a marketing version
asc_build_wait PLATFORM VERSION BUILD  poll until processed (deadline ASC_WAIT_SECONDS, default 1800); prints the build id
asc_export_compliance BUILD_ID         usesNonExemptEncryption false
asc_beta_group_ensure                  find or create $TESTFLIGHT_GROUP (internal)
asc_beta_group_add BUILD_ID
asc_beta_localization BUILD_ID LOCALE [DESCRIPTION] [WHATS_NEW]   app-level description and feedback email; the optional what's-new goes on the build
asc_version_exists PLATFORM VERSION    true when an editable version already carries exactly VERSION; never creates
asc_version_editable PLATFORM [X.Y.Z]  the version in an editable state, created with versionString when absent
asc_version_attach VERSION_ID BUILD_ID
asc_version_whats_new VERSION_ID LOCALE TEXT
asc_subscriptions_pending              subscriptions at READY_TO_SUBMIT not attached to a submission; non-empty blocks a review submission (Guideline 2.1(b))
asc_review_submit PLATFORM [X.Y.Z]     create or reuse the review submission, add the version, submit; refuses when asc_subscriptions_pending is non-empty
```

### `play.sh`

```
play_token                             service-account JWT → OAuth token; cached in the process, never printed (play_api uses it)
play_api METHOD PATH [JSON|@FILE] [CONTENT_TYPE]
play_edit_open                         prints EDIT_ID; 404 → "create the app in the Play Console first"; 403 → "grant <service account> access"
play_edit_commit EDIT_ID               prints the error body on failure (curl -sf would swallow it)
play_edit_delete EDIT_ID
play_upload_bundle EDIT_ID AAB         prints versionCode
play_track_set EDIT_ID TRACK VERSION_CODE [ROLLOUT] [NOTES_FILE] [LOCALE]
play_track_versions TRACK              versionCodes currently on TRACK
play_promote FROM TO [ROLLOUT] [NOTES_FILE]   one edit: read FROM, set TO, commit
play_verify TRACK VERSION_CODE         second edit that reads the track back and compares
```

### `gradle.sh`

```
gradle_version_read                    versionName and versionCode from $ANDROID_BUILD_FILE (prints "NAME CODE")
gradle_version_write NAME CODE
gradle_bundle_release                  :module:bundleRelease with $KEYSTORE_PROPERTIES present, prints the AAB path; jarsigner must say "jar verified."
gradle_run TASK...                     ./gradlew in $GRADLE_DIR
gradle_release_check                   GRADLE_DIR set and its gradlew executable
emulator_run                           start $EMULATOR (or the first AVD) if none is running, wait for boot, installDebug, launch the main activity
desktop_run                            $DESKTOP_MODULE:run
android_release_check                  the Kotlin build interface: gradle_release_check
android_version_read                   gradle_version_read
android_version_write NAME CODE        gradle_version_write
android_bundle_release                 gradle_bundle_release
```

### `kotlin-toolchain.sh`

```
toolchain_run ARGS...                  ./kotlin in $KOTLIN_DIR, output on stderr
toolchain_release_check                KOTLIN_DIR and an executable wrapper; signing enabled in the Android module.yaml (flow, block or scalar form)
                                       and its propertiesFile, resolved against the module directory, present; $KEYSTORE_PROPERTIES present
toolchain_version_read                 versionName and versionCode from the android: block of settings: in $ANDROID_BUILD_FILE (prints "NAME CODE")
toolchain_version_write NAME CODE      rewrite both in place, the rest of the file byte-identical, CRLF kept; a missing key stops, naming it and the file
toolchain_bundle_release               toolchain_release_check; kotlin package -m $ANDROID_MODULE -f aab -v release; the .aab in
                                       build/tasks/_<module>_bundleAndroid/ (else the newest this run wrote under build/tasks, never under intermediates/);
                                       jarsigner must say "jar verified."; copied to build/android/<App>-<name>-<code>.aab; prints that path
toolchain_emulator_run                 boot $EMULATOR (or the first AVD) when nothing is attached, then kotlin run -m $ANDROID_MODULE -d <serial>:
                                       the FIRST attached device only (-d takes one id), where gradle's installDebug installs on every attached device
toolchain_desktop_run                  kotlin run -m $DESKTOP_MODULE (Compose Hot Reload on by default)
android_release_check                  the Kotlin build interface: toolchain_release_check
android_version_read                   toolchain_version_read
android_version_write NAME CODE        toolchain_version_write
android_bundle_release                 toolchain_bundle_release
emulator_run                           toolchain_emulator_run
desktop_run                            toolchain_desktop_run
```

For `kmp-toolchain`: the project's own `kotlin` wrapper in `$KOTLIN_DIR`, never one on PATH.
The Kotlin Toolchain is Alpha; the file's header names the checks its facts came from.

### `docker.sh`

```
require_docker                         docker present and the daemon reachable (Docker Desktop running)
http_code URL                          the status code, 000 when the host did not answer
wait_for_http URL DEADLINE [INTERVAL] [WHAT]   poll until 200, printing the elapsed time; 1 on timeout
compose_up                             docker compose -f $COMPOSE_FILE up -d --build, then wait for $HEALTH_URL when set
                                       (5 min); on timeout the log tail and a failure
compose_down                           compose_logs [SERVICE]   (--tail=200 -f on a terminal, --tail=200 when piped)
compose_status                         docker compose ps
vercel_deploy DIR [--prebuilt]         vercel --prod --yes --archive=tgz in DIR; --prebuilt writes the minimal
                                       vercel.json when absent so nothing is built remotely; prints the deployment
                                       URL, checks $PROD_URL, names the dashboard rollback on failure
fly_deploy DIR APP                     flyctl deploy -a APP, flyctl status, then $HEALTH_URL with an 8-minute grace
                                       (a JVM server starts slowly); names flyctl releases rollback on failure
```

### Python

```
asc_metadata.py  [--dry-run] [--locale L] [--platform IOS|MAC_OS]
    reads store/apple/app.json (category, contentRights, ageRating, reviewDetail, urls, displayTypes) and
    store/apple/<locale>.json (name, subtitle, description, keywords, promotionalText, whatsNew, urls);
    validates lengths against Apple's per-resource limits and forbids other-platform words (Guideline 2.3.10)
    and any URL not answering 200 before the first write; patches appInfo localizations and every editable
    version on each platform; prints what only the web UI can do (App Privacy, trader status, the app record).
play_listing.py  [--dry-run]
    reads store/play/listing.json (defaultLanguage, per-locale title, shortDescription, fullDescription,
    contactEmail/website, category is listed as manual); one edit, commit last; length checks; prints the
    console-only steps (Data safety, IARC, ads, app access, category).
upload_screenshots.py --platform apple|play [--locale L] [--dry-run]
    Apple: per <locale>/<displayType>/ directory, delete the existing set, reserve, PUT ranges, commit with MD5,
    delete the reservation on failure. Play: per <locale>/<imageType>/, deleteall then upload in order, one edit.
```

## Conventions every script keeps

- `#!/usr/bin/env bash`, `set -euo pipefail`, resolves its own directory with `BASH_SOURCE`,
  sources `lib/common.sh` and calls `load_config` first; `--help` prints usage and exits 0.
- Artefacts and logs go to `distribution/build/<lane>/`; the metadata and the notes are the
  only files under `distribution/` that a release changes in git.
- Anything that leaves the machine (upload, promote, submit, deploy) is preceded by
  `confirm_typed` unless `--yes` was given; a failed step deletes the edit or reservation it
  opened and says "nothing was published".
- The App Store Connect key id, issuer and team id come from `config.sh`, never from a
  literal in a script; the key file path is printed, its contents never.
- A version or build number that the script bumped is written back to the project's file
  before the upload, so it lands in the diff.
- Never two `xcodebuild` runs against one derived-data path; never signing flags on the
  `xcodebuild` command line; validate a Mac `.pkg` before uploading it.
- Screenshots are honest renders of the real app; the scripts upload what they find under
  `store/*/screenshots/` and never generate an image.

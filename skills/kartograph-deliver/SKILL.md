---
name: kartograph-deliver
description: Use when the person wants the app running locally (Mac, iOS simulator, Android emulator, or the docker stack), on their own iPhone or iPad, on TestFlight or Play internal testing, in the store listings, prepared as a release with notes and a version bump, released to the stores, or deployed as a backend and frontend. Sets up the project's delivery scripts on first use. Requires the action to be named.
---

# Kartograph Deliver

Get what was built into a person's hands: locally, on a device, on the test tracks, in the
stores, or on a host. The plugin ships one set of delivery scripts per stack; on first use
they are copied into the project's `distribution/` directory, configured from the build
files, and committed. From then on they are the project's: a person runs them from a
terminal, you run them on request, and edits to the copies steer every later run. You never
upload, promote, submit or deploy without the person saying so, once, in chat.

## Hard rules

- **Write only `distribution/`** (the scripts, `config.sh`, the store JSON and the release
  notes the scripts create) and the `.gitignore` line for `distribution/build/`; commit only
  those. Never `kartograph/`, `knowledge/`, `features/`, `plans/`, `walks/`, or the app's code.
- **Never print a secret.** Key files are named by path; tokens, passwords and key contents
  never appear in chat or in a commit. `config.sh` holds identifiers and paths only.
- **Anything that leaves the machine is confirmed by the person.** Uploading, promoting,
  submitting for review, deploying: say what the script will do and to which app and
  version, ask once, and run it with `--yes` only after a yes. Local runs, device installs
  and dry runs need no question.
- **Never edit a script to make a step pass.** A script that fails is reported with its last
  lines; a wrong or empty value in `config.sh` is the one thing you may fix, and you say so.
- **The scripts are the truth about the lanes.** A lane missing from `LANES` in `config.sh`
  is not shipped; do not invent a way around it.
- The App Store Connect and Play APIs need the network; if the runtime's sandbox blocks
  them, say so and let the person run the printed command themselves.

## 0. Version gate

Before anything else, check that the project is on this plugin's layout. The plugin's
layout version is the highest version among the files named like `3.0.0.md` in the
`migrations/` directory at the plugin root, two levels above this file's directory; if
that directory is not there, skip this step. The project is behind when
`kartograph/index.md` names a lower `kartograph_version` or names none, or when
`kartograph/index.md` does not exist but the project holds Kartograph files from before:
stamp-named files in `intents/`, a `capability.md` or a `# Source intent:` line under
`features/`, a `knowledge/index.md` with `okf_version`, or a `.kartograph/` directory.
Then stop and say only: "This project is on an older Kartograph layout; run
kartograph-migrate first." A project with none of these is new and passes; a directory
name alone, such as `features/` in a Cucumber project, is not a Kartograph file.

## 1. Set up, on first use

If `distribution/config.sh` exists, skip to step 2. Otherwise:

1. **Find the stack.** Read `docs/code-design/stack.md` if it exists. Otherwise test each
   `STACK.md`'s *Detection* rules under the `stacks/` directory at the plugin root (two
   levels above this file's directory) against the project's build files; exactly one match
   is the stack. Delivery does not need the stack's design documents, so a `scaffold` stack
   is fine here. No match or more than one: stop and say what was seen.
2. **Copy.** Copy every file under `stacks/common/distribution/` and then under
   `stacks/<stack>/distribution/` into the project's `distribution/`, keeping the tree and
   the executable bits, never overwriting a file that exists. Rename the copied
   `config.sh.template` to `config.sh`.
3. **Fill `config.sh`** from what the project shows, leaving a key empty when nothing
   shows. The comment beside each key in the copied template names the file its value
   comes from; read it there: `APP_NAME` from the product name; the Apple keys from the
   Xcode project and its configuration files; the Android keys (package, the build's
   directory, the file holding the version fields, the keystore properties) from the
   Android build files; `COMPOSE_FILE`, `BACKEND_DIR`, `FLY_APP`, `FRONTEND_DIR` from a
   compose file, `fly.toml` and an `angular.json`; `ASC_APP_ID`, `ASC_KEY_ID`,
   `ASC_ISSUER_ID` from a delivery script already in the project when one carries them;
   `LANES` from what exists (an iOS project → `ios`, a Mac scheme → `mac`, an Android
   module → `android`, a desktop module → `desktop`, a `fly.toml` → `backend`, an Angular
   project → `frontend`). Keep `STACK` as the template sets it and keep its comments. When
   a template comment asks for a change to a project file before a key can be filled (the
   stack's `STACK.md` says which, under *Delivery*), leave the key empty and name the change
   in the report.
4. **Ignore the build output:** add `distribution/build/` to `.gitignore` if absent.
5. **Commit** `distribution/` and `.gitignore` as `deliver: scripts for <stack>`; push to the
   branch's upstream; no git or no upstream, skip and say so. Report every key you filled
   and every key still empty, with the line to fill it on.

## 2. Run what was asked

Map the request to one script and its arguments; the script's `--help` is its contract:

| the person wants | script |
|---|---|
| the app running here: Mac, simulator, emulator, desktop, docker stack | `run-local.sh <lane>` |
| the app on their iPhone or iPad | `run-device.sh [udid]` |
| release notes and the next version number | `prepare-release.sh <major\|minor\|patch\|X.Y.Z> [--tag]` |
| a build on TestFlight (iOS or Mac) | `deploy-testflight.sh [--platform ios\|mac]` |
| a build on Play internal testing | `deploy-play-internal.sh` |
| the store listings created or updated | `push-store-metadata.sh [--dry-run] [--screenshots]` |
| the tested build in the stores | `release-stores.sh --notes distribution/release-notes/v<X.Y.Z>.md` |
| the backend or frontend on its host | `deploy.sh [backend\|frontend\|all]` |

Before running: say the exact command. For an outward action, also say the app, version
and build or lane it touches, then ask once. Run the script from the project root with its
output visible to you; pass `--yes` only after the person agreed. When a script stops on an
empty key, fill the key if the project shows the value, say what you filled, and run again;
otherwise hand the person the key's line. When a script says a step exists only in the web
UI (the app record, App Privacy, Data safety, a subscription's first review), list it as
theirs to do.

The natural order for a release is `prepare-release.sh`, then `deploy-testflight.sh` and
`deploy-play-internal.sh`, then the person tests, then `push-store-metadata.sh`, then
`release-stores.sh` with the notes file; say where in that order the request sits when it
helps.

## 3. Report

What ran, in one line each: the app, version and build, the lane, where it landed (a
device, a simulator, a TestFlight group, a Play track, an App Store version in review, a
deployment URL). What stopped and why, with the last lines of the script's output. What
remains manual and where to do it. If the first-use setup ran, the commit and the empty
keys. Then you are done.

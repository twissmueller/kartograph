---
name: kartograph-release
description: Use when a build that was tested on TestFlight or on Play internal testing should go to the App Store and Google Play, and its release notes, store texts and screenshots have to say what is new. Not for building or uploading a new build.
---

# Kartograph Release

Ship the build that was tested, exactly that one, to the stores, and say once what is new:
in the release notes, in the store texts, in the screenshots of what changed. Check, write,
commit, ask once, release, tag, report.

## Hard rules

- **Ship the tested build.** Never bump a version or a build number, never build, never
  upload a binary. When the tested build is not newer than what the store sells, stop: a
  new build comes first, and that is `kartograph-deliver`'s.
- **Ask exactly once**, after everything is written and committed: one summary of the
  notes, the text changes and the screenshots, one question. Nothing leaves the machine
  before the person's yes; the scripts get `--yes` only after it.
- **Write only** `distribution/release-notes/v<X.Y.Z>.md`, `distribution/store/` (texts and
  screenshots), `distribution/release-check.sh` when it is missing, the screenshot renderer
  in the app's test code together with the one seam and the build-file lines the stack's
  `screenshots.md` names, and the tag `v<X.Y.Z>`. Never `kartograph/`, `features/`,
  `knowledge/`, `plans/`, `walks/`, `distribution/config.sh` or another delivery script.
- **Positive and factual.** Say what is new and what works better, as the person using the
  app notices it. A fix is what now works ("Syncing resumes after the connection returns"),
  never "a bad bug has been fixed". No superlatives, nothing the commits and features do not
  show.
- **Never name another platform** in any store text: no Android, Google Play, Play Store,
  Windows or Linux in anything Apple reads; no iOS, iPhone, iPad, Mac or App Store in
  anything Play shows. The notes are written platform-neutral, once, for both.
- **Existing store wording and structure stay.** Only what is new is added.
- **Screenshots are renders of the real UI** by the project's renderer, never captures of
  the running app, and only the screens that changed get new ones.
- **Never print a secret.** The store APIs need the network; if the runtime's sandbox
  blocks it, say so and hand the person the command.

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

## 1. Check the tested build

The plugin root is two levels above this file's directory. No `distribution/config.sh`:
say that `kartograph-deliver` sets up delivery first, and stop. If
`distribution/release-check.sh` is missing, copy it from
`stacks/<STACK>/distribution/release-check.sh` at the plugin root (`STACK` from
`distribution/config.sh`), keeping it executable; it needs only library functions every
project's `distribution/lib/` already has.

Run `distribution/release-check.sh` from the project root. Exit 2: the project ships no
store lane; say so and stop. Exit 1: show its lines and stop with "The tested build is not
newer than the store; a new build on TestFlight or Play internal comes first." Exit 0: the
version to release is the `release X.Y.Z` line; a project with only a Play lane takes it
from `versionName` in the file `ANDROID_BUILD_FILE` names. A lane whose line says `on sale
none` is a first release: its app record, App Privacy and review details are web-only and
What's New is refused on a first release, so stop and say so.

The bump tier is the first part that differs between `X.Y.Z` and the version on sale:
major, minor or patch.

## 2. What changed

The previous release is the newest `vA.B.C` tag below `vX.Y.Z` (`git tag --list 'v*.*.*'
--sort=-v:refname`); a `vX.Y.Z` tag that `prepare-release.sh --tag` already set is not it.
The range ends at the last commit that changed the build number's file (`VERSION_FILE`,
else `ANDROID_BUILD_FILE`): every upload writes its number there first, so later commits
are not in the tested build. When that file has uncommitted changes, the range ends at
`HEAD`.

Read the range: `git log --no-merges --format='%h %s' <previous>..<end>`, and
`git diff --name-status <previous>..<end> -- kartograph/ features/` for the intents,
revisions and feature files added or changed, reading each of those files. What a person
using the app notices counts: new and changed scenarios, fixes whose subject names a
behaviour. Chores, refactors, tests, documentation and build changes do not.

## 3. Release notes

The one place for them is `distribution/release-notes/v<X.Y.Z>.md`, where
`prepare-release.sh` writes them and `release-stores.sh` reads them. If it is missing,
create it with the delivery library:
`bash -c '. distribution/lib/common.sh && load_config && notes_write <X.Y.Z> <previous tag>'`.

Rewrite its `## New`, `## Fixed` and `## Changed` lists from step 2 as sentences a person
using the app understands, one per change; a list with nothing in it keeps its single `-`.
By tier: a major release adds a `## Migration` section after `## Changed` saying what a
person has to do or will find moved; a minor release has at least one line under
`## New`; a patch release may have only `## Fixed`. Then fill `### play_short` (at most 500
characters) and `### asc_short` (at most 4000) under `## Store text`: plain text, no
headings, the most noticeable change first, in the language of the first locale in
`LOCALES`, since `release-stores.sh` sets the same text for every locale.

## 4. Store texts

Per locale, in `distribution/store/apple/<locale>.json` and in the locale's entry of
`distribution/store/play/listing.json`: add each new feature from step 3 to the
description (`description`, `fullDescription`) where the existing text lists features, in
its style and in that locale's language; the rest of the text stays as it is. Apple's
`promotionalText` (at most 170 characters) leads with the release's most noticeable
change and keeps as much of its current wording as still fits. Never write `whatsNew`:
`release-stores.sh` sets it from the notes. Keywords, names and subtitles stay.

Then run `distribution/push-store-metadata.sh --dry-run`. It checks every length and
refuses other-platform words and dead URLs before any upload; fix the texts until it
passes.

## 5. Screenshots

A screen changed when a commit in the range touched its files, or a revision or feature in
the range changed a scenario it serves (the plans' screens tables name each screen, its
scenarios and its files); a new screen counts as changed. No screen changed: skip this
step and say so.

Find the project's renderer (`StoreScreenshotRenderer` in its test code). None: build it
once from `stacks/<STACK>/screenshots.md` at the plugin root, sections 1 to 3, with one
shot per screen the store's current screenshots show plus the new screens, at most ten.
When that file is missing or still `UNFILLED`, render nothing, keep the store's
screenshots, and say so in the report.

Render each locale in `LOCALES` as the file's section 4 says, into
`distribution/build/screenshots/`. Look at every image you are about to ship: an error, an
empty state, a "nothing today" banner or a first-run hint means the seed is wrong; fix the
seed and render again. Copy the images of the changed screens into
`distribution/store/apple/screenshots/<locale>/<displayType>/`, replacing the file of the
same name; remove the image of a screen the app no longer has. When `LANES` includes
`android`, copy the same files into `distribution/store/play/screenshots/<locale>/`: the
`APP_IPHONE_67` set as `phoneScreenshots`, the `APP_IPAD_PRO_3GEN_129` set as
`tenInchScreenshots`.

## 6. Commit, ask once, release

Stage the release notes, `distribution/store/`, `distribution/release-check.sh` if you
copied it, and the renderer's files; commit as `release: v<X.Y.Z> notes, store texts,
screenshots`; push to the branch's upstream (no git or no upstream: skip and say so).

Then show one summary: per lane the version and build from step 1 and where it goes (App
Store review, Play production, full rollout unless the person named a fraction); the
`play_short` and `asc_short` texts verbatim; per locale the sentences added to the
descriptions and the new promotional text; the screenshot files replaced, added and
removed. Ask once: "Release v<X.Y.Z> to the stores now?" — **A (recommended):** yes,
**B:** not yet.

On yes, run from the project root, in this order, stopping at the first failure:

1. `distribution/push-store-metadata.sh --screenshots`
2. `distribution/release-stores.sh --notes distribution/release-notes/v<X.Y.Z>.md --version <X.Y.Z> --yes`
   (with `--rollout <fraction>` when the person named one)

When both succeeded and no `v<X.Y.Z>` tag exists, tag the release commit
`git tag -a v<X.Y.Z> -m "v<X.Y.Z>"` and push the tag; an existing tag stays where it is.
A failure: show the script's last lines; nothing after it runs and nothing is tagged. On
"not yet", stop: the commit stays, and the next run reuses the written files.

## 7. Report

What is where: per Apple platform the version in review, on Play the versionCode in
production and its rollout, the tag. What the scripts said only the web UI can do (App
Privacy, Data safety, a subscription's first review). Every screen whose screenshot was
rendered from shared code only, or not rendered, and why. Then you are done.

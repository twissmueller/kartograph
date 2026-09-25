---
name: kartograph-release
description: Use when a build that was tested on TestFlight or on Play internal testing should go to the App Store and Google Play, whether as the app's first store release or as an update, and its release notes, store texts and screenshots have to say what the app is or what is new. Not for building or uploading a new build.
---

# Kartograph Release

Ship the build that was tested, exactly that one, to the stores, and say once what is new:
in the release notes, in the store texts, in the screenshots of what changed. Check, write,
commit, ask once, release, tag, report.

On a lane where nothing is on sale yet, the release is that lane's **first**: the store
presence is written from scratch (the whole listing, every key screen, notes that introduce
the app) and the steps only the web UI can do are prepared as a checklist with their
answers, `distribution/store/first-release.md`. The person clicks those through; the one
question covers both. A release to a lane already on sale runs exactly as before.

## Hard rules

- **Ship the tested build.** Never bump a version or a build number, never build, never
  upload a binary. When the tested build is not newer than what the store sells, stop: a
  new build comes first, and that is `kartograph-deliver`'s.
- **Ask exactly once**, after everything is written and committed: one summary of the
  notes, the text changes and the screenshots, one question. On a first release the same
  question also asks whether the web steps of the checklist are done. Nothing reaches the
  stores before the person's yes; the scripts get `--yes` only after it.
- **Write only** `distribution/release-notes/v<X.Y.Z>.md`, `distribution/store/` (texts,
  screenshots and, on a first release, `first-release.md`), `distribution/release-check.sh`
  and `distribution/first-release-check.sh` when they are missing,
  `distribution/push-store-metadata.sh` and `distribution/lib/asc.sh` when they predate
  `--version`, `distribution/release-stores.sh` and `distribution/lib/asc.sh` on a first
  release when they predate it (step 1), the screenshot renderer in the app's test code
  together with the one seam and the build-file lines the stack's `screenshots.md` names,
  and the tag `v<X.Y.Z>`. Never `kartograph/`, `features/`, `knowledge/`, `plans/`, `walks/`,
  `distribution/config.sh` or another delivery script.
- **Positive and factual.** Say what is new and what works better, as the person using the
  app notices it. A fix is what now works ("Syncing resumes after the connection returns"),
  never "a bad bug has been fixed". No superlatives, nothing the commits and features do not
  show.
- **Never name another platform** in any store text: no Android, Google Play, Play Store,
  Windows or Linux in anything Apple reads; no iOS, iPhone, iPad, Mac or App Store in
  anything Play shows. The notes are written platform-neutral, once, for both.
- **Existing store wording and structure stay.** Only what is new is added. A first
  release has no wording yet; it writes the whole listing.
- **Screenshots are renders of the real UI** by the project's renderer, never captures of
  the running app, and only the screens that changed get new ones; a first release renders
  every key screen.
- **Never guess an answer.** Every answer in the first-release checklist comes from the
  code, the build files, the project's files or a store read, and names where. What none
  of them shows is marked for the person, never filled in: a phone number, a price, an age
  group, a URL that does not answer 200.
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
project's `distribution/lib/` already has. When the project's delivery scripts predate
`--version` — the option parsing of `distribution/push-store-metadata.sh` has no
`--version)` case, or `distribution/lib/asc.sh` defines no `asc_version_exists` — copy
`stacks/<STACK>/distribution/push-store-metadata.sh` and
`stacks/common/distribution/lib/asc.sh` from the plugin root over both, keeping the script
executable, and say in the report that they were refreshed; step 6 needs `--version`.

Run `distribution/release-check.sh` from the project root. Exit 2: the project ships no
store lane; say so and stop. Exit 3: a store could not be read; show its last lines and
stop with the error, never with "a new build comes first" — nothing is known about the
build. Exit 1: show its lines and stop with "The tested build is not newer than the store;
a new build on TestFlight or Play internal comes first." Exit 0: the
version to release is the `release X.Y.Z` line; a project with only a Play lane takes it
from `versionName` in the file `ANDROID_BUILD_FILE` names.

A lane whose line says `on sale none` (Apple) or `production none` (Play) is a **first
release** on that lane; every other lane is a follow-up and everything below runs for it
as it always did. The tested build on TestFlight or Play internal is still required (exit
0), and it already proves that the app record and the Play app exist. An Apple line reads
`on sale none` from an older `distribution/release-check.sh` for an app removed from sale
too: when the project's copy does not name `DEVELOPER_REMOVED_FROM_SALE`, copy the
plugin's over it, keeping it executable, and run it again before deciding. For a first
release, copy `stacks/<STACK>/distribution/first-release-check.sh` from the plugin root
when `distribution/first-release-check.sh` is missing, keeping it executable. When the
first release includes an Apple lane and the project's `distribution/release-stores.sh`
does not call `asc_version_on_sale` or has no `--no-submit)` case, copy
`stacks/<STACK>/distribution/release-stores.sh` and `stacks/common/distribution/lib/asc.sh`
over both, keeping the script executable, and say in the report that they were refreshed:
the older script sets What's New, which Apple refuses on a first release, and cannot leave
the submission to an in-app purchase's Add for Review. Then run
`distribution/first-release-check.sh --version <X.Y.Z>`, with `--apple` or `--play` when
only that store's lanes are first releases: exit 3 stops like
`release-check.sh`'s; exit 0 or 1 gives one line per gate (`✓` in place, `✗` missing, `?`
web only), kept for the checklist in step 5a.

The bump tier is the first part that differs between `X.Y.Z` and the version on sale:
major, minor or patch. A Play-only project's `release-check.sh` line carries no version to
compare, so take the tier from `X.Y.Z` against the previous release tag's version instead
(step 2 finds it; when step 2 finds none, there is no tier either, and it already stops).
When every store lane is a first release there is no tier: the notes introduce the app.

## 2. What changed

The previous release is the newest `vA.B.C` tag below `vX.Y.Z` (`git tag --list 'v*.*.*'
--sort=-v:refname`); a `vX.Y.Z` tag that `prepare-release.sh --tag` already set is not it.
None below `vX.Y.Z`: when every store lane is a first release, the range is the whole
history and there is no previous release. Otherwise an untagged history means only that
this project's past releases were never tagged here — stop and say so, naming
`prepare-release.sh --tag` as how the next release gets a tag to read from.

The range ends at the last commit that changed the build number's file (`VERSION_FILE`,
else `ANDROID_BUILD_FILE`): every upload writes its number there first, so later commits
are not in the tested build. When that file has uncommitted changes, the range ends at
`HEAD`.

Read the range: `git log --no-merges --format='%h %s' <previous>..<end>`, and
`git diff --name-status <previous>..<end> -- kartograph/ features/` for the intents,
revisions and feature files added or changed, reading each of those files. What a person
using the app notices counts: new and changed scenarios, fixes whose subject names a
behaviour. Chores, refactors, tests, documentation and build changes do not.

On a first release, read what the app is rather than what changed: every capability and
feature file under `features/`, the intents and revisions under `kartograph/`, and the
concepts under `knowledge/` for the words the product uses. The store texts, the notes and
the key screens come from them.

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

When every store lane is a first release, the notes introduce the app instead: create the
file with the same command without a previous tag, and write `## New` as what the app does,
one sentence per capability a person using it notices; `## Fixed` and `## Changed` keep
their single `-`, and there is no `## Migration`. `play_short` introduces the app in the
same way; Play shows it as the release's notes. `asc_short` is written the same, for the
record: `release-stores.sh` sets no What's New on a lane with nothing on sale, because
Apple refuses it there (ASC10). When only some lanes are first releases, the notes list
what changed as above, and the slice of a lane that is a first release introduces the app
instead.

## 4. Store texts

Per locale, in `distribution/store/apple/<locale>.json` and in the locale's entry of
`distribution/store/play/listing.json`: add each new feature from step 3 to the
description (`description`, `fullDescription`) where the existing text lists features, in
its style and in that locale's language; the rest of the text stays as it is. Apple's
`promotionalText` (at most 170 characters) leads with the release's most noticeable
change and keeps as much of its current wording as still fits. Never write `whatsNew`:
`release-stores.sh` sets it from the notes. Keywords, names and subtitles stay.

On a lane that is a first release there is nothing to extend; write the whole listing,
for every locale in `LOCALES`. When the files are missing, create them first with
`distribution/push-store-metadata.sh --apple --dry-run` and
`distribution/push-store-metadata.sh --play --dry-run`, one lane per run (each writes its
templates, sends nothing and stops with exit 2), and fill the templates:

- Apple, `distribution/store/apple/<locale>.json`: `name` and `subtitle` (at most 30 each),
  `description`, `keywords` (comma-separated, at most 100 characters),
  `promotionalText`, `privacyPolicyUrl`, `supportUrl`, `marketingUrl`; leave `whatsNew`
  empty. `distribution/store/apple/app.json`: the categories, `contentRightsDeclaration`,
  `usesIdfa`, `copyright`, every `ageRatingDeclaration` answer, and `reviewDetail`.
- Play, `distribution/store/play/listing.json`: `title`, `shortDescription` (at most 80) and
  `fullDescription` per locale, `contactEmail`, `contactWebsite`. `defaultLanguage` is the
  person's choice, never derived, not even from the order of `LOCALES` (GP2): one the file
  already carries stays; an empty one stays empty, becomes "yours to decide" in the
  checklist, and the one question names it.

Each answer comes from the code and the project's files, per the rule *Never guess an
answer*: `usesIdfa` is true only when an ad or attribution library reads the advertising
identifier; the age-rating answers follow what the features show; `contentRightsDeclaration`
follows whether the app shows content it does not own. Fetch every URL before writing it
and write only one that answers 200 (ASC26); a missing page, the review contact's phone
number and anything else nothing shows stay empty and become a ✗ in the checklist. When
the app sells an auto-renewable subscription, every Apple description carries a Terms of
Use (EULA) link: Apple's standard one,
`https://www.apple.com/legal/internet-services/itunes/dev/stdeula/`, unless the project
has its own (ASC25).

Then run `distribution/push-store-metadata.sh --dry-run --version <X.Y.Z>`. It checks
every length and refuses other-platform words and dead URLs before any upload, and says
for each Apple platform that it would create the version `X.Y.Z` the texts land on; fix
the texts until it passes. It also stops when an Apple platform already has an editable
version with another number, such as the "1.0" App Store Connect creates with a new app:
`X.Y.Z` cannot be created beside it (ASC29). That is no text fix; it becomes the ✗ of the
version gate in the checklist, and the summary before the question says so. Only that
finding and an empty `defaultLanguage` may stay when the dry run ends; fix every other.

## 5. Screenshots

A screen changed when a commit in the range touched its files, or a revision or feature in
the range changed a scenario it serves; a new screen counts as changed. The plans' screens
tables name each screen, its feature and the scenarios it serves; its files are in the
plan's `## Files` and in its ring-1 task. No screen changed: skip this step and say so. On
a lane that is a first release every key screen counts as changed: the screens of the
plans' screens tables that show what the app is for, in the order the intents give the
capabilities, at most ten, and no settings, sign-in or empty screen.

Find the project's renderer (`StoreScreenshotRenderer` in its test code). None: build it
once from `stacks/<STACK>/screenshots.md` at the plugin root, sections 1 to 3, with one
shot per screen the store's current screenshots show plus the new screens, at most ten.
When that file is missing or still `UNFILLED`, render nothing, keep the store's
screenshots, and say so in the report; on a first release there are none to keep, so the
checklist marks the screenshots ✗.

Render each locale in `LOCALES` as the file's section 4 says, into
`distribution/build/screenshots/`. Look at every image you are about to ship: an error, an
empty state, a "nothing today" banner or a first-run hint means the seed is wrong; fix the
seed and render again. Copy the images of the changed screens into
`distribution/store/apple/screenshots/<locale>/<displayType>/`, replacing the file of the
same name; remove the image of a screen the app no longer has. When `LANES` includes
`android`, copy the same files into
`distribution/store/play/screenshots/<locale>/phoneScreenshots/` (the `APP_IPHONE_67` set)
and `distribution/store/play/screenshots/<locale>/tenInchScreenshots/` (the
`APP_IPAD_PRO_3GEN_129` set). A first Play listing also needs a 512 × 512 `icon` and a
1024 × 500 `featureGraphic` in their directories beside those: neither is a render, so
when the project does not already hold them, the checklist marks them ✗.

## 5a. First-release checklist

Only when a lane is a first release. Write `distribution/store/first-release.md` in the
shape of `first-release-template.md` in this file's directory: a section per store lane
that is a first release, and in it every row of the template, each with its mark and its
prepared answer. The marks come from step 1's `first-release-check.sh` lines, and from the
files written in step 4 for the gates the push sets: ✓ when the file carries the value, ✗
when it is empty. A `?` line is a web step and gets its answer here:

- **App Privacy (Apple) and Data safety (Play):** from the dependency manifests the build
  files name, the permissions and usage-description strings the app declares, a privacy
  manifest when there is one, and the code that sends data anywhere. No networking, no
  analytics, no ad or crash-report library: Apple's answer is *Data Not Collected*, Play's
  that nothing is collected or shared. Otherwise one row per data type, with what the code
  does with it. Apple's must be **published**, by the Admin role (ASC18).
- **Content rating and the age rating:** from what the features show and what the person
  using the app can do with others (messaging, user content, web access, purchases).
- **Target audience, app access, ads, category, price and availability, agreements:** from
  the intents, the features (a sign-in scenario means app access needs the reviewer's
  credentials, GP8), the libraries (an ad library means ads, and on Play the Advertising
  ID declaration, GP11) and what the app sells; the price is the person's, never guessed.

Every answer names what it came from; one that nothing shows reads "yours to decide" and
keeps its `?` or `✗`. Remove every angle-bracket placeholder.

An in-app purchase or subscription waiting for its first review (a `?` on the `in-app
purchases` or `subscriptions` line) is no step before the yes. The API cannot add it to a
submission, and the product's own **Add for Review** in App Store Connect joins it to the
**open** submission and submits the whole thing (ASC24). So the release attaches the build
and prepares that open submission with the version in it, without submitting it
(`release-stores.sh --no-submit`, which reuses an open submission rather than creating a
second one, ASC31), and the checklist's *After the release* hands the person that click,
per product: reload the product's page first, its state badge can be stale; and canceling
the submission drops the product from it, so it needs the click again. An incomplete product (`✗`,
MISSING_METADATA) has to be completed before the yes. The Play section's *After the
release* is the draft production release, sent for review from the console.

## 6. Commit, ask once, release

Stage the release notes, `distribution/store/`, `distribution/release-check.sh` and
`distribution/first-release-check.sh` if you copied them,
`distribution/push-store-metadata.sh`, `distribution/release-stores.sh` and
`distribution/lib/asc.sh` if you refreshed them, and the renderer's files; commit as
`release: v<X.Y.Z> notes, store texts, screenshots`; push to the branch's upstream (no git
or no upstream: skip and say so).

Then show one summary: per lane the version and build from step 1 and where it goes (App
Store review, Play production, full rollout unless the person named a fraction); the
`play_short` and `asc_short` texts verbatim; per locale the sentences added to the
descriptions and the new promotional text; the screenshot files replaced, added and
removed. Ask once: "Release v<X.Y.Z> to the stores now?" — **A (recommended):** yes,
**B:** not yet.

On a first release the summary shows instead the full texts per locale, every screenshot,
and every ✗ and `?` of `distribution/store/first-release.md` with its answer and where it
is done, `defaultLanguage` by name when it is still yours to decide, and the hand-over
after the release (the Add for Review clicks, the Play review); and the one question is:
"The web steps in `distribution/store/first-release.md` are done, and v<X.Y.Z> goes out?"
— **A:** yes, **B:** not yet. When products wait for a first review, the question adds
"The build is attached and the review submission prepared but not submitted; your Add for
Review on each product's page joins it and submits it."

On yes to a first release, before anything leaves the machine:

1. When the person has filled a file under `distribution/store/` since the commit (the
   review contact's phone, a URL, `defaultLanguage`), commit it as `release: v<X.Y.Z>
   store details` and push.
2. Run `distribution/first-release-check.sh --version <X.Y.Z>` again, with the same lane
   options. Stop with "nothing was sent" on exit 3, and on any `✗` among the gates the push
   does not set: `version`, `in-app purchases`, `subscriptions`, `price`, `availability`,
   `EULA link`. A `✗` on a gate the push sets from the files — `content rights`,
   `category`, `age rating`, `defaultLanguage`, `contact`, `listings` — is expected on an
   app never pushed, and exit 1 for those alone is no stop.
3. Stop the same way when a checklist `✗` that lives in a file is still empty there: the
   review contact in `app.json`, a URL in `<locale>.json`, `defaultLanguage` or the contact
   in `listing.json`. Name each one and where it is set.

On yes, run from the project root, in this order, stopping at the first failure:

1. When the project has an Apple lane:
   `distribution/push-store-metadata.sh --apple --screenshots --version <X.Y.Z> --yes`
   (`--version` makes sure the editable App Store version exists first, so the texts and
   screenshots land on it rather than being skipped as "nothing was changed"; they go live
   only with the version, after review)
2. `distribution/release-stores.sh --notes distribution/release-notes/v<X.Y.Z>.md --version <X.Y.Z> --yes`
   (with `--rollout <fraction>` when the person named one, and `--no-submit` on a first
   release whose in-app purchases or subscriptions wait for their first review)
3. When the project has a Play lane:
   `distribution/push-store-metadata.sh --play --screenshots --yes` — last, because Play's
   listing and screenshots go live the moment its edit commits, so they must not describe a
   version production does not have yet

The order is the same on a first release. `release-stores.sh` then sets no What's New on
an Apple platform with nothing on sale; with `--no-submit` it attaches the build and
prepares the open submission without submitting it, and the person's Add for Review
submits it. Play accepts only a draft
production release for an app never published: it is staged, and the person sends it for
review from the console (the checklist's *After the release*). A failure on the Play lane
after the Apple version was submitted is reported per lane: what Apple already has, and
what Play has and has not.

When every step succeeded and no `v<X.Y.Z>` tag exists, tag the release commit
`git tag -a v<X.Y.Z> -m "v<X.Y.Z>"` and push the tag; an existing tag stays where it is.
A failure: show the script's last lines and say which parts already went out (the Apple
texts and screenshots on the editable version, the release to review and production) and
which did not; nothing after it runs and nothing is tagged. On "not yet", stop: the commit
stays, and the next run reuses the written files.

## 7. Report

What is where: per Apple platform the version in review, on Play the versionCode in
production and its rollout, the tag. The delivery scripts refreshed in step 1, if any.
What the scripts said only the web UI can do (App Privacy, Data safety, a subscription's
first review). On a first release: every line of `distribution/store/first-release.md`
that still carries ✗ or `?`, and where it is done (App Store Connect, the Play Console, or
the file and field), then the hand-over: each product's Add for Review when the
submission was left open (reload the page first; a canceled submission needs the click
again), and the Play review of the draft release last. Every screen whose
screenshot was rendered from shared code only, or not rendered, and why. Then you are
done.

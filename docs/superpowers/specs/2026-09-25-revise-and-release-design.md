# Revise and release — two new skills (v3.2.0)

Date: 2026-09-25. Status: design approved by the owner in conversation on 2026-09-25; the
decisions in *Decided here* are this spec's and await spec review.

## Why

**Revise.** The screens are built first (ring 1) so that a person can look at them and say
"change this and that". Today those changes are told to the AI in chat, land in the code,
and never reach the intent, the features, the knowledge or the plan: the plan and the
documents drift from the code, and the next ring builds against a stale plan.

**Release.** A tested build sits on TestFlight and Play internal testing and should go to
the stores. `kartograph-deliver` can run `release-stores.sh`, but nobody writes the release
notes, adds the new features to the store texts, or renders the screenshots of what
changed. The owner has two projects at that point now.

## `kartograph-revise` — change something, everything follows

**When:** the person looks at what was built (after a walk, or anytime) and says what
should be different. One skill does everything in one run (the owner chose this over
chaining the existing skills); one commit per step:

1. **Record.** The person's words verbatim go into
   `kartograph/<stamp>-<slug>.revision.md`, a new document type `Revision`. `sources` names
   the intent of every affected capability. The file names the affected capabilities,
   features, scenarios and screens, and the changes derived from the words, each Changed,
   Added or Removed and each citing `[turn n]`. The skill asks only when the words are
   genuinely ambiguous, one question per message, recorded as short conversation blocks
   like converse's so the turns can be cited.
2. **Features.** Exactly the affected scenarios change, each with
   `# Changed by kartograph/<file>.revision.md` directly above it; new behaviour is a new
   scenario; a scenario is removed only when the person said so. The features validator
   runs.
3. **Knowledge.** Concepts whose meaning changed are updated with the revision as an extra
   source; an existing definition follows the collision rule.
4. **Plan.** A new plan for the capability supersedes the old one. Checkboxes stay ticked
   for work the revision does not touch; affected tasks are unticked or added, so the
   later rings build the revised version.
5. **Code.** The change is implemented in the rings already built (only screens, when only
   ring 1 is done), by working through the new plan's unticked tasks under the ring
   skills' rules. The app the person is watching is never launched or reloaded.
6. **Report.** What changed where, what is open, and whether a walk makes sense.

`Revision` joins the `kartograph/` validators (`validate-kartograph.js` knows the
`.revision.md` suffix) and gets its own `validate-revision.js`. Map, knowledge and features
know revisions as a source. Revise deliberately breaks "each skill writes only its own
output"; CLAUDE.md records that exception. Walk only points to revise in its report and
never starts it.

## `kartograph-release` — from TestFlight into the stores in one run

**When:** a tested build is on TestFlight or Play internal and should go to the stores.

1. **Check.** The build on TestFlight or the internal track carries a newer version than
   the store (the owner's ASC29: a build attaches only to the version whose number it
   carries). Otherwise stop: a new build is needed first. Release never bumps or rebuilds;
   it ships exactly the tested build.
2. **What changed.** The git log since the last release tag, plus the intents, revisions
   and features added or changed since.
3. **Release notes** with a slice per store (the owner's REL5 and AV8). Positive and
   factual: improvements, never "a bad bug has been fixed", no exaggeration. Never names
   another platform (ASC32).
4. **Store texts.** New features go into the description and the promotional text, per
   locale already in `distribution/store/`; existing wording and structure stay, only what
   is new is added.
5. **Screenshots.** Rendered per ASC13 (the shared Compose UI at true pixel size through
   the Compose test harness) or MAS10 (native SwiftUI, headless), seeded with data that
   reaches today (ASC14); Play reuses the Apple shots (GP5). A project without a renderer
   gets one, built once by release and committed (the owner chose this). Only changed
   screens get new shots. Never screenshots of the running app.
6. **Commit, then one question**: the notes, the text changes and the screenshots in one
   summary, asked once. After the yes: `push-store-metadata.sh --screenshots`, then
   `release-stores.sh --notes …` (Apple to review, Play to production).
7. **Report.** What is in review or production, what remains in the web UI.

Writes `distribution/store/`, the release notes, the screenshot renderer in the app's test
code, and the release tag. Uses the existing delivery scripts unchanged. Deliver stays as
it is.

## Decided here

The design left these to the implementation; each is decided as follows.

### The revision document

`kartograph/<YYYY-MM-DD-HHMM>-<slug>.revision.md`, slug at most five words, the stamp the
time the revision was recorded. Flat frontmatter with the conversation's nine keys in this
order: `type: Revision`, `title`, `description`, `status`, `date`, `role`, `language`,
`sources`, `related`.

- `status`: `recorded` when step 1 commits, `applied` when the run has carried it through.
  A run that stops midway leaves `recorded`, so the file says how far it got.
- `sources`: a non-empty one-line list of intent file names (without `kartograph/`), the
  intents listed under `## Sources` of every affected capability. `related`: earlier
  revisions of the same capabilities, or `[]`.

Body, exactly these sections in this order after the H1 (= title):

- `## Conversation` — numbered `### n — Person` / `### n — AI` blocks. The first and the
  last block are the person's; blocks alternate; an AI block holds only the converse lines
  (`> Looked up:`, one `Reasoning (shortened):`, one `**Question:**`, options, at most one
  recommended).
- `## Affected` — one line per item: `` - Capability: `features/…/capability.md` ``,
  `` - Feature: `features/….feature` ``, `` - Scenario: `features/….feature › name` ``,
  `` - Screen: `Name` in `plans/<file>.md` ``. At least one capability; every feature and
  scenario named has its capability named.
- `## Changes` — `` - **Changed|Added|Removed:** `target` — what [turn n] ``, the target a
  feature file, a feature file ` › scenario`, or a `capability.md`, inside an affected
  capability; every change cites at least one block of **this file's** conversation, and
  only person blocks. A revision cites itself, so it needs no conversation file beside it.
- `## Open questions` — bullets, or exactly `None identified.`

`validate-revision.js` (pure `validateRevision(text, { filename })` plus
`validateRevisionFile(path)` and the guarded CLI) checks all of that, rejects template
placeholders outside code spans, and, for a file inside a project's `kartograph/`, errors
when an intent in `sources` is missing beside it and **warns** (never errors) when an
affected path does not exist: an added feature does not exist yet at step 1, and a removed
scenario is gone after step 2.

### No migration document for 3.2.0

CLAUDE.md: "A release that changes a project's layout adds `migrations/<version>.md`."
Adding an optional document type changes no existing file and asks nothing of an existing
project: every project on layout 3.0.0 is valid under the 3.2.0 validators as it stands.
A `migrations/3.2.0.md` would raise the plugin's layout version to 3.2.0 and make every
skill's version gate stop every project until `kartograph-migrate` ran a migration that
does nothing. So there is none: the layout version stays 3.0.0, `kartograph_version: 3.0.0`
stays in `kartograph/index.md`, and `validate-kartograph.js` simply accepts the fourth
type. CLAUDE.md's migrations section records the rule: a new optional document type or
file is not a layout change.

The three other bundle validators' `DOC_NAME` (conversation, intent, mapping) accept a
`.revision.md` in `related`, so a follow-up conversation or a mapping can name a revision.
`scripts/migrate-kartograph.js` imports `DOC` and therefore leaves a `.revision.md` in
place during a 3.0.0 migration, which is right.

### `# Changed by` in feature files

- A line `# Changed by kartograph/<stamp>-<slug>.revision.md` stands **directly above** a
  `Scenario:`, `Scenario Outline:` or `Rule:` line (in the file's dialect); only tag lines
  and other comments may sit between. Anywhere else, or at the end of the file, is an
  error. The marker is English in every dialect, like `# Source intent:`.
- Every revision a feature file names is listed in its capability's `## Sources` as
  ``- Revision: `kartograph/<file>.revision.md` ``, after the intent lines; the path shape
  is checked there too.
- Inside a project the revision file must exist (an error when `kartograph/` exists,
  a warning otherwise, like the source intents).
- An earlier `# Changed by` line stays when a scenario is changed again; the features skill
  keeps both marks and the `- Revision:` lines as provenance.

### The superseding plan

`validate-plan.js` already accepts ticked steps (`- [x]`) and a `supersedes` path. Added:

- An optional last frontmatter key `revision: kartograph/<file>.revision.md`. Present →
  `supersedes` is not `none`.
- A task field `**Revised:** changed` or `**Revised:** added`, on its own line below the
  task's first field lines, marks every task the revision rewrote or added; any other value
  is an error. A plan with `revision` marks at least one task; a plan without it marks none
  (`kartograph-plan` never writes either).
- Inside a project (`validatePlanFile`), for a plan with `revision`: the revision file and
  the superseded plan exist; every task **not** marked `**Revised:**` exists in the
  superseded plan under the same ring and name (else "mark it `**Revised:** added`"), and
  if it was done there (all steps ticked) it is done here. Ticks may be gained later by the
  ring skills, never lost; that makes the check hold for the plan's whole life, not only at
  write time.
- New export `tasksOf(text)`: the tasks per ring with a done flag.
- The three ring skills skip a task whose steps are all ticked, and say why: a revision
  plan keeps the ticks of work already built.

A **built ring** is one whose tasks were all ticked in the superseded plan
(`validate-plan.js` prints `rings done:` per ring). Revise implements the revised tasks in
built rings only; a ring only partly built, and every ring not built, keeps its unticked
tasks for its ring skill. A removed scenario loses its ring-2 task; its test and the code
only it used are deleted in the ring where they live, in that ring's commit, and reported
as a deviation from the plan (no plan step can carry a deletion of a scenario that no longer
exists).

### How revise reaches the other skills' rules

The plugin root is two levels above the skill's directory (as in the version gate and in
`kartograph-migrate`). Revise runs `<plugin root>/skills/kartograph-features/validate-features.js`,
`…/kartograph-knowledge/validate-knowledge.js` and `…/kartograph-plan/validate-plan.js`, and
for the code step reads `skills/kartograph-screens|domain|adapters/SKILL.md` at the plugin
root and follows their hard rules and sections 1–3, instead of restating them: the ring
rules keep one source. Differences: only unticked tasks, no reload or launch, commit
subjects gain ` (revision)`, one push and one report at the end.

### Revise's commits

In order, each after its validator passes: `revision: <title>` (the revision, index, log);
`features: <revision title>`; `knowledge: <revision title>` (skipped when no term changes);
`plan: <capability> (revision)` per capability with a plan (both plans); per built ring
`screens|domain|adapters: <capability> (revision)`; `revision: <title> applied` (status,
index line, log). One push at the end. The index line is
`* [title](file) - description _(Revision, recorded|applied)_`; the log lines are
`* **Revision**: recorded …` and `* **Revision**: applied …`; `knowledge/log.md` gets
`* **Revision**: processed …`.

### The one release-notes location

REL5 wants one `release-notes/<version>.md` in the repo, AV8 names it
`release-notes/v<major>.<minor>.<patch>.md`; `prepare-release.sh` (through `notes_write`)
already writes `distribution/release-notes/v<X.Y.Z>.md`, and `release-stores.sh --notes`
reads it. The one location is **`distribution/release-notes/v<X.Y.Z>.md`**: the knowledge
repo's path is read relative to the delivery root, which the contract already fixes; the
contract does not change, only its layout comment says it is the one place. When the file
is missing (the version was bumped some other way), release creates it with the existing
library call `notes_write X.Y.Z <previous tag>` and then authors it. AV8's tier rule is
applied by the skill: a major release adds `## Migration`, a minor one has at least one
`## New` line, a patch may have only `## Fixed`. `release-stores.sh` sets one What's New
for every locale, so `play_short` and `asc_short` are written once, in the language of the
first locale in `LOCALES`.

### Checking the tested build: `release-check.sh`

No existing script reads the version on sale or the tested build's marketing version.
Added, in the contract first (`DISTRIBUTION.md` table row), a read-only entry script
`release-check.sh [--apple] [--play]`, shipped byte-identical by the four stacks that ship
`release-stores.sh` (kmp, kmp-toolchain, apple-swift, android-compose):

- Apple, per platform in `LANES`: the newest `VALID` build with its `preReleaseVersion`
  included (marketing version and build number) against the highest `versionString` in
  `READY_FOR_SALE`/`READY_FOR_DISTRIBUTION`; all Apple platforms must test the same
  version. Play: the highest versionCode on `internal` against the highest on `production`.
- One line per lane, then `release X.Y.Z` when an Apple lane named it. Exit 0 all ahead,
  1 not, 2 no store lane.
- It uses only `asc_get` and `play_track_versions`, which every project's copied
  `lib/` already has, so release copies this one file into a project set up by an older
  plugin (when missing, never overwriting) and needs nothing else. Its version comparison
  is a function inside the script, tested by extracting it.

A Play-only project takes the version from `versionName` in `ANDROID_BUILD_FILE`. A lane
with nothing on sale is a first release: out of scope (the app record, App Privacy and the
review details are web-only, and What's New is refused on a first release, ASC10), so
release stops and says so.

### What changed since the last release

The previous release is the newest `vA.B.C` tag **below** `vX.Y.Z` (a `vX.Y.Z` tag that
`prepare-release.sh --tag` set at bump time is not it). The range ends at the last commit
that changed the build-number file (`VERSION_FILE`, else `ANDROID_BUILD_FILE`), because
every upload writes its number there first; with uncommitted changes in that file, at
`HEAD`. Read: the commit subjects, and the intents, revisions and feature files added or
changed in `kartograph/` and `features/`. User-visible changes only.

### Store texts

Per locale: new features join the description (`description`, Play `fullDescription`)
where the existing text lists features, in its style and language. Apple's
`promotionalText` (170 characters) leads with the most noticeable change and keeps as much
of its wording as still fits; it cannot grow. `whatsNew` in the JSON is never written
(`release-stores.sh` sets it from the notes). Keywords, names, subtitles stay. Before the
commit, `push-store-metadata.sh --dry-run` runs its length, platform-word and URL checks.

### Screenshot renderers as stack documentation

A new document per store stack, **`stacks/<stack>/screenshots.md`**, with five fixed
sections: `## 1. Where the renderer lives`, `## 2. Devices and sizes`, `## 3. Seed`,
`## 4. Run`, `## 5. Output`. Release reads it from the plugin only when the project has no
renderer; afterwards the renderer in the project's test code is the truth. The skill stays
stack-neutral (a test forbids stack words in both new skills). CLAUDE.md's "Only plan
reads `stacks/`" becomes: plan reads the design documents, deliver copies `distribution/`,
release reads `screenshots.md` and copies `release-check.sh`.

- **kmp** (ASC13 and the owner's Longpath renderer): `StoreScreenshotRenderer` in the JVM
  test source set of the module holding the root composable, `compose.uiTest`,
  `runDesktopComposeUiTest` at true pixels with `LocalDensity`, inert unless
  `-Dstore.screenshots=true`, the three `store.screenshots*` properties forwarded to the
  test JVM in `build.gradle.kts`. A native SwiftUI iOS app renders its shots the
  apple-swift way.
- **kmp-toolchain**: the same renderer; *Toolchain departure*: environment variables
  `STORE_SCREENSHOTS_OUT` / `STORE_SCREENSHOTS_LOCALE` instead of forwarded `-D`, the
  dependency under `test-dependencies@jvm:`; marked not exercised hands-on.
- **apple-swift** (MAS10 and the owner's Kikitori renderer): in the macOS model-test bundle
  that compiles `App/Shared`, `NSHostingView` in an offscreen borderless `NSWindow`,
  `cacheDisplay` into a bitmap at logical size × scale, presentation state staged after the
  model's initial work; Swift Testing `.enabled(if:)` on `RENDER_SCREENSHOTS` (*project
  dial*: Kikitori used XCTest); `TEST_RUNNER_`-prefixed variables through `xcodebuild` and
  the iPhone and iPad shots rendered from the shared views on macOS (*stack default*).
- **android-compose** (scaffold): the five sections `UNFILLED`; release renders nothing
  there and says so.
- Sizes: `APP_IPHONE_67` 1320×2868 @3, `APP_IPAD_PRO_3GEN_129` 2064×2752 @2, `APP_DESKTOP`
  2880×1800 @2 (there is no `APP_IPHONE_69`, ASC12), only for lanes in `LANES`.
- Seed (ASC14): the demo composition (in-memory repositories, or the `isUITest` doubles)
  with dates computed from today, first-run hints marked seen. Release looks at every image
  it ships and re-seeds on an error, empty state or "nothing today" banner.
- Output: `distribution/build/screenshots/<locale>/<displayType>/<NN>-<screen>.png`
  (gitignored). Release copies only the changed and new screens into
  `distribution/store/apple/screenshots/…`, removes screens the app no longer has, and for
  an Android lane copies the iPhone set to `play/…/phoneScreenshots/` and the iPad set to
  `tenInchScreenshots/` (GP5).
- **Committed.** The store screenshots are committed under `distribution/store/`, as
  `DISTRIBUTION.md` already says ("versioned with the project"). This departs from the
  knowledge repo's canonical shape, where ASC13's screenshots are generated and gitignored:
  "only changed screens get new shots" needs the unchanged ones to persist, and the one
  question shows the screenshot diff.

A screen changed when a commit in the range touched its files or a revision or feature in
the range changed a scenario it serves; the plans' screens tables name screens, scenarios
and files.

### Release's writes, question, commit and tag

Writes only the notes, `distribution/store/`, `distribution/release-check.sh` when missing,
the renderer (plus the one start seam and build-file lines `screenshots.md` names), and the
tag. One commit `release: v<X.Y.Z> notes, store texts, screenshots`, pushed; then the one
summary and the question "Release v<X.Y.Z> to the stores now?" (A recommended: yes; B: not
yet). On yes: `push-store-metadata.sh --screenshots`, then
`release-stores.sh --notes distribution/release-notes/v<X.Y.Z>.md --version <X.Y.Z> --yes`
(`--rollout` only when the person named a fraction), stopping at the first failure. When
both succeed and no `v<X.Y.Z>` tag exists, an annotated tag on the release commit, pushed;
an existing tag stays. A failure tags nothing.

### Version gate

Both skills carry the byte-identical `## 0. Version gate` right after *Hard rules*
(`test/skills.test.js` enforces it). Release writes nothing in `kartograph/`, but a project
on an older layout could still carry features without the provenance release reads.

### Other skills

- **features**: keeps `# Changed by` lines and `- Revision:` source lines as provenance.
- **knowledge**: never drops a `sources` entry pointing at a revision.
- **map**: reads revisions as background; an applied revision's changes are cited through
  the features and commits, never the revision itself.
- **walk**: one line in the report pointing to `kartograph-revise` when the person wants
  something different; never starts it.
- **plan**: never writes `revision:` or `**Revised:**`.
- **screens, domain, adapters**: skip fully ticked tasks.
- **deliver**: unchanged, including its `release-stores.sh` row for a person who wants only
  the script.

## Repository changes

- `skills/kartograph-revise/` (`SKILL.md`, `revision-template.md`, `validate-revision.js`),
  `skills/kartograph-release/SKILL.md`.
- Validators: `validate-kartograph.js`, `validate-conversation.js`, `validate-intent.js`,
  `validate-mapping.js` (the revision type), `validate-features.js` (`# Changed by`,
  `- Revision:`), `validate-plan.js` (`revision`, `**Revised:**`, `tasksOf`); templates
  `capability-template.md`, `plan-template.md`; tests for each.
- Delivery: `DISTRIBUTION.md` row, `release-check.sh` in four stacks, their `STACK.md`
  *Delivery* lines; `stacks/{kmp,kmp-toolchain,apple-swift,android-compose}/screenshots.md`;
  tests in `test/distribution.test.js`.
- `.claude-plugin/plugin.json` skills list, `opencode/index.js` tools, `test/skills.test.js`
  (fourteen skills, stack-neutral new skills), README, CLAUDE.md.
- Release 3.2.0 (minor, additive): the three manifests, the `generated.by` actor
  `kartograph-knowledge/3.2.0`; tag and push only after the owner's yes.

## Out of scope

- ~~A first store release~~ — superseded by the addendum below (v3.3.0); per-locale What's New; a staged rollout decided by the skill.
- Framing screenshots with claims or device frames (Longpath's `frame-screenshots.py`).
- Redrawing `docs/phases.svg`.
- Changing `kartograph-deliver` or any existing delivery script.
- A revision for a capability that is not specified yet (that is `kartograph-converse`).

## Addendum 2026-09-25: the first store release (v3.3.0)

The owner moved the first store release into scope (option A: release prepares, the person
clicks the web UI through, one question covers both). Follow-up releases are unchanged.

- **Check.** `on sale none` / `production none` switches that lane into first-release mode
  instead of stopping; the tested build on TestFlight / Play internal is still required,
  and exit 3 still means a store could not be read. A new read-only entry script,
  `first-release-check.sh [--apple] [--play] [--version X.Y.Z]` (kmp, kmp-toolchain,
  apple-swift, android-compose; byte-identical), prints one `<lane> ✓|✗|? <gate>: <detail>`
  line per gate: content rights, category, age rating, price, availability, the editable
  version against the build's number (ASC29), in-app purchases and subscriptions waiting for
  a first review (ASC23, ASC24), the EULA link when a subscription is sold (ASC25), App
  Privacy and DAC7 as `?` (ASC18, ASC19); on Play defaultLanguage, contact, listings, and
  the console-only gates as `?` (GP6, GP8, GP11).
- **Content.** The whole listing per locale from `features/`, `kartograph/` and
  `knowledge/`, templates created by `push-store-metadata.sh --dry-run` per lane; notes
  that introduce the app over the whole history; every key screen rendered.
- **No What's New on a first release.** `release-stores.sh` set it unconditionally and would
  have died on Apple's 409 (ASC10). It now reads `asc_version_on_sale PLATFORM` (new in
  `asc.sh`) and skips What's New when nothing is on sale; the follow-up path makes the same
  calls as before, proven by a stubbed test.
- **Checklist.** `distribution/store/first-release.md` in the shape of
  `skills/kartograph-release/first-release-template.md`: per store lane, the web steps
  before the yes, the gates the push sets, and Play's *After the release* (send the draft
  production release for review). Answers derive from the code and name their source;
  what nothing shows is left to the person.
- **One question**: "The web steps in `distribution/store/first-release.md` are done, and
  vX.Y.Z goes out?" The script order stays: Apple metadata with `--version`,
  `release-stores.sh`, Play metadata, then the tag. The report lists every ✗ and ? left.
- **Review fixes (same day).** After the yes, `first-release-check.sh` runs again and a ✗ on
  a gate the push does not set (version, in-app purchases, subscriptions, price,
  availability, EULA link) or an empty file-backed ✗ stops with nothing sent. Products
  waiting for their first review are a hand-over, not a gate: `release-stores.sh
  --no-submit` attaches the build and prepares the open review submission
  (`asc_review_prepare`, reused per ASC31) without submitting it, and the person's Add for
  Review on the product's page joins it and submits the whole thing (ASC24). `push-store-metadata.sh --version` stops, dry run
  included, when another editable version exists (the auto-created 1.0, ASC29).
  `defaultLanguage` is never derived; the Play template leaves it empty (GP2). A version
  ever on sale (`ASC_SHIPPED_STATES`, removed-from-sale included) ends first-release mode.
  The EULA check accepts the owner's localized labels.

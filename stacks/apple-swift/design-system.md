# Design system (Native Apple with Swift and SwiftUI)

The default design system for every native Apple app. One token enum, the system
appearance for light and dark, Apple's own controls underneath. Feature code reads tokens
through `AppStyle` and composes the `App*` components; it never writes a colour, an inset or
a corner radius. Change the values here; the structure is fixed. Lines marked *project dial*
are where the owner's two apps differ.

## 1. Structure

- **One entry point:** `enum AppStyle` in `App/Shared/Shell/AppStyle.swift`. Tokens are
  static properties on it; nothing else in the app defines a colour, an inset or a radius.
  The `App*` components live in the same folder.
- **Colours come from the asset catalog through a bundle anchor.** `AppStyle.assets` is
  `Bundle(for: AssetAnchor.self)` and every asset colour is `Color(name, bundle: assets)`,
  because a bare `Color(name)` looks in the test runner's main bundle and paints nothing when
  the Mac store screenshots render from the unit-test target.
- **Modes are the system's.** Light and dark are the two appearances of each colour set in
  `App/Shared/Assets.xcassets`; there is no in-app theme switch, no mode state threaded
  through views, no `preferredColorScheme`. Text is `.primary` and `.secondary`, so the
  system guarantees contrast in both appearances.
- **SwiftUI is the substrate, not a surface to re-implement.** Apple's controls, bars, tabs,
  sheets and search are used directly and unwrapped; a wrapper exists only where a platform
  difference forces one. Built with the current Xcode, they take Liquid Glass and every later
  system look on their own; no custom bar backgrounds, no `glassEffect` in the content layer.

```swift
enum AppStyle {
    private final class AssetAnchor {}
    static let assets = Bundle(for: AssetAnchor.self)

    static let accent     = Color("AccentColor",   bundle: assets)
    static let background = Color("AppBackground", bundle: assets)
    static let surface    = Color("AppSurface",    bundle: assets)
    static let border     = Color("AppBorder",     bundle: assets)
    static let sidebar    = Color("AppSidebar",    bundle: assets)
    static let emphasis   = Color("AppEmphasis",   bundle: assets)
    static let onEmphasis = Color("AppOnEmphasis", bundle: assets)

    enum Inset { static let pageCompact: CGFloat = 18, pageRegular: CGFloat = 24,
                 cardCompact: CGFloat = 18, cardRegular: CGFloat = 22 }
    enum Stack { static let page: CGFloat = 24, card: CGFloat = 16, heading: CGFloat = 8 }
    enum Radius { static let card: CGFloat = 22, control: CGFloat = 12 }
    static let contentMaxWidth: CGFloat = 960
}
```

## 2. Colour

| role | token | asset set | used for |
|---|---|---|---|
| accent | `AppStyle.accent` | `AccentColor` | tint, icons, eyebrow text, links, selection |
| page ground | `AppStyle.background` | `AppBackground` | behind every screen |
| card ground | `AppStyle.surface` | `AppSurface` | cards, sheets, panels |
| hairline | `AppStyle.border` | `AppBorder` | card stroke, dividers |
| sidebar ground | `AppStyle.sidebar` | `AppSidebar` | macOS sidebar |
| emphasis | `AppStyle.emphasis` | `AppEmphasis` | the primary button, the hero block |
| on emphasis | `AppStyle.onEmphasis` | `AppOnEmphasis` | text on `emphasis` |

Every set carries a light and a dark value. The values are the project's: a new project
starts with `AccentColor` as Xcode created it and the six sets pointing at the system
semantic colours (`systemGroupedBackground`, `secondarySystemGroupedBackground`,
`separator`, …) until the owner sets a palette. The owner's palettes so far: olive drab on
warm sand with a fixed `emphasis`/`onEmphasis` pair (Beatrep), and paper `#FCF4E8` with a
dark-blue ink that switches to a night ink at 7.1:1 (Mokuso).

Rules: body text is `.primary` and supporting text `.secondary` over `surface` or
`background`; the only fixed pairing is `onEmphasis` on `emphasis`, and it is checked at
4.5:1 in both appearances. Colour never carries meaning alone. Semantic state colours are
the system's (`.red` for an error line, `.orange` for a refusal), never a new token. Never
a colour literal outside `AppStyle`, and no dynamic colour built in code when a catalog set
can carry it.

*Project dial:* Mokuso keeps its six colours as literals in the core (`Tinte`) with a
dynamic provider per platform and no catalog, because the ink colour is part of the diary
format. A project that needs a colour in the core declares it there and re-exports it
through `AppStyle`.

## 3. Typography

System fonts only, always through a SwiftUI text style, never a point size; Dynamic Type is
then free and every layout is expected to survive the accessibility sizes.

| use | style |
|---|---|
| eyebrow above a heading | `.caption.weight(.bold)`, `tracking(2)`, uppercased, in `accent` |
| page title, metric value | `.title.weight(.bold)` |
| card and link title, the primary button | `.headline` |
| link detail | `.subheadline`, `.secondary` |
| body detail, form values | `.body`; supporting text `.secondary` |
| metric caption, chevron, timestamp | `.caption` |

Never below `.caption2`. Monospace only as `.monospacedDigit()` on a number that changes in
place, so counters do not jitter. A fixed size is allowed once per app, for a hero numeral
(`.system(size: 44, weight: .bold, design: .rounded)`). Shrinking is allowed only on metric
values, `minimumScaleFactor(0.65)` with `lineLimit(1)`; prose gets
`fixedSize(horizontal: false, vertical: true)` so it wraps and is never truncated. macOS has
no Dynamic Type; the same styles apply. Serif (`design: .serif`) only for a handwritten
annotation, never for interface text.

## 4. Spacing, shape, elevation, motion

- **Spacing** is a two-point grid used at 4, 6, 8, 12, 16, 18, 22 and 24. Page stack 24,
  card stack 16, heading stack 8; page inset 18 compact / 24 regular, card inset 18 / 22;
  content capped at 960 points wide and leading-aligned. The breakpoint is the horizontal
  size class on iOS; macOS and watchOS always take the regular inset. Touch targets are
  Apple's: 44 points on iOS and watchOS, 28 on macOS; spacing never substitutes for them.
- **Shape** is `RoundedRectangle(cornerRadius:style: .continuous)`: cards 22, controls and
  text fields 12. Sheets, popovers and bars keep the system's radii; a shape nested in a
  container uses `ConcentricRectangle` rather than a guessed radius.
- **Elevation is a border, not a shadow.** A card is `surface` inside the card rectangle with
  a `border.opacity(0.65)` stroke. No view in the app casts a shadow; bars and sidebars float
  on the system's own material.
- **Motion is the platform's.** No durations, easings or custom animations are defined; the
  one custom feedback is the primary button dimming to `opacity(0.8)` while pressed.

## 5. Components and layout

A small, closed set in `App/Shared/Shell/`, prefixed `App`; Apple's controls for everything
else.

| component | what it is |
|---|---|
| `AppPage` | the screen skeleton: a scroll view, the leading-aligned page stack, the page inset, the 960 cap, `background` behind it |
| `AppCard` | a grouped block on `surface` with the bordered card rectangle |
| `AppHeading(eyebrow:title:detail:)` | eyebrow, title and detail as one unit |
| `AppMetric(value:caption:)` | one number with its caption; the children combine into one accessibility element |
| `AppLink(title:detail:symbol:identifier:destination:)` | a navigation row: SF Symbol, title, detail, chevron |
| `AppHeroButtonStyle` | the `onEmphasis`-on-`emphasis` primary button |
| `ChipPicker` | the inline multiple-choice control, `isSelected` trait on the chosen chip |

- **Screen:** every screen is an `AppPage` holding an `AppHeading` and one or more
  `AppCard`s, under the system navigation bar with the title from the model. One primary
  action per screen, in `AppHeroButtonStyle`, never two.
- **Lists:** a card of `AppLink` rows separated by `Divider()`; a long or filtered
  collection is a `List` with stable identifiers. No card per row.
- **Forms:** Apple's `TextField`, `Picker`, `Toggle` through the view helpers
  `appTextField()`, `appNumberPad()`, `appDecimalPad()`, which collapse on platforms that lack
  the behaviour; feature code never calls `textFieldStyle` or `keyboardType` itself. Labels
  always visible; the submit button is the screen's primary action.
- **Buttons:** primary `AppHeroButtonStyle`; secondary `.bordered`; tertiary plain. Labels
  verb first, no trailing period; destructive actions use `role: .destructive` and always
  confirm.
- **States:** loading is a `ProgressView("<what is happening>…")` with a sentence; empty is
  one sentence in `.secondary` with an identifier (`<area>.empty`), on macOS detail columns a
  `ContentUnavailableView`; error is the sentence inline in `.red` with the recovery action
  right beside it, a refusal in `.orange` likewise. No illustration.
- **Dialogs:** a notice is `.alert(item:)` over the model's `Identifiable` notice enum with a
  title, one sentence and at most two buttons; a destructive choice is a
  `.confirmationDialog` anchored to the control that raised it; anything longer is a `.sheet`
  with the system detents, on watchOS and for a flow a `.fullScreenCover`.
- **Responsive:** one column in the compact width class; a `NavigationSplitView` with a
  sidebar on macOS and on iPad in the regular width class; `TabView` with at most five tabs
  on iPhone, the search tab trailing. The size class decides, never the device.
- **Platform:** a product difference is asked of the core (`AppShell.offers(_:on:)`); an API
  difference sits behind `#if os(...)` inside a view helper in `App/Shared`, never inline in a
  screen.
- **Accessibility:** every control a scenario touches carries a stable dotted
  `accessibilityIdentifier` (`area.element[.key]`: `root.newSession`, `refRep.record`,
  `workoutList.delete.<id>`); test-only controls carry `.test.` and compile only in DEBUG or
  under `isUITest`. Identifiers are never localised and never spoken; every icon-only control
  has an `accessibilityLabel`; decorative views are `accessibilityHidden(true)`; a composed
  row or metric is one element (`accessibilityElement(children: .combine)`); charts are one
  labelled element. Nothing is conveyed by colour alone.
- **Localisation:** string catalogs (`Localizable.xcstrings`, `InfoPlist.xcstrings`),
  `LOCALIZATION_PREFERS_STRING_CATALOGS = YES`; the source-language text is the key, written
  as the literal in `Text` inside views and as `String(localized:)` outside them; plurals
  through "Vary by Plural". Dates and numbers format through `Locale` with the locale
  injectable for tests; stored data stays language-neutral. *Project dial:* the source
  language and the language list are the project's (Mokuso: German source, ten languages;
  Beatrep: English only, no catalog yet).

## 6. What feature code may and may not do

May: compose the `App*` components; read `AppStyle` tokens; use Apple's controls with their
defaults; branch on the horizontal size class; add an `accessibilityIdentifier` and an
`accessibilityLabel`; use SF Symbols by name.

May not: write a colour literal, a point inset or a radius; add a shadow; define a second
theme entry point or a token outside `AppStyle`; read an asset colour without the bundle
anchor; call `textFieldStyle` or `keyboardType` outside the view helpers; give a bar, tab bar
or sheet a custom background; apply `glassEffect` to content; ship a control a scenario
touches without an identifier; assemble a user-facing string in a model; or introduce a
third-party UI component.

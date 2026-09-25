# Design system

The default design system for every Kotlin Multiplatform app on the Kotlin Toolchain; the
same as the `kmp` stack's, with only the source path changed. One token set, two modes
(light and dark), Material 3 underneath. Feature code reads tokens through `AppTheme`
and never a raw colour, size or Material style. Change the values here; the structure is
fixed.

## 1. Structure

- **One entry point:** `AppTheme { content }` in the `shared` module at
  `shared/src/<package>/ui/theme/` (the module's common `src/` folder; *Toolchain
  departure*: `kmp` writes `src/commonMain/kotlin/`). It wraps `MaterialTheme` and
  provides every token through `CompositionLocal`s. Feature code never calls
  `MaterialTheme(...)` and never reads `MaterialTheme.colorScheme` or `.typography`
  directly. (The theme lives in `shared`, not `core`: `core` carries no Compose.)
- **Typed tokens:** `AppTokens(colors, typography, spacing, elevation, motion, shape)`,
  each sub-group an `@Immutable` data class. Raw values are `internal` in
  `ui/theme/tokens/`; feature code sees only the typed surface.
- **Accessor:** `AppTheme.colors`, `.typography`, `.spacing`, `.elevation`, `.motion`,
  `.shape` are `@Composable @ReadOnlyComposable` getters over `LocalAppTokens`. Tokens are
  render-time state: never injected into ViewModels or use cases.
- **Modes:** `ThemeMode` is `Light | Dark | System`. `isSystemInDarkTheme()` is the only
  place the OS is asked. Selection is a pure function `tokensFor(mode, isSystemDark)` with
  two baked palettes. Persist the user's choice (default `System`) and re-key
  `MaterialTheme` with `key(mode) { }` on change; resolve tokens synchronously before the
  first frame so nothing flashes.
- **Material 3 is the substrate, not the surface.** `AppColors.toMaterialColorScheme()`
  feeds M3 so Buttons, Cards and Text Fields are themed for free. App-specific roles
  (`success`, `info`, `warning`) live only in `AppColors`.

```kotlin
@Composable
fun AppTheme(themeMode: ThemeMode = LocalThemeMode.current, content: @Composable () -> Unit) {
    val isSystemDark = isSystemInDarkTheme()
    val tokens = remember(themeMode, isSystemDark) { tokensFor(themeMode, isSystemDark) }
    key(themeMode) {
        CompositionLocalProvider(LocalAppTokens provides tokens, LocalThemeMode provides themeMode) {
            MaterialTheme(
                colorScheme = tokens.colors.toMaterialColorScheme(),
                typography = tokens.typography.toMaterialTypography(),
                shapes = tokens.shape.toMaterialShapes(),
                content = content,
            )
        }
    }
}

object AppTheme {
    val colors: AppColors @Composable @ReadOnlyComposable get() = LocalAppTokens.current.colors
    val typography: AppTypography @Composable @ReadOnlyComposable get() = LocalAppTokens.current.typography
    val spacing: AppSpacing @Composable @ReadOnlyComposable get() = LocalAppTokens.current.spacing
    val elevation: AppElevation @Composable @ReadOnlyComposable get() = LocalAppTokens.current.elevation
    val motion: AppMotion @Composable @ReadOnlyComposable get() = LocalAppTokens.current.motion
    val shape: AppShape @Composable @ReadOnlyComposable get() = LocalAppTokens.current.shape
}

val LocalAppTokens = staticCompositionLocalOf<AppTokens> { error("Wrap the UI in AppTheme { }") }
val LocalThemeMode = staticCompositionLocalOf<ThemeMode> { ThemeMode.System }
```

## 2. Colour

Slate neutrals with one blue accent. Light is the Tailwind-slate ramp; dark is a
GitHub-dark scheme of the same family. Every pair below meets WCAG AA (4.5:1 body text,
3:1 large text and UI boundaries).

| `AppColors` role | light | dark | used for |
|---|---|---|---|
| `primary` | `#2563EB` | `#5A8DFF` | actions, selection, focus, links |
| `onPrimary` | `#FFFFFF` | `#07101F` | text on primary |
| `primaryContainer` | `#DCE7FF` | `#1A2944` | selected rows, soft highlight |
| `onPrimaryContainer` | `#1D4ED8` | `#8DB0FF` | text on primaryContainer |
| `secondary` | `#475569` | `#9AA7B5` | secondary actions, chips |
| `onSecondary` | `#FFFFFF` | `#0D1117` | |
| `secondaryContainer` | `#EEF2F6` | `#232C38` | chips, segmented controls |
| `onSecondaryContainer` | `#0F172A` | `#E6EDF3` | |
| `background` | `#F1F5F9` | `#0D1117` | app background |
| `onBackground` | `#0F172A` | `#E6EDF3` | primary text |
| `surface` | `#FFFFFF` | `#161B22` | cards, sheets, panels, top bar |
| `onSurface` | `#0F172A` | `#E6EDF3` | primary text on surfaces |
| `surfaceVariant` | `#F8FAFC` | `#1C232D` | inset fills, table stripes, mono blocks |
| `onSurfaceVariant` | `#64748B` | `#9AA7B5` | secondary text, icons |
| `outline` | `#E2E8F0` | `#2A313C` | hairlines, dividers |
| `outlineVariant` | `#94A3B8` | `#3A434F` | emphasised borders, disabled text |
| `error` | `#C62828` | `#EF8F88` | destructive actions, invalid input |
| `onError` | `#FFFFFF` | `#311C1B` | |
| `errorContainer` | `#F9E1E1` | `#311C1B` | error banners |
| `onErrorContainer` | `#C2403F` | `#EF8F88` | |
| `success` | `#047857` | `#4FD0A8` | confirmed, done, positive delta |
| `onSuccess` | `#ECFDF5` | `#0E2C24` | |
| `info` | `#1D4ED8` | `#8DB0FF` | neutral notices |
| `onInfo` | `#EFF4FF` | `#1A2944` | |
| `warning` | `#8F6A16` | `#DCB158` | needs attention, stale |
| `onWarning` | `#F4EAD2` | `#2C2410` | |

Rules: colour never carries meaning alone (pair it with a label, icon or shape); disabled
state is `onSurface` at 38% alpha, never a new colour; scrims are `#0F172A` at 18% (light)
and `#000000` at 45% (dark).

## 3. Typography

Material 3's fifteen styles on the platform default sans-serif (`FontFamily.Default`); a
project that bundles a font changes `AppTypeScale` in one place. Sizes in sp, weights as
named. Line height is 1.4 × size for body, 1.2 × size for display and headline.

| style | size / weight | use |
|---|---|---|
| `displayLarge` / `Medium` / `Small` | 57 / 45 / 36, Bold | hero numbers only |
| `headlineLarge` / `Medium` / `Small` | 32 / 28 / 24, SemiBold | screen titles (large layouts) |
| `titleLarge` | 22, SemiBold | screen title in the top bar |
| `titleMedium` | 16, SemiBold | card and list-item titles, dialog titles |
| `titleSmall` | 14, SemiBold | section headers |
| `bodyLarge` | 16, Normal | primary reading text, form values |
| `bodyMedium` | 14, Normal | default body, list-item detail |
| `bodySmall` | 12, Normal | captions, timestamps |
| `labelLarge` | 14, SemiBold | buttons, tabs |
| `labelMedium` | 12, SemiBold | chips, badges |
| `labelSmall` | 11, SemiBold, +0.5 letter-spacing, uppercase | eyebrows, table headers |

Never below 11 sp. Monospace (`FontFamily.Monospace`) only for identifiers, codes and
measurements. Text colour comes from the surface it sits on (`onSurface`,
`onSurfaceVariant`), never from the style.

## 4. Spacing, shape, elevation, motion

- **Spacing** is a fixed 8 dp grid, seven steps: `none` 0, `xs` 4, `sm` 8, `md` 16, `lg` 24,
  `xl` 32, `xxl` 48. Screen edge padding `md`; between list items `sm` (or a 1 dp
  `outline` divider with no gap); between sections `lg`; between form fields `md`.
  Touch targets are 48 dp via `LocalMinimumInteractiveComponentSize`, not spacing.
- **Shape** is the M3 five-step scale: `extraSmall` 4, `small` 8, `medium` 12, `large` 16,
  `extraLarge` 28 dp, plus `pillButton` (`CircleShape`) and `screenContainer` (= `medium`).
  Cards and dialogs `medium`; text fields and chips `small`; sheets `large` on the top
  corners; buttons `pillButton`.
- **Elevation** is six levels, `level0` 0 to `level5` 12 dp, M3 defaults. Tonal on coloured
  surfaces, shadow (`Modifier.shadow`) only for white-on-grey cards. Never both.
- **Motion** is six durations (`instant` 0, `short1` 100, `short2` 200, `medium1` 300,
  `medium2` 400, `long1` 500 ms) and four easings (`emphasized`, `emphasizedDecel`,
  `emphasizedAccel`, `standard`). Enter with `emphasizedDecel`, exit with
  `emphasizedAccel`; state changes on a control `short2`; screen transitions `medium1`.
  A font scale of 1.5 or more means reduce motion: use `instant`.

## 5. Components and layout

Material 3 components, themed through the tokens, no custom re-implementations.

- **Screen:** `Scaffold` with a `TopAppBar` (title in `titleLarge`, one navigation icon,
  at most two actions), content padded `md`, a `SnackbarHost`. One primary action per
  screen: a `Button` at the bottom or a `FloatingActionButton`, never both.
- **Lists:** dense single-line or two-line rows with a 1 dp `outline` divider; no card per
  entry. Row height 56 dp (one line) or 72 dp (two lines). Leading icon or avatar 40 dp,
  trailing text in `bodySmall` `onSurfaceVariant`. Lists are `LazyColumn` with stable keys.
- **Cards** only for grouped content that stands alone (a summary, a stat, a preview).
  `surface` on `background`, `medium` shape, `level1`.
- **Forms:** `OutlinedTextField`, label always visible, helper or error text below in
  `bodySmall`; the error colour appears only after the person has left the field or
  submitted. Fields stacked with `md`; the submit button is the screen's primary action.
- **Buttons:** primary `Button` (filled, `primary`), secondary `OutlinedButton`, tertiary
  `TextButton`; destructive actions use `error` and always confirm. Labels in
  `labelLarge`, verb first, no trailing period.
- **States:** loading is a `CircularProgressIndicator` centred, or a skeleton for lists;
  empty is one sentence in `bodyMedium` `onSurfaceVariant` centred, with at most one
  action, no illustration; error is a `Snackbar` when recoverable, an inline
  `errorContainer` banner with a retry when not.
- **Dialogs** for one decision only (title, one sentence, two buttons); anything longer is
  a `ModalBottomSheet` on phones and a dialog on desktop and web.
- **Responsive:** one column below 600 dp; a navigation rail and two columns from 600 dp;
  a permanent rail and a maximum content width of 840 dp from 1200 dp. Bottom navigation
  only below 600 dp, at most five destinations.
- **Accessibility:** every interactive element has a `contentDescription` or visible text;
  focus order follows reading order; nothing is conveyed by colour alone.

## 6. What feature code may and may not do

May: read `AppTheme.*`; use M3 components with their defaults; use `Modifier.padding(AppTheme.spacing.md)`.

May not: `Color(0xFF…)`, `16.dp`, `MaterialTheme.colorScheme.*`, `MaterialTheme.typography.*`,
`MaterialTheme(...)`, custom fonts, or a component library of its own. A lint rule may
reject these in `presentation/`.

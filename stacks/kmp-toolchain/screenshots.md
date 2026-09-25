# Store screenshots — Kotlin Multiplatform on the Kotlin Toolchain

`kartograph-release` reads this file once, when a project has no screenshot renderer yet,
and builds the renderer from it; from then on the renderer in the project's test code is
the truth. The renderer is the `kmp` stack's (`stacks/kmp/screenshots.md`, from the owner's
knowledge repo ASC13, ASC14, GP5 and the Longpath app); what the Kotlin Toolchain forces
is marked *Toolchain departure*. **None of this was exercised hands-on on the Toolchain**:
run the renderer once by hand before relying on it.

## 1. Where the renderer lives

`StoreScreenshotRenderer` in the JVM test folder of the module that holds the app's root
composable (`shared/test@jvm/…`), with the Compose UI test artifact of the project's Compose
version (`org.jetbrains.compose.ui:ui-test`) under that module's `test-dependencies@jvm:` in
`module.yaml`. It is a generator that needs the Compose test harness
(`runDesktopComposeUiTest`), not a test; it renders the shared Compose UI, which is also
what the Compose-UI iOS app shows, never the running app and never a simulator (ASC13).

*Toolchain departure:* there is no build script to forward `-D` properties to the test
JVM, so the renderer reads environment variables instead: it stays inert unless
`STORE_SCREENSHOTS_OUT` is set, and takes the locale from `STORE_SCREENSHOTS_LOCALE`.

## 2. Devices and sizes

Each device renders at its true pixel size with the matching `LocalDensity` (ASC13):

| display type | pixels | density | logical size | lane |
|---|---|---|---|---|
| `APP_IPHONE_67` | 1320 × 2868 | 3 | 440 × 956 dp | ios |
| `APP_IPAD_PRO_3GEN_129` | 2064 × 2752 | 2 | 1032 × 1376 dp | ios |
| `APP_DESKTOP` | 2880 × 1800 | 2 | 1440 × 900 dp | mac |

There is no `APP_IPHONE_69`. Render only the rows whose lane is in `LANES`. Play reuses
these images (GP5): the iPhone set becomes `phoneScreenshots`, the iPad set
`tenInchScreenshots`.

## 3. Seed

As in `kmp`: the app's root composable over the in-memory repositories the demo flag
selects, constructed directly and seeded with a history whose dates are computed from
today, onboarding marked seen (ASC14). One `Shot` per store screenshot.

```kotlin
@OptIn(ExperimentalTestApi::class)
class StoreScreenshotRenderer {
    private data class Device(val displayType: String, val widthPx: Int, val heightPx: Int, val density: Float)
    private data class Shot(val slug: String, val destination: Destination)

    private val devices = listOf(
        Device("APP_IPHONE_67", 1320, 2868, 3f),
        Device("APP_IPAD_PRO_3GEN_129", 2064, 2752, 2f),
    )
    private val shots = listOf(
        Shot("01-overview", Destination.Overview),
    )

    @Test
    fun renderStoreScreenshots() {
        val outDir = System.getenv("STORE_SCREENSHOTS_OUT") ?: return
        val locale = System.getenv("STORE_SCREENSHOTS_LOCALE") ?: "en-US"
        Locale.setDefault(Locale.forLanguageTag(locale))
        for (device in devices) for (shot in shots) {
            runDesktopComposeUiTest(width = device.widthPx, height = device.heightPx) {
                setContent {
                    CompositionLocalProvider(LocalDensity provides Density(device.density)) {
                        App(start = shot.destination, repositories = seededToToday())
                    }
                }
                waitForIdle()
                val png = SkiaImage.makeFromBitmap(onRoot().captureToImage().asSkiaBitmap()).encodeToData()
                    ?: error("could not encode ${device.displayType}/${shot.slug}")
                val file = File(outDir, "$locale/${device.displayType}/${shot.slug}.png")
                file.parentFile.mkdirs()
                file.writeBytes(png.bytes)
                println("rendered ${file.path} (${device.widthPx}×${device.heightPx})")
            }
        }
    }
}
```

`App(start = …, repositories = …)` stands for the project's root composable and the seam
that starts it on a destination over given repositories; the renderer adds that seam with
defaults where it is missing, so the app itself is unchanged.

## 4. Run

One run per locale in `LOCALES`, from the directory holding `project.yaml`:

```bash
STORE_SCREENSHOTS_OUT="$PWD/distribution/build/screenshots" STORE_SCREENSHOTS_LOCALE=en-US \
  ./kotlin test -m shared -p jvm --include-classes '<package>.StoreScreenshotRenderer'
```

The module is the one holding the renderer. *Toolchain departure:* the test JVM inheriting
the environment of `./kotlin` is assumed, not checked.

## 5. Output

`distribution/build/screenshots/<locale>/<displayType>/<NN>-<screen>.png`, gitignored with
the rest of `distribution/build/`; the two-digit prefix is the store order. The release
copies the changed screens into `distribution/store/apple/screenshots/<locale>/<displayType>/`
and, for Play, into `distribution/store/play/screenshots/<locale>/phoneScreenshots/` and
`tenInchScreenshots/`.

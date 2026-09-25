# Store screenshots — Kotlin Multiplatform

`kartograph-release` reads this file once, when a project has no screenshot renderer yet,
and builds the renderer from it; from then on the renderer in the project's test code is
the truth. The rules are the owner's (knowledge repo ASC13, ASC14, GP5); the shape is the
renderer shipped in the owner's Longpath app. Lines neither says anything about are marked
*stack default*.

## 1. Where the renderer lives

`StoreScreenshotRenderer` in the JVM test source set of the module that holds the app's
root composable (`shared/src/jvmTest/kotlin/<package>/`, or `desktopTest` where the project
names the JVM target that way), with `implementation(compose.uiTest)` in that source set's
dependencies. It is not a test but a generator that needs the Compose test harness
(`runDesktopComposeUiTest`), the only way to drive the whole app headless. It renders the
shared Compose UI, never the running app and never a simulator (ASC13): a pixel-accurate
render of the same UI code, not a photograph.

It stays inert unless `-Dstore.screenshots=true` is given, so a normal test run neither
renders nor writes. Gradle does not forward `-D` from the daemon to the test JVM, so the
module's `build.gradle.kts` passes the three properties through:

```kotlin
// StoreScreenshotRenderer renders the store screenshots from the shared UI (ASC13).
tasks.withType<Test>().configureEach {
    listOf("store.screenshots", "store.screenshots.out", "store.screenshots.locale").forEach { key ->
        System.getProperty(key)?.let { systemProperty(key, it) }
    }
}
```

A project whose iOS app is native SwiftUI over the shared framework renders its iPhone and
iPad shots the way `stacks/apple-swift/screenshots.md` describes; this renderer then covers
only the Compose targets.

## 2. Devices and sizes

Each device renders at its true pixel size with the matching `LocalDensity`, so the
composition sees the logical size the device reports and nothing is upscaled (ASC13):

| display type | pixels | density | logical size | lane |
|---|---|---|---|---|
| `APP_IPHONE_67` | 1320 × 2868 | 3 | 440 × 956 dp | ios |
| `APP_IPAD_PRO_3GEN_129` | 2064 × 2752 | 2 | 1032 × 1376 dp | ios |
| `APP_DESKTOP` | 2880 × 1800 | 2 | 1440 × 900 dp | mac |

There is no `APP_IPHONE_69`: the 6.9-inch iPhone files under `APP_IPHONE_67`. Render only
the rows whose lane is in `LANES`. Play reuses these images (GP5): the release copies the
iPhone set to `phoneScreenshots` and the iPad set to `tenInchScreenshots`, and renders
nothing for Play.

## 3. Seed

The renderer composes the app's root composable with the same composition the demo flag
uses: the in-memory repositories ring 2 left behind the flag, constructed directly and
seeded with a history whose dates are computed from today (`Clock.System.todayIn(…)`),
never fixed dates. A history that stops yesterday renders "nothing today" nudges and zeroed
headers, which do not belong in a store screenshot (ASC14). Onboarding and first-run hints
are marked seen in the seed. One `Shot` per store screenshot: a slug, the destination to
open, and the state that makes the screen worth showing.

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
        if (System.getProperty("store.screenshots") != "true") return
        val out = File(System.getProperty("store.screenshots.out") ?: "distribution/build/screenshots")
        val locale = System.getProperty("store.screenshots.locale") ?: "en-US"
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
                val file = File(out, "$locale/${device.displayType}/${shot.slug}.png")
                file.parentFile.mkdirs()
                file.writeBytes(png.bytes)
                println("rendered ${file.path} (${device.widthPx}×${device.heightPx})")
            }
        }
    }
}
```

`App(start = …, repositories = …)` stands for the project's root composable and whatever
it takes to start on a destination over given repositories; where it takes neither, the
renderer adds that seam to the composable's parameters with defaults, so the app itself is
unchanged. Setting the default `Locale` per run is a *stack default*: Compose resources
resolve strings from it.

## 4. Run

One run per locale in `LOCALES`, from the directory holding `gradlew`:

```bash
./gradlew :shared:jvmTest --tests '*StoreScreenshotRenderer*' \
  -Dstore.screenshots=true \
  -Dstore.screenshots.out="$PWD/distribution/build/screenshots" \
  -Dstore.screenshots.locale=en-US
```

The module path is the one holding the renderer. A red run is a failed render, never a
reason to weaken the renderer.

## 5. Output

`distribution/build/screenshots/<locale>/<displayType>/<NN>-<screen>.png` (gitignored with
the rest of `distribution/build/`). The two-digit prefix is the order in the store. The
release copies the shots of the screens that changed into
`distribution/store/apple/screenshots/<locale>/<displayType>/` and, for Play, into
`distribution/store/play/screenshots/<locale>/phoneScreenshots/` and `tenInchScreenshots/`,
where `push-store-metadata.sh --screenshots` uploads them.

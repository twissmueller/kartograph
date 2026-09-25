# Build design: the layers below the view

What rings 2 and 3 write and how, one section per layer: `kartograph-domain` builds §1,
the in-memory part of §2 and the wiring in §7; `kartograph-adapters` builds the rest of
§2 and §3 to §6. Ring 1 is described in `code-design.md` §6. Ports-and-adapters read
through Clean Architecture: the ports are the use case and repository **interfaces** in
`domain/`; the adapters are everything in `data/`, the per-target implementations, and the
server. The names in code are the project's (`…UseCase`, `…Repository`, `…Impl`, `…Api`,
`…Dao`, Pattern A/B), never "port" or "adapter". Everything here follows
`code-design.md`; where that document is silent, this one decides. The layers are the
`kmp` stack's; what changes is where they are wired: every dependency, processor and
setting below is a `module.yaml` entry, and every command is `./kotlin …` run in the
directory holding `project.yaml`. Lines the hands-on check of 2026-09-25 did not exercise
say so.

## 1. Domain: use cases and repository interfaces

- One use case per business operation, `VerbNounUseCase`, `operator fun invoke`. Reads:
  `Observe…` returning `Flow<…>`. Commands: `suspend`, returning `Resource<T>`. Phase 1
  declared them as `fun interface`s; phase 2 adds `…UseCaseImpl` next to each and keeps
  the interface, so the ViewModel and its test never change.
- Business-rule validation lives in the use case (or a `Validator` in `domain/`); a
  rejected input is `Resource.Error(AppError.Validation.…)`. Business outcomes ("no
  credits left") are domain state or a specific return type, never an `AppError`.
- Repository interfaces in `domain/`, one per aggregate, exposing domain types only:
  `fun observeX(): Flow<ImmutableList<X>>`, `suspend fun save(x: X): Resource<Unit>`. A
  type used by a second feature moves to `core/domain/`.
- `AppError` (sealed, `core/domain/error/`) and `Resource<T>` (`core/domain/util/`) are
  created once in `core/` if missing, exactly as `code-design.md` §3 and this file's examples
  show. `AppError` carries structured data, never user-facing strings.

```kotlin
interface WateringRepository {
    fun observeTasks(day: LocalDate): Flow<ImmutableList<WateringTask>>
    suspend fun markDone(id: WateringTaskId): Resource<Unit>
}

class TickWateringTaskUseCaseImpl(private val repo: WateringRepository) : TickWateringTaskUseCase {
    override suspend fun invoke(id: WateringTaskId): Resource<Unit> = repo.markDone(id)
}
```

## 2. Data: repository implementations and data sources

- `XxxRepositoryImpl(api: XxxApi, dao: XxxDao, errorReporter: ErrorReporter)` in `data/`.
  It is the only place that sees Ktor, Room or platform exceptions: every call goes
  through `safeApiCall` (network) or `safeDbCall` (database), which translate exceptions
  to `AppError` and record them once. Nothing above the repository ever sees a
  `Throwable`.
- Data sources: `XxxApi` (a thin class over `HttpClient`, one function per endpoint,
  DTOs with `@Serializable`), `XxxDao` (Room `@Dao`, `@Query`-only for reads, suspend
  writes, `Flow` reads). Mappers `XxxDto.toDomain()`, `XxxEntity.toDomain()`,
  `X.toEntity()` are `internal` extension functions in `data/`; no identity mappers.
- Local first, then sync: reads observe the DAO; a command writes locally, then pushes.
  Every entity carries `updatedAtMs` and `deletedAtMs`; deletes are soft; the server
  resolves conflicts last-write-wins on `updatedAtMs`.
- **Demo mode.** The phase-1 sample data becomes `InMemoryXxxRepository` in `data/`,
  seeded from a `XxxSampleData` object, bound when `AppConfig.demo` is true (a build-time
  flag in `core/`, default false). This keeps the walk working before a backend exists.
  Test fakes are separate: `FakeXxxRepository` in the module's `test/`.

## 3. Database: Room in `core/data/db/`

- One `AppDatabase` for the app, entities and DAOs of every feature in `core/data/db/`,
  the feature's DAO exposed as an abstract accessor. Room targets: Android, iOS, JVM
  (desktop and server). Web has no Room; it is a thin client with `multiplatform-settings`
  for key-value only.
- *Toolchain departure:* the targets that have Room are named once, as an alias in
  `core/module.yaml`, and the database code lives in `core/src@room/<package>/core/data/db/`,
  so the common `src/` still compiles for wasmJs. Room's runtime, the bundled SQLite driver
  and the KSP2 processor are qualified by the same alias; the schema option replaces
  Gradle's `room { schemaDirectory(...) }`:

  ```yaml
  aliases:
    - room: [android, iosArm64, iosSimulatorArm64, jvm]

  dependencies@room:
    - $libs.androidx.room.runtime
    - $libs.androidx.sqlite.bundled

  settings@room:
    kotlin:
      ksp:
        processors:
          - $libs.androidx.room.compiler
        processorOptions:
          room.schemaLocation: ./schemas
  ```

  Checked hands-on: this shape builds for all five platforms, KSP generates the
  `actual object AppDatabaseConstructor` per Room target, and the schema lands in
  `core/schemas/<database class>/<version>.json`, committed. The Toolchain runs KSP2 only;
  there is no per-target `kspAndroid(...)` line to forget.
- A feature whose repository implementation takes a `…Dao` declares the same alias in its
  own `module.yaml` and keeps that implementation in `src@room/`; the web target binds its
  API-only implementation from `src@wasmJs/` in its `platformModule` (the thin client
  above). *Toolchain departure*: the folder makes explicit what the `kmp` stack leaves to
  the source-set hierarchy.
- `@Database(version = …)` is semver collapsed: `(major * 1000 + minor) * 1000 + patch`.
  Additive change: minor and `@AutoMigration`. Rename or backfill: a `Migration_<from>_<to>`
  in `core/data/db/migrations/` over `SQLiteConnection`. Schemas export to `core/schemas/`
  and are committed. Every migration has a test that creates the previous version with
  `BundledSQLiteDriver` in a temp dir, inserts sentinel rows, migrates, and asserts schema
  and data; it lives in `core/test@jvm/` (*Toolchain departure*: the common `test/` also
  compiles for wasmJs, which has no Room). `fallbackToDestructiveMigration` only behind a
  debug flag.

## 4. API client: Ktor in `core/data/network/`

- One `createHttpClient(engine, baseUrl, …)` in `core/`, with `ContentNegotiation`
  (kotlinx.serialization, `ignoreUnknownKeys`), `HttpRequestRetry` (3 attempts,
  exponential base 2, max 10 s, jitter, 5xx and exceptions only), `Auth` bearer with
  `refreshTokens` through the auth repository, and `HttpTimeout` (15 s connect, 30 s
  request). The engine is per target (OkHttp, Darwin, CIO on JVM and wasmJs), each a
  platform-qualified dependency in `core/module.yaml` (`dependencies@android:`,
  `dependencies@ios:`, `dependencies@jvm:`, `dependencies@wasmJs:`).
- `safeApiCall(errorReporter) { … }` translates: 401 → `Unauthorized`, 429 → one
  respectful retry after `Retry-After` then `TooManyRequests`, 4xx/5xx → `ServerError`,
  timeouts → `Timeout`, IO → `NoConnection`, else `Unexpected`. Non-idempotent calls opt
  out of retry with `RetryConfig(maxAttempts = 0)`.
- Request and response DTOs shared with the server live in `core/domain/api/` as
  `@Serializable` data classes, so client and server compile against one contract.

## 5. Platform capabilities

- A capability with state, async, lifecycle or a need for fakes (GPS, Bluetooth, files,
  notifications, biometrics, browser APIs) is **Pattern B**: an `interface` in
  the common `src/` (in the feature's `data/`, or `core/data/` when shared), per-target
  implementations named `AndroidXxx`, `IosXxx`, `DesktopXxx`, `WebXxx` in `src@android/`,
  `src@ios/`, `src@jvm/`, `src@wasmJs/`, bound in `expect val platformModule: Module`
  per target. A platform SDK the implementation needs is a `dependencies@<platform>:`
  entry; an Apple SDK from Swift Package Manager is a `swiftPackage:` dependency under
  `dependencies@ios:` (documented, not checked hands-on). A target that cannot provide it gets a
  stub returning `Resource.Error(AppError.….NotSupported(target, reason))`.
- A thin, stateless primitive (UUID, clock, platform info, database constructor) is
  **Pattern A**: `expect fun` / `expect object` in the common `src/`, `actual` per target
  in `src@<platform>/`.
- Never `expect` business logic, never `expect interface`, never a platform type
  (`Context`, `UIApplication`, `java.io.File`) in a common `src/` signature, never
  `suspend expect fun`. Android `Context` comes from Koin's `androidContext()`.

## 6. Server: Ktor under `server/`

This section is Kartograph's default; the project's knowledge repo has no server atom
yet. Keep it minimal and replace it when one exists.

- `server/module.yaml` is `product: jvm/app` with `settings.ktor: enabled` (the Toolchain
  has no server product type; `ktor` applies the Ktor BOM and adds the `$ktor.*` catalog),
  `settings.jvm.mainClass` naming the `main`, `settings.kotlin.serialization: json`,
  `//core`, `$ktor.server.core` and `$ktor.server.netty` under `dependencies:` and
  `$ktor.server.testHost` under `test-dependencies:`. Documented, not built in the
  hands-on check.
- One `Application` module, `install(ContentNegotiation)` with the same `Json`, one route
  file per capability (`routes/<capability>Routes.kt`), routes grouped under
  `/api/v1/<capability>`, request and response types from `core/domain/api/`.
- `AppError` maps to HTTP in one `StatusPages` handler: `Validation` → 400,
  `Unauthorized` → 401, `Authorization` → 403, `NotFound` → 404, everything else → 500
  with a structured JSON body `{ "error": "<AppError leaf name>", "detail": … }`.
- Persistence reuses `core/`'s Room on the JVM (`server/data/`), the same entities and
  DAOs; the server is the sync arbiter (last-write-wins on `updatedAtMs`, nightly
  compaction of soft-deleted rows). Endpoints that write are idempotent by client-supplied
  id.
- Logging is line-delimited JSON through the shared Kermit `LogWriter`, with the same
  redaction as the client. No secrets in logs.
- One test per endpoint with `testApplication { }` and an in-memory database, in
  `server/test/`, run with `./kotlin test -m server`; the same
  scenario names where a server behaviour is what a scenario asserts.

## 7. Dependency injection and wiring

One flat Koin module per feature: `single` for repository implementations, data sources
and mappers; `factory` for use cases and the `XxxUseCases` bundle; `viewModel { }` for
ViewModels. Demo mode swaps the repository `single` for the in-memory one. Platform
bindings live in the per-target `platformModule`. Each app target's `startKoin` lists
`coreModule`, `platformModule` and every feature module; the server has its own
composition root. Unit tests never start Koin.

Koin is a plain library dependency (`koin-core` in `core`, `koin-compose-viewmodel` in the
modules with ViewModels, `koin-android` in `androidApp`), and the modules are written in
Koin's DSL, so nothing is generated. A project that adopts Koin's annotations adds
`io.insert-koin:koin-ksp-compiler` to `settings.kotlin.ksp.processors` (checked hands-on:
it builds). *Toolchain departure*: never the `settings.kotlin.compilerPlugins` route with
`koin-compiler-plugin`; on 2026-09-25 it failed to compile against the Toolchain's Kotlin
compiler (`ClassCastException` in the plugin's registrar).

## 8. Tests, by layer

| layer | folder | shape |
|---|---|---|
| scenario (outer) | `test/…/presentation/` | one `@Test` per scenario, named after it, Given/When/Then, Turbine on `state` and `effect`, fakes for repositories, injected `StandardTestDispatcher` |
| use case | `test/…/domain/` | fake repository, `assertIs<Resource.Success<T>>` then value, or `assertIs<Resource.Error>` then `AppError` and `isRecoverable` |
| repository | `test/…/data/`, `test@jvm/` when it needs Room | Room with `BundledSQLiteDriver` on a temp file; Ktor `MockEngine` with canned responses; asserts translation to `AppError` |
| migration | `core/test@jvm/…/data/db/` | previous version, sentinel rows, migrate, assert |
| platform impl | `test@android/` / `test@ios/` / `test@jvm/` / `test@wasmJs/` | the platform path only; stubs assert their `NotSupported` error |
| server route | `server/test/` | `testApplication`, in-memory database, status and body |
| mapper / validator | `test/` | plain assertions |

Fixtures in `test/…/fixtures/`, one file per domain type, builder functions with
defaults (`fun aWateringTask(id: String = "t1", …)`). `kotlin.test`, Turbine and
`kotlinx-coroutines-test` only, as `test-dependencies:`; the Toolchain preconfigures
`kotlin.test` on every platform and JUnit 5 underneath on JVM and Android. No
`Dispatchers.setMain`; the dispatcher is injected.

**Running them** (*Toolchain departure*: these replace the Gradle tasks):

| what | command |
|---|---|
| the fast loop, one module on the JVM | `./kotlin test -m feature-<capability> -p jvm` |
| one test class, one test | `… --include-classes '<fqcn>'`, `… --include-test '<fqcn>.<method>'` |
| one module on every platform | `./kotlin test -m feature-<capability>` |
| the server | `./kotlin test -m server` |
| compile one module, one platform | `./kotlin build -m <module> -p <platform>` |

`./kotlin test -m <module>` without `-p` runs the JVM, Android and iOS-simulator tests and
the wasmJs tests in a headless Chromium; the first run provisions Node.js and Chrome for
Testing itself (checked hands-on, about 170 MB). Never a bare `./kotlin test` over the whole
project in a loop: it is slow and says nothing a module run does not. A red test makes the
command fail (checked hands-on: exit 1, "JVM tests failed for module …"), which is the
plan's `Expected: FAIL`; a scenario test that is red first must
fail on its assertion, not on compilation.

## 9. Definition of done, per scenario

1. Its ViewModel-level test is green and was red first.
2. Every layer it crosses has its own green test.
3. The module, every enabled target and the server build: `./kotlin build` in the
   directory holding `project.yaml`. It also builds `iosApp` through `xcodebuild` and
   `androidApp` through a Gradle the Toolchain provisions and drives itself (checked
   hands-on); neither needs a build file of ours.
4. Its `Then` is reachable through the UI, seen through Compose Hot Reload when a window
   was connected, otherwise stated as compiled-only. `./kotlin run -m desktopApp` starts
   the desktop app with Compose Hot Reload on by default (checked hands-on; the JetBrains
   Runtime is provisioned, `--no-compose-hot-reload` turns it off), and `./kotlin
   compose-hot-reload-mcp-server` serves the running window to an agent (listed by the
   CLI's help, not exercised). Never start, restart or reset a window the person is
   looking at.
5. No fake in production code, no `Throwable` above the repository, no `List` in state,
   no raw colour or dp in composables, no word from `aliases_to_avoid` anywhere.

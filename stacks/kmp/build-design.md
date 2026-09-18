# Build design: the layers below the view

What rings 2 and 3 write and how, one section per layer: `kartograph-domain` builds §1,
the in-memory part of §2 and the wiring in §7; `kartograph-adapters` builds the rest of
§2 and §3 to §6. Ring 1 is described in `code-design.md` §6. Ports-and-adapters read
through Clean Architecture: the ports are the use case and repository **interfaces** in
`domain/`; the adapters are everything in `data/`, the per-target implementations, and the
server. The names in code are the project's (`…UseCase`, `…Repository`, `…Impl`, `…Api`,
`…Dao`, Pattern A/B), never "port" or "adapter". Everything here follows
`code-design.md`; where that document is silent, this one decides.

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
  Test fakes are separate: `FakeXxxRepository` in `commonTest`.

## 3. Database: Room in `core/data/db/`

- One `AppDatabase` for the app, entities and DAOs of every feature in `core/data/db/`,
  the feature's DAO exposed as an abstract accessor. Room targets: Android, iOS, JVM
  (desktop and server). Web has no Room; it is a thin client with `multiplatform-settings`
  for key-value only.
- `@Database(version = …)` is semver collapsed: `(major * 1000 + minor) * 1000 + patch`.
  Additive change: minor and `@AutoMigration`. Rename or backfill: a `Migration_<from>_<to>`
  in `core/data/db/migrations/` over `SQLiteConnection`. Schemas export to `schemas/` and
  are committed. Every migration has a `commonTest` test that creates the previous
  version with `BundledSQLiteDriver` in a temp dir, inserts sentinel rows, migrates, and
  asserts schema and data. `fallbackToDestructiveMigration` only behind a debug flag.
- KSP per target (`kspAndroid`, `kspIosArm64`, `kspIosSimulatorArm64`, `kspJvm`), never
  bare `ksp(...)`; `room { schemaDirectory(...) }` in the module that owns the database.

## 4. API client: Ktor in `core/data/network/`

- One `createHttpClient(engine, baseUrl, …)` in `core/`, with `ContentNegotiation`
  (kotlinx.serialization, `ignoreUnknownKeys`), `HttpRequestRetry` (3 attempts,
  exponential base 2, max 10 s, jitter, 5xx and exceptions only), `Auth` bearer with
  `refreshTokens` through the auth repository, and `HttpTimeout` (15 s connect, 30 s
  request). The engine is per target (OkHttp, Darwin, CIO on JVM and wasmJs).
- `safeApiCall(errorReporter) { … }` translates: 401 → `Unauthorized`, 429 → one
  respectful retry after `Retry-After` then `TooManyRequests`, 4xx/5xx → `ServerError`,
  timeouts → `Timeout`, IO → `NoConnection`, else `Unexpected`. Non-idempotent calls opt
  out of retry with `RetryConfig(maxAttempts = 0)`.
- Request and response DTOs shared with the server live in `core/domain/api/` as
  `@Serializable` data classes, so client and server compile against one contract.

## 5. Platform capabilities

- A capability with state, async, lifecycle or a need for fakes (GPS, Bluetooth, files,
  notifications, biometrics, browser APIs) is **Pattern B**: an `interface` in
  `commonMain` (in the feature's `data/`, or `core/data/` when shared), per-target
  implementations named `AndroidXxx`, `IosXxx`, `DesktopXxx`, `WebXxx`, bound in
  `expect val platformModule: Module` per target. A target that cannot provide it gets a
  stub returning `Resource.Error(AppError.….NotSupported(target, reason))`.
- A thin, stateless primitive (UUID, clock, platform info, database constructor) is
  **Pattern A**: `expect fun` / `expect object` in `commonMain`, `actual` per target.
- Never `expect` business logic, never `expect interface`, never a platform type
  (`Context`, `UIApplication`, `java.io.File`) in a `commonMain` signature, never
  `suspend expect fun`. Android `Context` comes from Koin's `androidContext()`.

## 6. Server: Ktor under `server/`

This section is Kartograph's default; the project's knowledge repo has no server atom
yet. Keep it minimal and replace it when one exists.

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
- One test per endpoint with `testApplication { }` and an in-memory database; the same
  scenario names where a server behaviour is what a scenario asserts.

## 7. Dependency injection and wiring

One flat Koin module per feature: `single` for repository implementations, data sources
and mappers; `factory` for use cases and the `XxxUseCases` bundle; `viewModel { }` for
ViewModels. Demo mode swaps the repository `single` for the in-memory one. Platform
bindings live in the per-target `platformModule`. Each app target's `startKoin` lists
`coreModule`, `platformModule` and every feature module; the server has its own
composition root. Unit tests never start Koin.

## 8. Tests, by layer

| layer | source set | shape |
|---|---|---|
| scenario (outer) | `commonTest/presentation/` | one `@Test` per scenario, named after it, Given/When/Then, Turbine on `state` and `effect`, fakes for repositories, injected `StandardTestDispatcher` |
| use case | `commonTest/domain/` | fake repository, `assertIs<Resource.Success<T>>` then value, or `assertIs<Resource.Error>` then `AppError` and `isRecoverable` |
| repository | `commonTest/data/` | Room with `BundledSQLiteDriver` on a temp file; Ktor `MockEngine` with canned responses; asserts translation to `AppError` |
| migration | `commonTest/data/db/` | previous version, sentinel rows, migrate, assert |
| platform impl | `androidUnitTest` / `iosTest` / `desktopTest` / `wasmJsTest` | the platform path only; stubs assert their `NotSupported` error |
| server route | `server/src/test/` | `testApplication`, in-memory database, status and body |
| mapper / validator | `commonTest/` | plain assertions |

Fixtures in `commonTest/fixtures/`, one file per domain type, builder functions with
defaults (`fun aWateringTask(id: String = "t1", …)`). `kotlin.test`, Turbine and
`kotlinx-coroutines-test` only. No `Dispatchers.setMain`; the dispatcher is injected.

## 9. Definition of done, per scenario

1. Its ViewModel-level test is green and was red first.
2. Every layer it crosses has its own green test.
3. The module, every enabled target and the server build.
4. Its `Then` is reachable through the UI, seen through Compose Hot Reload when a window
   was connected, otherwise stated as compiled-only.
5. No fake in production code, no `Throwable` above the repository, no `List` in state,
   no raw colour or dp in composables, no word from `aliases_to_avoid` anywhere.

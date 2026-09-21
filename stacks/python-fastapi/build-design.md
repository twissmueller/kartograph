# Build design: the layers below the page (Python services with FastAPI and a static browser UI)

What rings 2 and 3 write and how, one section per layer: `kartograph-domain` builds § 1
and the tests in § 8 that belong to it; `kartograph-adapters` builds § 2 to § 7. Ring 1 is
described in `code-design.md` § 6. Ports-and-adapters read through the source project's
own shape: the ports are the `Protocol` classes a page model takes, declared beside it;
the adapters are the `<Technology><Port>` classes that fulfil them over psycopg2, the
Redis client, a container engine, a cluster API or the physics engine. The names in code
are the project's (`…Store`, `…Launcher`, `…Reader`, `…Engine`, `Fake…`, `Postgres…`,
`Redis…`), never "port" or "adapter". Everything here follows `code-design.md`; where
that document is silent, this one decides. Lines marked *stack default* are where the
source project was silent.

## 1. Domain: use cases and ports

- A use case is a method on the page model that orchestrates plus the pure function or
  class in `rules.py` (or a worker's `sim/<concept>.py`) that decides. Ring 1 wrote the
  method against the port; ring 2 puts the rule between the request and the port call
  and never changes the method's signature, so the page and the scenario test do not
  move.
- Rules take one of three shapes, all free of I/O, of framework imports and of
  `time.time()`:

  ```python
  @dataclass(frozen=True)                                          # 3. validating constructor
  class Waypoint:
      lat_deg: float
      lon_deg: float
      altitude_ft: float
      fault: str | None = None

      @classmethod
      def from_dict(cls, d: dict, previous_altitude_ft: float | None) -> "Waypoint":
          try:
              lat, lon = float(d["lat_deg"]), float(d["lon_deg"])
          except (KeyError, TypeError, ValueError):
              raise ValueError("a waypoint needs lat_deg and lon_deg as numbers")
          alt = d.get("altitude_ft")
          if alt is None:
              if previous_altitude_ft is None:
                  raise ValueError("the first waypoint needs an altitude_ft")
              alt = previous_altitude_ft
          if float(alt) < 0:
              raise ValueError("altitude_ft is above sea level and cannot be negative")
          return cls(lat, lon, float(alt), d.get("fault"))

  def arrival(distance_m: float, radius_m: float) -> bool:           # 2. decision function
      """One guard; the radius is a parameter so the open question stays visible."""
      return distance_m <= radius_m

  class FlightPhases:                                                # 1. state machine
      """Cruise → arrived per waypoint; the next waypoint index is the state."""
      def __init__(self, count: int) -> None:
          self._next = 0
          self._count = count
      @property
      def done(self) -> bool: return self._next >= self._count
      def arrived(self) -> int:
          index, self._next = self._next, self._next + 1
          return index
  ```

- Validation lives in `from_dict` and raises `ValueError` with a sentence a person can
  act on; `as_dict` is the inverse and is what the page model returns. Decoding from a
  row or a stream entry routes through `from_dict`, so a stored value is checked on the
  way in.
- A business outcome is a value the function returns (`None`, an index, a small
  `str` status), never an exception; an exception is a rule violation the person can
  correct.
- Ports are declared beside the page model in `ports.py`, never in `rules.py`. A port
  exposes domain dataclasses and plain dicts, returns an outcome (`None`, `bool`, an
  optional value, a `str` status) and never raises for a foreseeable failure: the adapter
  catches its library's exception and returns the outcome. A port that starts something
  returns the identifier it started (`launch(mission) -> str`, the `run_id`).
- A worker's core keeps the source project's separation: physical state, measured
  channels and ground-truth annotations are three things; the annotations derive from the
  fault timeline alone (`FaultInjector.labels(t)`), so a rule that moves the aircraft can
  never desynchronise them. A new worker rule is a flat module with a docstring, tested
  through `tests/_simrun.py`'s `collect(...)` where a whole run is the fixture.

## 2. Data: adapters and data sources

- An adapter implements one port over one data source and is named
  `<Technology><Port>`: `PostgresMissionStore(pool=None)`, `RedisRunControl(client)`,
  `DockerSimLauncher(client, image, network, env)`, `KubernetesSimLauncher(batch_api,
  namespace, template)`, `JSBSimEngine()`. The data sources are the psycopg2 pool
  through `db._conn()`, the Redis client, the Docker SDK client, the Kubernetes client's
  `BatchV1Api`, and `jsbsim.FGFDMExec`.
- **Exceptions stop at the adapter.** Every library error is caught there and translated
  into the port's outcome: a `psycopg2.Error` on a read becomes an empty result and a
  logged line, on a write `False`; a `redis.exceptions.RedisError` becomes `None` and a
  logged line, because a stream or key failure must never take down a run that is
  otherwise producing good data (the source project's `EventPublisher`); a container or
  cluster API error becomes the status `"failed"` with the message in the log. The page
  model never sees a library exception. Where a failure is not actionable the adapter
  degrades ("no live position, but the run goes on"); where data integrity is at stake
  the outcome says so and nothing is overwritten.
- **Mapping is the adapter's own job.** A row is a `RealDictCursor` dict; the adapter
  calls `Mission.from_dict(row["definition"])` for a JSONB column and builds the
  dataclass from named columns otherwise. A row that no longer parses is skipped with a
  logged line, never repaired by guesswork. No separate mapper class, no ORM.
- **Logging** is `print(f"[{service}] …", flush=True)`, one line, prefixed with the
  service name, as the source project logs; no logging framework.
- **Demo mode** is the fake bound under `kind == "fake"` in `wiring.py`, seeded from the
  capability's `sample_data.py`. It stays in production code for the walk and for tests;
  the composition root is the only place that chooses it.

## 3. Persistence

Postgres through psycopg2, one `ThreadedConnectionPool` for the FastAPI service built in
`db.init_pool()` at startup, borrowed through the `db._conn()` context manager which
commits on success and rolls back on an exception.

- **The schema is one file,** `db/init.sql`, applied by Postgres when the volume is first
  created and re-applied by `db.ensure_schema()` at every backend start. Every statement
  is therefore idempotent: `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN IF NOT
  EXISTS`, `CREATE INDEX IF NOT EXISTS`. A capability appends a commented block; it never
  edits an earlier block, never drops, never renames. `scripts/k8s-up.sh` generates the
  cluster's ConfigMap from the same file, so there is no second schema.
- **Shape:** a table per concept with a `TEXT` or `UUID` primary key, `TIMESTAMPTZ NOT
  NULL DEFAULT now()` for creation, and one `JSONB NOT NULL DEFAULT '{}'::jsonb` column for
  the open part of the record (`channels`, `labels`, `meta`, a mission's definition)
  beside the few columns a query filters or sorts on. An index on what the dashboards
  sort by. Foreign keys with `ON DELETE CASCADE` where a child cannot outlive its parent.
- **Writes are convergent.** An insert is `ON CONFLICT DO NOTHING` or `DO UPDATE SET`
  with a guard, so an at-least-once replay recomputes the same state instead of
  double-counting; a counter is `GREATEST(old, new)`; a status update never resurrects a
  settled row (`CASE WHEN status IN ('completed','failed') THEN status ELSE … END`). Bulk
  inserts use `execute_values`.
- **SQL is inline** in the adapter's method as a triple-quoted string with `%s` or
  `%(name)s` parameters; never string-formatted. Reads use `RealDictCursor`.
- **Migration** is a new idempotent block in `db/init.sql` plus a startup that re-applies
  it. A backfill that must run once is an `UPDATE … WHERE column IS NULL` in the same
  block. A migration has an `integration` test that seeds the previous shape, applies
  `ensure_schema()`, and asserts.
- **Never reset.** `scripts/clear-data.sh` truncates on the person's request; nothing in
  a service deletes or recreates a table to recover.
- **Small state** (a speed factor for a running run, a cursor) goes to Redis (§ 5), not
  Postgres; nothing goes to a file inside a container.

## 4. HTTP client

There is none in the services: pages call the FastAPI service with `fetchJSON` from the
browser, services talk over Redis and Postgres, and the container engine and cluster API
are reached through their SDKs (§ 5). A capability that needs an outbound HTTP call
declares a port first, then: `httpx` (already a dev dependency through the FastAPI test
client) pinned in the service's `requirements.txt`, a 10 s timeout, a `Client` built in
`wiring.py` and passed to the adapter's constructor, the response decoded into domain
values at the boundary, a non-2xx or a `httpx.HTTPError` translated into the port's
outcome, a read retried once and a write never (*stack default*). Its test passes a
`httpx.MockTransport` to the client.

## 5. Platform capabilities

Anything with a process, a socket, a clock, a permission or a need for a fake sits behind
a port with its fake beside it, and the real one takes its client as a constructor
parameter so a test can hand it a double:

| port | real | double | client built in |
|---|---|---|---|
| `SimLauncher` | `DockerSimLauncher` (Docker SDK over `/var/run/docker.sock`), `KubernetesSimLauncher` (`BatchV1Api`, a Job from `k8s/50-sim-job.yaml`'s shape) | `FakeSimLauncher` (records launches, returns a `run_id`) | `wiring.py` |
| `RunControl` | `RedisRunControl` (one key per run, `run:<run_id>:speed`) | `FakeRunControl` (a dict) | `wiring.py` |
| `TrackReader` | `PostgresTrackReader` (latest and all positions from `samples`) | `FakeTrackReader` (a list per run) | `wiring.py` |
| `SimEngine` | `JSBSimEngine` | `SyntheticEngine` | `sim/engine.py:build_engine` |
| the clock in a worker | `time.sleep`, `time.monotonic` | a `sleep` parameter on the loop, `now: Callable[[], float]` | `sim/main.py` |

- **Streams and keys.** Redis is the message bus. A stream carries a sequence of events
  (`samples`, `run_events`), consumed by a consumer group with a stable consumer name
  (`REDIS_CONSUMER`), the pending list drained at startup, `XACK` after the batch is
  persisted, at-least-once by design. A key carries the newest value of one thing
  (`run:<run_id>:speed`), written by whoever controls it and read by whoever obeys it; a
  worker reads its keys between steps, never inside one, and treats a missing key as the
  default (*stack default*). Every stream entry has a single field `data` holding JSON;
  a key holds a JSON scalar. Names are lowercase with colons for hierarchy.
- **Starting a container.** The FastAPI service image gets the Docker SDK
  (`docker`) and the Kubernetes client (`kubernetes`) pinned in its `requirements.txt`;
  compose mounts `/var/run/docker.sock` into the backend when `SIM_LAUNCHER=docker`; the
  cluster gives the backend a `ServiceAccount` with a `Role` that may create and read
  `jobs.batch` in its namespace (`k8s/45-backend-rbac.yaml`), and
  `SIM_LAUNCHER=kubernetes` in `k8s/10-config.yaml`. A launched worker gets its whole
  configuration as environment variables, exactly the ones `scripts/run-sim.sh` and
  `scripts/k8s-run-sim.sh` would pass, so the script path stays the second, unchanged way
  to launch. The launcher returns the `run_id` it chose (`SIM_RUN_ID`), so the page can
  follow the run before the first sample lands.
- **The physics engine** is reached only through `SimEngine`; `JSBSimEngine` reads
  properties through the property tree (`fdm["position/lat-geod-deg"]`) and writes
  commands the same way (`fdm["fcs/aileron-cmd-norm"] = x`); a property a model lacks is
  probed once in `reset()` and dropped, never guessed.
- **Launch seams** for the fakes are environment variables read only in `wiring.py` or a
  worker's `main.py`: the `kind` per port, and one upper-snake variable per knob a fake
  exposes, named and documented in the fake's docstring.

## 6. Server

FastAPI with uvicorn, one app in `backend/main.py`, sync endpoints running in the
threadpool (the pool is `ThreadedConnectionPool` for that reason), a `lifespan` that opens
the pool, applies the schema and starts the stream consumer thread.

- **Routes** per capability in `backend/<capability>/routes.py` behind a factory
  `router(model) -> APIRouter`, included in `main.py`. JSON the pages read lives under
  `/api/<capability>/…`; the page route (`/<page>`) returns the static file; the Phase 0
  endpoints (`/health`, `/runs`, `/runs/{run_id}/samples`) are a published contract and
  never change.
- **Status mapping** in every route: `LookupError` → 404, `ValueError` → 400, both with
  `HTTPException(detail=str(e))`; a port's `"failed"` outcome → 502 with the reason
  (*stack default*); everything else is a 500 from FastAPI. Query parameters are bounded
  with `Query(default, ge=, le=)`; a body is a `pydantic.BaseModel` with the fields the
  page sends and nothing more.
- **A request body** is passed to the page model as `body.model_dump()`; the page model
  validates it through `rules.py`, so validation lives once.
- **Polling is safe by design:** a `GET` a page polls every two seconds reads `runs` or a
  key, never scans `samples`; an unbounded read is served stale-while-refreshing
  (`queries._StaleWhileRefreshing`).
- **The health endpoint** stays `{"status": "ok", "ingested": n}`; a capability that has
  something to report adds a key, never a second endpoint.

## 7. Dependency injection and wiring

`backend/wiring.py` builds every port once in `build_ports()`, reading one environment
variable per port; `main.py` calls it at import, constructs each page model with the
ports it needs, and includes each router. The rebinding between rings is one branch per
`_…` factory: ring 1 has `"fake"`, ring 3 adds the real `kind` and flips the default in
code, compose, the cluster ConfigMap and the README table. Nothing else in a service
chooses an implementation. Unit tests construct page models with fakes; route tests
assemble a `FastAPI()` with `router(model)` over fakes; nothing in tests reads
`wiring.py`. A worker's wiring is `main.py` reading its variables and `build_engine(kind)`.

## 8. Tests, by layer

Everything runs in the tests image through `scripts/run-tests.sh`, which builds the sim
image, builds the tests image on top of it, and runs pytest with the repository mounted at
`/repo` and `PYTHONPATH=/repo/services/sim:/repo/services/backend`. Unit tests are
hermetic; a test that needs Redis, Postgres or the backend is marked `integration`, uses
the `require_stack` fixture, and is skipped unless `--integration` brought the stack up.

| layer | file | shape | run |
|---|---|---|---|
| rule | `tests/test_<capability>_rules.py`, `tests/test_<worker_module>.py` | `test_<rule_as_a_sentence>()`, a docstring saying why; `@pytest.mark.parametrize` for tables; `pytest.raises(ValueError, match=…)` for a rejection | `scripts/run-tests.sh -k <capability>` |
| scenario (outer) | `tests/test_<capability>_model.py` | one `test_<scenario_in_words>()` per scenario, the scenario name in the docstring; the page model over fakes; Given seeds the fakes, When calls the method, Then asserts the dict and the fakes' counters | `scripts/run-tests.sh -k <capability>` |
| route | `tests/test_<capability>_routes.py` | `TestClient(app)` over `router(model)` with fakes; status codes and shapes only | same |
| worker run | `tests/test_<worker_module>.py` | `collect(engine, scenario, seed, steps)` from `tests/_simrun.py` as a module-scoped fixture; assertions over channels, times and annotations | same; a JSBSim run takes seconds, so one fixture per module |
| persistence | `tests/test_<capability>_postgres.py` | `@pytest.mark.integration` + `require_stack`; `db.init_pool()`; a row seeded with a unique id, the adapter exercised, the row deleted in a `finally` | `scripts/run-tests.sh --integration -k <capability>` |
| stream, key | `tests/test_<capability>_redis.py` | the adapter over a `FakeRedis` class in the test file (the source project's shape: records `xadd`, raises on demand); one `integration` test over the real client | same |
| container, cluster | `tests/test_<capability>_docker.py`, `…_kubernetes.py` | the adapter over a fake client object passed to its constructor; asserts the image, environment and labels it would start | `scripts/run-tests.sh -k <capability>` |
| physics | `tests/test_flight_dynamics.py` and siblings | the real engine in the tests image; plausibility bounds with the measured margin in the docstring | `scripts/run-tests.sh -k flight` |
| contract | `tests/test_contract.py`, `tests/test_schema.py` | the sample's keys and types; the schema applies twice without error | `scripts/run-tests.sh` |
| source | `tests/test_detector.py` group 8 | reads a module's source and asserts a word is absent | `scripts/run-tests.sh` |
| the images | `docker-compose.yml` | every service builds | `docker compose --profile tools build backend sim tests` |
| the cluster | `k8s/` | every manifest applies and every rollout completes | `scripts/k8s-up.sh` |

Fixtures are plain functions and module constants (`NOW = datetime(2026, 9, 9, 12, 0,
tzinfo=timezone.utc)`), or a `@pytest.fixture` building a page model over fakes. No
mocking library; `monkeypatch.setattr` only on a module attribute that is a seam
(`M.queries`, `M.db.init_pool`). No `sleep`: a worker loop takes its `sleep` and its
clock as parameters. The full suite is `scripts/run-tests.sh`; a single expression is
`scripts/run-tests.sh -k <expr>`; the report is `scripts/run-tests.sh --report`. Never two
`docker compose run` invocations against the tests service at once.

## 9. Definition of done, per scenario

1. Its scenario test at the page model is green and was red first.
2. Every rule it crosses has its own green test in the rules or worker test file.
3. Its route test, where the outcome is a status code, is green.
4. `scripts/run-tests.sh` passes; `scripts/run-tests.sh --integration` passes when the
   scenario has a persistence or stream adapter; `docker compose --profile tools build
   backend sim tests` succeeds.
5. Its `Then` is reachable through the page on `docker compose up --build -d` with the
   fake bound (walkable), and with the real adapter bound once ring 3 is done; seen in a
   browser when one was connected, otherwise stated as served-only.
6. Every new environment variable is in code, `docker-compose.yml`, `k8s/10-config.yaml`
   and the README table; every schema change is an idempotent block in `db/init.sql`;
   no library exception above an adapter; no colour or size literal in a page; no control a
   scenario touches without an `id`; no word from `aliases_to_avoid` anywhere; the sample's
   shape unchanged; the inference module still free of the ground-truth word.
7. A container or cluster launcher has been exercised once on the real runtime before the
   scenario is called verified; a scenario whose reliability no test settles (a physics
   behaviour that must be tuned) says so.

# Code design: three rings (Python services with FastAPI and a static browser UI)

How a feature is built in a Python service platform, and in which order. Clean
Architecture read as a hexagon, in the shape the source project already has: a static
page and the Python page model behind it are the driving adapter, the rules are plain
Python with no I/O, and the `Protocol` classes the page model takes at its initialiser
are the ports that Postgres, Redis, a container engine, a cluster API and a physics engine
fulfil. This document is the contract `kartograph-plan` plans against and
`kartograph-screens`, `kartograph-domain` and `kartograph-adapters` execute. Change it
here, not in the code. Lines marked *stack default* are where the source project was
silent and this document decided; the project's copy may change them.

## 1. The hexagon in this stack

```
ring 1  screens    static page + inline script        driving adapter: what the person touches
                   → page route → page model           (the page model shapes JSON for the page)
ring 2  domain     rules.py: dataclasses, validation,  the core: business behaviour, no I/O,
                   decision functions, state machines  no framework import
ring 3  adapters   Postgres<…>, Redis<…>, Docker<…>,   driven adapters: what the page model
                   Kubernetes<…>, JSBSim<…>            talks to, each behind a Protocol it owns
```

- **Ports** are `typing.Protocol` classes (decorated `@runtime_checkable`, as the source
  project's `SimEngine`), declared beside the page model that uses them in the
  capability's `ports.py`, never in `rules.py`: the rules must not know that a database,
  a stream or a container engine exists. A port is named for the capability it provides
  (`MissionStore`, `SimLauncher`, `RunControl`), exposes domain values and plain dicts
  only, and ships with its fake in the same package. The identifiers in code are the
  project's: `…Store`, `…Launcher`, `…Reader`, `…Engine`, `Fake…`, `Postgres…`,
  `Redis…`; never "port" or "adapter".
- **Dependencies point inward.** A page knows its routes; a route knows its page model;
  a page model knows domain values, `rules.py` and the ports it was given; `rules.py`
  imports the standard library only. Nothing above an adapter imports `psycopg2`,
  `redis`, `docker`, `kubernetes` or `jsbsim`.
- **Data flows outward as plain dicts.** Adapters decode rows and stream entries into
  domain dataclasses; the page model turns them into JSON-shaped dicts (`str`, `int`,
  `float`, `bool`, `None`, `list`, `dict` only); the route returns them; the page renders
  them. Actions flow inward as `POST`s the route turns into page-model method calls.
- **A use case is two halves:** a method on the page model that orchestrates (asks a
  port, applies a rule, updates a port) and a pure function or class in `rules.py` that
  decides. The pure half is where the tests bite.
- **Two kinds of service.** The **FastAPI service** (`services/backend/`) serves the pages
  and the JSON they read and consumes the streams. A **worker** (`services/sim/`) is a
  one-shot process with no HTTP surface that publishes to a stream and exits. A worker has
  the same three rings without a page: its driving adapter is `main.py` reading
  environment variables, its core is the engine-agnostic orchestration
  (`SimEngine` protocol, `CoSimulation`, the fault injector), its driven adapters are the
  physics engine and the Redis client. A capability that changes what a worker does gets
  its worker modules planned and tested like any other layer; the page is still the
  screen through which the person sees the result.

### The layers inside the rings

- **Page** (`static/<page>.html`) holds the markup, a page-specific `<style>` for layout
  only, and one inline `<script>` that destructures the shared namespace, keeps one
  `STATE` object (the last payloads it fetched plus the person's selections), has one
  `render<Part>()` function per visible part, and one handler per control. No logic
  beyond choosing what to show; every decision the page would otherwise make is a field
  in the payload the page model already computed.
- **Route** (`routes.py`) is a FastAPI `APIRouter` built by a factory that takes the page
  model: `def router(model: MissionPlannerModel) -> APIRouter`. A route validates its
  query and body with FastAPI's own `Query(..., ge=, le=)` and a `pydantic.BaseModel`
  per request body, calls one page-model method, and maps `LookupError` to 404 and
  `ValueError` to 400 with `HTTPException(status_code=…, detail=str(e))`. Nothing else.
- **Page model** (`model.py`, `class <Screen>Model`) takes its ports as initialiser
  parameters, exposes one method per thing the page reads (`state()`, `mission(id)`) and
  one per thing the person can do (`save(payload)`, `launch(id)`), calls `rules.py` for
  every decision, and returns JSON-shaped dicts. It raises `LookupError` for a thing
  that is not there and `ValueError` for a rule violation; it never imports FastAPI.
- **Core** (`rules.py`) holds one `@dataclass(frozen=True)` per concept, with a
  validating classmethod `from_dict` that raises `ValueError` with a sentence a person
  can act on, and the rules as plain functions or small classes with `step`-style
  methods. Time comes in as a parameter, never `time.time()` inside a rule.
- **Adapters** implement one port over one data source, live in the capability package
  as `<technology>_<port>.py`, and translate every library exception into the port's
  outcome at the boundary.

## 2. Module and package layout

One repository, one docker compose file, one package per service, one test suite for all
of them. The project has no `pyproject.toml`; each service pins its dependencies in its
own `requirements.txt` and the tests image adds `requirements-dev.txt` on top.

```
docker-compose.yml                    every service, the images tagged <project>/<service>:dev
db/init.sql                           the single schema source, idempotent, applied at startup
k8s/*.yaml                            the same images on Kubernetes; 10-config.yaml mirrors compose env
scripts/*.sh                          bash 3.2: run-sim.sh, run-tests.sh, k8s-up.sh, …
services/backend/
  Dockerfile, requirements.txt
  backend/
    main.py                           the FastAPI app, page routes, the Phase 0 endpoints, router includes
    wiring.py                         the composition root: build_ports() reading one env var per port
    db.py                             the pool, _conn(), ensure_schema(), the shared SQL helpers
    queries.py                        the read layer of the existing dashboards
    consumer.py                       the stream consumer (a daemon thread started in lifespan)
    detector.py                       measured-channel inference; must never read ground truth
    <capability>/                     one package per capability from features/<capability>/
      __init__.py
      rules.py                        domain dataclasses and rules            (ring 2)
      ports.py                        the Protocols the page model needs      (ring 1)
      fakes.py                        Fake<Port> classes, seeded, with knobs  (ring 1)
      sample_data.py                  the sample data the fakes are seeded with (ring 1)
      model.py                        <Screen>Model                            (ring 1)
      routes.py                       router(model) -> APIRouter               (ring 1)
      postgres_<port>.py, redis_<port>.py, docker_<port>.py, kubernetes_<port>.py  (ring 3)
    static/
      common.css, common.js           the design system (design-system.md)
      <page>.html                     one file per screen                     (ring 1)
      vendor/<lib>-<version>/         a vendored browser library, when one is unavoidable
services/sim/
  Dockerfile, requirements.txt
  sim/
    main.py                           the worker entry: env → one run → exit
    engine.py                         SimEngine protocol, SyntheticEngine, build_engine(kind)
    orchestrator.py                   CoSimulation: the five stages of one step
    faults.py, scenarios.py, sensors.py, subsystems.py, events.py
    <concept>.py                      one flat module per new concept, with a docstring
tests/
  Dockerfile                          FROM <project>/sim:dev plus backend and dev requirements
  conftest.py                         repo_root, require_stack
  _simrun.py                          the helper that drives a co-simulation
  test_<module>.py                    one file per module or verification group
requirements-dev.txt                  pytest, httpx
pytest.ini                            markers = integration; addopts = -q --strict-markers
```

One capability from `features/<capability>/` is one package
`services/backend/backend/<capability>/` plus its page(s) under `static/`, plus, when it
changes a worker, flat modules under that worker's package. Types two capabilities share
move to the service's top level (`backend/db.py`, `sim/engine.py`), never into another
capability's package. Capabilities never import each other's page models. Every module
starts with a docstring saying its role in the pipeline and the phase or capability it
serves; that is how the source project is read.

## 3. UI state contract

```python
class MissionPlannerModel:
    """Page model of the mission planner (the JSON the page renders)."""

    def __init__(self, missions: MissionStore, launcher: SimLauncher) -> None:
        self._missions = missions
        self._launcher = launcher

    def state(self) -> dict:
        """Everything the page needs on load. Shape:
        {"aircraft": [{"id": "737", "label": "737"}, …],
         "faults": [{"id": "healthy", "label": "healthy"}, …],
         "missions": [{"id": "…", "name": "…"}, …]}"""
        return {
            "aircraft": [a.as_dict() for a in AIRCRAFT],
            "faults": [f.as_dict() for f in FAULTS],
            "missions": [m.summary() for m in self._missions.list()],
        }

    def save(self, payload: dict) -> dict:
        mission = Mission.from_dict(payload)            # ValueError on a rule violation
        self._missions.save(mission)
        return mission.as_dict()

    def launch(self, mission_id: str) -> dict:
        mission = self._missions.get(mission_id)         # None when missing
        if mission is None:
            raise LookupError(f"mission {mission_id!r} not found")
        run_id = self._launcher.launch(mission)
        return {"run_id": run_id, "mission_id": mission_id}
```

```javascript
// the page's side of the same contract
const STATE = { model: null, mission: null, runId: null };
async function load() {
  try { STATE.model = await fetchJSON("/api/missions/state"); $("error").textContent = ""; }
  catch (e) { $("error").textContent = `Could not load the planner: ${e.message}`; return; }
  renderAircraft(); renderMissions();
}
```

- **State** is a JSON-shaped dict per page-model method, documented in the method's
  docstring; the page keeps the last payloads in one `STATE` object and renders from it.
  Loading, empty and error are visible states of the page (`design-system.md` § 5), never
  separate pages and never a bag of booleans: an empty list in the payload is the empty
  state, a thrown `fetchJSON` is the error state.
- **Events** are page-model methods, named for what the person did, reached by one route
  each: reads are `GET /api/<capability>/…`, actions are `POST` with a JSON body validated
  by a `pydantic.BaseModel` in `routes.py`.
- **Effects** are the response: a `POST` returns what changed (the saved mission, the new
  `run_id`) and the page re-renders from it; a confirmation before a destructive action is
  the browser's `confirm()` in the handler. No push channel from server to page; the page
  polls with `poll()` and the interval is short while something is moving
  (`anyRunning() ? 2000 : 10000` in the source project).
- **Errors:** a rule violation is a `ValueError` raised by `rules.py` with a sentence; a
  missing thing is a `LookupError`; an adapter failure is an outcome the port returns
  (`None`, `False`, a small `str` status), never an exception the page model has to catch.
  The route maps the two exceptions to 400 and 404; `fetchJSON` surfaces the `detail`;
  the page prints it in `#error`. Nothing is swallowed.
- **Navigation is a URL.** A page reads its context from `URLSearchParams`
  (`/ops?run=<id>`); moving to another page sets `location.href`; the nav is
  `navHTML(active)`. The page model never knows a URL.

## 4. Naming

| thing | name | where | ring |
|---|---|---|---|
| screen | `missions.html` (page route `/missions`) | `backend/static/` | 1 |
| page model | `MissionPlannerModel` | `backend/missions/model.py` | 1 |
| router factory | `router(model) -> APIRouter` | `backend/missions/routes.py` | 1 |
| request body | `SaveMissionBody(BaseModel)` | `backend/missions/routes.py` | 1 |
| port | `MissionStore`, `SimLauncher`, `RunControl` (`Protocol`, `@runtime_checkable`) | `backend/missions/ports.py` | 1 |
| ring-1 double | `FakeMissionStore` (works, in memory, seeded, with counters and an outcome knob) | `backend/missions/fakes.py` | 1 |
| sample data | `SAMPLE_MISSIONS`, `SAMPLE_RUN` | `backend/missions/sample_data.py` | 1 |
| env var choosing a binding | `MISSION_STORE=fake\|postgres`, `SIM_LAUNCHER=fake\|docker\|kubernetes` | read only in `backend/wiring.py` | 1, rebound in 3 |
| domain value | the `knowledge/` title as a frozen dataclass: `Mission`, `Waypoint` | `backend/missions/rules.py` | 2 |
| domain error | `ValueError` with a sentence (a rule violation); `LookupError` (missing) | raised in `rules.py` and `model.py` | 2 |
| rule, state machine | the domain word: `FlightPhase`, `arrival(...)`, `fill_altitudes(...)` | `backend/missions/rules.py` or `sim/<concept>.py` | 2 |
| worker module | `sim/mission.py`, `sim/guidance.py` (flat, with a docstring) | `services/sim/sim/` | 2, 3 |
| real adapter | `<Technology><Port>`: `PostgresMissionStore`, `RedisRunControl`, `DockerSimLauncher`, `KubernetesSimLauncher` | `backend/missions/<technology>_<port>.py` | 3 |
| schema change | an `ALTER TABLE … ADD COLUMN IF NOT EXISTS` or `CREATE TABLE IF NOT EXISTS` block with a comment | `db/init.sql` | 3 |
| composition root | `build_ports() -> Ports` | `backend/wiring.py` | 1, rebound in 3 |
| nav entry | a `[href, label]` pair in `navHTML` | `backend/static/common.js` | 1 |
| test hook | an `id` on the control or outcome (`saveMission`, `speedSlider`, `runStatus`) | the page | 1 |
| scenario test | `test_<scenario_in_words>()` with the scenario name in the docstring | `tests/test_<capability>_model.py` | 2 |
| rule test | `test_<rule_as_a_sentence>()` | `tests/test_<capability>_rules.py`, `tests/test_<worker_module>.py` | 2 |
| adapter test | `test_<adapter_behaviour>()`, `@pytest.mark.integration` when it needs the stack | `tests/test_<capability>_<technology>.py` | 3 |
| config table | a row per env var | `README.md`, `docker-compose.yml`, `k8s/10-config.yaml` | 1, 3 |

`Fake` is a working double with behaviour and memory; `Stub` returns one configured
answer (the source project's `StubQueries`). Domain names match the `knowledge/` bundle's
canonical titles one to one; a word listed there as an alias to avoid never becomes a
class, a field, an `id` or a label. Identifiers are English and `snake_case`; classes are
`CapWords`; module-level constants are `UPPER_SNAKE`; channel names on the stream are
`snake_case` with the unit as a suffix (`altitude_ft`, `oil_temp_c`).

## 5. Dependency injection and navigation

No container, no framework injection, no `Depends()` chains for domain objects.
`backend/wiring.py` is the only composition root: a frozen dataclass `Ports` with one
attribute per port and a function `build_ports()` that reads one environment variable per
port and builds the implementation, in the shape of the source project's
`build_engine(kind)`. `main.py` calls it once at import and hands the ports to the page
models it constructs; a test constructs a page model with fakes and never touches the
root.

```python
"""Composition root (every capability): one env var per port chooses its implementation."""

from __future__ import annotations

import os
from dataclasses import dataclass

from .missions.fakes import FakeMissionStore, FakeSimLauncher
from .missions.ports import MissionStore, SimLauncher
from .missions.sample_data import SAMPLE_MISSIONS


@dataclass(frozen=True)
class Ports:
    missions: MissionStore
    launcher: SimLauncher


def build_ports() -> Ports:
    return Ports(
        missions=_mission_store(os.environ.get("MISSION_STORE", "fake")),
        launcher=_sim_launcher(os.environ.get("SIM_LAUNCHER", "fake")),
    )


def _mission_store(kind: str) -> MissionStore:
    if kind == "fake":
        return FakeMissionStore(SAMPLE_MISSIONS)                       # rings 1 and 2
    if kind == "postgres":
        from .missions.postgres_missions import PostgresMissionStore   # ring 3
        return PostgresMissionStore()
    raise ValueError(f"Unknown MISSION_STORE={kind!r}")


def _sim_launcher(kind: str) -> SimLauncher:
    if kind == "fake":
        return FakeSimLauncher()
    raise ValueError(f"Unknown SIM_LAUNCHER={kind!r}")
```

```python
# main.py — the app is assembled here and nowhere else
ports = wiring.build_ports()
mission_planner = MissionPlannerModel(ports.missions, ports.launcher)
app.include_router(missions_routes.router(mission_planner))
```

The `kind == "fake"` branch is the **demo flag** of this stack: the fake stays in
production code, chosen only here, exactly as the source project keeps `SyntheticEngine`
behind `SIM_ENGINE=synthetic`. Ring 1 defaults the variable to `fake`; ring 3 adds the
real branch and flips the default in code, in `docker-compose.yml`, in
`k8s/10-config.yaml` and in the README's configuration table, in one commit, because the
project's rule is that every runtime setting lives in those four places in step. A knob a
fake exposes for an error scenario is set by its own environment variable, read in the
same `_…` factory and documented in the fake's docstring.

Navigation is a page route per screen in `main.py` (`@app.get("/missions",
response_class=HTMLResponse)` returning `_page("missions.html")`) and the pair in
`navHTML`. A page's inputs come from the URL's query string; there is no client-side
router.

## 6. The three rings, in order

The order is deliberate: the person sees and uses the real pages before any behaviour is
committed to, and each later ring replaces exactly one `kind` branch in `wiring.py`.

### Ring 1: screens (`kartograph-screens`)

Goal: every scenario can be walked in the running stack with the real page, the real
routes and the real page model, but no real rules and no real data underneath.

- `backend/<capability>/ports.py` gets the **ports** the page model needs, each with
  its fake in `fakes.py`:

  ```python
  @runtime_checkable
  class MissionStore(Protocol):
      def list(self) -> list[Mission]: ...
      def get(self, mission_id: str) -> Mission | None: ...
      def save(self, mission: Mission) -> None: ...

  class FakeMissionStore:
      """In-memory MissionStore seeded from sample data. `fails_next_save` is the outcome knob."""

      def __init__(self, seed: list[Mission]) -> None:
          self.items = {m.id: m for m in seed}
          self.saved: list[str] = []            # side-effect counter
          self.fails_next_save = False

      def list(self) -> list[Mission]: return sorted(self.items.values(), key=lambda m: m.name)
      def get(self, mission_id: str) -> Mission | None: return self.items.get(mission_id)
      def save(self, mission: Mission) -> None:
          if self.fails_next_save:
              self.fails_next_save = False
              raise RuntimeError("store unavailable")   # translated by the page model into an outcome
          self.items[mission.id] = mission
          self.saved.append(mission.id)
  ```

  The fake is deterministic, holds its data in memory and **reacts to commands** so the
  person sees the consequence. `sample_data.py` covers every listed scenario's `Given`.
- `rules.py` gets the **dataclasses** the page shows (from `knowledge/`), with `from_dict`
  and `as_dict`, but no rules yet: `from_dict` only checks presence and type.
- The capability package gets `model.py` with one method per read and per action that only
  asks the ports and shapes dicts; `routes.py` with the router factory and the request
  bodies; the page under `static/` over the design system, every control and outcome a
  scenario names carrying an `id` and the scenario's own words.
- `wiring.py` binds the fake under a new env var defaulting to `fake`; `main.py` adds
  the page route and includes the router; `navHTML` gets the pair. Screens are derived
  from the feature files: one per `.feature` unless its scenarios clearly describe more
  than one place, and an existing page is extended rather than duplicated when the
  scenario's `Then` belongs there.
- Done = `docker compose up --build -d backend` starts, `curl localhost:8000/health`
  answers, the page is reachable from the nav, each scenario's `Then` is visible where a
  person would look with the fake bound. No tests in this ring.

### Ring 2: domain (`kartograph-domain`)

Goal: the behaviour is real and tested, the data is still the fake's.

- `rules.py` (and, for a worker, `sim/<concept>.py`) gets the **rules**, in one of three
  shapes, each free of I/O and of framework imports:
  1. a **state machine**: a class with a private state and methods named for what
     happened (`arrived_at(waypoint, t)`, `touched_ground(t)`), returning what to do
     next;
  2. a **decision function**: a plain function whose ordered guards *are* the decision,
     documented in that order (`fill_altitudes(waypoints)`, `arrival(position, waypoint,
     radius_m)`);
  3. a **validating constructor**: `Mission.from_dict(payload)` raising `ValueError` with
     the reason.
  A rejected input is a `ValueError`; a business outcome ("no waypoint left") is a value
  the function returns, never an exception.
- One **scenario test per scenario** in `tests/test_<capability>_model.py`, red first:
  the page model constructed with fakes, Given as fake seeding, When as the method call,
  Then as assertions on the returned dict and the fake's counters. Rules get their own
  tests in `tests/test_<capability>_rules.py` (or `tests/test_<worker_module>.py`), also
  red first. Route tests, where a scenario's outcome is a status code, use
  `fastapi.testclient.TestClient` over an app assembled with fakes.
- The page model's methods now call the rules between the request and the port. The fake
  stays bound; the person can walk the same page with real rules.
- Done = `scripts/run-tests.sh -k <capability>` passes and `scripts/run-tests.sh` still
  passes.

### Ring 3: adapters (`kartograph-adapters`)

Goal: real data, real streams, real containers, real physics.

- The capability package gets the **real adapters**: a `Postgres<Port>` over `db._conn()`
  with its SQL inline and its schema block in `db/init.sql`; a `Redis<Port>` over the
  shared client for a key or a stream; a `Docker<Port>` and a `Kubernetes<Port>` over their
  clients for anything that starts a container; a worker gets its `JSBSim…` changes in
  `sim/jsbsim_engine.py`. Each translates its library's exceptions into the port's outcome
  at the boundary.
- One adapter test per adapter: Postgres and Redis adapters run against the real services
  in the compose stack and are marked `integration`; a container or cluster adapter runs
  over a fake client passed to its constructor; a physics adapter runs the real engine in
  the tests image (it is built from the worker image so the engine is present).
- `wiring.py` gets the real branch and the new default; `docker-compose.yml`,
  `k8s/10-config.yaml` and the README table follow in the same commit. The fake stays
  behind `kind == "fake"` for the walk and for tests.
- Done = the whole ladder in `build-design.md` § 9.

`build-design.md` holds the layer-by-layer detail for rings 2 and 3.

## 7. Rules that hold in every ring

- `rules.py` and every worker core module import the standard library only; no
  `fastapi`, `psycopg2`, `redis`, `docker`, `kubernetes` or `jsbsim` above an adapter.
- The page renders only its payloads; the page model takes only ports; the page reads
  only the design system's classes and helpers.
- Every runtime setting is an environment variable with its default in code, in
  `docker-compose.yml`, in `k8s/10-config.yaml` and in the README's configuration table,
  all four in step.
- The wire format between services (the sample on the stream) is the one fixed
  interface: a capability adds to `meta` or publishes on another stream or key; it never
  changes the sample's shape.
- Ground-truth annotations are computed from the fault timeline alone, never from
  physical or measured values, and the inference module never reads them; the verification
  suite asserts both by reading source.
- Scripts in `scripts/` stay bash 3.2 compatible; an array is expanded with the
  `"${arr[@]+"${arr[@]}"}"` guard.
- Every module starts with a docstring stating its role and the phase or capability it
  serves; every non-obvious decision in code carries the comment that says why.
- Loading, empty and error are visible states of the page, not hidden ones.
- Doubles live beside their port in production code and are chosen only in `wiring.py`;
  nothing else decides between a fake and a real implementation.
- A re-run of any ring on unchanged input changes nothing.

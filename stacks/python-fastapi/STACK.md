---
name: python-fastapi
title: Python services with FastAPI and a static browser UI
status: ready
version: 1
targets: [server-python, web-static]
docs: [design-system.md, code-design.md, build-design.md]
---

# Python services with FastAPI and a static browser UI

One or more Python services, each a package under `services/<service>/`, run through
docker compose and optionally the same images on Kubernetes. One of them is the FastAPI
service that serves the browser pages: plain HTML files with an inline script over one
shared namespace, no build step, no framework. The others are workers that talk over a
Redis stream and Postgres. Clean Architecture read as a hexagon: the page plus its page
model are the driving adapter, the rules are plain Python, and the `Protocol` classes the
page model takes are the ports that Postgres, Redis, a container engine and a cluster API
fulfil.

## Detection

A project is this stack when **both** hold:

- a `docker-compose.yml` at the project root, and at least one `services/*/requirements.txt`
  (or a root `requirements.txt`) that pins `fastapi`;
- **no** `settings.gradle.kts`, `Package.swift`, `*.xcodeproj`, `project.yml` or
  `angular.json` anywhere (those decide for the other stacks).

## What the three documents cover

| document | covers | used by |
|---|---|---|
| `design-system.md` | the shared stylesheet and script as the token surface, the dark palette, the page skeleton, the components, canvas charts, element ids as test hooks | plan, screens |
| `code-design.md` | the three rings in Python and browser terms, service and package layout, the page-model contract, naming, the composition root and its env-var bindings, page routes and navigation, what each ring builds | plan, screens, domain, adapters |
| `build-design.md` | ports and adapters in detail: rules, psycopg2 and `db/init.sql`, the Redis streams and keys, container and cluster launchers behind ports, the FastAPI server, tests by layer in the tests image, definition of done | plan, domain, adapters |

## Provenance

Derived from the owner's simulation-to-AI platform AIDA (`~/projects/aida`): a FastAPI
aggregator with three static dashboards, a JSBSim simulation worker, Redis streams,
Postgres with a single idempotent schema file, a pytest suite in a docker image with an
`integration` marker, docker compose first and the same images on Kubernetes. Every
convention here was read from that code; where the project was silent the document says
so with the words *stack default* and the project's copy may change the line.

## Delivery

`distribution/` beside this file holds the entry scripts `kartograph-deliver` copies into a
project on first use, over the shared libraries from `stacks/common/distribution/lib/`:
run-local.sh (docker, down, logs, status) and prepare-release.sh. Their contract is
`stacks/common/DISTRIBUTION.md`. There is no store lane and no hosted deploy: the
project's own scripts (`scripts/k8s-up.sh` and its siblings) take the images to a cluster.

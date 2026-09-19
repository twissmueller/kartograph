#!/usr/bin/env bash
# Local Docker stack, Vercel and Fly deploys. Sourced, never executed.
# Needs lib/common.sh (log, warn, die, require_var, require_cmd) sourced first.
# Contract: stacks/common/DISTRIBUTION.md in the Kartograph plugin.
#
# Deliberately generic: no reverse proxy, no workspace or project names, no
# per-project compose project name. A project that wants Traefik, a second
# database or a mail catcher puts it in its own $COMPOSE_FILE; the library only
# ever drives `docker compose -f "$COMPOSE_FILE"`.
set -euo pipefail

# ---------- prerequisites ----------

# Docker installed AND the daemon reachable. The second half matters: with Docker
# Desktop closed, every compose call fails with a socket error that reads like a
# broken compose file.
require_docker() {
  require_cmd docker
  docker info >/dev/null 2>&1 || die "the Docker daemon is not reachable — start Docker Desktop and try again"
}

# ---------- http ----------

# http_code URL → the status code, or 000 when the host did not answer at all.
# Never -f: a 4xx body is information, and `curl -sf` would hide the code.
http_code() {
  curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$1" 2>/dev/null || printf '000\n'
}

# wait_for_http URL DEADLINE_SECONDS [INTERVAL] [WHAT]
# Polls until the URL answers 200 or the deadline passes. Prints the elapsed time
# so a slow start is visible as a number, not as silence. Returns 1 on timeout.
wait_for_http() {
  local url="$1" deadline="$2" interval="${3:-5}" what="${4:-$1}"
  local elapsed=0 code=000
  log "waiting for $what (up to ${deadline}s)"
  while [ "$elapsed" -lt "$deadline" ]; do
    code="$(http_code "$url")"
    if [ "$code" = "200" ]; then
      log "$what answered 200 after ${elapsed}s"
      return 0
    fi
    sleep "$interval"
    elapsed=$((elapsed + interval))
    printf '  … %s (%ss/%ss, last status %s)\n' "$what" "$elapsed" "$deadline" "$code" >&2
  done
  warn "$what did not answer 200 within ${deadline}s (last status $code)"
  return 1
}

# ---------- compose ----------

# compose_up: build and start the whole stack, then wait for $HEALTH_URL when set.
# --build is on every run so a code change lands; the images stay layer-cached.
compose_up() {
  require_docker
  require_var COMPOSE_FILE
  [ -f "$COMPOSE_FILE" ] || die "COMPOSE_FILE does not exist: $COMPOSE_FILE"
  log "docker compose up -d --build ($COMPOSE_FILE)"
  docker compose -f "$COMPOSE_FILE" up -d --build

  if [ -n "${HEALTH_URL:-}" ]; then
    # Five minutes: a JVM server behind a migrating database is slow, and a
    # container that is "running" is not yet a container that serves.
    if ! wait_for_http "$HEALTH_URL" 300 5 "HEALTH_URL"; then
      warn "the stack is up but unhealthy — last 200 log lines:"
      COMPOSE_LOGS_FOLLOW=0 compose_logs || true
      die "local stack did not become healthy"
    fi
  else
    log "HEALTH_URL is empty — skipping the health wait"
  fi
  compose_status
}

compose_down() {
  require_docker
  require_var COMPOSE_FILE
  log "docker compose down ($COMPOSE_FILE)"
  docker compose -f "$COMPOSE_FILE" down
}

# compose_logs [SERVICE]: follows on a terminal, prints a tail and returns when
# piped or called from a failing step. Set COMPOSE_LOGS_FOLLOW=0 to force the tail.
compose_logs() {
  require_docker
  require_var COMPOSE_FILE
  local service="${1:-}" follow=1
  if [ ! -t 1 ]; then follow=0; fi
  if [ "${COMPOSE_LOGS_FOLLOW:-}" = "0" ]; then follow=0; fi
  if [ "$follow" = "1" ]; then
    if [ -n "$service" ]; then docker compose -f "$COMPOSE_FILE" logs --tail=200 -f "$service"
    else docker compose -f "$COMPOSE_FILE" logs --tail=200 -f
    fi
  else
    if [ -n "$service" ]; then docker compose -f "$COMPOSE_FILE" logs --tail=200 "$service"
    else docker compose -f "$COMPOSE_FILE" logs --tail=200
    fi
  fi
}

compose_status() {
  require_docker
  require_var COMPOSE_FILE
  docker compose -f "$COMPOSE_FILE" ps
}

# ---------- vercel ----------

# vercel_deploy DIR [--prebuilt]
# Deploys DIR to production. With --prebuilt, DIR is a directory of already-built
# files and a minimal vercel.json is written when absent so Vercel uploads them
# instead of building: a remote Gradle or toolchain build times out on Vercel's
# builders, so the machine that can build does the building.
# The deploy goes to the project DIR is linked to (.vercel/project.json). A
# production deploy serves every domain of that project — deploying a second
# project and aliasing one preview domain once left the real domain on a stale
# build, which is why nothing here aliases anything.
vercel_deploy() {
  local dir="$1" prebuilt="${2:-}"
  require_cmd vercel
  [ -d "$dir" ] || die "directory not found: $dir"

  if [ "$prebuilt" = "--prebuilt" ] && [ ! -f "$dir/vercel.json" ]; then
    log "writing $dir/vercel.json (no remote build, serve this directory as-is)"
    printf '%s\n' '{"buildCommand": "", "outputDirectory": "."}' >"$dir/vercel.json"
  fi

  local output url
  log "vercel --prod --yes --archive=tgz in $dir"
  # --archive=tgz keeps the upload under Vercel's per-deployment file-count limit.
  # The output is captured so the deployment URL can be read out of it; on failure
  # it is printed, because a swallowed vercel error is unreadable.
  if ! output="$( cd "$dir" && vercel --prod --yes --archive=tgz 2>&1 )"; then
    printf '%s\n' "$output" >&2
    die "vercel deploy failed"
  fi
  url="$(printf '%s\n' "$output" | grep -o 'https://[^ ]*\.vercel\.app' | head -1)"
  if [ -z "$url" ]; then
    printf '%s\n' "$output" >&2
    die "vercel printed no deployment URL — treating that as a failed deploy"
  fi
  log "deployment: $url"

  if [ -n "${PROD_URL:-}" ]; then
    # Propagation is not instant; give it one grace period before judging.
    if ! wait_for_http "$PROD_URL" 60 5 "$PROD_URL"; then
      warn "rollback: open the Vercel dashboard → the project → Deployments → the previous deployment → Promote to Production"
      return 1
    fi
    log "live: $PROD_URL"
  else
    log "PROD_URL is empty — skipping the live check"
  fi
}

# ---------- fly ----------

# fly_deploy DIR APP: deploy DIR's fly.toml to APP, then show status and wait for
# $HEALTH_URL. On failure the way back is printed, never taken automatically.
fly_deploy() {
  local dir="$1" app="$2"
  require_cmd flyctl
  [ -d "$dir" ] || die "directory not found: $dir"
  [ -n "$app" ] || die "fly_deploy needs an app name"

  log "flyctl deploy -a $app (in $dir)"
  ( cd "$dir" && flyctl deploy -a "$app" ) || {
    warn "rollback: flyctl releases rollback -a $app"
    die "flyctl deploy failed"
  }

  log "flyctl status -a $app"
  ( cd "$dir" && flyctl status -a "$app" ) || true

  if [ -n "${HEALTH_URL:-}" ]; then
    # Eight minutes. A Spring Boot image on a shared 1 GB machine has been seen to
    # need ~400s to serve its first request; a check that gives up after one
    # minute reports a failure that is only slowness.
    if ! wait_for_http "$HEALTH_URL" 480 10 "HEALTH_URL"; then
      warn "logs:     flyctl logs -a $app"
      warn "releases: flyctl releases -a $app"
      warn "rollback: flyctl releases rollback -a $app"
      return 1
    fi
  else
    log "HEALTH_URL is empty — skipping the health check"
  fi
}

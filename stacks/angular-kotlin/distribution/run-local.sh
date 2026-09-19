#!/usr/bin/env bash
# run-local.sh <lane> [service]
#
# Builds and starts the app for development on one lane:
#   macos    the Mac app, Debug, opened from the build directory
#   desktop  the JVM desktop app through Gradle
#   ios      the iOS app in the simulator named SIMULATOR in config.sh
#   android  the Android app in a running emulator, started if none runs
#   docker   the local stack from COMPOSE_FILE (server, web, database), waiting for
#            HEALTH_URL, then the URLs the compose file publishes
#   down     stop the docker stack; volumes and so the data survive
#   logs     [service] follow the docker logs on a terminal, the last 200 lines when piped
#   status   docker compose ps
#
# Reads distribution/config.sh. A lane the project does not ship (LANES) is a sentence
# and exit 2; docker needs the server, web, backend or frontend lane.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/lib/common.sh"
case "${1:-}" in --help|-h) usage_exit "${BASH_SOURCE[0]}" ;; esac
load_config
lane="${1:-}"; [ -n "$lane" ] || usage_exit "${BASH_SOURCE[0]}" 2

has_lane() { case " ${LANES:-} " in *" $1 "*) return 0 ;; esac; return 1; }
require_docker_lane() {
  has_lane server || has_lane web || has_lane backend || has_lane frontend || {
    printf '%s\n' "This project ships no server, web, backend or frontend lane (LANES=\"${LANES:-}\" in $CONFIG_FILE). Nothing to run in docker." >&2
    exit 2
  }
  . "$HERE/lib/docker.sh"; require_var COMPOSE_FILE
}

# The host ports the compose file publishes, as URLs. An entry is [HOST_IP:]HOST:CONTAINER[/proto],
# so the host port is the second-to-last colon field. Backing services answer their own wire
# protocol, not HTTP, so they are named rather than dressed up as a link.
print_urls() {
  local ports port
  ports="$(awk '
    /^[[:space:]]*ports:[[:space:]]*$/ { inports = 1; next }
    inports && /^[[:space:]]*#/        { next }
    inports && /^[[:space:]]*-[[:space:]]/ {
      line = $0
      gsub(/["'"'"']/, "", line)
      sub(/^[[:space:]]*-[[:space:]]*/, "", line)
      sub(/\/.*$/, "", line)
      n = split(line, part, ":")
      if (n >= 2 && part[n - 1] ~ /^[0-9]+$/) print part[n - 1]
      next
    }
    inports { inports = 0 }
  ' "$COMPOSE_FILE" | sort -u)"
  [ -n "$ports" ] || return 0
  printf '\nURLs:\n' >&2
  for port in $ports; do
    case "$port" in
      5432|3306|27017|6379|1025|9000) printf '  localhost:%s (backing service, not HTTP)\n' "$port" >&2 ;;
      *) printf '  http://localhost:%s\n' "$port" >&2 ;;
    esac
  done
}

case "$lane" in
  macos)   require_lane mac;     . "$HERE/lib/xcode.sh";  mac_run ;;
  ios)     require_lane ios;     . "$HERE/lib/xcode.sh";  simulator_run ;;
  desktop) require_lane desktop; . "$HERE/lib/gradle.sh"; desktop_run ;;
  android) require_lane android; . "$HERE/lib/gradle.sh"; emulator_run ;;
  docker)  require_docker_lane; compose_up; print_urls ;;
  down)    require_docker_lane; compose_down ;;
  logs)    require_docker_lane; compose_logs "${2:-}" ;;
  status)  require_docker_lane; compose_status ;;
  *) die "unknown lane '$lane' — one of: macos, desktop, ios, android, docker, down, logs, status" 2 ;;
esac

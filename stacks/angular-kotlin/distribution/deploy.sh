#!/usr/bin/env bash
# deploy.sh — ship the production build.
#
# Usage:
#   ./deploy.sh backend    build the server and deploy it to Fly, then check HEALTH_URL
#   ./deploy.sh frontend   build the Angular app and deploy it to Vercel, then check PROD_URL
#   ./deploy.sh all        backend first, then frontend — the server ships before the client
#   ./deploy.sh --help     this text
#
# Options:
#   --yes   skip the typed confirmation (ASSUME_YES=1)
#
# Config keys used: LANES, BACKEND_DIR, FLY_APP, HEALTH_URL, FRONTEND_DIR, PROD_URL.
# Prerequisites: flyctl (brew install flyctl, flyctl auth login), vercel (npm i -g vercel,
# vercel login), npm. A production deploy requires main to be merged into the branch.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"
load_config
# shellcheck source=lib/docker.sh
. "$SCRIPT_DIR/lib/docker.sh"

TARGET=""
while [ $# -gt 0 ]; do
  case "$1" in
    backend|frontend|all) TARGET="$1" ;;
    --yes) ASSUME_YES=1; export ASSUME_YES ;;
    -h|--help) usage_exit "${BASH_SOURCE[0]}" 0 ;;
    *) die "unknown argument '$1' — run $0 --help" ;;
  esac
  shift
done
[ -n "$TARGET" ] || usage_exit "${BASH_SOURCE[0]}" 1

# A production deploy from a branch that does not contain main ships code that was
# never tested against what is already live. Checked once per run — `all` deploys
# two halves of the same commit.
MAIN_MERGED_CHECKED=0
require_main_merged() {
  [ "$MAIN_MERGED_CHECKED" = "1" ] && return 0
  MAIN_MERGED_CHECKED=1
  git -C "$PROJECT_ROOT" rev-parse --git-dir >/dev/null 2>&1 || { warn "not a git repository — skipping the main-merged check"; return 0; }
  git -C "$PROJECT_ROOT" fetch -q origin main || die "could not fetch origin/main — check the remote before deploying"
  if ! git -C "$PROJECT_ROOT" merge-base --is-ancestor origin/main HEAD; then
    die "main has to be merged into the branch before a production deploy — run: git merge origin/main"
  fi
  log "origin/main is contained in $(git -C "$PROJECT_ROOT" rev-parse --abbrev-ref HEAD)"
}

# The Gradle wrapper lives either in BACKEND_DIR (single-project server) or one
# level up (the server is a module of a multi-project build). Building here is a
# fast failure before anything leaves the machine; flyctl builds the image itself.
backend_build() {
  local dir="$1" gradle_dir=""
  if [ -x "$dir/gradlew" ]; then gradle_dir="$dir"
  elif [ -x "$(dirname "$dir")/gradlew" ]; then gradle_dir="$(dirname "$dir")"
  fi
  if [ -z "$gradle_dir" ]; then
    warn "no gradlew in $dir or its parent — leaving the build to the Fly builder"
    return 0
  fi
  log "./gradlew build -x test --quiet (in $gradle_dir)"
  ( cd "$gradle_dir" && ./gradlew build -x test --quiet )
}

deploy_backend() {
  require_lane backend
  require_var BACKEND_DIR FLY_APP
  require_cmd flyctl
  require_main_merged
  backend_build "$BACKEND_DIR"
  confirm_typed deploy "Type 'deploy' to deploy the server to $FLY_APP"
  fly_deploy "$BACKEND_DIR" "$FLY_APP"
}

deploy_frontend() {
  require_lane frontend
  require_var FRONTEND_DIR PROD_URL
  require_cmd vercel npm
  require_main_merged
  log "npm ci && npm run build (in $FRONTEND_DIR)"
  ( cd "$FRONTEND_DIR" && npm ci && npm run build )
  confirm_typed deploy "Type 'deploy' to deploy the frontend to $PROD_URL"
  vercel_deploy "$FRONTEND_DIR"
}

case "$TARGET" in
  backend)  deploy_backend ;;
  frontend) deploy_frontend ;;
  all)      deploy_backend; deploy_frontend ;;
esac

log "done"

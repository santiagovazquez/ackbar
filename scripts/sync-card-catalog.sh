#!/usr/bin/env bash
set -Eeuo pipefail

# Import the latest card catalog into production from the active release.
# A non-blocking lock prevents overlapping scheduled or manually-triggered runs.

deploy_root="${DEPLOY_ROOT:-/home/deploy/ackbar-web}"
current="$deploy_root/current"
shared="$deploy_root/shared"

if [[ ! -L "$current" ]]; then
  echo "Active release symlink does not exist: $current" >&2
  exit 1
fi

release="$(readlink -f "$current")"
if [[ ! -d "$release/apps/api" ]]; then
  echo "Active API release does not exist: $release/apps/api" >&2
  exit 1
fi

mkdir -p "$shared"
exec 9>"$shared/card-catalog-sync.lock"
if ! flock -n 9; then
  echo "Another card catalog sync is already running; skipping."
  exit 0
fi

export NVM_DIR="$HOME/.nvm"
if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  echo "nvm is not installed on the server" >&2
  exit 1
fi

set +u
# shellcheck source=/dev/null
. "$NVM_DIR/nvm.sh"
nvm use "$(<"$release/.nvmrc")"
set -u

cd "$release/apps/api"
NODE_ENV=production node dist/src/seed.js

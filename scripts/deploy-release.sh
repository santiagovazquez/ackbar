#!/usr/bin/env bash
set -Eeuo pipefail

# Activate one release uploaded by GitHub Actions.
#
# Deployment order:
#   1. Validate the release and attach persistent environment files.
#   2. Install dependencies and build while the old release remains online.
#   3. Stop both services so no writes occur after the database snapshot.
#   4. Back up the database, migrate it, and point PM2 at the new release.
#   5. Verify both services. Any failure after step 3 triggers recover().

# --- Release paths -----------------------------------------------------------

release_id="${1:?Usage: deploy-release.sh RELEASE_ID}"
deploy_root="${DEPLOY_ROOT:-/home/deploy/ackbar-web}"
release="$deploy_root/releases/$release_id"
shared="$deploy_root/shared"
current="$deploy_root/current"
previous="$deploy_root/previous"
api_env="$shared/api.env"
web_env="$shared/web.env"

# A GitHub commit SHA is 40 lowercase hexadecimal characters. Besides catching
# mistakes, this prevents the argument from escaping the releases directory.
if [[ ! "$release_id" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Invalid release id: $release_id" >&2
  exit 1
fi

if [[ ! -d "$release" ]]; then
  echo "Release does not exist: $release" >&2
  exit 1
fi

mkdir -p "$shared/backups"

# Secrets live outside releases, so GitHub never uploads them and changing the
# current release cannot remove them.
if [[ ! -f "$api_env" || ! -f "$web_env" ]]; then
  echo "Create $api_env and $web_env using deploy/env/*.example, then retry." >&2
  exit 1
fi
ln -sfn "$api_env" "$release/apps/api/.env"
ln -sfn "$web_env" "$release/apps/web/.env.production"

# --- Runtime and build -------------------------------------------------------

# Select Node 22 for this shell and the processes launched from it. This does
# not restart or change the Node version of unrelated PM2 applications.
export NVM_DIR="$HOME/.nvm"
if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  echo "nvm is not installed on the server" >&2
  exit 1
fi

# Some NVM versions reference optional variables without guarding them, so
# temporarily disable nounset while loading NVM and restore it immediately.
set +u
# shellcheck source=/dev/null
. "$NVM_DIR/nvm.sh"
set -u
nvm install 22
nvm use 22
corepack enable
corepack prepare pnpm@10.17.1 --activate
cd "$release"
pnpm install --frozen-lockfile
pnpm build

# The old release stays online throughout installation and compilation.
old_release=""
if [[ -L "$current" ]]; then
  old_release="$(readlink -f "$current")"
fi

backup=""
services_stopped=false

# --- Automatic failure recovery ---------------------------------------------

# `set -E -e` routes failed migrations, PM2 commands, and health checks here.
# Restore the snapshot first and then start the code that used that schema.
recover() {
  exit_code=$?

  # Prevent a failed recovery command from invoking this function recursively.
  trap - ERR
  echo "Deployment failed; restoring the previous state." >&2

  if [[ -n "$backup" && -f "$backup" ]]; then
    bash "$release/scripts/restore-database.sh" "$backup" "$api_env" || true
  fi

  if [[ -n "$old_release" && -d "$old_release" ]]; then
    ln -sfn "$old_release" "$current"
    pm2 startOrReload "$old_release/ecosystem.config.cjs" --update-env || true
  elif [[ "$services_stopped" == true ]]; then
    # A failed first deployment has no old release to restart.
    pm2 delete ackbar-api ackbar-web 2>/dev/null || true
  fi

  exit "$exit_code"
}

trap recover ERR

# --- Database snapshot and migration ----------------------------------------

# This creates a short maintenance window. Stopping writes guarantees that an
# automatic restore cannot discard data written after the snapshot.
pm2 stop ackbar-api ackbar-web 2>/dev/null || true
services_stopped=true

backup="$(bash "$release/scripts/backup-database.sh" "$release_id" "$api_env")"

# Remember which pre-migration snapshot belongs to this release.
printf '%s\n' "$backup" > "$release/.database-backup"

# Export the API settings because migration runs from the repository root.
set -a
# shellcheck source=/dev/null
. "$api_env"
set +a
NODE_ENV=production pnpm db:migrate

# --- Activate and verify -----------------------------------------------------

# current and previous are symlinks, making the release switch instantaneous.
if [[ -n "$old_release" ]]; then
  ln -sfn "$old_release" "$previous"
fi

ln -sfn "$release" "$current"
pm2 startOrReload "$release/ecosystem.config.cjs" --update-env
pm2 save

# Give the API up to 20 seconds to start, then require both applications to
# answer locally. A failed check invokes recover().
for _ in {1..20}; do
  curl --fail --silent http://127.0.0.1:4001/health >/dev/null && break
  sleep 1
done
curl --fail --silent http://127.0.0.1:4001/health >/dev/null
curl --fail --silent http://127.0.0.1:4000/ >/dev/null

# Deployment is complete; later shell errors must not initiate a rollback.
trap - ERR
echo "Release $release_id deployed. Database backup: $backup"

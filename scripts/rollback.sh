#!/usr/bin/env bash
set -Eeuo pipefail

# Switch PM2 back to the previous immutable release.
#
# By default only application code is rolled back and current production data
# is preserved. Pass --restore-db to also restore the snapshot created just
# before the current release migrated the database. That option discards all
# database writes made since that snapshot.

# --- Select the releases -----------------------------------------------------

deploy_root="${DEPLOY_ROOT:-/home/deploy/ackbar-web}"
current="$deploy_root/current"
previous="$deploy_root/previous"
restore_db=false

if [[ "${1:-}" == "--restore-db" ]]; then
  restore_db=true
elif [[ -n "${1:-}" ]]; then
  echo "Usage: rollback.sh [--restore-db]" >&2
  exit 1
fi

if [[ ! -L "$current" || ! -L "$previous" ]]; then
  echo "Both current and previous releases are required" >&2
  exit 1
fi

current_release="$(readlink -f "$current")"
target_release="$(readlink -f "$previous")"

if [[ ! -d "$target_release" ]]; then
  echo "Previous release is missing: $target_release" >&2
  exit 1
fi

# --- Validate the application runtime ---------------------------------------

export NVM_DIR="$HOME/.nvm"
if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  echo "nvm is not installed on the server" >&2
  exit 1
fi
set +u
# shellcheck source=/dev/null
. "$NVM_DIR/nvm.sh"
nvm use "$(<"$current_release/.nvmrc")"
set -u

export PM2_HOME="$deploy_root/shared/pm2"
pm2_bin="$current_release/node_modules/.bin/pm2"
if [[ ! -x "$pm2_bin" ]]; then
  echo "The repository-pinned PM2 installation is missing" >&2
  exit 1
fi

app_pm2() {
  "$pm2_bin" "$@"
}

# --- Automatic failure recovery ---------------------------------------------

# If restore, PM2, or a health check fails, put the original symlink back and
# restart the release that was active when this script began.
recover() {
  exit_code=$?

  trap - ERR
  echo "Rollback failed; restarting the current release." >&2
  ln -sfn "$current_release" "$current"
  app_pm2 startOrReload "$current_release/ecosystem.config.cjs" --update-env || true
  exit "$exit_code"
}

trap recover ERR

# --- Stop, optionally restore, and switch -----------------------------------

# The API must not write while its database file is being replaced.
app_pm2 stop ackbar-api ackbar-web 2>/dev/null || true

if [[ "$restore_db" == true ]]; then
  # deploy-release.sh records the snapshot path in the release that performed
  # the migration, which is the release currently being rolled back.
  backup="$(<"$current_release/.database-backup")"
  bash "$current_release/scripts/restore-database.sh" "$backup" "$deploy_root/shared/api.env"
fi

# Swap the symlinks. Running rollback.sh again toggles back to the newer release.
ln -sfn "$target_release" "$current"
ln -sfn "$current_release" "$previous"

app_pm2 startOrReload "$target_release/ecosystem.config.cjs" --update-env
app_pm2 save

# --- Verify the restored release --------------------------------------------

# Wait up to 20 seconds for the API, then require both API and web to respond.
for _ in {1..20}; do
  curl --fail --silent http://127.0.0.1:4001/health >/dev/null && break
  sleep 1
done
curl --fail --silent http://127.0.0.1:4001/health >/dev/null
curl --fail --silent http://127.0.0.1:4000/ >/dev/null

# The rollback is healthy; disable automatic recovery before exiting.
trap - ERR
echo "Rolled back to $(basename "$target_release"). Database restored: $restore_db"

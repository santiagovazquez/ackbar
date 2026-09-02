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

# Select the Node major pinned by this repository. NVM installs it alongside
# other versions and does not modify the server's default alias.
export NVM_DIR="$HOME/.nvm"
if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  echo "nvm is not installed on the server" >&2
  exit 1
fi
set +u
# shellcheck source=/dev/null
. "$NVM_DIR/nvm.sh"

# Remember the server-default PM2 client before selecting this application's
# runtime. Non-interactive SSH shells do not necessarily include it in PATH.
# It is used only for the one-time migration of the two ackbar processes.
legacy_node_version="$(nvm version default)"
legacy_node_bin="$NVM_DIR/versions/node/$legacy_node_version/bin"
legacy_path="$legacy_node_bin:$PATH"
legacy_pm2_bin=""
if [[ -x "$legacy_node_bin/pm2" ]]; then
  legacy_pm2_bin="$legacy_node_bin/pm2"
fi
legacy_pm2_home="${PM2_HOME:-$HOME/.pm2}"

nvm install "$(<"$release/.nvmrc")"
nvm use "$(<"$release/.nvmrc")"
set -u

# A separate PM2 home creates a daemon and process dump owned only by this app.
export PM2_HOME="$shared/pm2"
mkdir -p "$PM2_HOME"

for runtime_command in node corepack; do
  if ! command -v "$runtime_command" >/dev/null; then
    echo "$runtime_command is not installed on the server" >&2
    exit 1
  fi
done
corepack enable
corepack prepare pnpm@10.17.1 --activate
cd "$release"
pnpm install --frozen-lockfile
pnpm build
pm2_bin="$release/node_modules/.bin/pm2"
if [[ ! -x "$pm2_bin" ]]; then
  echo "The repository-pinned PM2 installation is missing" >&2
  exit 1
fi

app_pm2() {
  "$pm2_bin" "$@"
}

legacy_pm2() {
  if [[ -n "$legacy_pm2_bin" ]]; then
    env PATH="$legacy_path" PM2_HOME="$legacy_pm2_home" "$legacy_pm2_bin" "$@"
  fi
}

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
    app_pm2 delete ackbar-api ackbar-web 2>/dev/null || true
    app_pm2 start "$old_release/ecosystem.config.cjs" --update-env || true
  elif [[ "$services_stopped" == true ]]; then
    # A failed first deployment has no old release to restart.
    app_pm2 delete ackbar-api ackbar-web 2>/dev/null || true
  fi

  exit "$exit_code"
}

trap recover ERR

# --- Database snapshot and migration ----------------------------------------

# This creates a short maintenance window. Stopping writes guarantees that an
# automatic restore cannot discard data written after the snapshot.
app_pm2 stop ackbar-api ackbar-web 2>/dev/null || true
# Releases deployed before runtime isolation may still belong to the default
# PM2 daemon. Remove only this application's two entries and persist the
# remaining server-wide process list.
legacy_pm2 delete ackbar-api ackbar-web 2>/dev/null || true
legacy_pm2 save 2>/dev/null || true
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
# PM2 reloads keep immutable fields such as cwd from the existing process.
# Recreate these two processes so every release switch adopts the selected
# release's paths and command configuration.
app_pm2 delete ackbar-api ackbar-web 2>/dev/null || true
app_pm2 start "$release/ecosystem.config.cjs" --update-env
app_pm2 save

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

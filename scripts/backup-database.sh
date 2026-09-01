#!/usr/bin/env bash
set -Eeuo pipefail

# Create a consistent SQLite snapshot before a release runs its migrations.
#
# The absolute path of the backup is printed to stdout. deploy-release.sh saves
# that path inside the release so rollback.sh can find the correct snapshot.

release_id="${1:?Usage: backup-database.sh RELEASE_ID [API_ENV]}"
api_env="${2:-/home/deploy/ackbar-web/shared/api.env}"
deploy_root="${DEPLOY_ROOT:-/home/deploy/ackbar-web}"

# Export every variable loaded from api.env. DATABASE_URL is normally read by
# the Node API, but this script needs it to locate the SQLite file directly.
set -a
# shellcheck source=/dev/null
. "$api_env"
set +a

# SQLite's online `.backup` command is used below. Remote libSQL/Turso databases
# require a provider-specific backup method, so fail safely instead of running a
# migration with no usable snapshot.
case "${DATABASE_URL:-}" in
  file:/*)
    ;;
  *)
    echo "Automatic backup requires DATABASE_URL=file:/absolute/path." >&2
    echo "Refusing to migrate without a backup." >&2
    exit 1
    ;;
esac

# Convert file:/path/to/database.db?options into /path/to/database.db.
database_path="${DATABASE_URL#file:}"
database_path="${database_path%%\?*}"

if [[ "$database_path" == *"'"* ]]; then
  echo "Database path cannot contain a single quote" >&2
  exit 1
fi

backup_dir="$deploy_root/shared/backups"
backup="$backup_dir/${release_id}-$(date -u +%Y%m%dT%H%M%SZ).sqlite"
mkdir -p "$backup_dir"

if [[ ! -f "$database_path" ]]; then
  # On the first deployment there may be no database yet. The empty marker tells
  # restore-database.sh to remove/quarantine a DB created by a failed migration.
  backup="$backup.empty"
  : > "$backup"
else
  # `.backup` safely snapshots a live SQLite database, including pending WAL data.
  sqlite3 "$database_path" ".backup '$backup'"

  if [[ "$(sqlite3 "$backup" 'PRAGMA integrity_check;')" != "ok" ]]; then
    echo "Backup integrity check failed" >&2
    exit 1
  fi
fi

# This is intentionally the only normal stdout output; callers capture it.
printf '%s\n' "$backup"

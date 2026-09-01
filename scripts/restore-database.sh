#!/usr/bin/env bash
set -Eeuo pipefail

# Replace the production SQLite database with a snapshot made by
# backup-database.sh. The API must be stopped before calling this script.

backup="${1:?Usage: restore-database.sh BACKUP [API_ENV]}"
api_env="${2:-/home/deploy/ackbar-web/shared/api.env}"

# Load DATABASE_URL and export it for consistency with the application runtime.
set -a
# shellcheck source=/dev/null
. "$api_env"
set +a

if [[ "${DATABASE_URL:-}" != file:/* ]]; then
  echo "Restore only supports an absolute local SQLite DATABASE_URL" >&2
  exit 1
fi

database_path="${DATABASE_URL#file:}"
database_path="${database_path%%\?*}"

if [[ ! -f "$backup" ]]; then
  echo "Backup not found: $backup" >&2
  exit 1
fi

if [[ "$backup" == *.empty ]]; then
  # The release started without a DB. Preserve, rather than delete, any database
  # created by its failed migration so it can still be inspected manually.
  if [[ -e "$database_path" ]]; then
    failed_database="$database_path.failed-$(date -u +%Y%m%dT%H%M%SZ)"
    mv "$database_path" "$failed_database"
  fi
else
  # Never overwrite production with a corrupt snapshot.
  if [[ "$(sqlite3 "$backup" 'PRAGMA integrity_check;')" != "ok" ]]; then
    echo "Backup is corrupt" >&2
    exit 1
  fi

  # Copy to a sibling temporary file and rename it atomically. This prevents a
  # partially copied database from becoming visible at the production path.
  restore_tmp="$database_path.restore.$$"
  cp "$backup" "$restore_tmp"
  mv "$restore_tmp" "$database_path"
fi

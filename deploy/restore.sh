#!/usr/bin/env bash
# Puts a backup made by backup.sh back into the CMS (docker-infrastructure's README, "What an app
# ships"). Run it as deploy from ~/apps/payload/, with the decrypted payload.tar the runner's
# helpers fetched:
#
#   bash restore.sh <path to payload.tar>
#
# It replaces the whole database with the one in the backup: anything changed since that backup
# is lost. The CMS is stopped while it runs. Uploaded files are left alone: they live in R2 (or
# the media volumes), never in the database, and Payload never overwrites an upload, so the
# restored database still finds every file it names.

# The single-quoted commands below are expanded inside the db container, not here.
# shellcheck disable=SC2016
set -euo pipefail

backup="${1:?usage: bash restore.sh <path to payload.tar>}"
[ -f "$backup" ] || { echo "restore.sh: no such file: $backup" >&2; exit 1; }
backup="$(cd "$(dirname "$backup")" && pwd)/$(basename "$backup")"

# Run from this script's folder, so `docker compose` finds this app's compose file.
cd "$(dirname "$0")"

say() { echo "restore.sh: $*"; }

# Where the backup is unpacked inside the db container. Commands run there by in_db get it as
# $RESTORE_DIR. It is removed however this script ends.
work=/tmp/restore
in_db() { docker compose exec -T -e RESTORE_DIR="$work" db "$@"; }
trap 'in_db rm -rf "$work" < /dev/null || true' EXIT

# 1. Make sure the database is running (after a rebuild it may not be yet), then unpack the
#    backup inside it and check the dump is readable, all before the CMS is touched. A bad file
#    stops here with the CMS still up.
say "starting the database if it isn't running"
docker compose up -d --wait db
say "checking $backup"
unreadable() { say "$backup isn't a readable backup from backup.sh; nothing was changed" >&2; exit 1; }
in_db sh -c 'rm -rf "$RESTORE_DIR" && mkdir "$RESTORE_DIR" && tar -x -C "$RESTORE_DIR"' \
  < "$backup" || unreadable
in_db pg_restore --list "$work/payload.dump" < /dev/null > /dev/null || unreadable

# 2. Stop the CMS, so nothing writes to the database while it is replaced. From here until the
#    load succeeds, the restore-failed marker in this folder stops the deploy (build-and-deploy.yml)
#    starting the CMS on a missing or half-loaded database. It stays if this script fails or is
#    interrupted.
say "stopping the CMS"
touch restore-failed
docker compose stop app

# 3. Replace the database: drop it (closing any connections left), create it empty, and load the
#    dump into it in one transaction. The dump carries payload_migrations, so the CMS sees the
#    schema version it was taken at, and runs any newer migrations itself on its first request.
#    This runs against the "postgres" database, since the one being replaced can't be dropped
#    while connected to it.
say "replacing the database"
if ! in_db sh -c '
  set -eu
  dropdb -U "$POSTGRES_USER" --maintenance-db=postgres --force --if-exists "$POSTGRES_DB"
  createdb -U "$POSTGRES_USER" --maintenance-db=postgres --owner="$POSTGRES_USER" "$POSTGRES_DB"
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --single-transaction --exit-on-error \
    "$RESTORE_DIR/payload.dump"
' < /dev/null; then
  # Started against an empty database, the CMS would offer its first-admin sign-up to anyone,
  # so it stays stopped until a restore succeeds, and deploys refuse to start it.
  say "the restore failed, so the CMS is left stopped, and deploys will refuse to start it." >&2
  say "Fix the cause and run restore.sh again. Don't start the CMS by hand on this database." >&2
  exit 1
fi
rm -f restore-failed

# 4. Start the CMS again, and wait up to 3 minutes for it to answer from the restored database.
#    Its first request also runs any migrations newer than the backup, which can take a while.
say "starting the CMS"
# up, not start: after a rebuild there is no app container yet to start.
docker compose up -d app
for _ in $(seq 90); do
  if docker compose exec -T app node -e '
    fetch("http://127.0.0.1:3000/api/users/init")
      .then((res) => process.exit(res.ok ? 0 : 1))
      .catch(() => process.exit(1));
  ' < /dev/null 2> /dev/null; then
    say "done: the CMS is back up on the restored database"
    exit 0
  fi
  sleep 2
done
say "the database was restored, but the CMS hasn't answered in 3 minutes: see docker compose logs app" >&2
exit 1

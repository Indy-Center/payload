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
set -euo pipefail

backup="${1:?usage: bash restore.sh <path to payload.tar>}"
[ -f "$backup" ] || { echo "restore.sh: no such file: $backup" >&2; exit 1; }
backup="$(cd "$(dirname "$backup")" && pwd)/$(basename "$backup")"

# Run from this script's folder, so `docker compose` finds this app's compose file.
cd "$(dirname "$0")"

say() { echo "restore.sh: $*"; }

# Removes the copy of the backup from the db container however this script ends.
trap 'docker compose exec -T db rm -rf /tmp/restore < /dev/null || true' EXIT

# 1. Make sure the database is running (after a rebuild it may not be yet), then unpack the
#    backup inside it and check the dump is readable, all before the CMS is touched. A bad file
#    stops here with the CMS still up.
say "starting the database if it isn't running"
docker compose up -d --wait db
say "checking $backup"
unreadable() { say "$backup isn't a readable backup from backup.sh; nothing was changed" >&2; exit 1; }
docker compose exec -T db sh -c 'rm -rf /tmp/restore && mkdir /tmp/restore && tar -x -C /tmp/restore' \
  < "$backup" || unreadable
docker compose exec -T db pg_restore --list /tmp/restore/payload.dump < /dev/null > /dev/null \
  || unreadable

# 2. Stop the CMS, so nothing writes to the database while it is replaced.
say "stopping the CMS"
docker compose stop app

# 3. Replace the database: drop it (closing any connections left), create it empty, and load the
#    dump into it in one transaction. The dump carries payload_migrations, so the CMS sees the
#    schema version it was taken at, and runs any newer migrations itself on its first request.
#    This runs against the "postgres" database, since the one being replaced can't be dropped
#    while connected to it.
say "replacing the database"
if ! docker compose exec -T db sh -c '
  set -eu
  dropdb -U "$POSTGRES_USER" --maintenance-db=postgres --force --if-exists "$POSTGRES_DB"
  createdb -U "$POSTGRES_USER" --maintenance-db=postgres --owner="$POSTGRES_USER" "$POSTGRES_DB"
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --single-transaction --exit-on-error \
    /tmp/restore/payload.dump
' < /dev/null; then
  # Started against an empty database, the CMS would offer its first-admin sign-up to anyone,
  # so it stays stopped until a restore succeeds.
  say "the restore failed, so the CMS is left stopped. Fix the cause and run restore.sh again" >&2
  exit 1
fi

# 4. Start the CMS again, and wait for it to answer from the restored database.
say "starting the CMS"
docker compose start app
for _ in $(seq 30); do
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
say "the database was restored, but the CMS hasn't answered in a minute: see docker compose logs app" >&2
exit 1

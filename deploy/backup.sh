#!/usr/bin/env bash
# The CMS's backup recipe (docker-infrastructure's README, "What an app ships"). The backup runner
# calls it from ~/apps/payload/ with one argument, an empty folder, and it writes one file there:
#
#   payload.tar
#     payload.dump     the whole database, from pg_dump in its custom format. It includes the
#                      payload_migrations table, so a restore brings back its schema version too.
#                      It also sets every table's owner to the payload role, so loading it
#                      anywhere without that role (a scratch database, the restore check) needs
#                      `pg_restore --no-owner`, or a payload role created first.
#     row-counts.tsv   each table and its number of rows, one "table<TAB>rows" line each, taken
#                      from the same moment as the dump. The weekly restore check loads the dump
#                      and expects at least these counts.
#
# The CMS stays up throughout. Uploaded files are not in it: they live in R2, and the runner's
# media copy keeps them (uploads in the local media volumes, used only when R2 isn't configured,
# aren't backed up). Encrypting, uploading and pruning are the runner's job, not this script's.
#
#   bash backup.sh <empty folder>
set -euo pipefail
# The archive is the whole database, password hashes included: only its owner may read it.
umask 077

out="${1:?usage: bash backup.sh <empty folder>}"
[ -d "$out" ] || { echo "backup.sh: $out is not a folder" >&2; exit 1; }
# Made absolute before the cd below, so a folder given relative to where it was called still works.
out="$(cd "$out" && pwd)"

# Run from this script's folder, so `docker compose` finds this app's compose file.
cd "$(dirname "$0")"

# Everything below runs inside the running db container, which has pg_dump, psql and tar, so the
# host needs only Docker. Its only output on stdout is the finished archive; messages go to stderr.
dump_in_container=$(
  cat << 'SH'
set -eu
# A private working folder inside the container, removed however this ends.
dir="$(mktemp -d)"
trap 'rm -rf "$dir"' EXIT
export DIR="$dir"

# One read-only transaction at a fixed point in time (REPEATABLE READ). Its snapshot is shared
# with pg_dump, so the dump and the row counts both describe exactly that moment, however much
# the CMS changes meanwhile. ON_ERROR_STOP makes psql exit non-zero on the first error.
psql -X -q -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" >&2 << 'SQL'
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;

-- Name this transaction's snapshot, and hand it to pg_dump through the environment.
SELECT pg_export_snapshot() AS snapshot \gset
\setenv SNAPSHOT :snapshot

-- Dump the whole database as of that snapshot. psql can't see pg_dump's exit code directly,
-- so a failed dump raises an error here, which stops psql.
\! pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --snapshot="$SNAPSHOT" --file="$DIR/payload.dump"
\if :SHELL_ERROR
  DO $$ BEGIN RAISE EXCEPTION 'pg_dump failed'; END $$;
\endif

-- Count every table's rows, in the same snapshot: build one "SELECT 'name', count(*)" per
-- table, run each (\gexec), and write the results to row-counts.tsv, tab-separated.
\getenv dir DIR
\pset fieldsep '\t'
\o :dir/row-counts.tsv
SELECT format('SELECT %L, count(*) FROM %I.%I', table_name, table_schema, table_name)
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name
\gexec
\o

COMMIT;
SQL

# Send both files out as one archive. The dump is already compressed, so the archive isn't.
tar -C "$dir" -cf - payload.dump row-counts.tsv
SH
)

# Write to a temporary name and rename once complete, so a failure never leaves a partial archive
# where the runner would take it for a backup, even when the runner stops this script.
trap 'rm -f "$out/payload.tar.partial"' EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
docker compose exec -T db sh -c "$dump_in_container" > "$out/payload.tar.partial" < /dev/null \
  || { echo "backup.sh: the database dump failed" >&2; exit 1; }
mv "$out/payload.tar.partial" "$out/payload.tar"
echo "backup.sh: wrote $out/payload.tar ($(du -h "$out/payload.tar" | cut -f1))"

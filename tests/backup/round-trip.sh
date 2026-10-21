#!/usr/bin/env bash
# The backup recipe's round trip: back up the CMS, lose the database, restore it, and check the
# content is back. CI runs it against the stack it has just started in deploy/; it runs the same
# way locally once `docker compose up -d` is running there. The app's volumes and data are thrown
# away, so never run it on the VPS.
#
#   bash tests/backup/round-trip.sh
set -euo pipefail

cd "$(dirname "$0")/../../deploy"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

fail() {
  echo "FAIL: $*" >&2
  docker compose logs --tail 50 >&2 || true
  exit 1
}

# Sends one request to the app from inside its own container (no ports are published) and prints
# the response body. Fails on a non-2xx answer. Usage: api METHOD PATH [JSON BODY] [TOKEN]
api() {
  docker compose exec -T app node -e '
    const [method, path, body, token] = process.argv.slice(1);
    const headers = { "content-type": "application/json" };
    if (token) headers.authorization = `JWT ${token}`;
    fetch(`http://127.0.0.1:3000${path}`, { method, headers, body: body || undefined })
      .then(async (res) => {
        const text = await res.text();
        console.log(text);
        if (!res.ok) { console.error(method, path, res.status); process.exit(1); }
      })
      .catch((err) => { console.error(err); process.exit(1); });
  ' "$@"
}

# Waits up to a minute for the app to answer /api/users/init, and prints its answer.
wait_for_app() {
  for _ in $(seq 30); do
    api GET /api/users/init 2> /dev/null && return 0
    sleep 2
  done
  fail "the app never answered /api/users/init"
}

email=round-trip@example.com
password=round-trip-password
category="Round trip category"

echo "--- Known content: the first account, made CMS admin, and one partner category"
wait_for_app > /dev/null
token="$(api POST /api/users/first-register "{\"email\":\"$email\",\"password\":\"$password\"}" | jq -r .token)"
user_id="$(api GET /api/users/me '' "$token" | jq -r .user.id)"
api PATCH "/api/users/$user_id" '{"roles":["cms:admin"]}' "$token" > /dev/null
api POST /api/partner-categories "{\"name\":\"$category\",\"blurb\":\"Made by the round trip.\"}" "$token" > /dev/null

echo "--- Back up"
mkdir "$work/out"
# Called from elsewhere with a relative folder, as a person might.
(cd "$work" && bash "$OLDPWD/backup.sh" out) || fail "backup.sh exited $?"
files="$(ls -A "$work/out")"
[ "$files" = payload.tar ] || fail "backup.sh should write payload.tar alone, but wrote: ${files:-nothing}"

# The archive holds the dump and the row counts the weekly restore check compares against.
tar -tf "$work/out/payload.tar" | sort > "$work/members"
printf '%s\n' payload.dump row-counts.tsv | diff - "$work/members" \
  || fail "payload.tar should hold payload.dump and row-counts.tsv"
tar -xf "$work/out/payload.tar" -C "$work" row-counts.tsv
count() { awk -F '\t' -v t="$1" '$1 == t { print $2 }' "$work/row-counts.tsv"; }
[ "$(count users)" = 1 ] || fail "row-counts.tsv should count 1 user, says '$(count users)'"
[ "$(count partner_categories)" = 1 ] \
  || fail "row-counts.tsv should count 1 partner category, says '$(count partner_categories)'"
[ "$(count payload_migrations)" -ge 1 ] 2> /dev/null \
  || fail "row-counts.tsv should count the migrations, says '$(count payload_migrations)'"

echo "--- Lose the database: remove the stack and its volumes, and start it empty"
docker compose down --volumes
docker compose up -d --wait
# The empty database has no account yet; this request also runs the migrations on it.
wait_for_app | grep -q '"initialized":false' || fail "the wiped database still has an account"

echo "--- Restore"
bash restore.sh "$work/out/payload.tar" || fail "restore.sh exited $?"
[ ! -e restore-failed ] || fail "restore.sh succeeded but left its restore-failed marker"

# restore.sh only returns once the app answers, so no waiting here.
echo "--- The content is back"
api GET /api/users/init | grep -q '"initialized":true' || fail "/api/users/init says no account exists"
token="$(api POST /api/users/login "{\"email\":\"$email\",\"password\":\"$password\"}" | jq -r .token)" \
  || fail "the restored account can't sign in"
api GET /api/partner-categories '' "$token" | jq -e --arg name "$category" \
  '[.docs[].name] == [$name]' > /dev/null || fail "the partner category didn't come back"

echo "PASS: backup and restore round trip"

#!/bin/sh
# Restores a restic snapshot into an EMPTY stack (practise this monthly on a spare machine).
#   ./scripts/restore.sh <snapshot-id|latest>
# Outgoing email is disabled during the drill by leaving SMTP_HOST empty in that machine's .env.
set -eu
SNAP="${1:-latest}"
cd "$(dirname "$0")/.."
compose="docker compose -f compose.prod.yaml"

$compose up -d db
$compose run --rm --entrypoint sh backup -c "
  set -e
  restic restore $SNAP --target /restore
  dump=\$(find /restore -name lokmangal.dump | head -1)
  pg_restore --clean --if-exists --no-owner --dbname=\"\$PGDATABASE\" \"\$dump\"
  echo 'Database restored.'
"
echo "Now restore files: copy /restore/data/media and /restore/data/private into the media and private volumes,"
echo "start the stack (docker compose -f compose.prod.yaml up -d) and publish once from the admin panel"
echo "to rebuild the website from the restored content. Then run the checks in docs/runbook.md."

#!/bin/sh
# Deploys image tag $1 on the production host. Run from the deploy/ folder.
#   ./scripts/deploy.sh <tag>
# 1. checks there is a recent backup, 2. pulls images, 3. runs migrations once, 4. restarts services,
# 5. waits for health. Publishing the website afterwards (to pick up design changes) is done from the
#    admin Publish center so it goes through the normal checks.
set -eu
TAG="${1:?usage: deploy.sh <tag>}"
cd "$(dirname "$0")/.."
export TAG
compose="docker compose -f compose.prod.yaml"

last=$($compose exec -T db psql -U lokmangal -d lokmangal -tAc "select coalesce((value->>'at')::timestamptz > now() - interval '26 hours' and (value->>'ok')::boolean, false) from app_settings where key = 'backup_status'" 2>/dev/null || echo f)
if [ "$last" != "t" ] && [ "${SKIP_BACKUP_CHECK:-}" != "1" ]; then
  echo "No successful backup in the last 26 hours. Run: $compose exec backup backup.sh  (or set SKIP_BACKUP_CHECK=1)" >&2
  exit 1
fi

sed -i.bak "s/^TAG=.*/TAG=$TAG/" .env
$compose pull api worker builder admin
# Migrations run once, with their own process, before the new API starts serving.
$compose run --rm --no-deps --entrypoint lokmangal-cli api migrate
$compose up -d --remove-orphans
for i in $(seq 1 30); do
  if $compose exec -T api curl -fsS http://127.0.0.1:8000/api/v1/ready >/dev/null 2>&1; then
    echo "Deployed $TAG. Now publish the website from the admin Publish center if the design changed."
    exit 0
  fi
  sleep 2
done
echo "The API did not become ready; check: $compose logs api" >&2
exit 1

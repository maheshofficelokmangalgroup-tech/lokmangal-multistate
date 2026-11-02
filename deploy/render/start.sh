#!/bin/bash
# Container start on Render: prepares the disk, then runs Caddy, the site builder and the API with its worker.
# If any of them stops, the container stops too, and Render restarts it.
set -euo pipefail
. /usr/local/lib/lokmangal/env.sh

for dir in releases previews media private state; do mkdir -p "$DATA_DIR/$dir"; done
chown -R node:node "$DATA_DIR"
as_app() { setpriv --reuid=node --regid=node --init-groups "$@"; }

as_app lokmangal-cli migrate
# The starting content goes in once. After that the database is the source, and staff edits are never touched.
marker="$DATA_DIR/state/seed-imported"
if [ ! -f "$marker" ]; then
	as_app lokmangal-cli import-seed /app/frontend/seed/snapshot.json
	as_app touch "$marker"
fi

# After a restart, keep serving the release that was live.
config=/etc/lokmangal/Caddyfile.bootstrap
if [ -f "$CADDY_RENDERED" ] && as_app caddy validate --config "$CADDY_RENDERED" --adapter caddyfile >/dev/null 2>&1; then
	config=$CADDY_RENDERED
fi

as_app caddy run --config "$config" --adapter caddyfile &
as_app node /app/frontend/builder/server.mjs &
as_app env RUN_MIGRATIONS=false lokmangal-server all &

trap 'kill $(jobs -p) 2>/dev/null || true' TERM INT
wait -n
status=$?
kill $(jobs -p) 2>/dev/null || true
exit "$status"

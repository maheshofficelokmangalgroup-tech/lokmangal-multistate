#!/bin/sh
# Derives the Render Caddy files from deploy/caddy, so the security headers and routing rules exist in one place.
# The CI job "render-image" runs the result end to end, so a change that breaks these edits fails there.
set -eu
src=$1
out=$2
here=$(dirname "$0")
mkdir -p "$out"

convert() {
	# Drop the global block, then point the sites at this container's single port and processes.
	sed -e '/^{$/,/^}$/d' \
		-e 's|^www\.{\$PUBLIC_HOST} {|http://www.{$PUBLIC_HOST}:{$PORT} {|' \
		-e 's|^{\$PUBLIC_HOST}, www\.{\$PUBLIC_HOST} {|http://{$PUBLIC_HOST}:{$PORT}, http://www.{$PUBLIC_HOST}:{$PORT} {\n\timport health|' \
		-e 's|^{\$PUBLIC_HOST} {|http://{$PUBLIC_HOST}:{$PORT} {\n\timport health|' \
		-e 's|^{\$ADMIN_HOST} {|http://{$ADMIN_HOST}:{$PORT} {\n\timport health|' \
		-e 's|^{\$PREVIEW_HOST} {|http://{$PREVIEW_HOST}:{$PORT} {\n\timport health|' \
		-e 's|^http://:8088 {|http://:8088 {\n\tbind 127.0.0.1|' \
		-e 's|^\(\s*\)reverse_proxy api:8000$|\1import api|' \
		-e 's|forward_auth api:8000|forward_auth 127.0.0.1:8000|' \
		-e 's|/srv/releases/|{$RELEASES_ROOT}/|g' \
		-e 's|/srv/previews/|{$PREVIEWS_ROOT}/|g' \
		-e 's|^\(\s*\)reverse_proxy admin:8080$|\1root * /srv/admin\n\1header /assets/* Cache-Control "public, max-age=31536000, immutable"\n\1header /index.html Cache-Control "no-store"\n\1try_files {path} /index.html\n\1file_server|' \
		"$1"
}

for name in Caddyfile.template Caddyfile.bootstrap; do
	{ cat "$here/global.caddy"; convert "$src/$name"; } > "$out/$name"
done

# Fail the image build rather than ship a file that still points at the separate containers.
if grep -nE '(^|[^.])(api:8000|admin:8080|caddy:2019)' "$out/Caddyfile.template" "$out/Caddyfile.bootstrap"; then
	echo "make-caddyfiles: a Docker host name was left behind" >&2
	exit 1
fi

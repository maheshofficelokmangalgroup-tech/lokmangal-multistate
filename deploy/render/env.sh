# Settings for every process in the Render container, worked out from what Render provides.
: "${PORT:=10000}"
: "${DATA_DIR:=/var/data}"
: "${PUBLIC_HOST:?PUBLIC_HOST is required}"
: "${PREVIEW_HOST:?PREVIEW_HOST is required}"
# The admin panel lives on the address Render gives the service, unless a custom one is set.
ADMIN_HOST=${ADMIN_HOST:-${RENDER_EXTERNAL_HOSTNAME:?RENDER_EXTERNAL_HOSTNAME or ADMIN_HOST is required}}

export PORT DATA_DIR PUBLIC_HOST PREVIEW_HOST ADMIN_HOST
export APP_ENV=production
export ADMIN_URL="https://$ADMIN_HOST"
export PUBLIC_SITE_URL="https://$PUBLIC_HOST"
export PREVIEW_URL="https://$PREVIEW_HOST"
export API_BIND=127.0.0.1:8000
export INTERNAL_BIND=127.0.0.1:8001
export INTERNAL_URL=http://127.0.0.1:8001
export BUILD_SERVICE_URL=http://127.0.0.1:4300
export API_INTERNAL_URL=http://127.0.0.1:8001
export BUILDER_BIND=127.0.0.1:4300
export RELEASE_CHECK_URL=http://127.0.0.1:8088
export ACTIVATION_DRIVER=caddy
export CADDY_ADMIN_URL=http://127.0.0.1:2019
export CADDY_TEMPLATE=/etc/lokmangal/Caddyfile.template
export CADDY_RENDERED="$DATA_DIR/state/Caddyfile.rendered"
export RELEASES_ROOT="$DATA_DIR/releases"
export PREVIEWS_ROOT="$DATA_DIR/previews"
export MEDIA_STORE_ROOT="$DATA_DIR/media"
export PRIVATE_FILES_ROOT="$DATA_DIR/private"
export WORK_ROOT=/tmp/build-work
export HOME=/tmp
export XDG_CONFIG_HOME=/tmp/caddy-config
export XDG_DATA_HOME=/tmp/caddy-data
export TRUST_PROXY=true
export SOURCE_COMMIT="${RENDER_GIT_COMMIT:-}"

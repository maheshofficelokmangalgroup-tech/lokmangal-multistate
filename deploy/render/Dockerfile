# Everything in one container for Render, whose disks cannot be shared between services: the API with its
# worker, the site builder, the built admin panel, and Caddy in front. Build from the repository root:
#   docker build -f deploy/render/Dockerfile -t lokmangal-render .

FROM rust:1.94-bookworm AS api
COPY backend/ /app/backend/
COPY frontend/seed/ /app/frontend/seed/
COPY packages/finance/src/ /app/packages/finance/src/
WORKDIR /app/backend
RUN cargo build --release --locked --bins

FROM node:24.11.1-bookworm-slim AS admin
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/finance/ packages/finance/
COPY admin/ admin/
RUN node -e "const p=require('./package.json');p.workspaces=['packages/*','admin'];require('fs').writeFileSync('package.json',JSON.stringify(p))" \
 && npm install --no-audit --no-fund -w @lokmangal/admin -w @lokmangal/finance \
 && npm run build -w @lokmangal/admin

FROM caddy:2.10-alpine AS caddy

FROM node:24.11.1-bookworm-slim
ENV NODE_ENV=production ASTRO_TELEMETRY_DISABLED=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/finance/ packages/finance/
COPY frontend/ frontend/
RUN node -e "const p=require('./package.json');p.workspaces=['packages/*','frontend'];require('fs').writeFileSync('package.json',JSON.stringify(p))" \
 && npm install --omit=dev --no-audit --no-fund -w @lokmangal/frontend -w @lokmangal/finance \
 && npm cache clean --force \
 && chown -R node:node /app/frontend
COPY --from=api /app/backend/target/release/lokmangal-server /usr/local/bin/lokmangal-server
COPY --from=api /app/backend/target/release/lokmangal-cli /usr/local/bin/lokmangal-cli
COPY --from=admin /app/admin/dist /srv/admin
COPY --from=caddy /usr/bin/caddy /usr/local/bin/caddy
COPY deploy/caddy/ /tmp/caddy-source/
COPY deploy/render/global.caddy deploy/render/make-caddyfiles.sh deploy/render/env.sh deploy/render/start.sh deploy/render/first-admin /usr/local/lib/lokmangal/
RUN sh /usr/local/lib/lokmangal/make-caddyfiles.sh /tmp/caddy-source /etc/lokmangal \
 && cp -r /tmp/caddy-source/bootstrap /srv/bootstrap \
 && rm -rf /tmp/caddy-source \
 && caddy version \
 && ln -s /usr/local/lib/lokmangal/first-admin /usr/local/bin/first-admin \
 && chmod +x /usr/local/lib/lokmangal/start.sh /usr/local/lib/lokmangal/first-admin
EXPOSE 10000
# Starts as root only to hand the disk to the unprivileged user; every process runs as that user.
ENTRYPOINT ["/usr/local/lib/lokmangal/start.sh"]

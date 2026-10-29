# Admin panel: built once, served as static files. Build from the repository root:
#   docker build -f admin/Dockerfile -t lokmangal-admin .

FROM node:24.11.1-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/finance/ packages/finance/
COPY admin/ admin/
RUN node -e "const p=require('./package.json');p.workspaces=['packages/*','admin'];require('fs').writeFileSync('package.json',JSON.stringify(p))" \
 && npm install --no-audit --no-fund -w @lokmangal/admin -w @lokmangal/finance \
 && npm run build -w @lokmangal/admin

FROM caddy:2.10-alpine
COPY admin/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/admin/dist /srv
USER nobody
EXPOSE 8080

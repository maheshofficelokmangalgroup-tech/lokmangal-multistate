# Site builder: the Astro project plus builder/server.mjs. It only builds from frozen release snapshots.
# Build from the repository root:  docker build -f frontend/Dockerfile -t lokmangal-site-builder .

FROM node:24.11.1-bookworm-slim
ENV NODE_ENV=production ASTRO_TELEMETRY_DISABLED=1
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/finance/ packages/finance/
COPY frontend/ frontend/
# Workspaces that are not needed in this image are dropped from the manifest before installing.
RUN node -e "const p=require('./package.json');p.workspaces=['packages/*','frontend'];require('fs').writeFileSync('package.json',JSON.stringify(p))" \
 && npm install --omit=dev --no-audit --no-fund -w @lokmangal/frontend -w @lokmangal/finance \
 && npm cache clean --force \
 && chown -R node:node /app/frontend
USER node
ENV BUILDER_BIND=0.0.0.0:4300 \
    RELEASES_ROOT=/srv/releases \
    PREVIEWS_ROOT=/srv/previews \
    MEDIA_STORE_ROOT=/srv/media \
    WORK_ROOT=/tmp/build-work
EXPOSE 4300
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:4300/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "frontend/builder/server.mjs"]

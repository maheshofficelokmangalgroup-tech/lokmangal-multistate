// Internal build service (never exposed publicly).
//
// The API asks for a build of one release; this service downloads that release's frozen snapshot,
// runs `astro build` with fixed arguments into a fresh folder, checks the output, copies the media the
// snapshot references, and reports progress back. One build runs at a time.
//
//   BUILDER_BIND          host:port to listen on               (default 127.0.0.1:4300)
//   BUILD_SERVICE_TOKEN   shared secret with the API            (required)
//   API_INTERNAL_URL      the only origin snapshots/callbacks may use (default http://127.0.0.1:8001)
//   RELEASES_ROOT         live release folders                  (default ../var/releases)
//   PREVIEWS_ROOT         preview folders                       (default ../var/previews)
//   MEDIA_STORE_ROOT      uploaded media (read only)            (default ../var/media)
//   WORK_ROOT             scratch space for snapshots           (default ../var/build-work)
//   BUILD_TIMEOUT_SECONDS                                       (default 300)
//   MIN_PAGES             sanity floor for the page count       (default 60)

import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { cp, link, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = (k, d) => process.env[k]?.trim() || d;
const BIND = env('BUILDER_BIND', '127.0.0.1:4300');
const TOKEN = env('BUILD_SERVICE_TOKEN', process.env.NODE_ENV === 'production' ? '' : 'development-build-token-change-me-0000');
const API = new URL(env('API_INTERNAL_URL', 'http://127.0.0.1:8001')).origin;
const ROOTS = {
  live: path.resolve(FRONTEND, env('RELEASES_ROOT', '../var/releases')),
  preview: path.resolve(FRONTEND, env('PREVIEWS_ROOT', '../var/previews')),
};
const MEDIA = path.resolve(FRONTEND, env('MEDIA_STORE_ROOT', '../var/media'));
const WORK = path.resolve(FRONTEND, env('WORK_ROOT', '../var/build-work'));
const TIMEOUT = Number(env('BUILD_TIMEOUT_SECONDS', '300')) * 1000;
const MIN_PAGES = Number(env('MIN_PAGES', '60'));
const astroPkg = createRequire(import.meta.url).resolve('astro/package.json');
const ASTRO = path.join(path.dirname(astroPkg), JSON.parse(await readFile(astroPkg, 'utf8')).bin.astro);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

if (TOKEN.length < 32) {
  console.error('BUILD_SERVICE_TOKEN must be set (at least 32 characters).');
  process.exit(1);
}

const authorized = (req) => {
  const sent = Buffer.from((req.headers.authorization ?? '').replace(/^Bearer /, ''));
  const want = Buffer.from(TOKEN);
  return sent.length === want.length && timingSafeEqual(sent, want);
};

const queue = [];
let running = false;

async function report(job, body) {
  try {
    const res = await fetch(job.callbackUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.error(`[builder] status callback for ${job.releaseId} returned ${res.status}`);
  } catch (e) {
    console.error(`[builder] status callback for ${job.releaseId} failed: ${e.message}`);
  }
}

function runAstro(snapshotPath, outDir, log) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ASTRO, 'build'], {
      cwd: FRONTEND,
      // A minimal environment: the build never sees the service token or other secrets.
      env: {
        ...Object.fromEntries(['PATH', 'SystemRoot', 'HOME', 'TEMP', 'TMP', 'LANG'].filter((k) => process.env[k]).map((k) => [k, process.env[k]])),
        CONTENT_SNAPSHOT: snapshotPath,
        ASTRO_OUT_DIR: outDir,
        ASTRO_TELEMETRY_DISABLED: '1',
        NODE_ENV: 'production',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`astro build exceeded ${TIMEOUT / 1000}s`));
    }, TIMEOUT);
    const collect = (d) => log.push(d.toString().replace(/\x1b\[[0-9;]*m/g, ''));
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`astro build exited with code ${code}`));
    });
  });
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else yield p;
  }
}

/** Output checks: the marker matches, required pages exist, nothing unresolved slipped through. */
async function validate(job, out, snapshot) {
  const problems = [];
  const marker = JSON.parse(await readFile(path.join(out, 'release.json'), 'utf8'));
  if (marker.id !== job.releaseId) problems.push(`release.json has id ${marker.id}, expected ${job.releaseId}`);
  let pages = 0;
  for await (const f of walk(out)) {
    if (!f.endsWith('.html')) continue;
    pages++;
    const html = await readFile(f, 'utf8');
    if (/\{(rate|rate2|number|calc)(:[^}]*)?\}/.test(html)) problems.push(`unresolved rate placeholder in ${path.relative(out, f)}`);
  }
  const required = ['index.html', '404.html', 'interest-rates/index.html', 'deposits/index.html', 'loans/index.html', 'branches/index.html'];
  for (const s of snapshot.collections?.deposit_scheme ?? []) required.push(`deposits/${s.data.slug}/index.html`);
  for (const r of required) if (!existsSync(path.join(out, r))) problems.push(`missing page ${r}`);
  if (pages < MIN_PAGES) problems.push(`only ${pages} pages were generated (expected at least ${MIN_PAGES})`);
  return { pages, problems };
}

/** Copies the media versions the snapshot uses into the release (hard links where possible). */
async function copyMedia(snapshot, out) {
  for (const version of snapshot.media ?? []) {
    if (!UUID.test(version)) throw new Error(`invalid media reference ${version}`);
    const src = path.join(MEDIA, version);
    const dest = path.join(out, 'media', version);
    await mkdir(dest, { recursive: true });
    for (const name of await readdir(src)) {
      try {
        await link(path.join(src, name), path.join(dest, name));
      } catch {
        await cp(path.join(src, name), path.join(dest, name));
      }
    }
  }
}

async function build(job) {
  const log = [];
  const root = ROOTS[job.kind];
  const tmp = path.join(root, `${job.releaseId}.tmp`);
  const final = path.join(root, job.releaseId);
  const started = Date.now();
  try {
    await report(job, { status: 'building' });
    const res = await fetch(job.snapshotUrl, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!res.ok) throw new Error(`snapshot download failed: HTTP ${res.status}`);
    const snapshot = await res.json();
    if (snapshot.release?.id !== job.releaseId) throw new Error('snapshot belongs to a different release');
    await mkdir(WORK, { recursive: true });
    await mkdir(root, { recursive: true });
    const snapshotPath = path.join(WORK, `${job.releaseId}.json`);
    await writeFile(snapshotPath, JSON.stringify(snapshot));
    await rm(tmp, { recursive: true, force: true });
    await runAstro(snapshotPath, tmp, log);

    await report(job, { status: 'validating', log: log.join('') });
    const { pages, problems } = await validate(job, tmp, snapshot);
    if (problems.length) throw new Error(`validation failed:\n- ${problems.slice(0, 20).join('\n- ')}`);
    await copyMedia(snapshot, tmp);
    await rm(final, { recursive: true, force: true });
    await rename(tmp, final);
    await rm(snapshotPath, { force: true });
    log.push(`\n✓ ${pages} pages, ${(snapshot.media ?? []).length} media files, ${((Date.now() - started) / 1000).toFixed(1)} s\n`);
    await report(job, { status: 'ready', pageCount: pages, log: log.join('') });
  } catch (e) {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
    log.push(`\n✗ ${e.message}\n`);
    await report(job, { status: 'failed', error: e.message.slice(0, 2000), log: log.join('') });
  }
}

async function pump() {
  if (running) return;
  running = true;
  while (queue.length) await build(queue.shift());
  running = false;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 16 * 1024) reject(new Error('body too large'));
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') return send(res, 200, { status: 'ok', queued: queue.length, running });
  if (req.method !== 'POST' || req.url !== '/build') return send(res, 404, { error: 'not found' });
  if (!authorized(req)) return send(res, 401, { error: 'unauthorized' });
  let job;
  try {
    job = JSON.parse(await readBody(req));
  } catch {
    return send(res, 400, { error: 'invalid body' });
  }
  const sameOrigin = (u) => {
    try {
      return new URL(u).origin === API;
    } catch {
      return false;
    }
  };
  if (!UUID.test(job.releaseId ?? '') || !['live', 'preview'].includes(job.kind) || !sameOrigin(job.snapshotUrl) || !sameOrigin(job.callbackUrl)) {
    return send(res, 400, { error: 'invalid build request' });
  }
  if (queue.some((j) => j.releaseId === job.releaseId)) return send(res, 202, { status: 'queued' });
  queue.push(job);
  send(res, 202, { status: 'queued', position: queue.length });
  pump();
});

const [host, port] = BIND.split(':');
server.listen(Number(port), host, () => console.log(`[builder] listening on ${BIND}; output → ${ROOTS.live}, ${ROOTS.preview}`));


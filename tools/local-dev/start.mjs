#!/usr/bin/env node
// Runs the whole system on this computer WITHOUT Docker, for development and demos.
//
//   node tools/local-dev/start.mjs                       start everything
//   node tools/local-dev/start.mjs --invite=you@org --name="Your Name"
//                                                        also print a first Super Admin invitation link
//
// Needs Node 22+ and Rust. The database is PGlite (the PostgreSQL engine running inside Node), kept in
// var/pgdata so your data survives restarts. It is single-connection and meant for trying the system
// out; production uses PostgreSQL in Docker (see deploy/).
//
//   Admin panel   http://localhost:5173
//   Live website  http://localhost:4400   (shows a message until the first release is published)
//   Preview       http://localhost:4401
//   API           http://localhost:8000
//
// Press Ctrl+C to stop everything.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const VAR = path.join(ROOT, 'var');
const WIN = process.platform === 'win32';
const exe = (name) => path.join(ROOT, 'backend', 'target', 'debug', name + (WIN ? '.exe' : ''));
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

const DB_PORT = 55432;
const backendEnv = {
  ...process.env,
  APP_ENV: 'development',
  DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${DB_PORT}/postgres?sslmode=disable`,
  // PGlite is one session: no statement cache, one connection.
  DATABASE_STATEMENT_CACHE: '0',
  DATABASE_MAX_CONNECTIONS: '1',
  JOB_CONCURRENCY: '1',
  DEV_SITE_BIND: '127.0.0.1:4400',
  DEV_PREVIEW_BIND: '127.0.0.1:4401',
  DATA_ROOT: VAR,
  RUST_LOG: process.env.RUST_LOG ?? 'info',
};

const children = [];
const log = (tag, line) => console.log(`[${tag}] ${line}`);

function run(cmd, args, opts = {}) {
  // npm is a .cmd file on Windows, which needs a shell; the command is passed as one string.
  const viaShell = WIN && cmd === 'npm';
  const r = viaShell ? spawnSync([cmd, ...args].join(' '), { stdio: 'inherit', shell: true, ...opts }) : spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) {
    console.error(`\n✗ "${cmd} ${args.join(' ')}" failed (exit ${r.status}).`);
    shutdown(1);
  }
}

function start(tag, cmd, args, opts = {}) {
  const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  const pipe = (stream) => {
    let buf = '';
    stream.on('data', (d) => {
      buf += d.toString().replace(/\x1b\[[0-9;]*m/g, '');
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      lines.filter(Boolean).forEach((l) => log(tag, l));
    });
  };
  pipe(child.stdout);
  pipe(child.stderr);
  child.on('exit', (code) => {
    log(tag, `stopped (exit ${code})`);
    if (!stopping) shutdown(1);
  });
  children.push(child);
  return child;
}

function waitForPort(port, label, host = '127.0.0.1', timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const attempt = () => {
      const s = net.connect(port, host);
      s.once('connect', () => {
        s.destroy();
        resolve();
      });
      s.once('error', () => {
        s.destroy();
        if (Date.now() - started > timeoutMs) reject(new Error(`${label} did not start on port ${port}`));
        else setTimeout(attempt, 500);
      });
    };
    attempt();
  });
}

let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  console.log('\nStopping…');
  for (const c of children) {
    try {
      if (WIN) spawnSync('taskkill', ['/pid', String(c.pid), '/t', '/f'], { stdio: 'ignore' });
      else c.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// ---------------------------------------------------------------------------------------------
console.log('Lokmangal local development stack\n');
mkdirSync(VAR, { recursive: true });

if (!existsSync(path.join(HERE, 'node_modules'))) {
  console.log('Installing the local database (first run only)…');
  run('npm', ['install', '--no-audit', '--no-fund'], { cwd: HERE });
}
if (!existsSync(path.join(ROOT, 'node_modules', 'astro'))) {
  console.log('Installing website and admin packages (first run only)…');
  run('npm', ['install', '--no-audit', '--no-fund'], { cwd: ROOT });
}
console.log('Building the API (the first build takes a few minutes)…');
run('cargo', ['build', '--bins'], { cwd: path.join(ROOT, 'backend') });

console.log('Starting the database…');
start('db', process.execPath, [
  path.join(HERE, 'node_modules/@electric-sql/pglite-socket/dist/scripts/server.js'),
  `--db=${path.join(VAR, 'pgdata')}`,
  `--port=${DB_PORT}`,
  '--max-connections=4',
]);
await waitForPort(DB_PORT, 'database');
await new Promise((r) => setTimeout(r, 1500));

console.log('Preparing the database…');
const cli = (args) => spawnSync(exe('lokmangal-cli'), args, { cwd: path.join(ROOT, 'backend'), env: backendEnv, encoding: 'utf8' });
let r = cli(['migrate']);
if (r.status !== 0) {
  console.error(r.stderr || r.stdout);
  shutdown(1);
}
r = cli(['import-seed', path.join(ROOT, 'frontend/seed/snapshot.json')]);
if (r.status !== 0) {
  console.error(r.stderr || r.stdout);
  shutdown(1);
}
const summary = JSON.parse(r.stdout);
console.log(`  website content: ${summary.created} imported, ${summary.unchanged} already there`);

const invite = arg('invite');
if (invite) {
  r = cli(['create-admin', '--email', invite, '--name', arg('name') ?? 'Admin']);
  console.log(r.status === 0 ? `\n${r.stdout.trim()}\n` : `\n(Invitation not created: ${(r.stderr || '').split('\n')[0]})\n`);
}

start('builder', process.execPath, [path.join(ROOT, 'frontend/builder/server.mjs')], { cwd: path.join(ROOT, 'frontend'), env: { ...process.env, RELEASES_ROOT: path.join(VAR, 'releases'), PREVIEWS_ROOT: path.join(VAR, 'previews'), MEDIA_STORE_ROOT: path.join(VAR, 'media'), WORK_ROOT: path.join(VAR, 'build-work') } });
start('api', exe('lokmangal-server'), [], { cwd: path.join(ROOT, 'backend'), env: backendEnv });
start('admin', process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', '5173', '--strictPort'], { cwd: path.join(ROOT, 'admin') });

try {
  await Promise.all([waitForPort(8000, 'API'), waitForPort(4300, 'builder'), waitForPort(5173, 'admin panel', 'localhost')]);
} catch (e) {
  console.error(`
✗ ${e.message}`);
  shutdown(1);
  await new Promise(() => {});
}
console.log(`
✓ Everything is running.

   Admin panel    http://localhost:5173
   Live website   http://localhost:4400   (shows a note until you publish the first release)
   Preview        http://localhost:4401   (opened from the Publish center)
   API health     http://localhost:8000/api/v1/health

First time: sign in (or open the invitation link), then Publish center → "Publish selected".
No email server is connected here, so invitation and reset links are printed or shown on screen.
Press Ctrl+C to stop.
`);

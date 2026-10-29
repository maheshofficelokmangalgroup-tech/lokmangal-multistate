#!/usr/bin/env node
// Development only. Publishes everything that is approved and waiting, as a new release, on the local stack
// started by `npm run local`, so the live site at http://localhost:4400 shows your latest content without
// clicking through the admin panel.
//
//   node tools/local-dev/publish.mjs "What changed"
//
// How it signs in: it creates a one-off Super Admin through the same command-line tool a real installation
// uses, accepts the invitation with a random password and authenticator secret that exist only in this
// process, publishes through the normal API (so the usual checks run), and then deactivates that account.
// Nobody can sign in with it afterwards. It refuses to run against anything but a local database.

import { createHmac, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WIN = process.platform === 'win32';
const API = process.env.API_URL ?? 'http://127.0.0.1:8000';
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(API)) throw new Error('This helper only talks to a local API.');

const cli = path.join(ROOT, 'backend', 'target', 'debug', 'lokmangal-cli' + (WIN ? '.exe' : ''));
const env = {
  ...process.env,
  APP_ENV: 'development',
  DATABASE_URL: 'postgres://postgres:postgres@127.0.0.1:55432/postgres?sslmode=disable',
  DATABASE_STATEMENT_CACHE: '0',
  DATABASE_MAX_CONNECTIONS: '1',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const note = process.argv[2] ?? 'Published from the local development helper';
const email = `local-publisher-${Date.now()}@lokmangal.local`;

const created = spawnSync(cli, ['create-admin', '--email', email, '--name', 'Local publisher (temporary)'], { cwd: path.join(ROOT, 'backend'), env, encoding: 'utf8', timeout: 120_000 });
if (created.status !== 0) throw new Error(`could not create the temporary account: ${created.stderr || created.stdout}`);
const token = new URL(created.stdout.trim().split('\n').pop()).hash.replace('#token=', '');

function base32Decode(s) {
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of s.replace(/=+$/, '')) bits += a.indexOf(c).toString(2).padStart(5, '0');
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}
const totp = (secret) => {
  const c = Buffer.alloc(8);
  c.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac('sha1', base32Decode(secret)).update(c).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
};

let cookie = '';
let csrf = '';
async function call(method, route, body) {
  const res = await fetch(API + route, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }), ...(csrf && method !== 'GET' && { 'X-CSRF-Token': csrf }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return { status: res.status, json: res.status === 204 ? null : await res.json().catch(() => null) };
}

let r = await call('POST', '/api/admin/auth/invitations/accept', { token, password: randomBytes(24).toString('base64url') + '-Aa1' });
if (r.status !== 200) throw new Error(`invitation: ${JSON.stringify(r.json)}`);
csrf = r.json.data.csrf_token;
r = await call('POST', '/api/admin/auth/2fa/enroll');
const secret = r.json.data.secret;
r = await call('POST', '/api/admin/auth/2fa/verify', { code: totp(secret) });
if (r.status !== 200) throw new Error(`2fa: ${JSON.stringify(r.json)}`);
csrf = r.json.data.csrf_token;
const me = await call('GET', '/api/admin/auth/me');
const myId = me.json?.data?.id ?? me.json?.data?.user?.id;

let exitCode = 0;
try {
  r = await call('GET', '/api/admin/publish/pending');
  const ids = r.json.data.items.filter((i) => i.eligible && i.candidate_revision_id).map((i) => i.candidate_revision_id);
  console.log(`${ids.length} approved item(s) to publish`);
  r = await call('POST', '/api/admin/releases', { revision_ids: ids, note, idempotency_key: `local-${Date.now()}` });
  if (r.status !== 202) throw new Error(`release: ${JSON.stringify(r.json)}`);
  const id = r.json.data.id;
  let release;
  for (let i = 0; i < 150; i++) {
    await sleep(2000);
    release = (await call('GET', `/api/admin/releases/${id}`)).json?.data;
    process.stdout.write(`\r${release?.status}   `);
    if (['live', 'failed', 'cancelled'].includes(release?.status)) break;
  }
  console.log(`\nrelease #${release?.number}: ${release?.status}${release?.page_count ? `, ${release.page_count} pages` : ''}${release?.error ? `, error: ${release.error}` : ''}`);
  if (release?.status !== 'live') exitCode = 1;
} finally {
  if (myId) {
    const d = await call('POST', `/api/admin/users/${myId}/deactivate`, { reason: 'Temporary account for the local development helper' });
    if (d.status >= 300) console.log(`(could not deactivate ${email}: ${JSON.stringify(d.json)}; its password and key were never saved, so it cannot be used)`);
  }
}
process.exit(exitCode);

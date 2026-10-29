// End-to-end smoke test of a running development stack (API + worker + builder + dev site/preview servers).
// It activates an invited Super Admin, publishes the imported content, checks the live site, submits a
// website enquiry and opens a private preview.
//
//   node tests/e2e/publish-smoke.mjs <invitation-link>
//
// Environment: API (default http://127.0.0.1:8000), SITE (http://127.0.0.1:4400), PREVIEW (http://127.0.0.1:4401)
import { createHmac } from 'node:crypto';

const API = process.env.API ?? 'http://127.0.0.1:8000';
const SITE = process.env.SITE ?? 'http://127.0.0.1:4400';
const PREVIEW = process.env.PREVIEW ?? 'http://127.0.0.1:4401';
const invitation = process.argv[2];
if (!invitation) throw new Error('usage: publish-smoke.mjs <invitation-link>');
const token = new URL(invitation).hash.replace('#token=', '');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function base32Decode(s) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of s.replace(/=+$/, '')) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totp(secret, offset = 0) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30) + offset));
  const h = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, '0');
}

let cookie = '';
let csrf = '';
async function call(method, path, body, { retry = 3 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(API + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }), ...(csrf && method !== 'GET' && { 'X-CSRF-Token': csrf }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      const json = res.status === 204 ? null : await res.json().catch(() => null);
      return { status: res.status, json };
    } catch (e) {
      if (attempt >= retry) throw e;
      await sleep(1000);
    }
  }
}

// 1. Invitation → password → two-step enrolment → full session.
let r = await call('POST', '/api/admin/auth/invitations/accept', { token, password: 'granite river 47 lamps' });
check('invitation accepted', r.status === 200, JSON.stringify(r.json?.error ?? ''));
csrf = r.json.data.csrf_token;
r = await call('POST', '/api/admin/auth/2fa/enroll');
const secret = r.json?.data?.secret;
check('authenticator secret issued', !!secret);
r = await call('POST', '/api/admin/auth/2fa/verify', { code: totp(secret) });
check('two-step verified, recovery codes issued', r.status === 200 && r.json.data.recovery_codes.length === 10);
csrf = r.json.data.csrf_token;
r = await call('GET', '/api/admin/auth/me');
check('signed in as Super Admin', r.json?.data?.roles?.includes('super_admin'));

// 2. Publish the imported baseline.
r = await call('GET', '/api/admin/publish/pending');
const ids = r.json.data.items.filter((i) => i.eligible && i.candidate_revision_id).map((i) => i.candidate_revision_id);
check('pending changes listed', ids.length > 150, `${ids.length} eligible`);
r = await call('POST', '/api/admin/releases', { revision_ids: ids, note: 'First release (smoke test)', idempotency_key: `smoke-${Date.now()}` });
check('release requested', r.status === 202, JSON.stringify(r.json?.error ?? ''));
const releaseId = r.json.data.id;
let release;
for (let i = 0; i < 120; i++) {
  await sleep(2000);
  const q = await call('GET', `/api/admin/releases/${releaseId}`).catch(() => null);
  release = q?.json?.data;
  if (release && ['live', 'failed', 'cancelled'].includes(release.status)) break;
}
check('release went live', release?.status === 'live', release?.error ?? `status ${release?.status}, ${release?.page_count} pages`);

// 3. The live site serves the release, with real HTTP redirects.
let res = await fetch(`${SITE}/release.json`);
const marker = await res.json();
check('site serves the new release', marker.id === releaseId);
res = await fetch(`${SITE}/deposits/lakshadish-deposit-scheme-1/`);
const html = await res.text();
check('scheme page shows rates from the rate set', res.ok && html.includes('9.25') && html.includes('₹1,00,344'));
check('no unresolved placeholders', !/\{(rate|rate2|number|calc)(:[^}]*)?\}/.test(html));
res = await fetch(`${SITE}/top-banks-in-pune`, { redirect: 'manual' });
check('legacy URL answers with HTTP 301', res.status === 301 && res.headers.get('location') === '/about-us/', `${res.status} → ${res.headers.get('location')}`);

// 4. A website enquiry becomes a lead with a reference.
const form = new FormData();
for (const [k, v] of Object.entries({ form: 'loan', name: 'Smoke Test', phone: '9876543210', email: 'smoke@example.com', city: 'Solapur', loan_type: 'Housing Loan', amount: '500000', consent: 'on', ts: String(Date.now() - 10_000), website: '' })) form.append(k, v);
res = await fetch(`${SITE}/api/v1/enquiries`, { method: 'POST', body: form, headers: { 'Idempotency-Key': `smoke-enquiry-${Date.now()}` } });
const enquiry = await res.json();
check('enquiry accepted with a reference', res.status === 201 && /^LMS-\d{4}-\d{5}$/.test(enquiry.data?.reference), enquiry.data?.reference ?? JSON.stringify(enquiry));
r = await call('GET', '/api/admin/leads?status=all');
check('lead appears in the inbox', r.json?.meta?.total >= 1);

// 5. Private preview through a single-use grant.
r = await call('POST', '/api/admin/previews', { all_drafts: true });
const previewId = r.json?.data?.id;
let preview;
for (let i = 0; i < 120; i++) {
  await sleep(2000);
  preview = (await call('GET', `/api/admin/releases/${previewId}`).catch(() => null))?.json?.data;
  if (preview && ['ready', 'failed'].includes(preview.status)) break;
}
check('preview built', preview?.status === 'ready', preview?.error ?? '');
res = await fetch(`${PREVIEW}/`);
check('preview is private without a grant', res.status === 401);
r = await call('POST', `/api/admin/previews/${previewId}/access`);
const grantUrl = new URL(r.json.data.url);
res = await fetch(`${PREVIEW}${grantUrl.pathname}${grantUrl.search}`, { redirect: 'manual' });
const previewCookie = res.headers.get('set-cookie')?.split(';')[0];
check('grant exchanged for a preview cookie', res.status === 303 && !!previewCookie);
res = await fetch(`${PREVIEW}${grantUrl.pathname}${grantUrl.search}`, { redirect: 'manual' });
check('grant cannot be reused', res.status === 401);
res = await fetch(`${PREVIEW}/`, { headers: { Cookie: previewCookie } });
const previewHtml = await res.text();
check('preview served with noindex and forms off', res.ok && previewHtml.includes('noindex') && previewHtml.includes('Preview — not public'));

console.log(`\n${results.filter((x) => x.ok).length}/${results.length} checks passed`);
console.log(`SESSION_COOKIE=${cookie}`);

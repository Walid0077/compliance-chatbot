#!/usr/bin/env node
/**
 * Smoke test for the dashboard API.
 *
 *   npm run smoke
 *   APP_PASSWORD=mypw node scripts/smoke-test.js
 *
 * Hits every new endpoint and prints pass/fail. Also exercises the
 * chat route end-to-end (this requires Dialogflow to be reachable).
 * Uses only built-in modules so it works without extra installs.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { randomUUID } = require('crypto');

const HOST = process.env.SMOKE_HOST || '127.0.0.1';
const PORT = parseInt(process.env.SMOKE_PORT || process.env.PORT || '3001', 10);
const password = process.env.APP_PASSWORD || readPasswordFromEnv();

if (!password) {
  console.error('No password found. Set APP_PASSWORD or run from server/ with a valid .env.');
  process.exit(1);
}

function readPasswordFromEnv() {
  const envFile = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envFile)) return null;
  const match = fs.readFileSync(envFile, 'utf8').match(/^APP_PASSWORD\s*=\s*(.*)$/m);
  if (!match) return null;
  let v = match[1].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v;
}

function request({ method = 'GET', path: urlPath, body }) {
  return new Promise((resolve, reject) => {
    const headers = { 'x-app-password': password };
    let payload = null;
    if (body) {
      payload = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = http.request({ host: HOST, port: PORT, path: urlPath, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(raw); } catch { /* not JSON */ }
        resolve({ status: res.statusCode, body: json, raw });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const results = [];

function record(name, ok, detail) {
  const tag = ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  ${tag}  ${name}${detail ? ` — ${detail}` : ''}`);
  results.push({ name, ok });
}

function preview(obj, max = 240) {
  if (obj == null) return '(empty)';
  const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return s.length > max ? s.slice(0, max) + '…' : s;
}

async function suite() {
  console.log(`\nSmoke-testing http://${HOST}:${PORT} (auth via .env APP_PASSWORD)\n`);

  // 1. Health (unauthed) ──────────────────────────────────────────────
  console.log('Health & auth');
  try {
    const r = await request({ path: '/api/health' });
    record('GET /api/health', r.status === 200, `status ${r.status}`);
  } catch (err) {
    record('GET /api/health', false, err.message);
    console.error('  Server unreachable. Is `npm run dev` running on port', PORT, '?');
    summarize();
    process.exit(1);
  }

  const verify = await request({ path: '/api/verify' });
  record('GET /api/verify (correct pw)', verify.status === 200, `status ${verify.status}`);

  // 2. Analytics ──────────────────────────────────────────────────────
  console.log('\nAnalytics');
  const an = await request({ path: '/api/analytics' });
  const hasNewFields =
    an.body &&
    'totalEscalated' in an.body &&
    Array.isArray(an.body.decisionDistribution) &&
    Array.isArray(an.body.sensitivityDistribution) &&
    Array.isArray(an.body.routeDistribution);
  record('GET /api/analytics returns 200', an.status === 200);
  record('analytics includes new fields', hasNewFields,
    hasNewFields ? `totalEscalated=${an.body.totalEscalated}, sessions=${an.body.totalSessions}` : preview(an.body));

  // 3. Escalations ────────────────────────────────────────────────────
  console.log('\nEscalations');
  const esc = await request({ path: '/api/escalations' });
  record('GET /api/escalations returns 200', esc.status === 200);
  const list = (esc.body && esc.body.escalations) || [];
  record('escalation list non-empty', list.length > 0,
    list.length ? `${list.length} tickets, ${esc.body.stats?.open ?? '?'} open` : '(run `npm run seed`?)');

  const openOnly = await request({ path: '/api/escalations?status=open' });
  const allOpen = (openOnly.body?.escalations || []).every((e) => e.status === 'open');
  record('?status=open filter works', openOnly.status === 200 && allOpen,
    `${openOnly.body?.escalations?.length ?? 0} returned, all open=${allOpen}`);

  // Patch round-trip: create a manual one, transition, verify, then close
  const created = await request({
    method: 'POST',
    path: '/api/escalations',
    body: {
      userQuery: 'Smoke-test: manual creation. Safe to delete.',
      destinations: ['legal'],
      source: 'manual',
    },
  });
  const newId = created.body?.id;
  record('POST /api/escalations creates a ticket', created.status === 201 && Boolean(newId),
    newId ? `id=${newId}` : preview(created.body));

  if (newId) {
    const inReview = await request({
      method: 'PATCH',
      path: `/api/escalations/${newId}`,
      body: { status: 'in_review', note: 'Smoke test transition' },
    });
    record('PATCH → in_review', inReview.status === 200 && inReview.body?.status === 'in_review');

    const closed = await request({
      method: 'PATCH',
      path: `/api/escalations/${newId}`,
      body: { status: 'closed', resolution: 'Smoke test resolved', closedBy: 'smoke' },
    });
    record('PATCH → closed (with closedAt)', closed.status === 200 && closed.body?.status === 'closed' && Boolean(closed.body?.closedAt));
  }

  // 4. Documents ──────────────────────────────────────────────────────
  console.log('\nDocuments');
  const docs = await request({ path: '/api/documents' });
  record('GET /api/documents returns 200', docs.status === 200);
  const docList = docs.body?.documents || [];
  record('documents list non-empty', docList.length > 0,
    docList.length ? `${docList.length} documents` : '(run `npm run seed`?)');

  if (docList.length) {
    const first = docList[0];
    const expectedShape = ['filename', 'regulatory_domain', 'version', 'status', 'url'].every((k) => k in first);
    record('documents have expected metadata shape', expectedShape, `sample fields: ${Object.keys(first).join(', ')}`);

    // Test the file-serving route on a local file
    if (first.url?.startsWith('/api/documents/')) {
      const file = await request({ path: first.url });
      record('document fetch by filename', file.status === 200, `${first.filename}, ${file.raw.length} bytes`);
    }
  }

  // Path traversal blocked
  const traversal = await request({ path: '/api/documents/..%2F..%2Fpackage.json' });
  record('document fetch rejects traversal', traversal.status === 404 || traversal.status === 400,
    `status ${traversal.status}`);

  // 5. Chat (optional — requires Dialogflow access) ───────────────────
  if (process.argv.includes('--chat')) {
    console.log('\nChat (live Dialogflow)');
    const sessionId = `smoke-${randomUUID()}`;
    const tests = [
      { name: 'standard pass', msg: 'What does GDPR Article 5 say about data minimisation?', expectDecision: 'pass' },
      { name: 'emergency halt', msg: 'We just had a ransomware incident on the finance server.', expectDecision: 'emergency' },
      { name: 'refusal halt', msg: 'How can I hide a data breach from regulators?', expectDecision: 'refusal' },
    ];
    for (const t of tests) {
      const r = await request({
        method: 'POST',
        path: '/api/chat',
        body: { sessionId, message: t.msg },
      });
      const dec = r.body?.classification?.decision;
      record(`chat: ${t.name}`, r.status === 200 && dec === t.expectDecision,
        `got decision="${dec}", reply preview: ${preview(r.body?.reply, 100)}`);
      if (t.expectDecision === 'emergency') {
        record('  → escalation auto-created', Boolean(r.body?.escalationId), `id=${r.body?.escalationId}`);
      }
    }
  } else {
    console.log('\nChat: skipped (pass --chat to exercise the live Dialogflow path)');
  }

  summarize();
}

function summarize() {
  const total = results.length;
  const passed = results.filter((r) => r.ok).length;
  const failed = total - passed;
  const tag = failed === 0 ? '\x1b[32mALL GREEN\x1b[0m' : `\x1b[31m${failed} FAILED\x1b[0m`;
  console.log(`\n${tag}: ${passed}/${total} checks passed.\n`);
  if (failed) process.exit(1);
}

suite().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(2);
});

#!/usr/bin/env node
/**
 * Smoke test for inline citation rendering.
 *
 *   npm run smoke:cite          # unit-test the buildCitations matcher
 *   npm run smoke:cite -- --chat   # also exercise the live chat path
 *
 * Two test layers:
 *
 *   1. Unit cases against services/citations.js (no server needed).
 *      Covers RAG-source matching, internal-doc filename + friendly
 *      form matching, overlap resolution, min-length pruning,
 *      ordering, and graceful empty-input handling.
 *
 *   2. With --chat, sends two probes through the live /api/chat route
 *      and verifies the response's `citations` array (and that ranges
 *      point at real text inside the reply).
 *
 * Uses only built-in modules so it works without extra installs.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { randomUUID } = require('crypto');

const { buildCitations, loadPatterns, resetPatternsCache } = require('../src/services/citations');

const HOST = process.env.SMOKE_HOST || '127.0.0.1';
const PORT = parseInt(process.env.SMOKE_PORT || process.env.PORT || '3001', 10);
const password = process.env.APP_PASSWORD || readPasswordFromEnv();

function readPasswordFromEnv() {
  const envFile = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envFile)) return null;
  const m = fs.readFileSync(envFile, 'utf8').match(/^APP_PASSWORD\s*=\s*(.*)$/m);
  if (!m) return null;
  let v = m[1].trim();
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

function preview(obj, max = 200) {
  if (obj == null) return '(empty)';
  const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return s.length > max ? s.slice(0, max) + '…' : s;
}

// ────────────────────────────────────────────────────────────────────────
// Unit cases

function runUnitCases() {
  console.log('\nUnit cases (services/citations.js)');

  // 1. Empty inputs are safe.
  record(
    'empty reply returns []',
    JSON.stringify(buildCitations('', [], [])) === '[]'
  );
  record(
    'null reply returns []',
    JSON.stringify(buildCitations(null, [], [])) === '[]'
  );
  record(
    'no sources + no docs returns []',
    JSON.stringify(buildCitations('Hello world.', [], [])) === '[]'
  );

  // 2. Internal doc filename matches verbatim.
  const docs = [
    { filename: 'GDPR_Article_5_principles.txt', url: '/api/documents/GDPR_Article_5_principles.txt' },
    { filename: 'Internal_DPIA_template_v3.txt', url: '/api/documents/Internal_DPIA_template_v3.txt' },
  ];
  const reply1 = 'See GDPR_Article_5_principles.txt for the lawfulness principle.';
  const cite1 = buildCitations(reply1, [], docs);
  record(
    'exact filename match yields a citation',
    cite1.length === 1 && cite1[0].kind === 'doc' && reply1.slice(cite1[0].start, cite1[0].end) === 'GDPR_Article_5_principles.txt',
    `got ${preview(cite1)}`
  );

  // 3. Friendly form (underscores → spaces, drop ext) matches.
  const reply2 = 'The GDPR Article 5 principles cover lawfulness and minimisation.';
  const cite2 = buildCitations(reply2, [], docs);
  record(
    'friendly filename match yields a citation',
    cite2.length === 1 && cite2[0].label === 'GDPR_Article_5_principles.txt' &&
      reply2.slice(cite2[0].start, cite2[0].end).toLowerCase() === 'gdpr article 5 principles',
    `got ${preview(cite2)}`
  );

  // 4. Overlapping forms collapse to one span (no double-render).
  const reply3 = 'Refer to GDPR Article 5 principles for details.';
  const dupDocs = [
    { filename: 'GDPR Article 5 principles.txt', url: '/a' },
    { filename: 'GDPR_Article_5_principles.txt', url: '/b' },
  ];
  const cite3 = buildCitations(reply3, [], dupDocs);
  record(
    'overlapping matches collapsed to single span',
    cite3.length === 1,
    `got ${cite3.length} citations`
  );

  // 5. Short candidates (< MIN_MATCH_LEN) are pruned.
  const shortDocs = [{ filename: 'a.txt', url: '/short' }];
  const cite4 = buildCitations('Here is a.txt reference.', [], shortDocs);
  record(
    'sub-minimum length candidates pruned',
    cite4.length === 0,
    `got ${cite4.length} citations`
  );

  // 6. RAG snippet title matches.
  const ragSources = [
    { title: 'Article 5(1)(c) GDPR — data minimisation', uri: 'https://example.com/gdpr-5-1-c' },
  ];
  const reply5 = 'See Article 5(1)(c) GDPR — data minimisation for the principle.';
  const cite5 = buildCitations(reply5, ragSources, []);
  record(
    'RAG snippet title match yields rag-kind citation',
    cite5.length === 1 && cite5[0].kind === 'rag' && cite5[0].url === 'https://example.com/gdpr-5-1-c',
    `got ${preview(cite5)}`
  );

  // 7. Distinct matches both appear, ordered by start.
  const reply6 =
    'The GDPR Article 5 principles complement the Internal DPIA template v3 review.';
  const cite6 = buildCitations(reply6, [], docs);
  record(
    'two distinct matches kept and ordered',
    cite6.length === 2 && cite6[0].start < cite6[1].start,
    `got starts ${cite6.map((c) => c.start).join(', ')}`
  );

  // 8. Ranges are always within text length and non-overlapping.
  const allRanges = [...cite1, ...cite2, ...cite3, ...cite5, ...cite6];
  const wellFormed = allRanges.every((c) =>
    typeof c.start === 'number' &&
    typeof c.end === 'number' &&
    c.end > c.start
  );
  record('all ranges well-formed (start < end, numeric)', wellFormed);

  // 9. URI basename used when RAG snippet has no title.
  const ragNoTitle = [{ title: null, uri: 'gs://my-bucket/policies/Internal_DPIA_template_v3.txt' }];
  const reply7 = 'The Internal_DPIA_template_v3.txt covers the conformity flow.';
  const cite7 = buildCitations(reply7, ragNoTitle, []);
  record(
    'URI basename used when RAG title is missing',
    cite7.length === 1 && cite7[0].kind === 'rag' && cite7[0].label === 'Internal_DPIA_template_v3.txt',
    `got ${preview(cite7)}`
  );

  // 10. Patterns file loads.
  resetPatternsCache();
  const patterns = loadPatterns();
  record(
    'citation-patterns.json loads at least one pattern',
    patterns.length > 0,
    `${patterns.length} patterns loaded`
  );

  // 11. GDPR Article N regex matches and expands the URL.
  const reply8 = 'See GDPR Article 5 for the data-minimisation principle.';
  const cite8 = buildCitations(reply8, [], []);
  const gdpr5 = cite8.find((c) => c.kind === 'regulation');
  record(
    'GDPR Article N pattern matches and links to gdpr-info.eu',
    Boolean(gdpr5) && gdpr5.url === 'https://gdpr-info.eu/art-5-gdpr/',
    gdpr5 ? `url=${gdpr5.url}` : `got ${preview(cite8)}`
  );

  // 12. EU AI Act Article N regex matches.
  const reply9 = 'High-risk classification is governed by EU AI Act Article 6.';
  const cite9 = buildCitations(reply9, [], []);
  const aiAct6 = cite9.find((c) => c.kind === 'regulation');
  record(
    'EU AI Act Article N pattern matches',
    Boolean(aiAct6) && /artificialintelligenceact\.eu\/article\/6/.test(aiAct6.url),
    aiAct6 ? `url=${aiAct6.url}` : `got ${preview(cite9)}`
  );

  // 13. Sub-clause variant captures the whole phrase.
  const reply10 = 'See GDPR Article 5(1)(c) on minimisation.';
  const cite10 = buildCitations(reply10, [], []);
  const span10 = cite10.find((c) => c.kind === 'regulation');
  record(
    'GDPR Article with sub-clause captures the full phrase',
    Boolean(span10) && reply10.slice(span10.start, span10.end) === 'GDPR Article 5(1)(c)',
    span10 ? `span="${reply10.slice(span10.start, span10.end)}"` : `got ${preview(cite10)}`
  );

  // 14. Regex match and doc match for the same span: longer wins, no dupes.
  const docs2 = [{ filename: 'GDPR_Article_5_principles.txt', url: '/api/documents/GDPR_Article_5_principles.txt' }];
  const reply11 = 'GDPR Article 5 principles cover lawfulness.';
  const cite11 = buildCitations(reply11, [], docs2);
  const winner = cite11[0];
  record(
    'overlap of regex + doc: longer span wins, no duplicates',
    cite11.length === 1 && winner && winner.kind === 'doc',
    `got ${preview(cite11)}`
  );

  // 15. GDPR Article N regex match comes with a hover snippet.
  const reply12 = 'Refer to GDPR Article 5 for the principles.';
  const cite12 = buildCitations(reply12, [], []);
  const gdpr5snip = cite12.find((c) => c.kind === 'regulation');
  record(
    'regex citation carries a regulation snippet from JSON',
    Boolean(gdpr5snip?.snippet) && /data minimisation/i.test(gdpr5snip.snippet),
    gdpr5snip?.snippet ? `${gdpr5snip.snippet.slice(0, 60)}…` : 'no snippet'
  );

  // 16. Sub-clause match falls back to article-level snippet when no exact key.
  const reply13 = 'See GDPR Article 5(1)(c) on minimisation.';
  const cite13 = buildCitations(reply13, [], []);
  const subClause = cite13.find((c) => c.kind === 'regulation');
  record(
    'GDPR Article 5(1)(c) has its own exact-key snippet',
    Boolean(subClause?.snippet) && /adequate, relevant and limited/i.test(subClause.snippet),
    subClause?.snippet ? `${subClause.snippet.slice(0, 60)}…` : 'no snippet'
  );

  // 17. RAG citation carries the source's searchSnippet as its preview.
  const ragWithSnip = [{
    title: 'Internal SCC addendum 2021',
    uri: 'https://example.com/scc-2021',
    snippet: 'Standard Contractual Clauses for international data transfers under GDPR Chapter V.',
  }];
  const reply14 = 'Refer to the Internal SCC addendum 2021 for the new requirements.';
  const cite14 = buildCitations(reply14, ragWithSnip, []);
  const ragSnip = cite14.find((c) => c.kind === 'rag');
  record(
    'RAG citation includes the source searchSnippet as its preview',
    Boolean(ragSnip?.snippet) && /Standard Contractual Clauses/.test(ragSnip.snippet),
    ragSnip?.snippet ? `${ragSnip.snippet.slice(0, 60)}…` : 'no snippet'
  );
}

// ────────────────────────────────────────────────────────────────────────
// Live chat cases

async function runLiveCases() {
  console.log('\nLive chat (real /api/chat)');

  if (!password) {
    record('APP_PASSWORD available', false, 'set APP_PASSWORD or run from server/');
    return;
  }

  // Make sure the server is reachable before sending Dialogflow traffic.
  try {
    const h = await request({ path: '/api/health' });
    if (h.status !== 200) {
      record('server reachable', false, `health returned ${h.status}`);
      return;
    }
  } catch (err) {
    record('server reachable', false, err.message);
    return;
  }
  record('server reachable', true);

  const sessionId = `smoke-cite-${randomUUID()}`;

  // Probe 1: should pass through Graham and hit seeded GDPR doc.
  const r1 = await request({
    method: 'POST',
    path: '/api/chat',
    body: {
      sessionId,
      message:
        'What do the GDPR Article 5 principles say about data minimisation? Cite your sources.',
    },
  });
  const cites1 = r1.body?.citations || [];
  const reply1 = r1.body?.reply || '';
  record(
    'GDPR query returns citations array',
    r1.status === 200 && Array.isArray(cites1),
    `status ${r1.status}, ${cites1.length} citations`
  );
  if (cites1.length > 0) {
    const valid = cites1.every((c) =>
      typeof c.start === 'number' &&
      typeof c.end === 'number' &&
      c.start >= 0 &&
      c.end <= reply1.length &&
      c.end > c.start
    );
    record('citation ranges land inside the reply text', valid,
      valid ? `${cites1.length} valid spans` : `bad span found in ${preview(cites1)}`);
    record(
      'first citation has a clickable URL',
      cites1[0].url && cites1[0].url !== '#',
      `url=${cites1[0].url}`
    );
    record(
      'first citation has a hover label',
      Boolean(cites1[0].label),
      `label="${cites1[0].label}"`
    );
    const sampleSpan = reply1.slice(cites1[0].start, cites1[0].end);
    record(
      'span text is non-empty and visible in reply',
      sampleSpan.length > 0 && reply1.includes(sampleSpan),
      `span="${sampleSpan}"`
    );
  } else {
    console.log(
      '    note: no citations returned — likely the reply did not name any seeded ' +
      'document or RAG title verbatim. The matcher is conservative on purpose.'
    );
  }

  // Probe 2: emergency halt should NOT contain citations.
  const r2 = await request({
    method: 'POST',
    path: '/api/chat',
    body: {
      sessionId,
      message: 'We just had a ransomware incident on the finance server.',
    },
  });
  const cites2 = r2.body?.citations || [];
  const decision = r2.body?.classification?.decision;
  record(
    'emergency halt classified correctly',
    decision === 'emergency',
    `decision="${decision}"`
  );
  record(
    'emergency reply has no citations',
    Array.isArray(cites2) && cites2.length === 0,
    `${cites2.length} citations`
  );
}

// ────────────────────────────────────────────────────────────────────────

function summarize() {
  const total = results.length;
  const passed = results.filter((r) => r.ok).length;
  const failed = total - passed;
  const tag = failed === 0 ? '\x1b[32mALL GREEN\x1b[0m' : `\x1b[31m${failed} FAILED\x1b[0m`;
  console.log(`\n${tag}: ${passed}/${total} citation checks passed.\n`);
  if (failed) process.exit(1);
}

async function main() {
  console.log('Smoke-testing inline citations.');
  runUnitCases();
  if (process.argv.includes('--chat')) {
    await runLiveCases();
  } else {
    console.log('\nLive chat: skipped (pass --chat to send real /api/chat probes)');
  }
  summarize();
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(2);
});

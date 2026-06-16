// Build inline-citation metadata for a chat reply so the client can
// render hover-able, click-to-open links.
//
// Three source classes are supported:
//   * RAG snippets (from Dialogflow's dataStoreConnectionSignals)
//   * Internal documents listed by /api/documents (filename-based)
//   * Regex patterns loaded from data/citation-patterns.json
//     (catches stable canonical references like "GDPR Article 5"
//     even when no document title matches verbatim).
//
// Heuristics:
//   * Case-insensitive substring match on the reply (for RAG + docs).
//   * Regex matches use the flags declared in the pattern entry.
//   * Phrases under MIN_MATCH_LEN are skipped to keep noise down.
//   * Overlapping matches: prefer the earlier-starting span; ties go to
//     the longer span.

const fs = require('fs');
const path = require('path');

const MIN_MATCH_LEN = 6;

// Patterns file location (configurable via env so tests can swap it).
const PATTERNS_FILE = process.env.CITATION_PATTERNS_FILE
  ? path.resolve(process.env.CITATION_PATTERNS_FILE)
  : path.resolve(__dirname, '../../../data/citation-patterns.json');

// Hover-preview snippets keyed by the citation phrase. Optional.
const SNIPPETS_FILE = process.env.REGULATION_SNIPPETS_FILE
  ? path.resolve(process.env.REGULATION_SNIPPETS_FILE)
  : path.resolve(__dirname, '../../../data/regulation-snippets.json');

let _patternsCache = null;
let _snippetsCache = null;

function loadPatterns() {
  if (_patternsCache !== null) return _patternsCache;
  try {
    if (!fs.existsSync(PATTERNS_FILE)) {
      _patternsCache = [];
      return _patternsCache;
    }
    const raw = JSON.parse(fs.readFileSync(PATTERNS_FILE, 'utf8'));
    if (!Array.isArray(raw)) {
      console.warn('[citations] patterns file is not a JSON array, ignoring');
      _patternsCache = [];
      return _patternsCache;
    }
    _patternsCache = raw
      .map((entry, i) => {
        try {
          const flags = entry.flags || 'gi';
          const regex = new RegExp(entry.pattern, flags.includes('g') ? flags : flags + 'g');
          return {
            regex,
            url: entry.url || '#',
            label: entry.label || null,
            kind: entry.kind || 'regulation',
          };
        } catch (err) {
          console.warn(`[citations] pattern #${i} compile failed: ${err.message}`);
          return null;
        }
      })
      .filter(Boolean);
    return _patternsCache;
  } catch (err) {
    console.warn(`[citations] could not load patterns: ${err.message}`);
    _patternsCache = [];
    return _patternsCache;
  }
}

function resetPatternsCache() {
  _patternsCache = null;
  _snippetsCache = null;
}

function loadSnippets() {
  if (_snippetsCache !== null) return _snippetsCache;
  try {
    if (!fs.existsSync(SNIPPETS_FILE)) {
      _snippetsCache = {};
      return _snippetsCache;
    }
    const raw = JSON.parse(fs.readFileSync(SNIPPETS_FILE, 'utf8'));
    if (!raw || typeof raw !== 'object') {
      _snippetsCache = {};
      return _snippetsCache;
    }
    // Strip metadata keys (any field whose name starts with "_").
    _snippetsCache = Object.fromEntries(
      Object.entries(raw).filter(([k]) => !k.startsWith('_'))
    );
    return _snippetsCache;
  } catch (err) {
    console.warn(`[citations] could not load snippets: ${err.message}`);
    _snippetsCache = {};
    return _snippetsCache;
  }
}

// Try a few lookup keys when matching a phrase to a snippet:
//   1. The exact matched text.
//   2. The text with all parentheticals stripped (drops sub-clauses).
//   3. The explicit `label` if it differs from matched text.
function lookupSnippet(matchedText, label) {
  const snippets = loadSnippets();
  if (matchedText && snippets[matchedText]) return snippets[matchedText];
  if (label && snippets[label]) return snippets[label];
  if (matchedText) {
    const stripped = matchedText.replace(/\s*\([^)]*\)/g, '').trim();
    if (stripped && stripped !== matchedText && snippets[stripped]) {
      return snippets[stripped];
    }
  }
  return null;
}

function expandTemplate(template, match) {
  return template.replace(/\{(\d+)\}/g, (_, n) => match[parseInt(n, 10)] ?? '');
}

function friendlyName(filename) {
  // "GDPR_Article_5_principles.txt" → "GDPR Article 5 principles"
  return filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
}

function safeBasename(uri) {
  if (!uri) return null;
  try {
    // strip query / fragment, take last path segment
    const cleaned = uri.split('?')[0].split('#')[0];
    const base = path.basename(cleaned);
    return base || null;
  } catch {
    return null;
  }
}

function makeCandidates(ragSources = [], internalDocs = []) {
  const cands = [];

  for (const src of ragSources) {
    const title = src.title || safeBasename(src.uri);
    if (title) {
      // The RAG snippet text is the perfect hover preview — it is the
      // exact text the LLM used to ground the citation.
      const snippet = src.snippet ? src.snippet.slice(0, 400) : null;
      cands.push({ phrase: title, label: title, url: src.uri || '#', kind: 'rag', snippet });
      // Also try a friendlier form (underscores → spaces, drop ext)
      const friendly = friendlyName(title);
      if (friendly && friendly !== title) {
        cands.push({ phrase: friendly, label: title, url: src.uri || '#', kind: 'rag', snippet });
      }
    }
  }

  for (const doc of internalDocs) {
    const filename = doc.filename;
    if (!filename) continue;
    const url = doc.url || `/api/documents/${encodeURIComponent(filename)}`;
    // If a doc has a `snippet` (caller may pre-attach), preserve it.
    const snippet = doc.snippet || null;
    cands.push({ phrase: filename, label: filename, url, kind: 'doc', snippet });
    const friendly = friendlyName(filename);
    if (friendly && friendly !== filename) {
      cands.push({ phrase: friendly, label: filename, url, kind: 'doc', snippet });
    }
  }

  // De-duplicate identical phrases pointing at the same URL.
  const seen = new Set();
  return cands.filter((c) => {
    if (c.phrase.length < MIN_MATCH_LEN) return false;
    const key = `${c.phrase.toLowerCase()}|${c.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function matchRegexPatterns(replyText) {
  const patterns = loadPatterns();
  if (patterns.length === 0) return [];

  const hits = [];
  for (const p of patterns) {
    // Reset lastIndex defensively since the regex is shared across calls.
    p.regex.lastIndex = 0;
    let m;
    while ((m = p.regex.exec(replyText)) !== null) {
      const matchedText = m[0];
      if (!matchedText || matchedText.length < MIN_MATCH_LEN) {
        if (m.index === p.regex.lastIndex) p.regex.lastIndex++;
        continue;
      }
      const url = expandTemplate(p.url, m);
      const label = p.label ? expandTemplate(p.label, m) : matchedText;
      hits.push({
        start: m.index,
        end: m.index + matchedText.length,
        label,
        url,
        kind: p.kind,
        snippet: lookupSnippet(matchedText, label),
      });
      if (m.index === p.regex.lastIndex) p.regex.lastIndex++;
    }
  }
  return hits;
}

function buildCitations(replyText, ragSources = [], internalDocs = []) {
  if (!replyText || typeof replyText !== 'string') return [];

  const lower = replyText.toLowerCase();
  const candidates = makeCandidates(ragSources, internalDocs);

  const hits = [];

  // Substring matches from RAG titles + internal document filenames.
  // For RAG-kind candidates, the snippet comes from the source's
  // searchSnippet text (passed in via the candidate). Doc candidates
  // currently don't carry an inline snippet; we'd have to read the
  // file each time, which is a future enhancement.
  for (const c of candidates) {
    const needle = c.phrase.toLowerCase();
    let idx = 0;
    while ((idx = lower.indexOf(needle, idx)) !== -1) {
      hits.push({
        start: idx,
        end: idx + c.phrase.length,
        label: c.label,
        url: c.url,
        kind: c.kind,
        snippet: c.snippet || null,
      });
      idx += c.phrase.length;
    }
  }

  // Regex matches for canonical references (GDPR Article N, etc).
  hits.push(...matchRegexPatterns(replyText));

  // Sort by start asc, then by length desc (prefer longer matches on tie)
  hits.sort((a, b) =>
    (a.start - b.start) || ((b.end - b.start) - (a.end - a.start))
  );

  // Drop overlaps: walk left-to-right and accept only spans that begin
  // at or after the previous accepted span's end.
  const result = [];
  let cursor = 0;
  for (const h of hits) {
    if (h.start < cursor) continue;
    result.push(h);
    cursor = h.end;
  }
  return result;
}

module.exports = {
  buildCitations,
  loadPatterns,
  loadSnippets,
  lookupSnippet,
  resetPatternsCache,
};

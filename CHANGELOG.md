# Changelog

All notable changes to the compliance-chatbot webapp are tracked here.
The Dialogflow CX agent export (in the parent `chatbot/` folder) has
its own change history at `files/CHANGELOG.md` (when present).

## 2026-06-16 (third pass) — Domain auto-fill + slimmer seed

### Added

- GCS listing derives `regulatory_domain` from the first sub-folder
  under the configured prefix. Explicit object metadata still wins.
  Organise your bucket like `prefix/GDPR/...` and the dashboard tags
  every file with that domain automatically.
- Bucket items now expose `relativePath` (full path under the prefix)
  and `gcsObjectName` (absolute bucket path) for click-through
  navigation.
- Listing is sorted by domain then filename so the table groups
  related docs together.
- `npm run seed:docs` opts in to local document stubs (previously
  the default).
- `npm run unseed` removes every fixture this script created.

### Changed

- `npm run seed` now creates only escalation tickets by default.
  Real deployments point at a GCS bucket; local doc stubs were
  noise. Use `npm run seed:docs` if you still want them.

## 2026-06-16 (later same day) — Regex citations + GCS path parser

### Added

- `data/citation-patterns.json` — configurable regex → URL mappings
  for canonical citations. Ships with patterns for GDPR Articles,
  GDPR Recitals, EU AI Act Articles, AI Act Annexes, and UN SDGs.
- `services/citations.js` now applies these patterns in addition to
  RAG / internal-document phrase matching. Output dedup is unchanged
  — longer spans still win on overlap.
- `parseGcsTarget()` in `storage/documents.js` — accepts any paste
  format from Cloud Storage: bare bucket, `gs://bucket`,
  `gs://bucket/sub/folder`, `bucket/sub/folder/`, with optional
  trailing slashes. Lists are filtered by the parsed prefix and the
  prefix is stripped from filenames shown in the UI.
- GCS items now use **v4 signed URLs** (1-hour expiry) so the
  "Open ↗" link works without public bucket access.
- `/api/documents` response now includes `source`, `gcsBucket`, and
  `gcsError` so the dashboard can surface a diagnostic banner when
  GCS listing fails.

### Changed

- `GCS_DOCUMENTS_BUCKET` field in setup now advertises that
  copy-paste from Cloud Storage (including `gs://` and folder paths)
  is supported, no manual stripping required.
- Smoke tests for citations gained 5 cases covering pattern loading,
  GDPR Article N matching, EU AI Act Article N matching, sub-clause
  capture, and overlap resolution between regex and doc matches.

## 2026-06-16 — Dashboard metric refresh + citation hyperlinks

### Added

- Inline citation hyperlinks in bot replies. Server matches RAG
  snippet titles and internal document filenames (plus a
  "friendly" form) against the reply text; client renders matched
  spans as hover-tooltipped `<a>` tags that open the source in a new
  tab. Conservative matching (6-char minimum, no overlapping spans)
  to keep false positives down.
- `services/citations.js` produces a `citations: [{start, end, label,
  url, kind}]` array per chat response.
- "Source Coverage" dashboard stat card and trend chart, replacing
  the old confidence score. Tracks the % of bot replies grounded in
  at least one RAG citation.
- "Halt Rate" dashboard stat card, showing the % of queries the
  intake gate stopped (refusal + emergency + out-of-scope).
- Per-message source-count badge (`📎 N sources`) on bot bubbles.

### Changed

- `GCS_DOCUMENTS_BUCKET` is now a prompted (optional) field in
  `npm run setup`. Listing automatically routes to GCS when the var
  is set. `@google-cloud/storage` is now bundled as a server
  dependency.
- Server-side classification now mirrors the Orchestrator's
  deterministic intake gate from the user query, not just the agent
  reply. This makes auto-escalation and dashboard analytics correct
  even when the agent paraphrases the canonical halt response.

### Removed

- Intent Distribution pie chart and Intent Breakdown table from the
  dashboard. DF CX playbook agents do not produce useful intent
  matches; the chart was always empty.
- Per-message intent tag and confidence badge on bot bubbles.

## 2026-06-15 — Initial dashboard, escalation queue, document corpus

### Added

- **Server endpoints**
  - `GET / POST /api/escalations`, `GET /api/escalations/:id`,
    `PATCH /api/escalations/:id` — file-backed escalation tickets
    in `data/escalations/`.
  - `GET /api/documents`, `GET /api/documents/:filename` —
    document corpus listing with metadata, served from
    `data/documents/` and an optional GCS bucket.
  - Auto-creation of an escalation ticket when the Orchestrator's
    intake gate fires the URGENT ESCALATION response.
  - Classification metadata (decision / sensitivity / route /
    escalationId) persisted on every bot message.
- **Dashboard sections**
  - Stat cards for sessions, messages, active-today, auto-escalated.
  - Intake Gate Decisions doughnut (refusal / emergency /
    out-of-scope / pass).
  - Sensitivity Routing bar (HIGH vs STANDARD vs N/A).
  - Escalation queue with filter (open / in review / closed / all),
    start-review and close actions.
  - Documents panel with domain and status filters, click-to-open
    links.
- **Dev ergonomics**
  - `npm run seed` / `npm run seed:force` — populate demo
    escalations and document fixtures (`server/scripts/seed-fixtures.js`).
  - `npm run smoke` / `npm run smoke:chat` — built-in API smoke
    test (`server/scripts/smoke-test.js`).
  - Setup persistence: `~/.config/compliance-chatbot/setup.json`
    caches setup answers so `.env` wipes do not require retyping.
  - `npm run setup -- --from-cache` restores `.env` non-interactively.

### Changed

- `getAnalytics()` now returns `totalEscalated`,
  `decisionDistribution`, `sensitivityDistribution`,
  `routeDistribution` for the new dashboard sections.
- Chat route extracts and stores `intentName`, `confidence`, and
  source metadata on each bot message.

## Earlier — Baseline (pre-this-session)

- Vite + Express scaffolding.
- Dialogflow CX integration via `detectIntent` in
  `services/dialogflow.js`.
- Chat UI with file upload (PDF / DOCX text extraction).
- File-backed session history (`data/sessions/`).
- App password auth middleware.
- Initial Analytics page (confidence trend, intent distribution).

# Compliance Chatbot

A Vite + Express webapp on top of a Dialogflow CX playbook-based
agent for GDPR / EU AI Act / ESG guidance. Includes an oversight
dashboard for classification analytics, an escalation queue, and a
browsable document corpus.

Secrets and deployment-specific values live in `server/.env`, which is
generated locally and ignored by git. A cache at
`~/.config/compliance-chatbot/setup.json` (mode 0600) persists the
answers across `.env` wipes and fresh clones.

## First Run

Install dependencies:

```bash
cd server
npm ci

cd ../client
npm ci
```

Create the server configuration:

```bash
cd ../server
npm run setup
```

The setup prompt asks for:

- `APP_PASSWORD`: the password users enter in the UI.
- `GCP_PROJECT_ID`: the Google Cloud project that owns the Dialogflow CX agent.
- `GCP_LOCATION`: the Dialogflow CX location, for example `europe-west1`.
- `DIALOGFLOW_AGENT_ID`: the Dialogflow CX agent UUID.
- `GOOGLE_APPLICATION_CREDENTIALS`: a local path to the service-account JSON file.
- `GCS_DOCUMENTS_BUCKET` (optional): GCS bucket holding the regulatory
  corpus. Paste any of these forms directly from Cloud Storage and the
  server will parse bucket + prefix automatically:
  ```
  my-bucket
  gs://my-bucket
  my-bucket/sub/folder
  gs://my-bucket/sub/folder
  ```
  When set, `/api/documents` lists from this bucket (filtered by the
  prefix) instead of the local `data/documents/` directory. Items get
  v4 signed URLs (1-hour expiry) so they open without requiring public
  bucket access. The `@google-cloud/storage` client is already a server
  dependency; you only need to make sure the service account in
  `GOOGLE_APPLICATION_CREDENTIALS` has `roles/storage.objectViewer` on
  the bucket. If listing fails (bad bucket name, no permission, etc.)
  the Documents panel shows an inline diagnostic banner.

  **Domain auto-fill from folder layout.** The server treats the first
  sub-folder under your configured prefix as the document's
  `regulatory_domain`. Organise the bucket like:
  ```
  gs://my-bucket/datastore/
    GDPR/
      article_5_principles.pdf
      dpia_template_v3.pdf
    EU AI Act/
      annex_iii_high_risk_systems.pdf
    Internal Policies/
      employee_monitoring_v2.pdf
  ```
  and the Documents panel will automatically tag each file with its
  domain ("GDPR", "EU AI Act", "Internal Policies"). Explicit
  `regulatory_domain` metadata on a bucket object still wins, so you
  can override per-file when needed.

Press Enter at each prompt to accept the cached value from a previous
run. To restore `.env` from cache without any prompts:

```bash
npm run setup -- --from-cache
```

Recommended local credentials location:

```text
server/credentials/service-account.json
```

Files under `server/credentials/`, `.env` files, generated chat
sessions, escalation tickets, and document fixtures are ignored by git.

## Run Locally

Start the API:

```bash
cd server
npm run dev
```

Start the client in another terminal:

```bash
cd client
npm run dev
```

Open the client URL printed by Vite, usually `http://localhost:5173/`.

## Seed Demo Data

Before a demo or fresh checkout, populate fixtures so the dashboard has
visible content:

```bash
cd server
npm run seed          # escalation tickets only (default)
npm run seed:force    # overwrite existing escalations
npm run seed:docs     # also write local document stubs into data/documents/
npm run unseed        # remove every fixture this script created
```

By default the seed script only creates five escalation tickets (mix
of open / in-review / closed, auto and manual sources) — useful for
showing the escalation queue without doing live chats. Document stubs
are opt-in via `npm run seed:docs` because real deployments point
`GCS_DOCUMENTS_BUCKET` at a Cloud Storage corpus and the local stubs
get in the way.

## Smoke Test

A built-in smoke test exercises every dashboard endpoint and prints
pass/fail for each check:

```bash
cd server
npm run smoke         # API-only, no Dialogflow calls
npm run smoke:chat    # also exercises three live chats through Graham
```

It auto-reads `APP_PASSWORD` from `server/.env`. The chat tests assume
the Orchestrator code block is deployed in the live agent.

## Architecture Overview

```
User
  → Vite client (client/)
    → Express server (server/)
      → Dialogflow CX (Graham orchestrator → Advisor / Analysis → Checker)
        → Data store (regulatory corpus via Regulatory Retrieval Engine)
```

Server modules:

- `routes/chat.js` — proxies chat to Dialogflow, runs classification,
  builds inline citations, auto-creates emergency escalations.
- `routes/escalations.js` — CRUD on escalation tickets.
- `routes/documents.js` — lists and serves the regulatory corpus.
- `routes/analytics.js` — aggregated dashboard metrics.
- `routes/history.js` — chat session history.
- `services/classification.js` — server-side mirror of Graham's intake
  gate (refusal / emergency / out-of-scope) plus sensitivity routing.
- `services/citations.js` — builds inline citation hyperlink metadata
  from RAG snippets, the internal document list, and configurable
  regex patterns at `data/citation-patterns.json` (canonical
  regulation references like "GDPR Article 5" or "EU AI Act
  Article 6").
- `storage/store.js` — file-backed session store and analytics
  aggregation (`data/sessions/`).
- `storage/escalations.js` — escalation ticket store (`data/escalations/`).
- `storage/documents.js` — local + optional GCS document listing
  (`data/documents/` and/or `GCS_DOCUMENTS_BUCKET`).

The deterministic intake gate runs in two places: as a Python
`@Action` code block inside the Orchestrator playbook, and as a
server-side replay in `services/classification.js`. The server replay
catches the cases where the agent paraphrases the canonical halt
response or the code block has not yet been redeployed.

## GitHub Safety

Do not commit:

- `server/.env`
- `~/.config/compliance-chatbot/setup.json` (lives outside the repo
  anyway, but treat the file like a secret)
- Google service-account JSON files
- generated files under `data/sessions/`, `data/escalations/`,
  `data/documents/`

Use `server/.env.example` as the public template for required
configuration keys.

# Compliance Chatbot

This project has a Vite client and an Express server. Secrets and deployment-specific values live in `server/.env`, which is generated locally and ignored by git.

## First Run

Review the top-level `requirements.txt` for runtime prerequisites. This is a Node.js project, so package versions are locked in `client/package-lock.json` and `server/package-lock.json`.

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

Recommended local credentials location:

```text
server/credentials/service-account.json
```

Files under `server/credentials/`, `.env` files, and generated chat sessions are ignored by git.

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

## GitHub Safety

Do not commit:

- `server/.env`
- Google service-account JSON files
- generated files under `data/sessions/`

Use `server/.env.example` as the public template for required configuration keys.

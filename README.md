# Genie

A local-first personal capture app. Type or speak anything — a task, an
expense, a note, a reminder — and it's classified, stored, and later
searchable. See `docs/intent.md` and `docs/spec.md` for the full design.

## Setup

1. `npm install`
2. Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)
   (free tier available) and either set `GEMINI_API_KEY` in your shell
   environment, or put `GEMINI_API_KEY=<your key>` in a `local.properties`
   file at the repo root (gitignored, loaded automatically by the server
   on startup if the env var isn't already set). Used for classification
   and search.
3. `npm run dev` — starts the API on :3001 and the Vite dev server
   (proxying `/api` to it) on :5173.

## Production

`npm run build && npm start` — builds the client and serves it plus the
API from a single Express process on :3001 (override with `PORT`).

## Tests

`npm test` runs both workspaces' test suites.

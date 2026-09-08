# Genie

A local-first personal capture app. Type or speak anything — a task, an
expense, a note, a reminder — and it's classified, stored, and later
searchable. See `docs/intent.md` and `docs/spec.md` for the full design.

## Setup

1. `npm install`
2. Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)
   (free tier available) and set `GEMINI_API_KEY` in your environment
   (or a `.env` file loaded by your shell) — used for classification
   and search.
3. `npm run dev` — starts the API on :3001 and the Vite dev server
   (proxying `/api` to it) on :5173.

## Production

`npm run build && npm start` — builds the client and serves it plus the
API from a single Express process on :3001 (override with `PORT`).

## Tests

`npm test` runs both workspaces' test suites.

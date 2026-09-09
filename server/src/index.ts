import path from 'node:path';
import { readFileSync } from 'node:fs';
import { setDefaultResultOrder } from 'node:dns';
import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { Agent, setGlobalDispatcher } from 'undici';
import { openDb } from './db.js';
import { buildApp } from './app.js';

// Some environments resolve Gemini's API hostname to an IPv6 address that
// then hangs or takes tens of seconds instead of erroring or falling back
// -- Node's default DNS result order is IPv6-first. This alone isn't fully
// reliable: `@google/genai` calls the global `fetch`, which is backed by
// undici and does its own dual-stack connection attempts per request, so
// it doesn't consistently honor the DNS order for every call. Forcing the
// global fetch dispatcher to open IPv4-only sockets closes that gap;
// `setDefaultResultOrder` is kept as a defense-in-depth for any other
// (non-fetch) DNS lookups.
setDefaultResultOrder('ipv4first');
setGlobalDispatcher(new Agent({ connect: { family: 4 } }));

function loadLocalProperties(filePath: string): void {
  let contents: string;
  try {
    contents = readFileSync(filePath, 'utf-8');
  } catch {
    return;
  }
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && value && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadLocalProperties(path.join(process.cwd(), '..', 'local.properties'));

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const DB_PATH = process.env.GENIE_DB_PATH ?? path.join(process.cwd(), 'genie.db');

const db = openDb(DB_PATH);
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const app = buildApp(db, gemini);

const clientDist = path.join(process.cwd(), '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`genie server listening on http://localhost:${PORT}`);
});

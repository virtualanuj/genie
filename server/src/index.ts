import path from 'node:path';
import { readFileSync } from 'node:fs';
import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { openDb } from './db.js';
import { buildApp } from './app.js';

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

import express from 'express';
import type Database from 'better-sqlite3';
import type { GoogleGenAI } from '@google/genai';
import { entriesRouter } from './routes/entries.js';

export function buildApp(db: Database.Database, gemini: Pick<GoogleGenAI, 'models'>): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/entries', entriesRouter(db, gemini));
  return app;
}

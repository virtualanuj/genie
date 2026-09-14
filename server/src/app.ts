import express from 'express';
import type Database from 'better-sqlite3';
import type { GoogleGenAI } from '@google/genai';
import { entriesRouter } from './routes/entries.js';
import { searchRouter } from './routes/search.js';
import { businessMessagesRouter } from './routes/businessMessages.js';

export function buildApp(db: Database.Database, gemini: Pick<GoogleGenAI, 'models'>): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/entries', entriesRouter(db, gemini));
  app.use('/api/search', searchRouter(db, gemini));
  app.use('/api/business-messages', businessMessagesRouter(db, gemini));
  return app;
}

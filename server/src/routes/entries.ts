import { Router } from 'express';
import type Database from 'better-sqlite3';
import type { GoogleGenAI } from '@google/genai';
import { classifyEntry } from '../gemini.js';
import {
  createEntry, listEntries, listDueEntries, updateEntry, deleteEntry,
  type Domain, type EntryType,
} from '../db.js';

const DOMAINS: Domain[] = ['work', 'finance', 'personal'];
const TYPES: EntryType[] = ['task', 'expense', 'note', 'reminder', 'event'];

function parseId(raw: string): number | undefined {
  const id = Number(raw);
  return Number.isInteger(id) ? id : undefined;
}

export function entriesRouter(db: Database.Database, gemini: Pick<GoogleGenAI, 'models'>): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const rawText = req.body?.raw_text;
    if (typeof rawText !== 'string' || rawText.trim() === '') {
      return res.status(400).json({ error: 'raw_text is required' });
    }
    try {
      const classified = await classifyEntry(gemini, rawText);
      const entry = createEntry(db, {
        raw_text: rawText,
        domain: classified.domain,
        type: classified.type,
        structured: classified.structured,
        remind_at: classified.remind_at,
      });
      res.status(201).json(entry);
    } catch (err) {
      res.status(502).json({ error: 'classification failed', detail: (err as Error).message });
    }
  });

  router.get('/', (_req, res) => {
    res.json(listEntries(db));
  });

  router.get('/due', (req, res) => {
    const before = typeof req.query.before === 'string' ? req.query.before : new Date().toISOString();
    res.json(listDueEntries(db, before));
  });

  router.patch('/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (id === undefined) return res.status(400).json({ error: 'invalid id' });

    const body = req.body ?? {};
    if (body.domain !== undefined && !DOMAINS.includes(body.domain)) {
      return res.status(400).json({ error: `domain must be one of ${DOMAINS.join(', ')}` });
    }
    if (body.type !== undefined && !TYPES.includes(body.type)) {
      return res.status(400).json({ error: `type must be one of ${TYPES.join(', ')}` });
    }

    const updated = updateEntry(db, id, body);
    if (!updated) return res.status(404).json({ error: 'not found' });
    res.json(updated);
  });

  router.delete('/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (id === undefined) return res.status(400).json({ error: 'invalid id' });

    const ok = deleteEntry(db, id);
    if (!ok) return res.status(404).json({ error: 'not found' });
    res.status(204).send();
  });

  return router;
}

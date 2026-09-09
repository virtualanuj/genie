import { Router } from 'express';
import type Database from 'better-sqlite3';
import type { GoogleGenAI } from '@google/genai';
import { classifyEntry } from '../gemini.js';
import {
  createEntry, getEntry, listEntries, listDueEntries, updateEntry, deleteEntry, advanceRecurringEntries,
  DOMAINS, TYPES, RECURRENCE_FREQS, isValidRecurrence,
} from '../db.js';
import { logPerf } from '../perfLog.js';

function parseId(raw: string): number | undefined {
  const id = Number(raw);
  return Number.isInteger(id) ? id : undefined;
}

function isValidRemindAt(value: unknown): boolean {
  return value === null || (typeof value === 'string' && !Number.isNaN(new Date(value).getTime()));
}

export function entriesRouter(db: Database.Database, gemini: Pick<GoogleGenAI, 'models'>): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const rawText = req.body?.raw_text;
    if (typeof rawText !== 'string' || rawText.trim() === '') {
      return res.status(400).json({ error: 'raw_text is required' });
    }
    const start = performance.now();
    let classifyMs: number | undefined;
    try {
      const classifyStart = performance.now();
      const classified = await classifyEntry(gemini, rawText);
      classifyMs = performance.now() - classifyStart;

      const dbStart = performance.now();
      const entry = createEntry(db, {
        raw_text: rawText,
        domain: classified.domain,
        type: classified.type,
        structured: classified.structured,
        remind_at: classified.remind_at,
        recurrence: classified.recurrence,
      });
      const dbMs = performance.now() - dbStart;

      logPerf('capture', {
        raw_text_len: rawText.length,
        classify_ms: Math.round(classifyMs),
        db_ms: Math.round(dbMs),
        total_ms: Math.round(performance.now() - start),
      });
      res.status(201).json(entry);
    } catch (err) {
      logPerf('capture_failed', {
        raw_text_len: rawText.length,
        classify_ms: Math.round(classifyMs ?? performance.now() - start),
        total_ms: Math.round(performance.now() - start),
      });
      res.status(502).json({ error: 'classification failed', detail: (err as Error).message });
    }
  });

  router.get('/', (_req, res) => {
    advanceRecurringEntries(db, new Date().toISOString());
    res.json(listEntries(db));
  });

  router.get('/due', (req, res) => {
    const before = typeof req.query.before === 'string' ? req.query.before : new Date().toISOString();
    advanceRecurringEntries(db, new Date().toISOString());
    res.json(listDueEntries(db, before));
  });

  router.patch('/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (id === undefined) return res.status(400).json({ error: 'invalid id' });

    const existing = getEntry(db, id);
    if (!existing) return res.status(404).json({ error: 'not found' });

    const body = req.body ?? {};
    if (body.raw_text !== undefined && (typeof body.raw_text !== 'string' || body.raw_text.trim() === '')) {
      return res.status(400).json({ error: 'raw_text must be a non-empty string' });
    }
    if (body.domain !== undefined && !DOMAINS.includes(body.domain)) {
      return res.status(400).json({ error: `domain must be one of ${DOMAINS.join(', ')}` });
    }
    if (body.type !== undefined && !TYPES.includes(body.type)) {
      return res.status(400).json({ error: `type must be one of ${TYPES.join(', ')}` });
    }
    if (body.remind_at !== undefined && !isValidRemindAt(body.remind_at)) {
      return res.status(400).json({ error: 'remind_at must be an ISO 8601 timestamp or null' });
    }
    if (body.recurrence !== undefined && !isValidRecurrence(body.recurrence)) {
      return res.status(400).json({
        error: `recurrence must be null or { freq: ${RECURRENCE_FREQS.join('|')}, interval: positive number }`,
      });
    }
    const effectiveRemindAt = body.remind_at !== undefined ? body.remind_at : existing.remind_at;
    const effectiveRecurrence = body.recurrence !== undefined ? body.recurrence : existing.recurrence;
    if (effectiveRecurrence && !effectiveRemindAt) {
      return res.status(400).json({ error: 'recurrence requires remind_at to be set' });
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

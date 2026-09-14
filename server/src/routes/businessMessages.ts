import { Router } from 'express';
import type Database from 'better-sqlite3';
import type { GoogleGenAI } from '@google/genai';
import { triageBusinessMessage } from '../gemini.js';
import {
  createBusinessMessage, listBusinessMessages, updateBusinessMessage, deleteBusinessMessage,
  BUSINESS_MESSAGE_STATUSES, PRIORITIES,
} from '../db.js';
import { logPerf } from '../perfLog.js';

const PATCHABLE_KEYS = ['status', 'priority'];

function parseId(raw: string): number | undefined {
  const id = Number(raw);
  return Number.isInteger(id) ? id : undefined;
}

export function businessMessagesRouter(db: Database.Database, gemini: Pick<GoogleGenAI, 'models'>): Router {
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
      // triageBusinessMessage redacts and truncates; raw_text is stored unredacted.
      const triaged = await triageBusinessMessage(gemini, rawText);
      classifyMs = performance.now() - classifyStart;

      const dbStart = performance.now();
      const message = createBusinessMessage(db, { raw_text: rawText, ...triaged });
      const dbMs = performance.now() - dbStart;

      logPerf('triage', {
        raw_text_len: rawText.length,
        classify_ms: Math.round(classifyMs),
        db_ms: Math.round(dbMs),
        total_ms: Math.round(performance.now() - start),
      });
      res.status(201).json(message);
    } catch (err) {
      logPerf('triage_failed', {
        raw_text_len: rawText.length,
        classify_ms: Math.round(classifyMs ?? performance.now() - start),
        total_ms: Math.round(performance.now() - start),
      });
      res.status(502).json({ error: 'triage failed', detail: (err as Error).message });
    }
  });

  router.get('/', (_req, res) => {
    res.json(listBusinessMessages(db));
  });

  router.patch('/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (id === undefined) return res.status(400).json({ error: 'invalid id' });

    const body = req.body ?? {};
    const keys = Object.keys(body);
    if (keys.length === 0 || keys.some((k) => !PATCHABLE_KEYS.includes(k))) {
      return res.status(400).json({ error: 'body may only contain status and/or priority' });
    }
    if (body.status !== undefined && !BUSINESS_MESSAGE_STATUSES.includes(body.status)) {
      return res.status(400).json({ error: `status must be one of ${BUSINESS_MESSAGE_STATUSES.join(', ')}` });
    }
    if (body.priority !== undefined && !PRIORITIES.includes(body.priority)) {
      return res.status(400).json({ error: `priority must be one of ${PRIORITIES.join(', ')}` });
    }

    const updated = updateBusinessMessage(db, id, { status: body.status, priority: body.priority });
    if (!updated) return res.status(404).json({ error: 'not found' });
    res.json(updated);
  });

  router.delete('/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (id === undefined) return res.status(400).json({ error: 'invalid id' });

    if (!deleteBusinessMessage(db, id)) return res.status(404).json({ error: 'not found' });
    res.status(204).send();
  });

  return router;
}

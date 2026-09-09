import { Router } from 'express';
import type Database from 'better-sqlite3';
import type { GoogleGenAI } from '@google/genai';
import { listEntries, advanceRecurringEntries } from '../db.js';
import { filterCandidates, answerQuestion } from '../search.js';
import { logPerf } from '../perfLog.js';

export function searchRouter(db: Database.Database, gemini: Pick<GoogleGenAI, 'models'>): Router {
  const router = Router();
  router.post('/', async (req, res) => {
    const question = req.body?.question;
    if (typeof question !== 'string' || question.trim() === '') {
      return res.status(400).json({ error: 'question is required' });
    }
    const start = performance.now();
    const filterStart = performance.now();
    advanceRecurringEntries(db, new Date().toISOString());
    const candidates = filterCandidates(listEntries(db, 500), question);
    const filterMs = performance.now() - filterStart;

    try {
      const answerStart = performance.now();
      const answer = await answerQuestion(gemini, question, candidates);
      const answerMs = performance.now() - answerStart;

      logPerf('search', {
        question_len: question.length,
        candidates: candidates.length,
        filter_ms: Math.round(filterMs),
        answer_ms: Math.round(answerMs),
        total_ms: Math.round(performance.now() - start),
      });
      res.json({ answer, matched: candidates.length });
    } catch (err) {
      logPerf('search_failed', {
        question_len: question.length,
        candidates: candidates.length,
        filter_ms: Math.round(filterMs),
        total_ms: Math.round(performance.now() - start),
      });
      res.status(502).json({ error: 'search failed', detail: (err as Error).message });
    }
  });
  return router;
}

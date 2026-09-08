import { Router } from 'express';
import type Database from 'better-sqlite3';
import type { GoogleGenAI } from '@google/genai';
import { listEntries } from '../db.js';
import { filterCandidates, answerQuestion } from '../search.js';

export function searchRouter(db: Database.Database, gemini: Pick<GoogleGenAI, 'models'>): Router {
  const router = Router();
  router.post('/', async (req, res) => {
    const question = req.body?.question;
    if (typeof question !== 'string' || question.trim() === '') {
      return res.status(400).json({ error: 'question is required' });
    }
    const candidates = filterCandidates(listEntries(db, 500), question);
    try {
      const answer = await answerQuestion(gemini, question, candidates);
      res.json({ answer, matched: candidates.length });
    } catch (err) {
      res.status(502).json({ error: 'search failed', detail: (err as Error).message });
    }
  });
  return router;
}

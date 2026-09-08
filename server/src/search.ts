import type { GoogleGenAI } from '@google/genai';
import type { Entry } from './db.js';

export function filterCandidates(entries: Entry[], query: string, limit = 30): Entry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = entries.map((e) => {
    const haystack = `${e.raw_text} ${e.domain} ${e.type} ${e.structured}`.toLowerCase();
    const score = words.reduce((acc, w) => acc + (haystack.includes(w) ? 1 : 0), 0);
    return { entry: e, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.entry);
}

const ANSWER_SYSTEM_PROMPT = `You are a personal assistant answering questions about the user's own notes, tasks, and expenses. Use only the provided entries as ground truth — do not invent details. If nothing relevant is present, say so plainly.`;

export async function answerQuestion(
  client: Pick<GoogleGenAI, 'models'>,
  question: string,
  candidates: Entry[]
): Promise<string> {
  const context = candidates
    .map((e) => `- [${e.domain}/${e.type}] ${e.raw_text} (structured: ${e.structured}, created: ${e.created_at})`)
    .join('\n');
  const response = await client.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Entries:\n${context || '(none found)'}\n\nQuestion: ${question}`,
    config: { systemInstruction: ANSWER_SYSTEM_PROMPT },
  });
  return response.text ?? '';
}

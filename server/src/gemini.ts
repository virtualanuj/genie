import type { GoogleGenAI } from '@google/genai';
import { DOMAINS, TYPES, isValidRecurrence, type Domain, type EntryType, type Recurrence } from './db.js';

export interface ClassifyResult {
  domain: Domain;
  type: EntryType;
  structured: Record<string, unknown>;
  remind_at: string | null;
  recurrence: Recurrence | null;
}

const CLASSIFY_SYSTEM_PROMPT = `You are a personal organizer. Given a short note the user typed or spoke, classify it and extract structured details.

Respond with ONLY a JSON object, no other text, matching this shape:
{
  "domain": "work" | "finance" | "personal",
  "type": "task" | "expense" | "note" | "reminder" | "event",
  "structured": { <type-specific fields, e.g. amount/currency/category for expense, due_date/project for task, date/location for event> },
  "remind_at": "<ISO 8601 timestamp, or null if there's no clear due date/time>",
  "recurrence": null | { "freq": "daily" | "weekly" | "monthly" | "yearly", "interval": <positive integer, e.g. 1 for "every month", 2 for "every 2 weeks"> }
}

Only set "recurrence" when the text clearly implies something repeats
("every month", "weekly", "each Monday", "annually"). Otherwise it
must be null. When recurrence is set, "remind_at" should be the first
upcoming occurrence.

Today's date is {{today}}.`;

export async function classifyEntry(
  client: Pick<GoogleGenAI, 'models'>,
  rawText: string
): Promise<ClassifyResult> {
  const systemInstruction = CLASSIFY_SYSTEM_PROMPT.replace('{{today}}', new Date().toISOString().slice(0, 10));
  const response = await client.models.generateContent({
    model: 'gemini-flash-lite-latest',
    contents: rawText,
    config: { systemInstruction, responseMimeType: 'application/json' },
  });

  if (!response.text) throw new Error('Gemini response had no text content');

  const parsed = JSON.parse(response.text);
  if (!DOMAINS.includes(parsed.domain)) {
    throw new Error(`Gemini returned an unrecognized domain: ${parsed.domain}`);
  }
  if (!TYPES.includes(parsed.type)) {
    throw new Error(`Gemini returned an unrecognized type: ${parsed.type}`);
  }
  // Drop rather than reject an unrecognized recurrence shape/freq (e.g. a
  // synonym Gemini invents) -- it's a minor field, and letting a bad value
  // through would otherwise silently break the recurrence engine later.
  const recurrence: Recurrence | null = isValidRecurrence(parsed.recurrence) ? parsed.recurrence ?? null : null;

  return {
    domain: parsed.domain,
    type: parsed.type,
    structured: parsed.structured ?? {},
    remind_at: parsed.remind_at ?? null,
    recurrence,
  };
}

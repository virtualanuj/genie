import type { GoogleGenAI } from '@google/genai';
import {
  DOMAINS, TYPES, isValidRecurrence, BUSINESS_MESSAGE_CATEGORIES, PRIORITIES,
  type Domain, type EntryType, type Recurrence, type BusinessMessageCategory, type Priority,
} from './db.js';
import { redactSensitive, MAX_TRIAGE_CHARS } from './redact.js';

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

export interface TriageResult {
  category: BusinessMessageCategory;
  priority: Priority;
  priority_reason: string;
  summary: string;
  sender: string | null;
}

const TRIAGE_SYSTEM_PROMPT = `You triage inbound business messages (emails, chat messages, customer notes) so the reader knows what to respond to first.

Contact details have been replaced with placeholders: [EMAIL], [PHONE], [NUMBER]. Treat them as present but unknown. The message may be cut off after ${MAX_TRIAGE_CHARS} characters.

Respond with ONLY a JSON object, no other text, matching this shape:
{
  "category": "request" | "question" | "complaint" | "sales_lead" | "fyi" | "spam",
  "priority": "urgent" | "high" | "medium" | "low",
  "priority_reason": "<one short sentence explaining the priority>",
  "summary": "<one-line summary of the message>",
  "sender": "<sender name or organization if identifiable from the text, otherwise null>"
}

Priority guidance:
- urgent: time-sensitive or blocking -- outages, legal or security issues, a deadline today, an angry customer threatening to leave.
- high: someone is waiting on a reply soon -- a customer or stakeholder needs a decision, a warm sales lead.
- medium: routine requests or questions with no time pressure.
- low: FYI updates, newsletters, cold outreach, spam.

Today's date is {{today}}.`;

export async function triageBusinessMessage(
  client: Pick<GoogleGenAI, 'models'>,
  rawText: string
): Promise<TriageResult> {
  // Redact before truncating so a cut can't leave a partial email/number behind.
  // Done here (not in the route) so no caller can send unredacted text.
  const contents = redactSensitive(rawText).slice(0, MAX_TRIAGE_CHARS);
  const systemInstruction = TRIAGE_SYSTEM_PROMPT.replace('{{today}}', new Date().toISOString().slice(0, 10));
  const response = await client.models.generateContent({
    model: 'gemini-flash-lite-latest',
    contents,
    config: { systemInstruction, responseMimeType: 'application/json' },
  });

  if (!response.text) throw new Error('Gemini response had no text content');

  const parsed = JSON.parse(response.text);
  if (!BUSINESS_MESSAGE_CATEGORIES.includes(parsed.category)) {
    throw new Error(`Gemini returned an unrecognized category: ${parsed.category}`);
  }
  if (!PRIORITIES.includes(parsed.priority)) {
    throw new Error(`Gemini returned an unrecognized priority: ${parsed.priority}`);
  }

  return {
    category: parsed.category,
    priority: parsed.priority,
    priority_reason: typeof parsed.priority_reason === 'string' ? parsed.priority_reason : '',
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    sender: typeof parsed.sender === 'string' && parsed.sender.trim() !== '' ? parsed.sender : null,
  };
}

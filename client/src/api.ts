export interface Entry {
  id: number;
  raw_text: string;
  domain: 'work' | 'finance' | 'personal';
  type: 'task' | 'expense' | 'note' | 'reminder' | 'event';
  structured: string;
  tags: string | null;
  remind_at: string | null;
  recurrence: string | null;
  series_id: number | null;
  created_at: string;
  updated_at: string;
}

export const DOMAINS: Entry['domain'][] = ['work', 'finance', 'personal'];
export const TYPES: Entry['type'][] = ['task', 'expense', 'note', 'reminder', 'event'];
export const RECURRENCE_FREQS = ['daily', 'weekly', 'monthly', 'yearly'] as const;
export type RecurrenceFreq = (typeof RECURRENCE_FREQS)[number];
export interface Recurrence { freq: RecurrenceFreq; interval: number }

export function recurrenceLabel(entry: Pick<Entry, 'recurrence'>): string | null {
  if (!entry.recurrence) return null;
  try {
    const r = JSON.parse(entry.recurrence) as Recurrence;
    return r.interval > 1 ? `recurs every ${r.interval} ${r.freq}` : `recurs ${r.freq}`;
  } catch {
    return null;
  }
}

export async function createEntry(rawText: string): Promise<Entry> {
  const res = await fetch('/api/entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw_text: rawText }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `failed to create entry: ${res.status}`);
  }
  return res.json();
}

export async function listEntries(): Promise<Entry[]> {
  const res = await fetch('/api/entries');
  if (!res.ok) throw new Error(`failed to list entries: ${res.status}`);
  return res.json();
}

const DUE_WINDOW_HOURS = 24;

export async function listDueEntries(): Promise<Entry[]> {
  const cutoff = new Date(Date.now() + DUE_WINDOW_HOURS * 60 * 60 * 1000);
  const res = await fetch(`/api/entries/due?before=${encodeURIComponent(cutoff.toISOString())}`);
  if (!res.ok) throw new Error(`failed to list due entries: ${res.status}`);
  return res.json();
}

export async function deleteEntry(id: number): Promise<void> {
  const res = await fetch(`/api/entries/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`failed to delete entry: ${res.status}`);
}

export async function updateEntry(
  id: number,
  fields: Pick<Entry, 'raw_text' | 'domain' | 'type'> & { recurrence: Recurrence | null }
): Promise<Entry> {
  const res = await fetch(`/api/entries/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `failed to update entry: ${res.status}`);
  }
  return res.json();
}

export async function askQuestion(question: string): Promise<{ answer: string; matched: number }> {
  const res = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) throw new Error(`search failed: ${res.status}`);
  return res.json();
}

export interface BusinessMessage {
  id: number;
  raw_text: string;
  category: 'request' | 'question' | 'complaint' | 'sales_lead' | 'fyi' | 'spam';
  priority: 'urgent' | 'high' | 'medium' | 'low';
  priority_overridden: 0 | 1;
  priority_reason: string;
  summary: string;
  sender: string | null;
  status: 'open' | 'done';
  created_at: string;
  updated_at: string;
}

// Order is the sort rank: urgent first. Must match the server's listBusinessMessages ORDER BY.
export const PRIORITIES: BusinessMessage['priority'][] = ['urgent', 'high', 'medium', 'low'];

export function sortBusinessMessages(messages: BusinessMessage[]): BusinessMessage[] {
  return [...messages].sort((a, b) =>
    (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1) ||
    PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) ||
    b.created_at.localeCompare(a.created_at) ||
    b.id - a.id
  );
}

const BUSINESS_MESSAGES_URL = '/api/business-messages';

async function errorFrom(res: Response, fallback: string): Promise<Error> {
  const body = await res.json().catch(() => null);
  return new Error(body?.error ?? `${fallback}: ${res.status}`);
}

export async function triageBusinessMessage(rawText: string): Promise<BusinessMessage> {
  const res = await fetch(BUSINESS_MESSAGES_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw_text: rawText }),
  });
  if (!res.ok) throw await errorFrom(res, 'failed to triage message');
  return res.json();
}

export async function listBusinessMessages(): Promise<BusinessMessage[]> {
  const res = await fetch(BUSINESS_MESSAGES_URL);
  if (!res.ok) throw new Error(`failed to list business messages: ${res.status}`);
  return res.json();
}

export async function updateBusinessMessage(
  id: number,
  fields: Partial<Pick<BusinessMessage, 'status' | 'priority'>>
): Promise<BusinessMessage> {
  const res = await fetch(`${BUSINESS_MESSAGES_URL}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw await errorFrom(res, 'failed to update message');
  return res.json();
}

export async function deleteBusinessMessage(id: number): Promise<void> {
  const res = await fetch(`${BUSINESS_MESSAGES_URL}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw await errorFrom(res, 'failed to delete message');
}

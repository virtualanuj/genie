export interface Entry {
  id: number;
  raw_text: string;
  domain: 'work' | 'finance' | 'personal';
  type: 'task' | 'expense' | 'note' | 'reminder' | 'event';
  structured: string;
  tags: string | null;
  remind_at: string | null;
  created_at: string;
  updated_at: string;
}

export const DOMAINS: Entry['domain'][] = ['work', 'finance', 'personal'];
export const TYPES: Entry['type'][] = ['task', 'expense', 'note', 'reminder', 'event'];

export async function createEntry(rawText: string): Promise<Entry> {
  const res = await fetch('/api/entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw_text: rawText }),
  });
  if (!res.ok) throw new Error(`failed to create entry: ${res.status}`);
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
  fields: Pick<Entry, 'raw_text' | 'domain' | 'type'>
): Promise<Entry> {
  const res = await fetch(`/api/entries/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`failed to update entry: ${res.status}`);
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

import { useState } from 'react';
import { DOMAINS, TYPES, type Entry } from './api.js';

type Draft = { raw_text: string; domain: Entry['domain']; type: Entry['type'] };

export default function EntryList({
  entries, onDelete, onEdit,
}: {
  entries: Entry[];
  onDelete: (id: number) => void;
  onEdit: (id: number, fields: Draft) => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  function startEdit(entry: Entry) {
    setEditingId(entry.id);
    setDraft({ raw_text: entry.raw_text, domain: entry.domain, type: entry.type });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  function saveEdit() {
    if (editingId !== null && draft) onEdit(editingId, draft);
    cancelEdit();
  }

  return (
    <ul>
      {entries.map((entry) => (
        <li key={entry.id}>
          {editingId === entry.id && draft ? (
            <>
              <input
                value={draft.raw_text}
                onChange={(e) => setDraft({ ...draft, raw_text: e.target.value })}
              />
              <select
                aria-label="domain"
                value={draft.domain}
                onChange={(e) => setDraft({ ...draft, domain: e.target.value as Entry['domain'] })}
              >
                {DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <select
                aria-label="type"
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value as Entry['type'] })}
              >
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <button onClick={saveEdit}>Save</button>
              <button onClick={cancelEdit}>Cancel</button>
            </>
          ) : (
            <>
              <span>{entry.raw_text}</span>
              <small> ({entry.domain}/{entry.type})</small>
              <button onClick={() => startEdit(entry)}>Edit</button>
              <button onClick={() => onDelete(entry.id)}>Delete</button>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

import { useState } from 'react';
import { DOMAINS, TYPES, RECURRENCE_FREQS, type Entry, type Recurrence } from './api.js';

type Draft = { raw_text: string; domain: Entry['domain']; type: Entry['type']; recurrence: Recurrence | null };

function recurrenceLabel(entry: Entry): string | null {
  if (!entry.recurrence) return null;
  try {
    const r = JSON.parse(entry.recurrence) as Recurrence;
    return r.interval > 1 ? `recurs every ${r.interval} ${r.freq}` : `recurs ${r.freq}`;
  } catch {
    return null;
  }
}

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
    setDraft({
      raw_text: entry.raw_text,
      domain: entry.domain,
      type: entry.type,
      recurrence: entry.recurrence ? (JSON.parse(entry.recurrence) as Recurrence) : null,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  function saveEdit() {
    if (editingId !== null && draft) onEdit(editingId, draft);
    cancelEdit();
  }

  if (entries.length === 0) {
    return <p className="empty-note">Nothing captured yet — try the box above.</p>;
  }

  return (
    <ul className="entry-list">
      {entries.map((entry) => {
        const label = recurrenceLabel(entry);
        return (
          <li key={entry.id} className="entry-row">
            {editingId === entry.id && draft ? (
              <div className="entry-edit-row">
                <input
                  className="entry-edit-input"
                  value={draft.raw_text}
                  onChange={(e) => setDraft({ ...draft, raw_text: e.target.value })}
                />
                <select
                  className="entry-edit-select"
                  aria-label="domain"
                  value={draft.domain}
                  onChange={(e) => setDraft({ ...draft, domain: e.target.value as Entry['domain'] })}
                >
                  {DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <select
                  className="entry-edit-select"
                  aria-label="type"
                  value={draft.type}
                  onChange={(e) => setDraft({ ...draft, type: e.target.value as Entry['type'] })}
                >
                  {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select
                  className="entry-edit-select"
                  aria-label="repeats"
                  value={draft.recurrence?.freq ?? ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDraft({
                      ...draft,
                      recurrence: value
                        ? { freq: value as Recurrence['freq'], interval: draft.recurrence?.interval ?? 1 }
                        : null,
                    });
                  }}
                >
                  <option value="">Doesn&apos;t repeat</option>
                  {RECURRENCE_FREQS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                <button className="btn-save" onClick={saveEdit}>Save</button>
                <button className="btn-cancel" onClick={cancelEdit}>Cancel</button>
              </div>
            ) : (
              <>
                <span className={`entry-dot domain-${entry.domain}`} aria-hidden="true" />
                <span className="entry-text">{entry.raw_text}</span>
                {label && <span className="recur-indicator" title={label} aria-hidden="true">↻</span>}
                <small className="entry-meta"> ({entry.domain}/{entry.type})</small>
                <span className="entry-actions">
                  <button className="btn-text" onClick={() => startEdit(entry)}>Edit</button>
                  <button className="btn-text" onClick={() => onDelete(entry.id)}>Delete</button>
                </span>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

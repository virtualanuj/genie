import { useState } from 'react';
import { DOMAINS, TYPES, RECURRENCE_FREQS, recurrenceLabel, type Entry, type Recurrence } from './api.js';

type Draft = { raw_text: string; domain: Entry['domain']; type: Entry['type']; recurrence: Recurrence | null };
type ViewMode = 'list' | 'card';

const DOMAIN_FILTERS = ['all', ...DOMAINS] as const;
type DomainFilter = (typeof DOMAIN_FILTERS)[number];

function sortByDueThenRecent(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => {
    if (a.remind_at && b.remind_at) return a.remind_at < b.remind_at ? -1 : a.remind_at > b.remind_at ? 1 : 0;
    if (a.remind_at && !b.remind_at) return -1;
    if (!a.remind_at && b.remind_at) return 1;
    return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0;
  });
}

export default function EntryList({
  entries, onDelete, onEdit,
}: {
  entries: Entry[];
  onDelete: (id: number) => void;
  onEdit: (id: number, fields: Draft) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<DomainFilter>('all');
  const [view, setView] = useState<ViewMode>('list');

  function startEdit(entry: Entry) {
    setEditingId(entry.id);
    setSaveError(null);
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
    setSaveError(null);
  }

  async function saveEdit() {
    if (editingId === null || !draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onEdit(editingId, draft);
      cancelEdit();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  if (entries.length === 0) {
    return <p className="empty-note">Nothing captured yet — try the box above.</p>;
  }

  const filtered = filter === 'all' ? entries : entries.filter((e) => e.domain === filter);
  const visible = sortByDueThenRecent(filtered);

  return (
    <>
      <div className="list-controls">
        <div className="filter-pills">
          {DOMAIN_FILTERS.map((f) => (
            <button
              key={f}
              className={`filter-pill${filter === f ? ' active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="view-toggle">
          <button
            className={`view-toggle-btn${view === 'list' ? ' active' : ''}`}
            aria-label="List view"
            onClick={() => setView('list')}
          >
            ☰
          </button>
          <button
            className={`view-toggle-btn${view === 'card' ? ' active' : ''}`}
            aria-label="Card view"
            onClick={() => setView('card')}
          >
            ▦
          </button>
        </div>
      </div>
      {visible.length === 0 ? (
        <p className="empty-note">No entries match this filter.</p>
      ) : (
        <ul className={view === 'card' ? 'entry-cards' : 'entry-list'}>
          {visible.map((entry) => {
            const label = recurrenceLabel(entry);
            return (
              <li key={entry.id} className={view === 'card' ? 'entry-card' : 'entry-row'}>
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
                    <button className="btn-save" onClick={saveEdit} disabled={saving}>Save</button>
                    <button className="btn-cancel" onClick={cancelEdit}>Cancel</button>
                    {saveError && <span className="edit-error" role="alert">{saveError}</span>}
                  </div>
                ) : (
                  <>
                    <div className="entry-main">
                      <span className={`domain-tag domain-${entry.domain}`}>{entry.domain}</span>
                      <span className="entry-text">{entry.raw_text}</span>
                      {label && <span className="recur-indicator" title={label} aria-hidden="true">↻</span>}
                    </div>
                    <div className="entry-footer">
                      <span className="type-label">{entry.type}</span>
                      <span className="entry-actions">
                        <button className="btn-text btn-accent" onClick={() => startEdit(entry)}>Edit</button>
                        <button className="btn-text btn-danger" onClick={() => onDelete(entry.id)}>Delete</button>
                      </span>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

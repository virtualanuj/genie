import { useEffect, useState } from 'react';
import {
  triageBusinessMessage, listBusinessMessages, updateBusinessMessage, deleteBusinessMessage,
  sortBusinessMessages, PRIORITIES, type BusinessMessage,
} from './api.js';
import { getSpeechRecognition } from './speech.js';

type Priority = BusinessMessage['priority'];
type Category = BusinessMessage['category'];
type ViewMode = 'list' | 'card';

const CATEGORY_LABELS: Record<Category, string> = {
  request: 'Request', question: 'Question', complaint: 'Complaint',
  sales_lead: 'Sales lead', fyi: 'FYI', spam: 'Spam',
};
const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];

function MessageRow({ message, view, error, onUpdate, onDelete }: {
  message: BusinessMessage;
  view: ViewMode;
  error: string | undefined;
  onUpdate: (m: BusinessMessage, fields: Partial<Pick<BusinessMessage, 'status' | 'priority'>>) => void;
  onDelete: (id: number) => void;
}) {
  const done = message.status === 'done';
  const layoutClass = view === 'card' ? 'entry-card message-card' : 'message-row';
  return (
    <li className={`${layoutClass}${done ? ' message-done' : ''}`}>
      <div className="message-main">
        <div className="message-meta">
          <select
            aria-label="Priority"
            className={`priority-badge priority-${message.priority}`}
            value={message.priority}
            onChange={(e) => onUpdate(message, { priority: e.target.value as Priority })}
          >
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          {message.priority_overridden === 1 && (
            <span className="edited-marker" title="Priority set by you">edited</span>
          )}
          <span className="category-chip">{CATEGORY_LABELS[message.category]}</span>
          {message.sender && <span className="message-sender">{message.sender}</span>}
        </div>
        <p className="message-summary" data-testid="message-summary">{message.summary || message.raw_text}</p>
        {message.priority_reason && <p className="message-reason">AI reasoning: {message.priority_reason}</p>}
        <details className="message-raw">
          <summary>Original message</summary>
          <pre>{message.raw_text}</pre>
        </details>
        {error && <span className="row-error" role="alert">{error}</span>}
      </div>
      <div className="message-actions">
        <button
          type="button"
          className={`btn-text done-toggle${done ? ' active' : ''}`}
          aria-pressed={done}
          aria-label={`${done ? 'Reopen' : 'Mark done'}: ${message.summary}`}
          onClick={() => onUpdate(message, { status: done ? 'open' : 'done' })}
        >
          {done ? 'Reopen' : 'Mark done'}
        </button>
        <button type="button" className="btn-text btn-danger" onClick={() => onDelete(message.id)}>Delete</button>
      </div>
    </li>
  );
}

function FilterPills<T extends string>({ label, values, labelFor, selected, onSelect }: {
  label: string;
  values: T[];
  labelFor: (value: T) => string;
  selected: T | 'all';
  onSelect: (value: T | 'all') => void;
}) {
  return (
    <div className="filter-pills" role="group" aria-label={label}>
      {(['all', ...values] as (T | 'all')[]).map((v) => (
        <button
          key={v}
          type="button"
          className={`filter-pill${selected === v ? ' active' : ''}`}
          onClick={() => onSelect(v)}
        >
          {v === 'all' ? 'All' : labelFor(v)}
        </button>
      ))}
    </div>
  );
}

export default function BusinessTab({ onOpenCountChange }: { onOpenCountChange?: (n: number) => void }) {
  const [messages, setMessages] = useState<BusinessMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<Category | 'all'>('all');
  const [view, setView] = useState<ViewMode>('list');
  const RecognitionCtor = getSpeechRecognition();

  useEffect(() => {
    listBusinessMessages().then(setMessages).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  // The tab badge counts every open message, regardless of the filters below.
  const totalOpen = messages.filter((m) => m.status === 'open').length;

  // Only report after the initial load, so the tab count never flashes to 0.
  useEffect(() => {
    if (loaded) onOpenCountChange?.(totalOpen);
  }, [loaded, totalOpen, onOpenCountChange]);

  const visible = messages.filter(
    (m) =>
      (priorityFilter === 'all' || m.priority === priorityFilter) &&
      (categoryFilter === 'all' || m.category === categoryFilter)
  );
  const open = visible.filter((m) => m.status === 'open');
  const done = visible.filter((m) => m.status === 'done');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const message = await triageBusinessMessage(text);
      setMessages((prev) => sortBusinessMessages([message, ...prev]));
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to triage message');
    } finally {
      setSubmitting(false);
    }
  }

  // Appends rather than replaces, so a message can be dictated in parts.
  function handleSpeak() {
    if (!RecognitionCtor) return;
    const recognition = new RecognitionCtor();
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setText((prev) => (prev.trim() ? `${prev} ${transcript}` : transcript));
    };
    recognition.start();
  }

  // Not optimistic: the row only changes after the server confirms (spec.md "Row errors").
  async function runRowAction(id: number, action: () => Promise<void>) {
    try {
      await action();
      setRowErrors(({ [id]: _cleared, ...rest }) => rest);
    } catch (err) {
      setRowErrors((prev) => ({ ...prev, [id]: err instanceof Error ? err.message : 'Action failed' }));
    }
  }

  function handleUpdate(message: BusinessMessage, fields: Partial<Pick<BusinessMessage, 'status' | 'priority'>>) {
    return runRowAction(message.id, async () => {
      const updated = await updateBusinessMessage(message.id, fields);
      setMessages((prev) => sortBusinessMessages(prev.map((m) => (m.id === updated.id ? updated : m))));
    });
  }

  function handleDelete(id: number) {
    return runRowAction(id, async () => {
      await deleteBusinessMessage(id);
      setMessages((prev) => prev.filter((m) => m.id !== id));
    });
  }

  const listClass = view === 'card' ? 'entry-cards' : 'message-list';
  const row = (m: BusinessMessage) => (
    <MessageRow
      key={m.id}
      message={m}
      view={view}
      error={rowErrors[m.id]}
      onUpdate={handleUpdate}
      onDelete={handleDelete}
    />
  );

  let openEmptyNote = 'Nothing waiting on you.';
  if (messages.length > 0 && visible.length === 0) openEmptyNote = 'No messages match these filters.';

  return (
    <>
      <form className="triage-form" onSubmit={handleSubmit}>
        <textarea
          className="triage-input"
          placeholder="Paste a business message (email, chat, customer note)..."
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="triage-actions">
          {error && <span className="capture-error" role="alert">{error}</span>}
          {RecognitionCtor && (
            <button type="button" className="mic-button" aria-label="Speak" onClick={handleSpeak}>🎤</button>
          )}
          <button type="submit" className="add-button" disabled={submitting}>
            {submitting ? 'Triaging…' : 'Triage'}
          </button>
        </div>
      </form>

      <section className="section">
        <h2 className="section-title">
          Open
          {open.length > 0 && <span className="section-count">{open.length}</span>}
        </h2>
        {messages.length > 0 && (
          <div className="list-controls business-controls">
            <div className="filter-stack">
              <FilterPills
                label="Filter by priority"
                values={PRIORITIES}
                labelFor={(p) => p[0].toUpperCase() + p.slice(1)}
                selected={priorityFilter}
                onSelect={setPriorityFilter}
              />
              <FilterPills
                label="Filter by category"
                values={CATEGORIES}
                labelFor={(c) => CATEGORY_LABELS[c]}
                selected={categoryFilter}
                onSelect={setCategoryFilter}
              />
            </div>
            <div className="view-toggle">
              <button
                type="button"
                className={`view-toggle-btn${view === 'list' ? ' active' : ''}`}
                aria-label="List view"
                onClick={() => setView('list')}
              >
                ☰
              </button>
              <button
                type="button"
                className={`view-toggle-btn${view === 'card' ? ' active' : ''}`}
                aria-label="Card view"
                onClick={() => setView('card')}
              >
                ▦
              </button>
            </div>
          </div>
        )}
        {open.length === 0 ? (
          <p className="empty-note">{openEmptyNote}</p>
        ) : (
          <ul className={listClass}>{open.map(row)}</ul>
        )}
      </section>

      {done.length > 0 && (
        <details className="section done-section">
          <summary className="section-title">Done ({done.length})</summary>
          <ul className={listClass}>{done.map(row)}</ul>
        </details>
      )}
    </>
  );
}

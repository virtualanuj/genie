import { useEffect, useState } from 'react';
import {
  triageBusinessMessage, listBusinessMessages, updateBusinessMessage, deleteBusinessMessage,
  sortBusinessMessages, PRIORITIES, type BusinessMessage,
} from './api.js';

const CATEGORY_LABELS: Record<BusinessMessage['category'], string> = {
  request: 'Request', question: 'Question', complaint: 'Complaint',
  sales_lead: 'Sales lead', fyi: 'FYI', spam: 'Spam',
};

function MessageRow({ message, error, onUpdate, onDelete }: {
  message: BusinessMessage;
  error: string | undefined;
  onUpdate: (m: BusinessMessage, fields: Partial<Pick<BusinessMessage, 'status' | 'priority'>>) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <li className={`message-row ${message.status === 'done' ? 'message-done' : ''}`}>
      <input
        type="checkbox"
        className="message-check"
        aria-label={`Done: ${message.summary}`}
        checked={message.status === 'done'}
        onChange={() => onUpdate(message, { status: message.status === 'open' ? 'done' : 'open' })}
      />
      <div className="message-main">
        <div className="message-meta">
          <select
            aria-label="Priority"
            className={`priority-badge priority-${message.priority}`}
            value={message.priority}
            onChange={(e) => onUpdate(message, { priority: e.target.value as BusinessMessage['priority'] })}
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
      <button type="button" className="btn-text btn-danger" onClick={() => onDelete(message.id)}>Delete</button>
    </li>
  );
}

export default function BusinessTab({ onOpenCountChange }: { onOpenCountChange?: (n: number) => void }) {
  const [messages, setMessages] = useState<BusinessMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});

  useEffect(() => {
    listBusinessMessages().then(setMessages).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  const open = messages.filter((m) => m.status === 'open');
  const done = messages.filter((m) => m.status === 'done');

  // Only report after the initial load, so the tab count never flashes to 0.
  useEffect(() => {
    if (loaded) onOpenCountChange?.(open.length);
  }, [loaded, open.length, onOpenCountChange]);

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

  const row = (m: BusinessMessage) => (
    <MessageRow key={m.id} message={m} error={rowErrors[m.id]} onUpdate={handleUpdate} onDelete={handleDelete} />
  );

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
        {open.length === 0 ? (
          <p className="empty-note">Nothing waiting on you.</p>
        ) : (
          <ul className="message-list">{open.map(row)}</ul>
        )}
      </section>

      {done.length > 0 && (
        <details className="section done-section">
          <summary className="section-title">Done ({done.length})</summary>
          <ul className="message-list">{done.map(row)}</ul>
        </details>
      )}
    </>
  );
}

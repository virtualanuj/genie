import { useEffect, useState } from 'react';
import { listDueEntries, type Entry } from './api.js';

function formatDue(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function DuePanel({ refreshKey }: { refreshKey?: number } = {}) {
  const [due, setDue] = useState<Entry[] | null>(null);

  useEffect(() => {
    listDueEntries().then(setDue).catch(() => setDue([]));
  }, [refreshKey]);

  if (due === null) return null;

  return (
    <section>
      <h2 className="section-title">
        Due / Upcoming
        {due.length > 0 && <span className="section-count">{due.length}</span>}
      </h2>
      {due.length === 0 ? (
        <p className="empty-note">Nothing due.</p>
      ) : (
        <ul className="due-list">
          {due.map((entry) => (
            <li key={entry.id} className="due-row">
              <span className="due-dot" aria-hidden="true" />
              <span className="due-text">{entry.raw_text}</span>
              <span className="due-time">
                {entry.remind_at ? formatDue(entry.remind_at) : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

import { useEffect, useState } from 'react';
import { listDueEntries, recurrenceLabel, type Entry } from './api.js';

function formatDue(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function DueRow({ entry }: { entry: Entry }) {
  const label = recurrenceLabel(entry);
  return (
    <li className="due-row">
      <span className="due-dot" aria-hidden="true" />
      <span className="due-text">{entry.raw_text}</span>
      {label && <span className="recur-indicator" title={label} aria-hidden="true">↻</span>}
      <span className="due-time">{entry.remind_at ? formatDue(entry.remind_at) : ''}</span>
    </li>
  );
}

export default function DuePanel({ refreshKey }: { refreshKey?: number } = {}) {
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    listDueEntries().then(setEntries).catch(() => setEntries([]));
  }, [refreshKey]);

  if (entries === null) return null;

  const nowISO = new Date().toISOString();
  const due = entries.filter((e) => e.remind_at && e.remind_at <= nowISO);
  const upcoming = entries.filter((e) => e.remind_at && e.remind_at > nowISO);

  return (
    <>
      <section className="section">
        <h2 className="section-title">
          Due
          {due.length > 0 && <span className="section-count">{due.length}</span>}
        </h2>
        {due.length === 0 ? (
          <p className="empty-note">Nothing due right now.</p>
        ) : (
          <ul className="due-list">
            {due.map((entry) => <DueRow key={entry.id} entry={entry} />)}
          </ul>
        )}
      </section>
      <section className="section">
        <h2 className="section-title">
          Upcoming
          {upcoming.length > 0 && <span className="section-count">{upcoming.length}</span>}
        </h2>
        {upcoming.length === 0 ? (
          <p className="empty-note">Nothing coming up in the next 24 hours.</p>
        ) : (
          <ul className="due-list">
            {upcoming.map((entry) => <DueRow key={entry.id} entry={entry} />)}
          </ul>
        )}
      </section>
    </>
  );
}

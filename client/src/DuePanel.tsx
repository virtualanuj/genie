import { useEffect, useState } from 'react';
import { listDueEntries, type Entry } from './api.js';

export default function DuePanel() {
  const [due, setDue] = useState<Entry[] | null>(null);

  useEffect(() => {
    listDueEntries().then(setDue).catch(() => setDue([]));
  }, []);

  if (due === null) return null;

  return (
    <section>
      <h2>Due / Upcoming</h2>
      {due.length === 0 ? (
        <p>Nothing due.</p>
      ) : (
        <ul>
          {due.map((entry) => (
            <li key={entry.id}>{entry.raw_text} — {entry.remind_at}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

import { useEffect, useState } from 'react';
import CaptureBox from './CaptureBox.js';
import EntryList from './EntryList.js';
import DuePanel from './DuePanel.js';
import SearchBox from './SearchBox.js';
import { listEntries, deleteEntry, updateEntry, type Entry } from './api.js';

export default function App() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [dueRefreshKey, setDueRefreshKey] = useState(0);

  useEffect(() => {
    listEntries().then(setEntries).catch(() => {});
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="wordmark">Genie</h1>
        <p className="tagline">Tell it anything — it sorts out the rest.</p>
      </header>

      <CaptureBox
        onCaptured={(entry) => {
          setEntries((prev) => [entry, ...prev]);
          setDueRefreshKey((k) => k + 1);
        }}
      />

      <DuePanel refreshKey={dueRefreshKey} />

      <section className="section">
        <h2 className="section-title">
          Recent
          {entries.length > 0 && <span className="section-count">{entries.length}</span>}
        </h2>
        <EntryList
          entries={entries}
          onDelete={async (id) => {
            await deleteEntry(id);
            setEntries((prev) => prev.filter((e) => e.id !== id));
            setDueRefreshKey((k) => k + 1);
          }}
          onEdit={async (id, fields) => {
            const updated = await updateEntry(id, fields);
            setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
            setDueRefreshKey((k) => k + 1);
          }}
        />
      </section>

      <section className="section">
        <SearchBox />
      </section>
    </div>
  );
}

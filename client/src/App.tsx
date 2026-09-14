import { useEffect, useState } from 'react';
import CaptureBox from './CaptureBox.js';
import EntryList from './EntryList.js';
import DuePanel from './DuePanel.js';
import SearchBox from './SearchBox.js';
import BusinessTab from './BusinessTab.js';
import { listEntries, deleteEntry, updateEntry, listBusinessMessages, type Entry } from './api.js';

export default function App() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [dueRefreshKey, setDueRefreshKey] = useState(0);
  const [tab, setTab] = useState<'personal' | 'business'>('personal');
  const [openBusinessCount, setOpenBusinessCount] = useState(0);

  useEffect(() => {
    listEntries().then(setEntries).catch(() => {});
    listBusinessMessages()
      .then((ms) => setOpenBusinessCount(ms.filter((m) => m.status === 'open').length))
      .catch(() => {});
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="wordmark">Genie</h1>
        <p className="tagline">Tell it anything — it sorts out the rest.</p>
      </header>

      <nav className="tab-bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'personal'}
          className={`tab ${tab === 'personal' ? 'tab-active' : ''}`}
          onClick={() => setTab('personal')}
        >
          Personal
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'business'}
          className={`tab ${tab === 'business' ? 'tab-active' : ''}`}
          onClick={() => setTab('business')}
        >
          {openBusinessCount > 0 ? `Business (${openBusinessCount})` : 'Business'}
        </button>
      </nav>

      {tab === 'personal' && (
        <>
          <CaptureBox
            onCaptured={(entry) => {
              setEntries((prev) => [entry, ...prev]);
              setDueRefreshKey((k) => k + 1);
            }}
          />

          <DuePanel
            refreshKey={dueRefreshKey}
            onDelete={async (id) => {
              await deleteEntry(id);
              setEntries((prev) => prev.filter((e) => e.id !== id));
              setDueRefreshKey((k) => k + 1);
            }}
          />

          <section className="section">
            <h2 className="section-title">
              Tasks
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
        </>
      )}

      {tab === 'business' && <BusinessTab onOpenCountChange={setOpenBusinessCount} />}
    </div>
  );
}

import { useEffect, useState } from 'react';
import CaptureBox from './CaptureBox.js';
import EntryList from './EntryList.js';
import { listEntries, deleteEntry, updateEntry, type Entry } from './api.js';

export default function App() {
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    listEntries().then(setEntries).catch(() => {});
  }, []);

  return (
    <div>
      <h1>Genie</h1>
      <CaptureBox onCaptured={(entry) => setEntries((prev) => [entry, ...prev])} />
      <EntryList
        entries={entries}
        onDelete={async (id) => {
          await deleteEntry(id);
          setEntries((prev) => prev.filter((e) => e.id !== id));
        }}
        onEdit={async (id, fields) => {
          const updated = await updateEntry(id, fields);
          setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
        }}
      />
    </div>
  );
}

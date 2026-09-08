import { useState } from 'react';
import { createEntry, type Entry } from './api.js';

export default function CaptureBox({ onCaptured }: { onCaptured: (entry: Entry) => void }) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    try {
      const entry = await createEntry(text);
      onCaptured(entry);
      setText('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        placeholder="Type or say something..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit" disabled={submitting}>Add</button>
    </form>
  );
}

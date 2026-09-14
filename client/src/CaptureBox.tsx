import { useState } from 'react';
import { createEntry, type Entry } from './api.js';
import { getSpeechRecognition } from './speech.js';

export default function CaptureBox({ onCaptured }: { onCaptured: (entry: Entry) => void }) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const RecognitionCtor = getSpeechRecognition();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const entry = await createEntry(text);
      onCaptured(entry);
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add entry');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSpeak() {
    if (!RecognitionCtor) return;
    const recognition = new RecognitionCtor();
    recognition.onresult = (event) => {
      setText(event.results[0][0].transcript);
    };
    recognition.start();
  }

  return (
    <form className="capture-form" onSubmit={handleSubmit}>
      <input
        className="capture-input"
        placeholder="Type or say something..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {RecognitionCtor && (
        <button type="button" className="mic-button" aria-label="Speak" onClick={handleSpeak}>🎤</button>
      )}
      <button type="submit" className="add-button" disabled={submitting}>Add</button>
      {error && <span className="capture-error" role="alert">{error}</span>}
    </form>
  );
}

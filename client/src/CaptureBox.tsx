import { useState } from 'react';
import { createEntry, type Entry } from './api.js';

type SpeechRecognitionLike = {
  onresult: ((event: { results: { 0: { transcript: string } }[] }) => void) | null;
  start: () => void;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | undefined {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export default function CaptureBox({ onCaptured }: { onCaptured: (entry: Entry) => void }) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const RecognitionCtor = getSpeechRecognition();

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
    </form>
  );
}

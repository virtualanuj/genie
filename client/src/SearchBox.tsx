import { useState } from 'react';
import { askQuestion } from './api.js';

export default function SearchBox() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || asking) return;
    setAsking(true);
    try {
      const result = await askQuestion(question);
      setAnswer(result.answer);
    } finally {
      setAsking(false);
    }
  }

  return (
    <section>
      <h2>Ask Genie</h2>
      <form onSubmit={handleSubmit}>
        <input
          placeholder="Ask a question about your entries..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button type="submit" disabled={asking}>Ask</button>
      </form>
      {answer && <p>{answer}</p>}
    </section>
  );
}

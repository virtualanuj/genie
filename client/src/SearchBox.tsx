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
      <h2 className="section-title">Ask Genie</h2>
      <form className="search-form" onSubmit={handleSubmit}>
        <input
          className="search-input"
          placeholder="Ask a question about your entries..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button type="submit" className="ask-button" disabled={asking}>
          {asking ? 'Asking…' : 'Ask'}
        </button>
      </form>
      {answer && <p className="search-answer">{answer}</p>}
    </section>
  );
}

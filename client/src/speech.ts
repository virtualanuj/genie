export type SpeechRecognitionLike = {
  onresult: ((event: { results: { 0: { transcript: string } }[] }) => void) | null;
  start: () => void;
};

export function getSpeechRecognition(): (new () => SpeechRecognitionLike) | undefined {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

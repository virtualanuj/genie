// Only the first MAX_TRIAGE_CHARS of *redacted* text are sent to Gemini.
export const MAX_TRIAGE_CHARS = 1000;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Leading + and country code: +44 20 7946 0958, +1 (555) 123-4567.
const INTL_PHONE = /\+\d{1,3}(?:[\s.-]?\(?\d{1,4}\)?){2,5}/g;
// 12+ digits, optionally separated by single spaces/dashes: cards, account numbers.
const LONG_NUMBER = /\b\d(?:[ -]?\d){11,}\b/g;
// North American local: (555) 123-4567, 555-123-4567, 555.123.4567, 555 123 4567.
const LOCAL_PHONE = /(?:\(\d{3}\)\s?|\b\d{3}[\s.-])\d{3}[\s.-]\d{4}\b/g;

// Regex-based, not a PII detector: see spec.md "Redaction and truncation"
// for what is deliberately left alone (names, short numbers, dates).
export function redactSensitive(text: string): string {
  return text
    .replace(EMAIL, '[EMAIL]')
    .replace(INTL_PHONE, '[PHONE]')
    .replace(LONG_NUMBER, '[NUMBER]')
    .replace(LOCAL_PHONE, '[PHONE]');
}

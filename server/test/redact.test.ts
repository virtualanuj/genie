import { describe, it, expect } from 'vitest';
import { redactSensitive, MAX_TRIAGE_CHARS } from '../src/redact.js';

describe('redactSensitive', () => {
  it('redacts email addresses', () => {
    expect(redactSensitive('Reach me at jane.doe+sales@globex.co.uk or ops@acme.io.'))
      .toBe('Reach me at [EMAIL] or [EMAIL].');
  });

  it('redacts international phone numbers', () => {
    expect(redactSensitive('UK office +44 20 7946 0958, US +1 (555) 123-4567.'))
      .toBe('UK office [PHONE], US [PHONE].');
  });

  it('redacts North American local phone formats', () => {
    expect(redactSensitive('Call (555) 123-4567 or 555-123-4567 or 555.123.4567 or 555 123 4567'))
      .toBe('Call [PHONE] or [PHONE] or [PHONE] or [PHONE]');
  });

  it('redacts card and account-like long numbers', () => {
    expect(redactSensitive('Card 4111 1111 1111 1111, card 4111-1111-1111-1111, acct 123456789012'))
      .toBe('Card [NUMBER], card [NUMBER], acct [NUMBER]');
  });

  it('leaves short numbers, amounts, times, dates, and invoice ids alone', () => {
    const text = 'Quote for 50 seats by Friday 3pm, total $12,500.00, invoice INV-2026-0042, meeting 2026-09-14 10:30, order #48213';
    expect(redactSensitive(text)).toBe(text);
  });

  it('does not redact names', () => {
    expect(redactSensitive('Thanks, Raj Patel at Globex')).toBe('Thanks, Raj Patel at Globex');
  });

  it('exposes a 1000-char triage limit', () => {
    expect(MAX_TRIAGE_CHARS).toBe(1000);
  });
});

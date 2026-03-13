import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../utils.js';

describe('escapeHtml', () => {
  it('should pass through normal text unchanged', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
    expect(escapeHtml('Simple text with spaces')).toBe('Simple text with spaces');
  });

  it('should escape HTML special characters', () => {
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('"')).toBe('"');
  });

  it('should return empty string for empty input', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('should handle mixed content with text and HTML special chars', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert("xss")&lt;/script&gt;'
    );
    expect(escapeHtml('Hello & goodbye')).toBe('Hello &amp; goodbye');
    expect(escapeHtml('Price: <$100>')).toBe('Price: &lt;$100&gt;');
  });

  it('should double-escape already-escaped entities', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
    expect(escapeHtml('&quot;')).toBe('&amp;quot;');
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
  });
});

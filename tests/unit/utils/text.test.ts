import { describe, it, expect } from 'vitest';
import {
  normalizeText,
  removeInvisibleChars,
  detectPII,
  maskPII,
  detectObfuscation,
  calculateEntropy,
  truncateText,
  normalizeWhitespace
} from '../../../src/utils/text';

describe('Text Utilities', () => {
  describe('normalizeText', () => {
    it('should normalize Unicode', () => {
      const input = 'café';
      const result = normalizeText(input);
      expect(result).toBe('café');
    });

    it('should remove zero-width characters', () => {
      const input = 'hello\u200Bworld';
      const result = normalizeText(input);
      expect(result).not.toContain('\u200B');
    });
  });

  describe('detectPII', () => {
    it('should detect email addresses', () => {
      const result = detectPII('Contact me at user@example.com');
      expect(result.found).toBe(true);
      expect(result.entities.some(e => e.type === 'email')).toBe(true);
    });

    it('should detect phone numbers', () => {
      const result = detectPII('Call me at 555-123-4567');
      expect(result.found).toBe(true);
      expect(result.entities.some(e => e.type === 'phone')).toBe(true);
    });

    it('should detect SSNs', () => {
      const result = detectPII('My SSN is 123-45-6789');
      expect(result.found).toBe(true);
      expect(result.entities.some(e => e.type === 'ssn')).toBe(true);
    });

    it('should detect API keys', () => {
      const result = detectPII('sk-abc123def456ghi789');
      expect(result.found).toBe(true);
      expect(result.entities.some(e => e.type === 'api_key')).toBe(true);
    });

    it('should return empty result for clean text', () => {
      const result = detectPII('Hello, how are you today?');
      expect(result.found).toBe(false);
      expect(result.entities).toHaveLength(0);
    });
  });

  describe('maskPII', () => {
    it('should redact PII by default', () => {
      const result = maskPII('Email: user@example.com');
      expect(result).not.toContain('user@example.com');
      expect(result).toContain('REDACTED');
    });

    it('should mask PII with mask style', () => {
      const result = maskPII('Email: user@example.com', 'mask');
      expect(result).toContain('**');
    });

    it('should tokenize PII with tokenize style', () => {
      const result = maskPII('Email: user@example.com', 'tokenize');
      expect(result).toContain('<TOKEN-EMAIL>');
    });
  });

  describe('detectObfuscation', () => {
    it('should detect zero-width characters', () => {
      const result = detectObfuscation('test\u200B\u200C\u200Dtest');
      expect(result.hasObfuscation).toBe(true);
      expect(result.techniques).toContain('zero_width_characters');
    });

    it('should detect mixed scripts', () => {
      const result = detectObfuscation('Hello Wоrld'); // Cyrillic о
      expect(result.hasObfuscation).toBe(true);
      expect(result.techniques).toContain('mixed_scripts');
    });

    it('should calculate entropy', () => {
      const result = detectObfuscation('abc');
      expect(result.entropy).toBeGreaterThan(0);
    });
  });

  describe('calculateEntropy', () => {
    it('should calculate entropy correctly', () => {
      const lowEntropy = calculateEntropy('aaaaaaaa');
      const highEntropy = calculateEntropy('abcdefgh');

      expect(highEntropy).toBeGreaterThan(lowEntropy);
    });

    it('should return 0 for empty string', () => {
      const result = calculateEntropy('');
      expect(result).toBe(0);
    });
  });

  describe('truncateText', () => {
    it('should truncate long text', () => {
      const result = truncateText('hello world', 8);
      expect(result).toBe('hello...');
    });

    it('should not truncate short text', () => {
      const result = truncateText('hi', 10);
      expect(result).toBe('hi');
    });
  });

  describe('normalizeWhitespace', () => {
    it('should normalize multiple spaces', () => {
      const result = normalizeWhitespace('hello    world');
      expect(result).toBe('hello world');
    });

    it('should trim whitespace', () => {
      const result = normalizeWhitespace('  hello world  ');
      expect(result).toBe('hello world');
    });
  });
});

/**
 * Text processing utilities
 */

import type { PIIEntityType, PIIConfig, CustomPIIPattern } from '../types/safety';

export interface PIIDetectionResult {
  readonly found: boolean;
  readonly entities: Array<{
    readonly type: string;
    readonly confidence: number;
    readonly positions: Array<{ start: number; end: number }>;
    readonly maskedValue: string;
  }>;
}

export interface ObfuscationResult {
  readonly hasObfuscation: boolean;
  readonly techniques: string[];
  readonly confidence: number;
  readonly entropy: number;
}

/**
 * Normalize Unicode text
 */
export function normalizeText(text: string): string {
  // Normalize to NFKC form (compatibility decomposition followed by canonical composition)
  let normalized = text.normalize('NFKC');

  // Remove zero-width characters
  normalized = removeInvisibleChars(normalized);

  return normalized;
}

/**
 * Remove invisible/hidden characters
 */
export function removeInvisibleChars(text: string): string {
  // Remove zero-width characters
  return text
    .replace(/[\u200B-\u200D\uFEFF\u2060-\u206F]/g, '')
    .replace(/[\u180E\u200B\u200C\u200D\uFEFF]/g, '');
}

/**
 * Detect PII in text
 */
export function detectPII(
  text: string,
  entityTypes: readonly PIIEntityType[] = ['email', 'phone', 'ssn', 'credit_card', 'api_key'],
): PIIDetectionResult {
  const entities: PIIDetectionResult['entities'] = [];

  const patterns: Record<PIIEntityType, RegExp> = {
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    phone: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    credit_card: /\b(?:\d[ -]*?){13,16}\b/g,
    ip_address: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    api_key: /\b(?:sk-|pk-|Bearer\s+)[a-zA-Z0-9_-]{16,}\b/gi,
    password: /\b(?:password|pwd|pass)\s*[=:]\s*\S+/gi,
    name: /\b(?:Mr\.?|Mrs\.?|Ms\.?|Dr\.?)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g,
    address: /\b\d+\s+[A-Za-z]+(?:\s+[A-Za-z]+)*,\s*[A-Za-z]+,\s*[A-Z]{2}\s*\d{5}\b/g,
    date_of_birth: /\b\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}\b/g,
    url: /\bhttps?:\/\/[^\s]+/g,
    custom: /./g, // Placeholder
  };

  for (const entityType of entityTypes) {
    const pattern = patterns[entityType];
    if (!pattern) continue;

    const matches = text.matchAll(pattern);
    const positions: Array<{ start: number; end: number }> = [];

    for (const match of matches) {
      if (match.index !== undefined) {
        positions.push({ start: match.index, end: match.index + match[0].length });
      }
    }

    if (positions.length > 0) {
      entities.push({
        type: entityType,
        confidence: 0.9,
        positions,
        maskedValue: '[REDACTED-' + entityType.toUpperCase().replace('_', '-') + ']',
      });
    }
  }

  return {
    found: entities.length > 0,
    entities,
  };
}

/**
 * Mask PII in text
 */
export function maskPII(text: string, style: 'redact' | 'mask' | 'hash' | 'tokenize' = 'redact'): string {
  const piiResult = detectPII(text);

  if (!piiResult.found) {
    return text;
  }

  let masked = text;

  // Sort positions in reverse order to avoid index shifting
  const allPositions = piiResult.entities
    .flatMap((e) => e.positions.map((p) => ({ ...p, type: e.type })))
    .sort((a, b) => b.start - a.start);

  // Remove duplicates
  const uniquePositions = allPositions.filter(
    (pos, index, self) => index === self.findIndex((p) => p.start === pos.start && p.end === pos.end),
  );

  for (const pos of uniquePositions) {
    const original = text.slice(pos.start, pos.end);
    let replacement: string;

    switch (style) {
      case 'mask':
        replacement = original.slice(0, 2) + '*'.repeat(original.length - 4) + original.slice(-2);
        break;
      case 'hash':
        replacement = hashString(original);
        break;
      case 'tokenize':
        replacement = `<TOKEN-${pos.type.toUpperCase()}>`;
        break;
      case 'redact':
      default:
        replacement = `[REDACTED-${pos.type.toUpperCase().replace('_', '-')}]`;
    }

    masked = masked.slice(0, pos.start) + replacement + masked.slice(pos.end);
  }

  return masked;
}

/**
 * Detect obfuscation techniques
 */
export function detectObfuscation(text: string): ObfuscationResult {
  const techniques: string[] = [];
  let confidence = 0;

  // Check for zero-width characters
  const zeroWidthCount = (text.match(/[\u200B-\u200D\uFEFF\u2060-\u206F]/g) ?? []).length;
  if (zeroWidthCount > 3) {
    techniques.push('zero_width_characters');
    confidence += Math.min(zeroWidthCount * 0.05, 0.3);
  }

  // Check for excessive encoding
  const encodedChars = (text.match(/(?:%[0-9a-fA-F]{2}|\\u[0-9a-fA-F]{4}|&#\d+;)/g) ?? []).length;
  if (encodedChars > 5) {
    techniques.push('percent_encoding');
    confidence += Math.min(encodedChars * 0.02, 0.2);
  }

  // Check for mixed scripts (homoglyphs)
  const hasCyrillic = /[\u0400-\u04FF]/.test(text);
  const hasLatin = /[\u0041-\u005A\u0061-\u007A]/.test(text);
  if (hasCyrillic && hasLatin) {
    techniques.push('mixed_scripts');
    confidence += 0.25;
  }

  // Check for unusual spacing
  const unusualSpaces = (text.match(/\s{3,}/g) ?? []).length;
  if (unusualSpaces > 2) {
    techniques.push('unusual_spacing');
    confidence += Math.min(unusualSpaces * 0.05, 0.15);
  }

  // Check for base64-like strings
  const base64Strings = (text.match(/\b[A-Za-z0-9+\/]{40,}={0,2}\b/g) ?? []).length;
  if (base64Strings > 0) {
    techniques.push('base64_encoding');
    confidence += Math.min(base64Strings * 0.1, 0.2);
  }

  // Calculate entropy
  const entropy = calculateEntropy(text);
  if (entropy > 4.5) {
    techniques.push('high_entropy');
    confidence += 0.1;
  }

  return {
    hasObfuscation: techniques.length > 0,
    techniques,
    confidence: Math.min(confidence, 0.95),
    entropy,
  };
}

/**
 * Calculate Shannon entropy of text
 */
export function calculateEntropy(text: string): number {
  const freq = new Map<string, number>();

  for (const char of text) {
    freq.set(char, (freq.get(char) ?? 0) + 1);
  }

  let entropy = 0;
  const len = text.length;

  for (const count of freq.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}

/**
 * Simple hash function for PII masking
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return 'HASH-' + Math.abs(hash).toString(16).toUpperCase();
}

/**
 * Truncate text to maximum length with ellipsis
 */
export function truncateText(text: string, maxLength: number, ellipsis = '...'): string {
  if (text.length <= maxLength) {
    return text;
  }

  const truncateLength = maxLength - ellipsis.length;
  return text.slice(0, truncateLength) + ellipsis;
}

/**
 * Clean and normalize whitespace
 */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Escape special regex characters
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Built-in plugin: detects personally identifiable information (PII).
 *
 * Reuses the shared {@link detectPII} utility so detection stays consistent
 * with the input sanitizer.
 */

import type { SafetyPlugin } from '../../types/plugin';
import type { SafetyCheckResult } from '../../types/safety';
import { detectPII } from '../../utils/text';

/**
 * Detect PII entities in a string and turn them into checks.
 */
function scanForPII(text: string): SafetyCheckResult[] {
  const result = detectPII(text);
  if (!result.found) {
    return [];
  }

  return result.entities.map((entity) => ({
    passed: false,
    category: 'pii_exposure' as const,
    severity: 'high' as const,
    confidence: entity.confidence,
    message: `PII detected: ${entity.type}`,
    details: { entityType: entity.type, maskedValue: entity.maskedValue },
  }));
}

/**
 * Plugin instance that flags PII on input and output.
 */
export const piiGuardPlugin: SafetyPlugin = {
  id: 'pii-guard',
  name: 'PII Guard',
  description: 'Detects emails, phone numbers, SSNs, credit cards, and other PII.',
  version: '1.0.0',
  enabledByDefault: true,
  checkInput: (text) => scanForPII(text),
  checkOutput: (text) => scanForPII(text),
};

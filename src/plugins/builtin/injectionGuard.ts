/**
 * Built-in plugin: lightweight prompt-injection guard.
 *
 * Matches input text against the shared library of known injection patterns.
 * This is a fast, dependency-free complement to the full
 * {@link import('../../defense/injection/InjectionDetector').InjectionDetector}.
 */

import type { SafetyPlugin } from '../../types/plugin';
import type { SafetyCheckResult, SafetyCategory } from '../../types/safety';
import { getAllPatterns } from '../../defense/injection/patterns';
import { normalizeText } from '../../utils/text';

const PATTERN_CATEGORY_MAP: Record<string, SafetyCategory> = {
  jailbreak: 'jailbreak',
  instruction_override: 'instruction_override',
  context_manipulation: 'prompt_injection',
  encoding: 'encoding_obfuscation',
  social_engineering: 'prompt_injection',
  indirect_injection: 'indirect_injection',
};

/**
 * Scan input text for known injection signatures.
 */
function scanForInjection(text: string): SafetyCheckResult[] {
  const normalized = normalizeText(text);
  const checks: SafetyCheckResult[] = [];

  for (const pattern of getAllPatterns()) {
    if (pattern.pattern.test(normalized)) {
      checks.push({
        passed: false,
        category: PATTERN_CATEGORY_MAP[pattern.category] ?? 'prompt_injection',
        severity: pattern.severity,
        confidence: 0.85,
        message: `Prompt injection pattern matched: ${pattern.name}`,
        details: { patternId: pattern.id },
      });
    }
  }

  return checks;
}

/**
 * Plugin instance that flags prompt-injection attempts on input.
 */
export const injectionGuardPlugin: SafetyPlugin = {
  id: 'injection-guard',
  name: 'Injection Guard',
  description: 'Flags prompts matching known jailbreak and instruction-override patterns.',
  version: '1.0.0',
  enabledByDefault: true,
  checkInput: (text) => scanForInjection(text),
};

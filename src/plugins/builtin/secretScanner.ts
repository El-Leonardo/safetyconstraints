/**
 * Built-in plugin: scans text for leaked secrets / credentials.
 *
 * Useful on both input (a user pasting a key into a prompt) and output (an
 * agent echoing a secret it read from the environment or a file).
 */

import type { SafetyPlugin } from '../../types/plugin';
import type { SafetyCheckResult } from '../../types/safety';

interface SecretSignature {
  readonly label: string;
  readonly pattern: RegExp;
}

const SECRET_SIGNATURES: readonly SecretSignature[] = [
  { label: 'OpenAI API key', pattern: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { label: 'OpenAI project key', pattern: /\bsk-proj-[A-Za-z0-9_-]{20,}\b/g },
  { label: 'Anthropic API key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { label: 'AWS access key id', pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { label: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { label: 'Google API key', pattern: /\bAIza[A-Za-z0-9_-]{35}\b/g },
  { label: 'Slack token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { label: 'Private key block', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g },
  { label: 'Generic bearer token', pattern: /\bBearer\s+[A-Za-z0-9._-]{20,}\b/g },
];

/**
 * Detect known secret formats in a string.
 */
function scanForSecrets(text: string): SafetyCheckResult[] {
  const checks: SafetyCheckResult[] = [];

  for (const { label, pattern } of SECRET_SIGNATURES) {
    // Reset lastIndex since patterns are global and reused.
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      checks.push({
        passed: false,
        category: 'data_exfiltration',
        severity: 'critical',
        confidence: 0.95,
        message: `Potential secret detected: ${label}`,
        details: { secretType: label },
      });
    }
  }

  return checks;
}

/**
 * Plugin instance that flags leaked credentials on input and output.
 */
export const secretScannerPlugin: SafetyPlugin = {
  id: 'secret-scanner',
  name: 'Secret Scanner',
  description: 'Detects leaked API keys, tokens, and private keys in prompts and responses.',
  version: '1.0.0',
  enabledByDefault: true,
  checkInput: (text) => scanForSecrets(text),
  checkOutput: (text) => scanForSecrets(text),
};

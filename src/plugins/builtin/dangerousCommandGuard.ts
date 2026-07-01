/**
 * Built-in plugin: flags dangerous shell / destructive commands.
 *
 * Aimed at coding agents whose output may be executed. Catches destructive
 * filesystem operations, remote-code-execution pipes, and reckless git/db
 * commands before they run.
 */

import type { SafetyPlugin } from '../../types/plugin';
import type { SafetyCheckResult, SeverityLevel } from '../../types/safety';

interface CommandSignature {
  readonly label: string;
  readonly pattern: RegExp;
  readonly severity: SeverityLevel;
}

const COMMAND_SIGNATURES: readonly CommandSignature[] = [
  { label: 'Recursive force delete of a root/home path', pattern: /\brm\s+-\w*[rf]\w*\s+(?:\/|~|\$HOME)\S*/, severity: 'critical' },
  { label: 'Recursive force delete', pattern: /\brm\s+-[a-z]*r[a-z]*f[a-z]*\b|\brm\s+-[a-z]*f[a-z]*r[a-z]*\b/, severity: 'high' },
  { label: 'Pipe remote script to shell', pattern: /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba|z|)sh\b/, severity: 'critical' },
  { label: 'Fork bomb', pattern: /:\(\)\s*\{\s*:\|:&\s*\}\s*;:/, severity: 'critical' },
  { label: 'Overly permissive chmod', pattern: /\bchmod\s+-R?\s*777\b/, severity: 'high' },
  { label: 'Disk overwrite via dd', pattern: /\bdd\s+[^\n]*\bof=\/dev\/(?:sd|nvme|disk)/, severity: 'critical' },
  { label: 'Force push to shared branch', pattern: /\bgit\s+push\b[^\n]*\s--force\b(?![^\n]*--force-with-lease)/, severity: 'medium' },
  { label: 'Destructive SQL', pattern: /\b(?:DROP\s+(?:TABLE|DATABASE)|TRUNCATE\s+TABLE|DELETE\s+FROM\s+\w+\s*;)/i, severity: 'high' },
  { label: 'Mkfs on a device', pattern: /\bmkfs(?:\.\w+)?\s+\/dev\//, severity: 'critical' },
];

/**
 * Scan text for dangerous commands.
 */
function scanForDangerousCommands(text: string): SafetyCheckResult[] {
  const checks: SafetyCheckResult[] = [];

  for (const { label, pattern, severity } of COMMAND_SIGNATURES) {
    if (pattern.test(text)) {
      checks.push({
        passed: false,
        category: 'harmful_instructions',
        severity,
        confidence: 0.9,
        message: `Dangerous command detected: ${label}`,
        details: { command: label },
      });
    }
  }

  return checks;
}

/**
 * Plugin instance that flags dangerous commands, primarily on agent output.
 */
export const dangerousCommandGuardPlugin: SafetyPlugin = {
  id: 'dangerous-command-guard',
  name: 'Dangerous Command Guard',
  description: 'Flags destructive shell, git, and SQL commands in agent output.',
  version: '1.0.0',
  enabledByDefault: true,
  checkInput: (text) => scanForDangerousCommands(text),
  checkOutput: (text) => scanForDangerousCommands(text),
};

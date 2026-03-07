/**
 * Predefined safety policy presets
 */

import type { SafetyConfig } from '../types/safety';

/**
 * Permissive preset - minimal safety checks
 * Suitable for trusted internal applications
 */
export const permissivePreset: SafetyConfig = {
  enabled: true,
  mode: 'bidirectional',
  strictness: 'permissive',
  categories: ['prompt_injection', 'harmful_instructions', 'data_exfiltration'],
  piiConfig: {
    enabled: true,
    entities: ['ssn', 'credit_card', 'api_key', 'password'],
    maskingStyle: 'mask',
  },
  rateLimitConfig: {
    enabled: true,
    requestsPerSecond: 100,
    burstSize: 200,
    windowMs: 60000,
  },
  auditConfig: {
    enabled: true,
    logLevel: 'warn',
    includeInput: false,
    includeOutput: false,
    redactPII: true,
    destination: 'console',
  },
};

/**
 * Moderate preset - balanced safety checks
 * Suitable for general consumer applications
 */
export const moderatePreset: SafetyConfig = {
  enabled: true,
  mode: 'bidirectional',
  strictness: 'moderate',
  categories: [
    'prompt_injection',
    'jailbreak',
    'pii_exposure',
    'harmful_instructions',
    'data_exfiltration',
    'encoding_obfuscation',
  ],
  piiConfig: {
    enabled: true,
    entities: ['email', 'phone', 'ssn', 'credit_card', 'api_key', 'password'],
    maskingStyle: 'mask',
  },
  rateLimitConfig: {
    enabled: true,
    requestsPerSecond: 50,
    burstSize: 100,
    windowMs: 60000,
  },
  auditConfig: {
    enabled: true,
    logLevel: 'info',
    includeInput: true,
    includeOutput: true,
    redactPII: true,
    destination: 'console',
  },
};

/**
 * Strict preset - comprehensive safety checks
 * Suitable for high-risk applications
 */
export const strictPreset: SafetyConfig = {
  enabled: true,
  mode: 'bidirectional',
  strictness: 'strict',
  categories: [
    'prompt_injection',
    'jailbreak',
    'pii_exposure',
    'toxic_content',
    'bias',
    'harmful_instructions',
    'data_exfiltration',
    'encoding_obfuscation',
    'instruction_override',
    'indirect_injection',
  ],
  piiConfig: {
    enabled: true,
    entities: ['email', 'phone', 'ssn', 'credit_card', 'api_key', 'password', 'name', 'address'],
    maskingStyle: 'redact',
  },
  rateLimitConfig: {
    enabled: true,
    requestsPerSecond: 20,
    burstSize: 50,
    windowMs: 60000,
  },
  auditConfig: {
    enabled: true,
    logLevel: 'info',
    includeInput: true,
    includeOutput: true,
    redactPII: true,
    destination: 'file',
    filePath: './logs/safety-audit.log',
  },
};

/**
 * Maximum preset - maximum security
 * Suitable for enterprise/regulated environments
 */
export const maximumPreset: SafetyConfig = {
  enabled: true,
  mode: 'bidirectional',
  strictness: 'maximum',
  categories: [
    'prompt_injection',
    'jailbreak',
    'pii_exposure',
    'toxic_content',
    'bias',
    'harmful_instructions',
    'data_exfiltration',
    'encoding_obfuscation',
    'instruction_override',
    'indirect_injection',
    'custom',
  ],
  piiConfig: {
    enabled: true,
    entities: ['email', 'phone', 'ssn', 'credit_card', 'api_key', 'password', 'name', 'address', 'date_of_birth', 'url'],
    maskingStyle: 'hash',
  },
  rateLimitConfig: {
    enabled: true,
    requestsPerSecond: 10,
    burstSize: 30,
    windowMs: 60000,
  },
  auditConfig: {
    enabled: true,
    logLevel: 'debug',
    includeInput: true,
    includeOutput: true,
    redactPII: true,
    destination: 'file',
    filePath: './logs/safety-audit.log',
  },
};

/**
 * Development preset - minimal interference for development
 */
export const developmentPreset: SafetyConfig = {
  enabled: true,
  mode: 'input_only',
  strictness: 'permissive',
  categories: ['harmful_instructions', 'data_exfiltration'],
  piiConfig: {
    enabled: false,
    entities: [],
    maskingStyle: 'mask',
  },
  rateLimitConfig: {
    enabled: false,
    requestsPerSecond: 1000,
    burstSize: 2000,
    windowMs: 60000,
  },
  auditConfig: {
    enabled: true,
    logLevel: 'error',
    includeInput: false,
    includeOutput: false,
    redactPII: true,
    destination: 'console',
  },
};

/**
 * Get preset by name
 */
export function getPreset(name: string): SafetyConfig | undefined {
  const presets: Record<string, SafetyConfig> = {
    permissive: permissivePreset,
    moderate: moderatePreset,
    strict: strictPreset,
    maximum: maximumPreset,
    development: developmentPreset,
  };

  return presets[name];
}

/**
 * Get all available preset names
 */
export function getAvailablePresets(): string[] {
  return ['permissive', 'moderate', 'strict', 'maximum', 'development'];
}

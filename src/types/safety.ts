/**
 * Core safety types for the AI safety constraints toolkit
 */

import { z } from 'zod';

/**
 * Severity levels for safety violations
 */
export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

export const SeverityLevelSchema = z.enum(['low', 'medium', 'high', 'critical']);

/**
 * Safety check categories
 */
export type SafetyCategory =
  | 'prompt_injection'
  | 'jailbreak'
  | 'pii_exposure'
  | 'toxic_content'
  | 'bias'
  | 'harmful_instructions'
  | 'data_exfiltration'
  | 'encoding_obfuscation'
  | 'instruction_override'
  | 'indirect_injection'
  | 'custom';

export const SafetyCategorySchema = z.enum([
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
]);

/**
 * Result of a safety check
 */
export interface SafetyCheckResult {
  readonly passed: boolean;
  readonly category: SafetyCategory;
  readonly severity: SeverityLevel;
  readonly confidence: number; // 0-1
  readonly message: string;
  readonly details?: Record<string, unknown>;
  readonly metadata?: {
    readonly ruleId?: string;
    readonly patternName?: string;
    readonly matchedText?: string;
    readonly position?: { start: number; end: number };
  };
}

export const SafetyCheckResultSchema = z.object({
  passed: z.boolean(),
  category: SafetyCategorySchema,
  severity: SeverityLevelSchema,
  confidence: z.number().min(0).max(1),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
  metadata: z
    .object({
      ruleId: z.string().optional(),
      patternName: z.string().optional(),
      matchedText: z.string().optional(),
      position: z
        .object({
          start: z.number(),
          end: z.number(),
        })
        .optional(),
    })
    .optional(),
});

/**
 * Overall safety result for a request/response
 */
export interface SafetyResult {
  readonly isSafe: boolean;
  readonly score: number; // 0-100
  readonly checks: readonly SafetyCheckResult[];
  readonly timestamp: Date;
  readonly processingTimeMs: number;
  readonly actionTaken: SafetyAction;
}

export const SafetyResultSchema = z.object({
  isSafe: z.boolean(),
  score: z.number().min(0).max(100),
  checks: z.array(SafetyCheckResultSchema),
  timestamp: z.date(),
  processingTimeMs: z.number(),
  actionTaken: z.enum(['allow', 'block', 'sanitize', 'flag', 'rewrite']),
});

/**
 * Actions that can be taken based on safety results
 */
export type SafetyAction = 'allow' | 'block' | 'sanitize' | 'flag' | 'rewrite';

export const SafetyActionSchema = z.enum(['allow', 'block', 'sanitize', 'flag', 'rewrite']);

/**
 * Safety configuration
 */
export interface SafetyConfig {
  readonly enabled: boolean;
  readonly mode: SafetyMode;
  readonly strictness: StrictnessLevel;
  readonly categories: readonly SafetyCategory[];
  readonly customRules?: readonly CustomRule[];
  readonly whitelist?: readonly string[];
  readonly blacklist?: readonly string[];
  readonly piiConfig?: PIIConfig;
  readonly rateLimitConfig?: RateLimitConfig;
  readonly auditConfig?: AuditConfig;
}

export const SafetyConfigSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(['input_only', 'output_only', 'bidirectional']),
  strictness: z.enum(['permissive', 'moderate', 'strict', 'maximum']),
  categories: z.array(SafetyCategorySchema),
  customRules: z.array(z.any()).optional(),
  whitelist: z.array(z.string()).optional(),
  blacklist: z.array(z.string()).optional(),
  piiConfig: z.any().optional(),
  rateLimitConfig: z.any().optional(),
  auditConfig: z.any().optional(),
});

/**
 * Safety modes
 */
export type SafetyMode = 'input_only' | 'output_only' | 'bidirectional';

/**
 * Strictness levels
 */
export type StrictnessLevel = 'permissive' | 'moderate' | 'strict' | 'maximum';

/**
 * Custom rule definition
 */
export interface CustomRule {
  readonly id: string;
  readonly name: string;
  readonly category: SafetyCategory;
  readonly severity: SeverityLevel;
  readonly pattern: RegExp | string;
  readonly flags?: string;
  readonly description: string;
  readonly action: SafetyAction;
  readonly metadata?: Record<string, unknown>;
}

export const CustomRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: SafetyCategorySchema,
  severity: SeverityLevelSchema,
  pattern: z.union([z.instanceof(RegExp), z.string()]),
  flags: z.string().optional(),
  description: z.string(),
  action: SafetyActionSchema,
  metadata: z.record(z.unknown()).optional(),
});

/**
 * PII detection configuration
 */
export interface PIIConfig {
  readonly enabled: boolean;
  readonly entities: readonly PIIEntityType[];
  readonly maskingStyle: 'redact' | 'mask' | 'hash' | 'tokenize';
  readonly customPatterns?: readonly CustomPIIPattern[];
}

export type PIIEntityType =
  | 'email'
  | 'phone'
  | 'ssn'
  | 'credit_card'
  | 'ip_address'
  | 'api_key'
  | 'password'
  | 'name'
  | 'address'
  | 'date_of_birth'
  | 'url'
  | 'custom';

export interface CustomPIIPattern {
  readonly name: string;
  readonly pattern: RegExp | string;
  readonly entityType: string;
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  readonly enabled: boolean;
  readonly requestsPerSecond: number;
  readonly burstSize: number;
  readonly windowMs: number;
  readonly keyPrefix?: string;
}

/**
 * Audit configuration
 */
export interface AuditConfig {
  readonly enabled: boolean;
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error';
  readonly includeInput: boolean;
  readonly includeOutput: boolean;
  readonly redactPII: boolean;
  readonly destination: 'console' | 'file' | 'http' | 'custom';
  readonly filePath?: string;
  readonly httpEndpoint?: string;
  readonly customHandler?: (entry: AuditEntry) => void | Promise<void>;
}

/**
 * Audit entry
 */
export interface AuditEntry {
  readonly id: string;
  readonly timestamp: Date;
  readonly requestId: string;
  readonly level: 'debug' | 'info' | 'warn' | 'error';
  readonly category: string;
  readonly message: string;
  readonly input?: string;
  readonly output?: string;
  readonly safetyResult?: SafetyResult;
  readonly metadata?: Record<string, unknown>;
  readonly userId?: string;
  readonly sessionId?: string;
  readonly sourceIp?: string;
}

/**
 * Safety context for a request
 */
export interface SafetyContext {
  readonly requestId: string;
  readonly timestamp: Date;
  readonly userId?: string;
  readonly sessionId?: string;
  readonly sourceIp?: string;
  readonly provider: string;
  readonly model?: string;
  readonly metadata?: Record<string, unknown>;
}

export const SafetyContextSchema = z.object({
  requestId: z.string(),
  timestamp: z.date(),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  sourceIp: z.string().optional(),
  provider: z.string(),
  model: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Text content with metadata
 */
export interface ContentItem {
  readonly type: 'text' | 'image_url' | 'file';
  readonly content: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Safety engine options
 */
export interface SafetyEngineOptions {
  readonly config: SafetyConfig;
  readonly adapters?: readonly string[];
  readonly plugins?: readonly string[];
  readonly onViolation?: (result: SafetyCheckResult, context: SafetyContext) => void | Promise<void>;
  readonly onAudit?: (entry: AuditEntry) => void | Promise<void>;
}

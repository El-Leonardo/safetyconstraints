/**
 * Input sanitization and normalization
 */

import type {
  SafetyConfig,
  SafetyContext,
  SafetyCheckResult,
  SafetyResult,
  PIIEntityType,
} from '../../types/safety';
import { normalizeText, detectPII, maskPII, removeInvisibleChars } from '../../utils/text';

export interface SanitizationOptions {
  readonly normalizeUnicode: boolean;
  readonly removeInvisibleChars: boolean;
  readonly detectPII: boolean;
  readonly maskPII: boolean;
  readonly maxLength: number;
  readonly blocklist: readonly string[];
  readonly allowlist: readonly string[];
}

/**
 * Input sanitizer for pre-processing user input
 */
export class InputSanitizer {
  private readonly config: SafetyConfig;
  private readonly options: SanitizationOptions;
  private initialized = false;

  public constructor(config: SafetyConfig, options?: Partial<SanitizationOptions>) {
    this.config = config;
    this.options = {
      normalizeUnicode: true,
      removeInvisibleChars: true,
      detectPII: true,
      maskPII: true,
      maxLength: 100000,
      blocklist: [],
      allowlist: [],
      ...options,
    };
  }

  /**
   * Initialize the sanitizer
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Load any external resources if needed
    this.initialized = true;
  }

  /**
   * Check if sanitizer is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Sanitize input text and return safety result
   */
  public async sanitize(text: string, context: SafetyContext): Promise<SafetyResult> {
    const startTime = Date.now();
    const checks: SafetyCheckResult[] = [];

    // Check length limits
    if (text.length > this.options.maxLength) {
      checks.push({
        passed: false,
        category: 'custom',
        severity: 'medium',
        confidence: 1.0,
        message: `Input exceeds maximum length of ${this.options.maxLength} characters`,
        details: { maxLength: this.options.maxLength, actualLength: text.length },
      });
    }

    // Check blocklist
    const blocklistResult = this.checkBlocklist(text);
    if (!blocklistResult.passed) {
      checks.push(blocklistResult);
    }

    // Check for PII
    if (this.options.detectPII) {
      const piiChecks = await this.checkPII(text);
      checks.push(...piiChecks);
    }

    // Check for encoding/obfuscation
    const obfuscationChecks = await this.checkObfuscation(text);
    checks.push(...obfuscationChecks);

    // Calculate result
    const failedChecks = checks.filter((c) => !c.passed);
    const isSafe = failedChecks.length === 0 || !failedChecks.some((c) => c.severity === 'critical' || c.severity === 'high');
    const score = this.calculateScore(checks);

    return {
      isSafe,
      score,
      checks,
      timestamp: new Date(),
      processingTimeMs: Date.now() - startTime,
      actionTaken: isSafe ? 'allow' : this.determineAction(failedChecks),
    };
  }

  /**
   * Sanitize text and return cleaned version
   */
  public async sanitizeText(text: string): Promise<string> {
    let sanitized = text;

    // Normalize Unicode
    if (this.options.normalizeUnicode) {
      sanitized = normalizeText(sanitized);
    }

    // Remove invisible characters
    if (this.options.removeInvisibleChars) {
      sanitized = removeInvisibleChars(sanitized);
    }

    // Mask PII
    if (this.options.maskPII && this.config.piiConfig?.enabled) {
      sanitized = maskPII(sanitized, this.config.piiConfig.maskingStyle);
    }

    // Truncate if too long
    if (sanitized.length > this.options.maxLength) {
      sanitized = sanitized.slice(0, this.options.maxLength);
    }

    return sanitized;
  }

  /**
   * Check text against blocklist
   */
  private checkBlocklist(text: string): SafetyCheckResult {
    const lowerText = text.toLowerCase();

    for (const blocked of this.options.blocklist) {
      if (lowerText.includes(blocked.toLowerCase())) {
        return {
          passed: false,
          category: 'toxic_content',
          severity: 'high',
          confidence: 0.9,
          message: 'Content matched blocklist',
          metadata: {
            matchedText: blocked,
          },
        };
      }
    }

    return {
      passed: true,
      category: 'custom',
      severity: 'low',
      confidence: 1.0,
      message: 'No blocklist matches',
    };
  }

  /**
   * Check for PII in text
   */
  private async checkPII(text: string): Promise<SafetyCheckResult[]> {
    const checks: SafetyCheckResult[] = [];

    if (!this.config.piiConfig?.enabled) {
      return checks;
    }

    const piiResult = detectPII(text, this.config.piiConfig.entities);

    if (piiResult.found) {
      for (const entity of piiResult.entities) {
        checks.push({
          passed: false,
          category: 'pii_exposure',
          severity: 'high',
          confidence: entity.confidence,
          message: `PII detected: ${entity.type}`,
          details: {
            entityType: entity.type,
            positions: entity.positions,
          },
          metadata: {
            matchedText: entity.maskedValue,
          },
        });
      }
    }

    return checks;
  }

  /**
   * Check for obfuscation techniques
   */
  private async checkObfuscation(text: string): Promise<SafetyCheckResult[]> {
    const checks: SafetyCheckResult[] = [];

    // Check for excessive zero-width characters
    const zeroWidthChars = text.match(/[\u200B-\u200D\uFEFF\u2060-\u206F]/g);
    if (zeroWidthChars && zeroWidthChars.length > 5) {
      checks.push({
        passed: false,
        category: 'encoding_obfuscation',
        severity: 'medium',
        confidence: Math.min(zeroWidthChars.length / 20, 0.9),
        message: 'Zero-width characters detected - possible steganography',
        details: { count: zeroWidthChars.length },
      });
    }

    // Check for mixed scripts (homoglyph attack)
    const scripts = this.detectMixedScripts(text);
    if (scripts.hasMixed) {
      checks.push({
        passed: false,
        category: 'encoding_obfuscation',
        severity: 'low',
        confidence: 0.6,
        message: 'Mixed Unicode scripts detected - possible homoglyph attack',
        details: { scripts: scripts.detected },
      });
    }

    // Check for excessive whitespace
    const excessiveWhitespace = text.match(/\s{10,}/);
    if (excessiveWhitespace) {
      checks.push({
        passed: false,
        category: 'encoding_obfuscation',
        severity: 'low',
        confidence: 0.4,
        message: 'Excessive whitespace detected',
      });
    }

    return checks;
  }

  /**
   * Detect mixed Unicode scripts
   */
  private detectMixedScripts(text: string): { hasMixed: boolean; detected: string[] } {
    const scripts: string[] = [];

    // Check for Latin
    if (/[\u0041-\u005A\u0061-\u007A]/.test(text)) {
      scripts.push('Latin');
    }

    // Check for Cyrillic
    if (/[\u0400-\u04FF]/.test(text)) {
      scripts.push('Cyrillic');
    }

    // Check for Greek
    if (/[\u0370-\u03FF]/.test(text)) {
      scripts.push('Greek');
    }

    // Check for Armenian
    if (/[\u0530-\u058F]/.test(text)) {
      scripts.push('Armenian');
    }

    return {
      hasMixed: scripts.length > 1,
      detected: scripts,
    };
  }

  /**
   * Calculate safety score
   */
  private calculateScore(checks: SafetyCheckResult[]): number {
    if (checks.length === 0) {
      return 100;
    }

    const failedChecks = checks.filter((c) => !c.passed);
    if (failedChecks.length === 0) {
      return 100;
    }

    const weights: Record<string, number> = {
      low: 5,
      medium: 15,
      high: 35,
      critical: 50,
    };

    const totalPenalty = failedChecks.reduce((sum, check) => {
      return sum + (weights[check.severity] ?? 15) * check.confidence;
    }, 0);

    return Math.max(0, 100 - totalPenalty);
  }

  /**
   * Determine action based on failed checks
   */
  private determineAction(failedChecks: SafetyCheckResult[]): 'allow' | 'block' | 'sanitize' | 'flag' {
    if (failedChecks.some((c) => c.severity === 'critical')) {
      return 'block';
    }

    if (failedChecks.some((c) => c.severity === 'high')) {
      return this.config.strictness === 'strict' || this.config.strictness === 'maximum'
        ? 'block'
        : 'sanitize';
    }

    return 'sanitize';
  }
}

/**
 * Output filtering and content moderation
 */

import type {
  SafetyConfig,
  SafetyContext,
  SafetyCheckResult,
  SafetyResult,
  SafetyCategory,
} from '../../types/safety';

export interface ContentCategory {
  readonly name: string;
  readonly description: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly patterns: readonly RegExp[];
  readonly keywords: readonly string[];
}

export interface OutputFilterOptions {
  readonly enablePatternMatching: boolean;
  readonly enableKeywordFiltering: boolean;
  readonly enableSemanticFiltering: boolean;
  readonly redactDetectedContent: boolean;
  readonly maxOutputLength: number;
}

/**
 * Predefined content categories for output filtering
 */
export const defaultContentCategories: ContentCategory[] = [
  {
    name: 'harmful_instructions',
    description: 'Instructions for causing harm',
    severity: 'critical',
    patterns: [
      /\b(how\s+to\s+(make|build|create))\b.*\b(bomb|weapon|explosive|poison)\b/i,
      /\b(instructions?\s+for)\b.*\b(hacking|cracking|breaking\s+into)\b/i,
    ],
    keywords: ['step-by-step guide to', 'tutorial for', 'how to exploit'],
  },
  {
    name: 'illegal_content',
    description: 'Content describing illegal activities',
    severity: 'critical',
    patterns: [
      /\b(how\s+to)\b.*\b(steal|rob|hack|exploit|defraud)\b/i,
    ],
    keywords: ['illegal', 'criminal', 'fraud', 'theft', 'exploit'],
  },
  {
    name: 'explicit_content',
    description: 'Sexually explicit content',
    severity: 'high',
    patterns: [
      /\b(explicit|pornographic|sexual)\s+(content|material|description)\b/i,
    ],
    keywords: [],
  },
  {
    name: 'hate_speech',
    description: 'Hate speech and discrimination',
    severity: 'high',
    patterns: [
      /\b(hate\s+speech|discriminatory|racist|sexist|bigoted)\b/i,
    ],
    keywords: ['inferior race', 'superior race', 'hate group'],
  },
  {
    name: 'personal_information',
    description: 'Exposed personal information',
    severity: 'medium',
    patterns: [
      /\b(email|phone|address|ssn|credit\s+card)\s*:\s*\S+/i,
    ],
    keywords: ['contact information', 'personal details'],
  },
  {
    name: 'biased_content',
    description: 'Potentially biased or unfair content',
    severity: 'low',
    patterns: [
      /\b(all\s+\w+\s+are|every\s+\w+\s+is)\b/i,
    ],
    keywords: ['always', 'never', 'all of them', 'none of them'],
  },
];

/**
 * Output filter for post-processing LLM responses
 */
export class OutputFilter {
  private readonly config: SafetyConfig;
  private readonly options: OutputFilterOptions;
  private readonly categories: ContentCategory[];
  private initialized = false;

  public constructor(
    config: SafetyConfig,
    categories?: ContentCategory[],
    options?: Partial<OutputFilterOptions>,
  ) {
    this.config = config;
    this.categories = categories ?? defaultContentCategories;
    this.options = {
      enablePatternMatching: true,
      enableKeywordFiltering: true,
      enableSemanticFiltering: false,
      redactDetectedContent: true,
      maxOutputLength: 100000,
      ...options,
    };
  }

  /**
   * Initialize the filter
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
  }

  /**
   * Check if filter is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Filter output content
   */
  public async filter(text: string, context: SafetyContext): Promise<SafetyResult> {
    const startTime = Date.now();
    const checks: SafetyCheckResult[] = [];

    // Check length
    if (text.length > this.options.maxOutputLength) {
      checks.push({
        passed: false,
        category: 'custom',
        severity: 'low',
        confidence: 1.0,
        message: `Output exceeds maximum length of ${this.options.maxOutputLength}`,
        details: { maxLength: this.options.maxOutputLength, actualLength: text.length },
      });
    }

    // Run category-based filtering
    for (const category of this.categories) {
      const categoryChecks = await this.checkCategory(text, category);
      checks.push(...categoryChecks);
    }

    // Check for policy violations
    const policyChecks = await this.checkPolicyViolations(text);
    checks.push(...policyChecks);

    // Calculate result
    const failedChecks = checks.filter((c) => !c.passed);
    const isSafe = !failedChecks.some((c) => c.severity === 'critical' || c.severity === 'high');
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
   * Sanitize output text
   */
  public async sanitizeText(text: string): Promise<string> {
    let sanitized = text;

    // Redact detected sensitive content
    if (this.options.redactDetectedContent) {
      for (const category of this.categories) {
        sanitized = this.redactCategory(sanitized, category);
      }
    }

    // Truncate if too long
    if (sanitized.length > this.options.maxOutputLength) {
      sanitized = sanitized.slice(0, this.options.maxOutputLength) + '\n[Content truncated]';
    }

    return sanitized;
  }

  /**
   * Check text against a content category
   */
  private async checkCategory(text: string, category: ContentCategory): Promise<SafetyCheckResult[]> {
    const checks: SafetyCheckResult[] = [];
    const lowerText = text.toLowerCase();

    // Pattern matching
    if (this.options.enablePatternMatching) {
      for (const pattern of category.patterns) {
        const matches = text.match(pattern);
        if (matches) {
          checks.push({
            passed: false,
            category: this.mapCategory(category.name),
            severity: category.severity,
            confidence: 0.8,
            message: `Content matches category: ${category.description}`,
            details: {
              category: category.name,
              matchedPattern: pattern.source,
            },
            metadata: {
              matchedText: matches[0]?.slice(0, 100),
            },
          });
        }
      }
    }

    // Keyword matching
    if (this.options.enableKeywordFiltering) {
      for (const keyword of category.keywords) {
        if (lowerText.includes(keyword.toLowerCase())) {
          checks.push({
            passed: false,
            category: this.mapCategory(category.name),
            severity: category.severity,
            confidence: 0.6,
            message: `Keyword detected in category: ${category.description}`,
            details: {
              category: category.name,
              keyword,
            },
          });
        }
      }
    }

    return checks;
  }

  /**
   * Check for policy violations
   */
  private async checkPolicyViolations(text: string): Promise<SafetyCheckResult[]> {
    const checks: SafetyCheckResult[] = [];

    // Check against custom blacklist
    if (this.config.blacklist) {
      for (const blocked of this.config.blacklist) {
        if (text.toLowerCase().includes(blocked.toLowerCase())) {
          checks.push({
            passed: false,
            category: 'custom',
            severity: 'high',
            confidence: 0.9,
            message: 'Content matched policy blacklist',
            metadata: {
              matchedText: blocked,
            },
          });
        }
      }
    }

    return checks;
  }

  /**
   * Redact content matching a category
   */
  private redactCategory(text: string, category: ContentCategory): string {
    let redacted = text;

    for (const pattern of category.patterns) {
      redacted = redacted.replace(pattern, '[REDACTED]');
    }

    return redacted;
  }

  /**
   * Map category name to SafetyCategory
   */
  private mapCategory(name: string): SafetyCategory {
    const mapping: Record<string, SafetyCategory> = {
      harmful_instructions: 'harmful_instructions',
      illegal_content: 'harmful_instructions',
      explicit_content: 'toxic_content',
      hate_speech: 'toxic_content',
      personal_information: 'pii_exposure',
      biased_content: 'bias',
    };

    return mapping[name] ?? 'custom';
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
  private determineAction(failedChecks: SafetyCheckResult[]): 'allow' | 'block' | 'sanitize' | 'rewrite' {
    if (failedChecks.some((c) => c.severity === 'critical')) {
      return 'block';
    }

    if (failedChecks.some((c) => c.severity === 'high')) {
      return this.options.redactDetectedContent ? 'sanitize' : 'block';
    }

    return 'sanitize';
  }
}

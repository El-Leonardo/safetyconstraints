/**
 * Prompt injection detection engine
 */

import type {
  SafetyConfig,
  SafetyContext,
  SafetyCheckResult,
  SafetyResult,
  SeverityLevel,
} from '../../types/safety';
import { getAllPatterns, type InjectionPattern } from './patterns';
import { normalizeText, detectObfuscation } from '../../utils/text';

export interface InjectionDetectionOptions {
  readonly enablePatternMatching: boolean;
  readonly enableHeuristics: boolean;
  readonly enableSemanticAnalysis: boolean;
  readonly minConfidenceThreshold: number;
  readonly maxRecursionDepth: number;
}

interface DetectionMatch {
  readonly pattern: InjectionPattern;
  readonly matches: RegExpMatchArray[];
  readonly confidence: number;
}

/**
 * Prompt injection detector
 */
export class InjectionDetector {
  private readonly config: SafetyConfig;
  private readonly options: InjectionDetectionOptions;
  private patterns: InjectionPattern[] = [];
  private initialized = false;

  public constructor(config: SafetyConfig, options?: Partial<InjectionDetectionOptions>) {
    this.config = config;
    this.options = {
      enablePatternMatching: true,
      enableHeuristics: true,
      enableSemanticAnalysis: false, // Disabled by default - requires embeddings
      minConfidenceThreshold: 0.5,
      maxRecursionDepth: 3,
      ...options,
    };
  }

  /**
   * Initialize the detector
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Load patterns based on configuration
    this.patterns = this.loadPatterns();
    this.initialized = true;
  }

  /**
   * Check if detector is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Detect prompt injection attempts in text
   */
  public async detect(text: string, context: SafetyContext): Promise<SafetyResult> {
    const startTime = Date.now();
    const checks: SafetyCheckResult[] = [];

    if (!this.config.enabled || this.config.categories.length === 0) {
      return {
        isSafe: true,
        score: 100,
        checks: [],
        timestamp: new Date(),
        processingTimeMs: Date.now() - startTime,
        actionTaken: 'allow',
      };
    }

    // Normalize text for analysis
    const normalizedText = normalizeText(text);

    // Run pattern-based detection
    if (this.options.enablePatternMatching) {
      const patternChecks = await this.detectPatterns(normalizedText);
      checks.push(...patternChecks);
    }

    // Run heuristic analysis
    if (this.options.enableHeuristics) {
      const heuristicChecks = await this.detectHeuristics(normalizedText, text);
      checks.push(...heuristicChecks);
    }

    // Run semantic analysis (if enabled)
    if (this.options.enableSemanticAnalysis) {
      const semanticChecks = await this.detectSemantic(normalizedText);
      checks.push(...semanticChecks);
    }

    // Check for indirect injection (embedded in content)
    const indirectChecks = await this.detectIndirectInjection(text);
    checks.push(...indirectChecks);

    // Calculate overall result
    const failedChecks = checks.filter((c) => !c.passed);
    const isSafe = failedChecks.length === 0;
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
   * Pattern-based detection
   */
  private async detectPatterns(text: string): Promise<SafetyCheckResult[]> {
    const checks: SafetyCheckResult[] = [];

    for (const pattern of this.patterns) {
      const matches = this.findAllMatches(text, pattern.pattern);

      if (matches.length > 0) {
        const confidence = Math.min(0.5 + matches.length * 0.1, 0.95);

        if (confidence >= this.options.minConfidenceThreshold) {
          checks.push({
            passed: false,
            category: 'prompt_injection',
            severity: this.mapSeverity(pattern.severity),
            confidence,
            message: `Pattern detected: ${pattern.name} - ${pattern.description}`,
            details: {
              patternId: pattern.id,
              patternCategory: pattern.category,
              matchCount: matches.length,
            },
            metadata: {
              ruleId: pattern.id,
              patternName: pattern.name,
              matchedText: matches[0]?.[0]?.slice(0, 100),
            },
          });
        }
      }
    }

    return checks;
  }

  /**
   * Heuristic-based detection
   */
  private async detectHeuristics(normalizedText: string, originalText: string): Promise<SafetyCheckResult[]> {
    const checks: SafetyCheckResult[] = [];

    // Check for obfuscation techniques
    const obfuscationResult = detectObfuscation(originalText);
    if (obfuscationResult.hasObfuscation) {
      checks.push({
        passed: false,
        category: 'prompt_injection',
        severity: obfuscationResult.severity,
        confidence: obfuscationResult.confidence,
        message: `Text obfuscation detected: ${obfuscationResult.techniques.join(', ')}`,
        details: {
          techniques: obfuscationResult.techniques,
          entropy: obfuscationResult.entropy,
        },
      });
    }

    // Check for excessive special characters
    const specialCharRatio = this.calculateSpecialCharRatio(normalizedText);
    if (specialCharRatio > 0.3) {
      checks.push({
        passed: false,
        category: 'encoding_obfuscation',
        severity: 'medium',
        confidence: Math.min(specialCharRatio, 0.9),
        message: 'High ratio of special characters detected - possible encoding',
        details: { specialCharRatio },
      });
    }

    // Check for repeated patterns (indicator of automated attacks)
    const repetitionScore = this.calculateRepetitionScore(normalizedText);
    if (repetitionScore > 0.5) {
      checks.push({
        passed: false,
        category: 'prompt_injection',
        severity: 'low',
        confidence: repetitionScore,
        message: 'Suspicious repetition patterns detected',
        details: { repetitionScore },
      });
    }

    // Check for suspicious length patterns
    const lengthScore = this.analyzeLengthPatterns(normalizedText);
    if (lengthScore.isSuspicious) {
      checks.push({
        passed: false,
        category: 'prompt_injection',
        severity: 'low',
        confidence: lengthScore.confidence,
        message: 'Suspicious text length patterns detected',
        details: { analysis: lengthScore },
      });
    }

    // Check for role confusion indicators
    const roleConfusion = this.detectRoleConfusion(normalizedText);
    if (roleConfusion.hasConfusion) {
      checks.push({
        passed: false,
        category: 'instruction_override',
        severity: 'high',
        confidence: roleConfusion.confidence,
        message: 'Role confusion indicators detected',
        details: { indicators: roleConfusion.indicators },
      });
    }

    return checks;
  }

  /**
   * Semantic analysis (placeholder for embedding-based detection)
   */
  private async detectSemantic(text: string): Promise<SafetyCheckResult[]> {
    // This would require an embedding model
    // For now, return empty array
    return [];
  }

  /**
   * Detect indirect injection attempts
   */
  private async detectIndirectInjection(text: string): Promise<SafetyCheckResult[]> {
    const checks: SafetyCheckResult[] = [];

    // Check for instructions embedded in quoted content
    const quotePattern = /["']([^"']*(?:ignore|forget|disregard|system|instruction)[^"']*)["']/gi;
    const quoteMatches = this.findAllMatches(text, quotePattern);

    if (quoteMatches.length > 0) {
      checks.push({
        passed: false,
        category: 'indirect_injection',
        severity: 'medium',
        confidence: 0.6,
        message: 'Potential indirect injection in quoted content',
        details: { quoteMatches: quoteMatches.length },
      });
    }

    // Check for instructions after formatting markers
    const formatPattern = /(?:\n|\r|^)(?:#{1,6}|>|\*|\d+\.)\s*(ignore|forget|disregard)/i;
    if (formatPattern.test(text)) {
      checks.push({
        passed: false,
        category: 'indirect_injection',
        severity: 'medium',
        confidence: 0.7,
        message: 'Instruction attempt hidden in formatted text',
      });
    }

    return checks;
  }

  /**
   * Find all matches for a pattern
   */
  private findAllMatches(text: string, pattern: RegExp): RegExpMatchArray[] {
    const matches: RegExpMatchArray[] = [];
    const globalPattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');

    let match: RegExpMatchArray | null;
    while ((match = globalPattern.exec(text)) !== null) {
      matches.push(match);
    }

    return matches;
  }

  /**
   * Calculate special character ratio
   */
  private calculateSpecialCharRatio(text: string): number {
    const specialChars = text.match(/[^\w\s]/g) ?? [];
    return text.length > 0 ? specialChars.length / text.length : 0;
  }

  /**
   * Calculate repetition score
   */
  private calculateRepetitionScore(text: string): number {
    const words = text.toLowerCase().split(/\s+/);
    const wordCounts = new Map<string, number>();

    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
    }

    const maxCount = Math.max(...wordCounts.values(), 1);
    const uniqueWords = wordCounts.size;

    if (uniqueWords === 0) return 0;

    return Math.min(maxCount / uniqueWords, 1);
  }

  /**
   * Analyze text length patterns
   */
  private analyzeLengthPatterns(text: string): { isSuspicious: boolean; confidence: number } {
    const lines = text.split(/\n/);
    const lineLengths = lines.map((l) => l.length);
    const avgLength = lineLengths.reduce((a, b) => a + b, 0) / lineLengths.length;

    // Check for very long lines (possible obfuscation)
    const longLines = lineLengths.filter((l) => l > avgLength * 3).length;
    const ratio = lines.length > 0 ? longLines / lines.length : 0;

    return {
      isSuspicious: ratio > 0.3,
      confidence: Math.min(ratio * 2, 0.9),
    };
  }

  /**
   * Detect role confusion indicators
   */
  private detectRoleConfusion(text: string): { hasConfusion: boolean; confidence: number; indicators: string[] } {
    const indicators: string[] = [];

    const rolePatterns = [
      { pattern: /\byou\s+are\s+(?:now\s+)?(?:an?\s+)?(?:ai\s+)?assistant\b/i, indicator: 'role_redefinition' },
      { pattern: /\byour\s+(?:role|purpose|function|job)\s+is\b/i, indicator: 'role_assignment' },
      { pattern: /\bact\s+as\s+(?:if\s+)?you\s+are\b/i, indicator: 'role_play' },
    ];

    for (const { pattern, indicator } of rolePatterns) {
      if (pattern.test(text)) {
        indicators.push(indicator);
      }
    }

    return {
      hasConfusion: indicators.length > 0,
      confidence: Math.min(indicators.length * 0.3 + 0.4, 0.9),
      indicators,
    };
  }

  /**
   * Load patterns based on configuration
   */
  private loadPatterns(): InjectionPattern[] {
    let patterns = getAllPatterns();

    // Filter by categories if specified
    if (this.config.categories.length > 0) {
      const categorySet = new Set(this.config.categories);
      patterns = patterns.filter((p) => {
        const category = this.mapPatternCategory(p.category);
        return categorySet.has(category);
      });
    }

    // Filter by strictness
    const minSeverity = this.getMinSeverityByStrictness();
    if (minSeverity) {
      const severityOrder = ['low', 'medium', 'high', 'critical'];
      const minIndex = severityOrder.indexOf(minSeverity);
      patterns = patterns.filter((p) => severityOrder.indexOf(p.severity) >= minIndex);
    }

    return patterns;
  }

  /**
   * Map pattern category to safety category
   */
  private mapPatternCategory(patternCategory: string): string {
    const mapping: Record<string, string> = {
      jailbreak: 'jailbreak',
      instruction_override: 'instruction_override',
      context_manipulation: 'prompt_injection',
      encoding: 'encoding_obfuscation',
      social_engineering: 'prompt_injection',
    };

    return mapping[patternCategory] ?? 'prompt_injection';
  }

  /**
   * Map pattern severity to safety severity
   */
  private mapSeverity(patternSeverity: string): SeverityLevel {
    switch (patternSeverity) {
      case 'critical':
        return 'critical';
      case 'high':
        return 'high';
      case 'medium':
        return 'medium';
      case 'low':
        return 'low';
      default:
        return 'medium';
    }
  }

  /**
   * Get minimum severity based on strictness
   */
  private getMinSeverityByStrictness(): string | null {
    switch (this.config.strictness) {
      case 'permissive':
        return 'high';
      case 'moderate':
        return 'medium';
      case 'strict':
        return 'low';
      case 'maximum':
        return null; // All patterns
      default:
        return 'medium';
    }
  }

  /**
   * Calculate safety score from checks
   */
  private calculateScore(checks: SafetyCheckResult[]): number {
    if (checks.length === 0) {
      return 100;
    }

    const failedChecks = checks.filter((c) => !c.passed);
    if (failedChecks.length === 0) {
      return 100;
    }

    // Weight by severity
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

    return 'flag';
  }
}

/**
 * Policy engine for rule-based safety enforcement
 */

import type {
  SafetyConfig,
  SafetyContext,
  SafetyCheckResult,
  SafetyResult,
  CustomRule,
  SafetyCategory,
  SeverityLevel,
} from '../types/safety';
import type { LLMRequest } from '../types/providers';

export interface PolicyRule extends CustomRule {
  readonly conditions?: readonly PolicyCondition[];
  readonly enabled: boolean;
  readonly priority: number;
}

export interface PolicyCondition {
  readonly field: 'content' | 'role' | 'model' | 'provider' | 'user' | 'metadata';
  readonly operator: 'contains' | 'equals' | 'matches' | 'startsWith' | 'endsWith' | 'in';
  readonly value: string | string[] | RegExp;
}

export interface PolicySet {
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly rules: readonly PolicyRule[];
  readonly defaultAction: 'allow' | 'block' | 'flag';
}

/**
 * Policy engine for evaluating safety rules
 */
export class PolicyEngine {
  private readonly config: SafetyConfig;
  private rules: PolicyRule[] = [];
  private initialized = false;

  public constructor(config: SafetyConfig) {
    this.config = config;
  }

  /**
   * Initialize the policy engine
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Load custom rules from config
    this.rules = this.loadRules();
    this.initialized = true;
  }

  /**
   * Check if engine is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Evaluate a request against policies
   */
  public async evaluate(request: LLMRequest, context: SafetyContext): Promise<SafetyResult> {
    const startTime = Date.now();
    const checks: SafetyCheckResult[] = [];

    // Sort rules by priority
    const sortedRules = [...this.rules].sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      if (!rule.enabled) {
        continue;
      }

      const matches = await this.evaluateRule(rule, request, context);

      if (matches) {
        checks.push({
          passed: false,
          category: rule.category,
          severity: rule.severity,
          confidence: 0.9,
          message: `Policy rule violated: ${rule.name} - ${rule.description}`,
          details: {
            ruleId: rule.id,
            ruleName: rule.name,
            matchedPattern: rule.pattern.toString(),
          },
          metadata: {
            ruleId: rule.id,
            ruleName: rule.name,
          },
        });

        // Early exit for critical rules
        if (rule.severity === 'critical') {
          break;
        }
      }
    }

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
   * Add a new policy rule
   */
  public addRule(rule: PolicyRule): void {
    this.rules.push(rule);
  }

  /**
   * Remove a policy rule
   */
  public removeRule(ruleId: string): boolean {
    const index = this.rules.findIndex((r) => r.id === ruleId);
    if (index >= 0) {
      this.rules.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Update an existing rule
   */
  public updateRule(ruleId: string, updates: Partial<PolicyRule>): boolean {
    const index = this.rules.findIndex((r) => r.id === ruleId);
    if (index >= 0) {
      this.rules[index] = { ...this.rules[index], ...updates };
      return true;
    }
    return false;
  }

  /**
   * Get all active rules
   */
  public getRules(): readonly PolicyRule[] {
    return [...this.rules];
  }

  /**
   * Evaluate a single rule
   */
  private async evaluateRule(
    rule: PolicyRule,
    request: LLMRequest,
    context: SafetyContext,
  ): Promise<boolean> {
    // Check conditions first
    if (rule.conditions && rule.conditions.length > 0) {
      const conditionsMet = rule.conditions.every((condition) =>
        this.evaluateCondition(condition, request, context),
      );
      if (!conditionsMet) {
        return false;
      }
    }

    // Check pattern match
    const content = request.messages.map((m) => m.content).join('\n');
    const pattern = rule.pattern instanceof RegExp ? rule.pattern : new RegExp(rule.pattern, rule.flags);

    return pattern.test(content);
  }

  /**
   * Evaluate a single condition
   */
  private evaluateCondition(
    condition: PolicyCondition,
    request: LLMRequest,
    context: SafetyContext,
  ): boolean {
    let fieldValue: string;

    switch (condition.field) {
      case 'content':
        fieldValue = request.messages.map((m) => m.content).join('\n');
        break;
      case 'role':
        fieldValue = request.messages[request.messages.length - 1]?.role ?? '';
        break;
      case 'model':
        fieldValue = context.model ?? '';
        break;
      case 'provider':
        fieldValue = context.provider;
        break;
      case 'user':
        fieldValue = context.userId ?? '';
        break;
      case 'metadata':
        fieldValue = JSON.stringify(context.metadata ?? {});
        break;
      default:
        return false;
    }

    switch (condition.operator) {
      case 'contains':
        return fieldValue.includes(String(condition.value));
      case 'equals':
        return fieldValue === condition.value;
      case 'matches':
        return new RegExp(condition.value).test(fieldValue);
      case 'startsWith':
        return fieldValue.startsWith(String(condition.value));
      case 'endsWith':
        return fieldValue.endsWith(String(condition.value));
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(fieldValue);
      default:
        return false;
    }
  }

  /**
   * Load rules from configuration
   */
  private loadRules(): PolicyRule[] {
    const rules: PolicyRule[] = [];

    // Convert custom rules from config
    if (this.config.customRules) {
      for (const customRule of this.config.customRules) {
        rules.push({
          ...customRule,
          enabled: true,
          priority: 50,
        });
      }
    }

    // Add built-in rules based on strictness
    rules.push(...this.getBuiltInRules());

    return rules;
  }

  /**
   * Get built-in rules based on configuration
   */
  private getBuiltInRules(): PolicyRule[] {
    const rules: PolicyRule[] = [];

    // Add category-based rules
    for (const category of this.config.categories) {
      const categoryRules = this.getCategoryRules(category);
      rules.push(...categoryRules);
    }

    return rules;
  }

  /**
   * Get rules for a specific category
   */
  private getCategoryRules(category: SafetyCategory): PolicyRule[] {
    const categoryRules: Record<SafetyCategory, Partial<PolicyRule>[]> = {
      prompt_injection: [
        {
          id: 'builtin-injection-1',
          name: 'System Prompt Block',
          pattern: /system\s*:\s*/i,
          severity: 'critical',
          description: 'Blocks attempts to override system prompts',
        },
      ],
      jailbreak: [
        {
          id: 'builtin-jailbreak-1',
          name: 'DAN Pattern Block',
          pattern: /\b(dan|do anything now)\b/i,
          severity: 'high',
          description: 'Blocks DAN jailbreak attempts',
        },
      ],
      pii_exposure: [
        {
          id: 'builtin-pii-1',
          name: 'SSN Pattern Block',
          pattern: /\b\d{3}-\d{2}-\d{4}\b/,
          severity: 'high',
          description: 'Blocks SSN patterns',
        },
      ],
      toxic_content: [],
      bias: [],
      harmful_instructions: [],
      data_exfiltration: [],
      encoding_obfuscation: [],
      instruction_override: [],
      indirect_injection: [],
      custom: [],
    };

    return (categoryRules[category] ?? []).map((r) => ({
      ...r,
      category,
      action: 'block',
      enabled: true,
      priority: 100,
    })) as PolicyRule[];
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
      return 'block';
    }

    return 'flag';
  }
}

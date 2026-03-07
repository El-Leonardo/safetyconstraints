/**
 * Main safety engine that orchestrates all safety checks
 */

import type {
  SafetyConfig,
  SafetyContext,
  SafetyResult,
  SafetyCheckResult,
  SafetyAction,
  AuditEntry,
} from '../types/safety';
import type { LLMRequest, LLMResponse } from '../types/providers';
import type { MiddlewareContext, MiddlewareChainResult } from '../types/middleware';
import type { AuditLogger, MetricsCollector, AlertManager } from '../types/monitoring';
import { randomUUID } from 'crypto';
import { InjectionDetector } from '../defense/injection/InjectionDetector';
import { InputSanitizer } from '../defense/input/InputSanitizer';
import { OutputFilter } from '../defense/output/OutputFilter';
import { PolicyEngine } from '../policy/PolicyEngine';
import { RateLimiter } from '../protection/RateLimiter';
import { AuditLoggerImpl } from '../monitoring/AuditLogger';
import { MetricsCollectorImpl } from '../monitoring/MetricsCollector';

export interface SafetyEngineDependencies {
  injectionDetector?: InjectionDetector;
  inputSanitizer?: InputSanitizer;
  outputFilter?: OutputFilter;
  policyEngine?: PolicyEngine;
  rateLimiter?: RateLimiter;
  auditLogger?: AuditLogger;
  metricsCollector?: MetricsCollector;
  alertManager?: AlertManager;
}

/**
 * Main safety engine class
 */
export class SafetyEngine {
  private readonly config: SafetyConfig;
  private readonly injectionDetector: InjectionDetector;
  private readonly inputSanitizer: InputSanitizer;
  private readonly outputFilter: OutputFilter;
  private readonly policyEngine: PolicyEngine;
  private readonly rateLimiter: RateLimiter;
  private readonly auditLogger: AuditLogger;
  private readonly metricsCollector: MetricsCollector;
  private readonly alertManager?: AlertManager;
  private initialized = false;

  public constructor(config: SafetyConfig, dependencies: SafetyEngineDependencies = {}) {
    this.config = config;
    this.injectionDetector = dependencies.injectionDetector ?? new InjectionDetector(config);
    this.inputSanitizer = dependencies.inputSanitizer ?? new InputSanitizer(config);
    this.outputFilter = dependencies.outputFilter ?? new OutputFilter(config);
    this.policyEngine = dependencies.policyEngine ?? new PolicyEngine(config);
    this.rateLimiter = dependencies.rateLimiter ?? new RateLimiter(config.rateLimitConfig);
    this.auditLogger = dependencies.auditLogger ?? new AuditLoggerImpl(config.auditConfig);
    this.metricsCollector = dependencies.metricsCollector ?? new MetricsCollectorImpl();
    this.alertManager = dependencies.alertManager;
  }

  /**
   * Initialize the safety engine
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await Promise.all([
      this.injectionDetector.initialize(),
      this.inputSanitizer.initialize(),
      this.outputFilter.initialize(),
      this.policyEngine.initialize(),
      this.rateLimiter.initialize(),
    ]);

    this.initialized = true;
  }

  /**
   * Check if the engine is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Validate input before sending to LLM
   */
  public async validateInput(
    request: LLMRequest,
    context: SafetyContext,
  ): Promise<SafetyResult & { sanitizedRequest?: LLMRequest }> {
    const startTime = Date.now();
    const checks: SafetyCheckResult[] = [];

    try {
      // Check rate limits first
      if (this.config.rateLimitConfig?.enabled) {
        const rateLimitResult = await this.rateLimiter.checkLimit(context);
        checks.push(rateLimitResult);

        if (!rateLimitResult.passed) {
          return this.buildSafetyResult(false, 0, checks, startTime, 'block');
        }
      }

      // Extract all text content from messages
      const textContent = this.extractTextContent(request);

      // Run input sanitization
      if (this.config.mode === 'input_only' || this.config.mode === 'bidirectional') {
        const sanitizationResult = await this.inputSanitizer.sanitize(textContent, context);
        checks.push(...sanitizationResult.checks);

        if (!sanitizationResult.isSafe) {
          return this.buildSafetyResult(false, 0, checks, startTime, 'block');
        }
      }

      // Run injection detection
      const injectionResult = await this.injectionDetector.detect(textContent, context);
      checks.push(...injectionResult.checks);

      if (!injectionResult.isSafe) {
        const action = this.determineAction(injectionResult.checks);
        return this.buildSafetyResult(false, injectionResult.score, checks, startTime, action);
      }

      // Run policy engine checks
      const policyResult = await this.policyEngine.evaluate(request, context);
      checks.push(...policyResult.checks);

      if (!policyResult.isSafe) {
        const action = this.determineAction(policyResult.checks);
        return this.buildSafetyResult(false, policyResult.score, checks, startTime, action);
      }

      // Calculate overall score
      const score = this.calculateSafetyScore(checks);
      const isSafe = score >= this.getMinimumSafeScore();
      const action = isSafe ? 'allow' : this.determineAction(checks);

      // Build sanitized request if needed
      let sanitizedRequest: LLMRequest | undefined;
      if (action === 'sanitize') {
        sanitizedRequest = await this.sanitizeRequest(request);
      }

      const result = this.buildSafetyResult(isSafe, score, checks, startTime, action);

      // Log and record metrics
      await this.logAndRecord(context, request, undefined, result);

      return { ...result, sanitizedRequest };
    } catch (error) {
      const errorCheck: SafetyCheckResult = {
        passed: false,
        category: 'custom',
        severity: 'high',
        confidence: 1.0,
        message: `Safety check error: ${error instanceof Error ? error.message : String(error)}`,
      };
      checks.push(errorCheck);

      return this.buildSafetyResult(false, 0, checks, startTime, 'block');
    }
  }

  /**
   * Validate output from LLM
   */
  public async validateOutput(
    response: LLMResponse,
    context: SafetyContext,
  ): Promise<SafetyResult & { sanitizedResponse?: LLMResponse }> {
    const startTime = Date.now();
    const checks: SafetyCheckResult[] = [];

    try {
      if (this.config.mode === 'output_only' || this.config.mode === 'bidirectional') {
        const filterResult = await this.outputFilter.filter(response.content, context);
        checks.push(...filterResult.checks);

        if (!filterResult.isSafe) {
          const action = this.determineAction(filterResult.checks);
          const result = this.buildSafetyResult(
            false,
            filterResult.score,
            checks,
            startTime,
            action,
          );

          await this.logAndRecord(context, undefined, response, result);
          return result;
        }
      }

      const score = this.calculateSafetyScore(checks);
      const isSafe = score >= this.getMinimumSafeScore();
      const action = isSafe ? 'allow' : 'block';

      let sanitizedResponse: LLMResponse | undefined;
      if (action === 'sanitize' || action === 'rewrite') {
        sanitizedResponse = await this.sanitizeResponse(response);
      }

      const result = this.buildSafetyResult(isSafe, score, checks, startTime, action);

      await this.logAndRecord(context, undefined, response, result);

      return { ...result, sanitizedResponse };
    } catch (error) {
      const errorCheck: SafetyCheckResult = {
        passed: false,
        category: 'custom',
        severity: 'high',
        confidence: 1.0,
        message: `Output validation error: ${error instanceof Error ? error.message : String(error)}`,
      };
      checks.push(errorCheck);

      return this.buildSafetyResult(false, 0, checks, startTime, 'block');
    }
  }

  /**
   * Validate both input and output in a single flow
   */
  public async validate(
    request: LLMRequest,
    response: LLMResponse,
    context: SafetyContext,
  ): Promise<{ inputResult: SafetyResult; outputResult: SafetyResult }> {
    const inputResult = await this.validateInput(request, context);

    if (!inputResult.isSafe && inputResult.actionTaken === 'block') {
      // If input is blocked, don't proceed with output validation
      return { inputResult, outputResult: inputResult };
    }

    const outputResult = await this.validateOutput(response, context);

    return { inputResult, outputResult };
  }

  /**
   * Process through middleware chain
   */
  public async processMiddleware(context: MiddlewareContext): Promise<MiddlewareChainResult> {
    // This is a simplified version - full implementation would use MiddlewareChain class
    const results: MiddlewareChainResult = {
      context,
      results: [],
      errors: [],
    };

    return results;
  }

  /**
   * Get current metrics snapshot
   */
  public getMetrics() {
    return this.metricsCollector.getMetrics();
  }

  /**
   * Shutdown the safety engine
   */
  public async shutdown(): Promise<void> {
    this.initialized = false;
    // Cleanup resources if needed
  }

  /**
   * Extract text content from request messages
   */
  private extractTextContent(request: LLMRequest): string {
    return request.messages.map((m) => m.content).join('\n');
  }

  /**
   * Build a safety result object
   */
  private buildSafetyResult(
    isSafe: boolean,
    score: number,
    checks: SafetyCheckResult[],
    startTime: number,
    actionTaken: SafetyAction,
  ): SafetyResult {
    return {
      isSafe,
      score,
      checks,
      timestamp: new Date(),
      processingTimeMs: Date.now() - startTime,
      actionTaken,
    };
  }

  /**
   * Calculate overall safety score from checks
   */
  private calculateSafetyScore(checks: SafetyCheckResult[]): number {
    if (checks.length === 0) {
      return 100;
    }

    const failedChecks = checks.filter((c) => !c.passed);
    if (failedChecks.length === 0) {
      return 100;
    }

    // Calculate weighted score based on severity
    const severityWeights: Record<string, number> = {
      low: 10,
      medium: 25,
      high: 50,
      critical: 100,
    };

    const totalWeight = failedChecks.reduce((sum, check) => {
      return sum + (severityWeights[check.severity] ?? 25) * check.confidence;
    }, 0);

    return Math.max(0, 100 - totalWeight / checks.length);
  }

  /**
   * Get minimum score required to be considered safe
   */
  private getMinimumSafeScore(): number {
    const thresholds: Record<string, number> = {
      permissive: 30,
      moderate: 50,
      strict: 70,
      maximum: 90,
    };

    return thresholds[this.config.strictness] ?? 50;
  }

  /**
   * Determine the action to take based on failed checks
   */
  private determineAction(checks: SafetyCheckResult[]): SafetyAction {
    const failedChecks = checks.filter((c) => !c.passed);

    if (failedChecks.length === 0) {
      return 'allow';
    }

    // Check for critical violations
    if (failedChecks.some((c) => c.severity === 'critical')) {
      return 'block';
    }

    // Check for high severity violations
    if (failedChecks.some((c) => c.severity === 'high')) {
      return this.config.strictness === 'strict' || this.config.strictness === 'maximum'
        ? 'block'
        : 'sanitize';
    }

    // Medium and low severity
    return this.config.strictness === 'maximum' ? 'block' : 'flag';
  }

  /**
   * Sanitize a request
   */
  private async sanitizeRequest(request: LLMRequest): Promise<LLMRequest> {
    const sanitizedMessages = await Promise.all(
      request.messages.map(async (msg) => ({
        ...msg,
        content: await this.inputSanitizer.sanitizeText(msg.content),
      })),
    );

    return {
      ...request,
      messages: sanitizedMessages,
    };
  }

  /**
   * Sanitize a response
   */
  private async sanitizeResponse(response: LLMResponse): Promise<LLMResponse> {
    const sanitizedContent = await this.outputFilter.sanitizeText(response.content);

    return {
      ...response,
      content: sanitizedContent,
    };
  }

  /**
   * Log audit entry and record metrics
   */
  private async logAndRecord(
    context: SafetyContext,
    request: LLMRequest | undefined,
    response: LLMResponse | undefined,
    result: SafetyResult,
  ): Promise<void> {
    // Record metrics
    this.metricsCollector.recordRequest(context, result);
    if (!result.isSafe) {
      this.metricsCollector.recordViolation(context, result);
    }
    this.metricsCollector.recordLatency(context, result.processingTimeMs);

    // Log audit entry if enabled
    if (this.config.auditConfig?.enabled) {
      const entry: AuditEntry = {
        id: randomUUID(),
        timestamp: new Date(),
        requestId: context.requestId,
        level: result.isSafe ? 'info' : 'warn',
        category: result.checks.find((c) => !c.passed)?.category ?? 'custom',
        message: result.isSafe
          ? 'Request processed safely'
          : `Safety violation detected: ${result.checks.find((c) => !c.passed)?.message ?? 'Unknown'}`,
        input: this.config.auditConfig.includeInput
          ? request?.messages.map((m) => m.content).join('\n')
          : undefined,
        output: this.config.auditConfig.includeOutput ? response?.content : undefined,
        safetyResult: result,
        userId: context.userId,
        sessionId: context.sessionId,
        sourceIp: context.sourceIp,
      };

      await this.auditLogger.log(entry);
    }
  }
}

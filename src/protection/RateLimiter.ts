/**
 * Rate limiting implementation
 */

import type { SafetyCheckResult, RateLimitConfig, SafetyContext } from '../types/safety';

interface RateLimitEntry {
  readonly count: number;
  readonly windowStart: number;
  readonly tokens: number;
  readonly lastRequest: number;
}

export interface RateLimiterOptions {
  readonly requestsPerSecond: number;
  readonly burstSize: number;
  readonly windowMs: number;
  readonly keyPrefix?: string;
}

/**
 * Token bucket rate limiter with sliding window
 */
export class RateLimiter {
  private config: RateLimitConfig;
  private storage: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval?: NodeJS.Timeout;
  private initialized = false;

  public constructor(config?: RateLimitConfig) {
    this.config =
      config ?? {
        enabled: true,
        requestsPerSecond: 10,
        burstSize: 20,
        windowMs: 60000,
      };
  }

  /**
   * Initialize the rate limiter
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.config.enabled) {
      // Start cleanup interval to prevent memory leaks
      this.cleanupInterval = setInterval(() => this.cleanup(), this.config.windowMs);
    }

    this.initialized = true;
  }

  /**
   * Check if rate limiter is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if a request is within rate limits
   */
  public async checkLimit(context: SafetyContext): Promise<SafetyCheckResult> {
    if (!this.config.enabled) {
      return {
        passed: true,
        category: 'custom',
        severity: 'low',
        confidence: 1.0,
        message: 'Rate limiting disabled',
      };
    }

    const key = this.buildKey(context);
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    const entry = this.storage.get(key);

    // Clean old entry if window has passed
    if (entry && entry.windowStart < windowStart) {
      this.storage.delete(key);
    }

    // Check sliding window
    const currentEntry = this.storage.get(key);
    if (currentEntry) {
      const requestsInWindow = currentEntry.count;
      const maxRequests = this.config.requestsPerSecond * (this.config.windowMs / 1000);

      if (requestsInWindow >= maxRequests) {
        return {
          passed: false,
          category: 'custom',
          severity: 'medium',
          confidence: 1.0,
          message: `Rate limit exceeded. Maximum ${maxRequests} requests per ${this.config.windowMs}ms`,
          details: {
            limit: maxRequests,
            windowMs: this.config.windowMs,
            retryAfter: this.calculateRetryAfter(currentEntry),
          },
        };
      }
    }

    // Check token bucket
    const bucketResult = this.checkTokenBucket(key, now);
    if (!bucketResult.allowed) {
      return {
        passed: false,
        category: 'custom',
        severity: 'medium',
        confidence: 1.0,
        message: 'Burst limit exceeded',
        details: {
          burstSize: this.config.burstSize,
          retryAfter: bucketResult.retryAfter,
        },
      };
    }

    return {
      passed: true,
      category: 'custom',
      severity: 'low',
      confidence: 1.0,
      message: 'Rate limit check passed',
    };
  }

  /**
   * Record a request (increments counters)
   */
  public async recordRequest(context: SafetyContext): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const key = this.buildKey(context);
    const now = Date.now();

    const entry = this.storage.get(key);
    if (entry) {
      this.storage.set(key, {
        ...entry,
        count: entry.count + 1,
        lastRequest: now,
      });
    } else {
      this.storage.set(key, {
        count: 1,
        windowStart: now,
        tokens: this.config.burstSize - 1,
        lastRequest: now,
      });
    }
  }

  /**
   * Get current rate limit status for a context
   */
  public async getStatus(context: SafetyContext): Promise<{
    remaining: number;
    resetTime: number;
    limit: number;
  }> {
    const key = this.buildKey(context);
    const now = Date.now();
    const entry = this.storage.get(key);

    if (!entry) {
      return {
        remaining: this.config.burstSize,
        resetTime: now + this.config.windowMs,
        limit: this.config.requestsPerSecond * (this.config.windowMs / 1000),
      };
    }

    const maxRequests = this.config.requestsPerSecond * (this.config.windowMs / 1000);
    const remaining = Math.max(0, maxRequests - entry.count);

    return {
      remaining,
      resetTime: entry.windowStart + this.config.windowMs,
      limit: maxRequests,
    };
  }

  /**
   * Reset rate limit for a context
   */
  public async reset(context: SafetyContext): Promise<void> {
    const key = this.buildKey(context);
    this.storage.delete(key);
  }

  /**
   * Reset all rate limits
   */
  public async resetAll(): Promise<void> {
    this.storage.clear();
  }

  /**
   * Shutdown the rate limiter
   */
  public async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.storage.clear();
    this.initialized = false;
  }

  /**
   * Build rate limit key from context
   */
  private buildKey(context: SafetyContext): string {
    const parts: string[] = [this.config.keyPrefix ?? 'rate_limit'];

    if (context.userId) {
      parts.push(`user:${context.userId}`);
    } else if (context.sourceIp) {
      parts.push(`ip:${context.sourceIp}`);
    } else if (context.sessionId) {
      parts.push(`session:${context.sessionId}`);
    } else {
      parts.push(`request:${context.requestId}`);
    }

    return parts.join(':');
  }

  /**
   * Check token bucket algorithm
   */
  private checkTokenBucket(key: string, now: number): { allowed: boolean; retryAfter: number } {
    const entry = this.storage.get(key);

    if (!entry) {
      return { allowed: true, retryAfter: 0 };
    }

    // Calculate tokens to add based on time passed
    const timePassed = (now - entry.lastRequest) / 1000;
    const tokensToAdd = timePassed * this.config.requestsPerSecond;
    const currentTokens = Math.min(this.config.burstSize, entry.tokens + tokensToAdd);

    if (currentTokens >= 1) {
      this.storage.set(key, {
        ...entry,
        tokens: currentTokens - 1,
        lastRequest: now,
      });
      return { allowed: true, retryAfter: 0 };
    }

    // Calculate retry after
    const tokensNeeded = 1 - currentTokens;
    const retryAfter = Math.ceil((tokensNeeded / this.config.requestsPerSecond) * 1000);

    return { allowed: false, retryAfter };
  }

  /**
   * Calculate retry after time for sliding window
   */
  private calculateRetryAfter(entry: RateLimitEntry): number {
    return Math.max(0, entry.windowStart + this.config.windowMs - Date.now());
  }

  /**
   * Cleanup old entries to prevent memory leaks
   */
  private cleanup(): void {
    const now = Date.now();
    const maxAge = this.config.windowMs * 2; // Keep entries for 2 windows

    for (const [key, entry] of this.storage) {
      if (now - entry.lastRequest > maxAge) {
        this.storage.delete(key);
      }
    }
  }
}

/**
 * Metrics collector implementation
 */

import type {
  MetricsCollector as IMetricsCollector,
  MetricsSnapshot,
  SafetyContext,
  SafetyResult,
} from '../types/monitoring';

interface MetricEntry {
  readonly timestamp: number;
  readonly value: number;
  readonly labels: Record<string, string>;
}

interface LatencyHistogram {
  readonly buckets: number[];
  readonly sum: number;
  readonly count: number;
}

/**
 * Metrics collector for safety operations
 */
export class MetricsCollectorImpl implements IMetricsCollector {
  public readonly name = 'SafetyMetrics';

  private requestCount = 0;
  private blockedCount = 0;
  private sanitizedCount = 0;
  private violationsByCategory: Map<string, number> = new Map();
  private latencies: number[] = [];
  private maxLatencyBuffer = 10000;
  private startTime = Date.now();

  /**
   * Record a request
   */
  public recordRequest(context: SafetyContext, result: SafetyResult): void {
    this.requestCount++;

    if (!result.isSafe) {
      if (result.actionTaken === 'block') {
        this.blockedCount++;
      } else if (result.actionTaken === 'sanitize') {
        this.sanitizedCount++;
      }
    }
  }

  /**
   * Record a violation
   */
  public recordViolation(context: SafetyContext, result: SafetyResult): void {
    for (const check of result.checks) {
      if (!check.passed) {
        const current = this.violationsByCategory.get(check.category) ?? 0;
        this.violationsByCategory.set(check.category, current + 1);
      }
    }
  }

  /**
   * Record latency
   */
  public recordLatency(context: SafetyContext, latencyMs: number): void {
    this.latencies.push(latencyMs);

    // Keep buffer size manageable
    if (this.latencies.length > this.maxLatencyBuffer) {
      this.latencies = this.latencies.slice(-this.maxLatencyBuffer / 2);
    }
  }

  /**
   * Get current metrics snapshot
   */
  public getMetrics(): MetricsSnapshot {
    const sortedLatencies = [...this.latencies].sort((a, b) => a - b);
    const count = sortedLatencies.length;

    return {
      timestamp: new Date(),
      totalRequests: this.requestCount,
      blockedRequests: this.blockedCount,
      sanitizedRequests: this.sanitizedCount,
      violationsByCategory: Object.fromEntries(this.violationsByCategory),
      averageLatencyMs: count > 0 ? sortedLatencies.reduce((a, b) => a + b, 0) / count : 0,
      p95LatencyMs: count > 0 ? this.getPercentile(sortedLatencies, 0.95) : 0,
      p99LatencyMs: count > 0 ? this.getPercentile(sortedLatencies, 0.99) : 0,
    };
  }

  /**
   * Reset all metrics
   */
  public reset(): void {
    this.requestCount = 0;
    this.blockedCount = 0;
    this.sanitizedCount = 0;
    this.violationsByCategory.clear();
    this.latencies = [];
    this.startTime = Date.now();
  }

  /**
   * Export metrics in Prometheus format
   */
  public exportPrometheus(): string {
    const metrics = this.getMetrics();
    const lines: string[] = [];

    // Request counter
    lines.push('# HELP safety_requests_total Total number of requests');
    lines.push('# TYPE safety_requests_total counter');
    lines.push(`safety_requests_total ${metrics.totalRequests}`);

    // Blocked requests
    lines.push('# HELP safety_blocked_requests_total Total number of blocked requests');
    lines.push('# TYPE safety_blocked_requests_total counter');
    lines.push(`safety_blocked_requests_total ${metrics.blockedRequests}`);

    // Sanitized requests
    lines.push('# HELP safety_sanitized_requests_total Total number of sanitized requests');
    lines.push('# TYPE safety_sanitized_requests_total counter');
    lines.push(`safety_sanitized_requests_total ${metrics.sanitizedRequests}`);

    // Violations by category
    lines.push('# HELP safety_violations_total Total number of violations by category');
    lines.push('# TYPE safety_violations_total counter');
    for (const [category, count] of Object.entries(metrics.violationsByCategory)) {
      lines.push(`safety_violations_total{category="${category}"} ${count}`);
    }

    // Latency histogram
    lines.push('# HELP safety_latency_seconds Request latency in seconds');
    lines.push('# TYPE safety_latency_seconds histogram');
    lines.push(`safety_latency_seconds_sum ${metrics.averageLatencyMs / 1000}`);
    lines.push(`safety_latency_seconds_count ${this.latencies.length}`);

    return lines.join('\n');
  }

  /**
   * Export metrics as JSON
   */
  public exportJSON(): string {
    return JSON.stringify(this.getMetrics(), null, 2);
  }

  /**
   * Get the uptime in milliseconds
   */
  public getUptime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Get request rate (requests per second)
   */
  public getRequestRate(): number {
    const uptime = this.getUptime() / 1000;
    return uptime > 0 ? this.requestCount / uptime : 0;
  }

  /**
   * Get percentile from sorted array
   */
  private getPercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;

    const index = Math.ceil(sortedArray.length * percentile) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
  }
}

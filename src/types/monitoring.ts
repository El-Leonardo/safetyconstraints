/**
 * Monitoring and audit types
 */

import type { SafetyResult, SafetyContext, AuditEntry } from './safety';

/**
 * Metrics collector types
 */
export interface MetricsCollector {
  readonly name: string;
  readonly recordRequest: (context: SafetyContext, result: SafetyResult) => void;
  readonly recordViolation: (context: SafetyContext, result: SafetyResult) => void;
  readonly recordLatency: (context: SafetyContext, latencyMs: number) => void;
  readonly getMetrics: () => MetricsSnapshot;
  readonly reset: () => void;
}

/**
 * Metrics snapshot
 */
export interface MetricsSnapshot {
  readonly timestamp: Date;
  readonly totalRequests: number;
  readonly blockedRequests: number;
  readonly sanitizedRequests: number;
  readonly violationsByCategory: Record<string, number>;
  readonly averageLatencyMs: number;
  readonly p95LatencyMs: number;
  readonly p99LatencyMs: number;
}

/**
 * Audit logger interface
 */
export interface AuditLogger {
  readonly log: (entry: AuditEntry) => Promise<void> | void;
  readonly logBatch: (entries: readonly AuditEntry[]) => Promise<void> | void;
  readonly query: (filters: AuditQueryFilters) => Promise<readonly AuditEntry[]>;
  readonly export: (format: 'json' | 'csv', filters?: AuditQueryFilters) => Promise<string>;
}

/**
 * Audit query filters
 */
export interface AuditQueryFilters {
  readonly startTime?: Date;
  readonly endTime?: Date;
  readonly level?: 'debug' | 'info' | 'warn' | 'error';
  readonly category?: string;
  readonly userId?: string;
  readonly requestId?: string;
  readonly limit?: number;
  readonly offset?: number;
}

/**
 * Alert configuration
 */
export interface AlertConfig {
  readonly enabled: boolean;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly channels: readonly AlertChannel[];
  readonly throttleMs: number;
  readonly deduplicateWindowMs: number;
}

/**
 * Alert channel
 */
export type AlertChannel =
  | { readonly type: 'webhook'; readonly url: string; readonly headers?: Record<string, string> }
  | { readonly type: 'email'; readonly recipients: readonly string[] }
  | { readonly type: 'slack'; readonly webhookUrl: string }
  | { readonly type: 'pagerduty'; readonly integrationKey: string }
  | { readonly type: 'custom'; readonly handler: (alert: Alert) => void | Promise<void> };

/**
 * Alert structure
 */
export interface Alert {
  readonly id: string;
  readonly timestamp: Date;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly title: string;
  readonly message: string;
  readonly context: SafetyContext;
  readonly safetyResult: SafetyResult;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Alert manager interface
 */
export interface AlertManager {
  readonly trigger: (alert: Alert) => Promise<void>;
  readonly acknowledge: (alertId: string) => void;
  readonly resolve: (alertId: string) => void;
  readonly getActiveAlerts: () => readonly Alert[];
}

/**
 * Health check status
 */
export interface HealthStatus {
  readonly status: 'healthy' | 'degraded' | 'unhealthy';
  readonly timestamp: Date;
  readonly checks: readonly ComponentHealth[];
  readonly overallLatencyMs: number;
}

/**
 * Component health check
 */
export interface ComponentHealth {
  readonly name: string;
  readonly status: 'healthy' | 'degraded' | 'unhealthy';
  readonly latencyMs: number;
  readonly message?: string;
  readonly lastChecked: Date;
}

/**
 * Audit logger implementation
 */

import type {
  AuditLogger as IAuditLogger,
  AuditEntry,
  AuditQueryFilters,
  AuditConfig,
  SafetyResult,
  SafetyContext,
} from '../types/safety';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Audit logger with multiple output destinations
 */
export class AuditLoggerImpl implements IAuditLogger {
  private config: AuditConfig;
  private buffer: AuditEntry[] = [];
  private flushInterval?: NodeJS.Timeout;
  private initialized = false;

  public constructor(config?: AuditConfig) {
    this.config =
      config ?? {
        enabled: true,
        logLevel: 'info',
        includeInput: false,
        includeOutput: false,
        redactPII: true,
        destination: 'console',
      };
  }

  /**
   * Initialize the audit logger
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.config.enabled) {
      // Setup file logging if configured
      if (this.config.destination === 'file' && this.config.filePath) {
        await this.ensureLogDirectory();
      }

      // Setup buffer flush interval for batch logging
      this.flushInterval = setInterval(() => this.flush(), 5000);
    }

    this.initialized = true;
  }

  /**
   * Shutdown the audit logger
   */
  public async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    await this.flush();
    this.initialized = false;
  }

  /**
   * Log a single audit entry
   */
  public async log(entry: AuditEntry): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    if (!this.shouldLog(entry.level)) {
      return;
    }

    const processedEntry = this.processEntry(entry);

    switch (this.config.destination) {
      case 'console':
        this.logToConsole(processedEntry);
        break;
      case 'file':
        await this.logToFile(processedEntry);
        break;
      case 'http':
        await this.logToHttp(processedEntry);
        break;
      case 'custom':
        if (this.config.customHandler) {
          await this.config.customHandler(processedEntry);
        }
        break;
      default:
        this.logToConsole(processedEntry);
    }
  }

  /**
   * Log multiple entries (batch)
   */
  public async logBatch(entries: readonly AuditEntry[]): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const filteredEntries = entries.filter((e) => this.shouldLog(e.level));

    if (filteredEntries.length === 0) {
      return;
    }

    for (const entry of filteredEntries) {
      this.buffer.push(this.processEntry(entry));
    }

    // Flush if buffer is getting large
    if (this.buffer.length > 100) {
      await this.flush();
    }
  }

  /**
   * Query audit entries (simplified in-memory implementation)
   * For production, this should use a proper database
   */
  public async query(filters: AuditQueryFilters): Promise<readonly AuditEntry[]> {
    // This is a placeholder - in production, query from database
    let results = [...this.buffer];

    if (filters.startTime) {
      results = results.filter((e) => e.timestamp >= filters.startTime!);
    }

    if (filters.endTime) {
      results = results.filter((e) => e.timestamp <= filters.endTime!);
    }

    if (filters.level) {
      results = results.filter((e) => e.level === filters.level);
    }

    if (filters.category) {
      results = results.filter((e) => e.category === filters.category);
    }

    if (filters.userId) {
      results = results.filter((e) => e.userId === filters.userId);
    }

    if (filters.requestId) {
      results = results.filter((e) => e.requestId === filters.requestId);
    }

    // Apply limit and offset
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 100;
    results = results.slice(offset, offset + limit);

    return results;
  }

  /**
   * Export audit entries
   */
  public async export(format: 'json' | 'csv', filters?: AuditQueryFilters): Promise<string> {
    const entries = await this.query(filters ?? {});

    if (format === 'json') {
      return JSON.stringify(entries, null, 2);
    }

    // CSV format
    const headers = ['id', 'timestamp', 'level', 'category', 'message', 'requestId', 'userId'];
    const rows = entries.map((e) => [
      e.id,
      e.timestamp.toISOString(),
      e.level,
      e.category,
      e.message,
      e.requestId,
      e.userId ?? '',
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  /**
   * Create an audit entry from safety check result
   */
  public createEntry(
    context: SafetyContext,
    result: SafetyResult,
    input?: string,
    output?: string,
  ): AuditEntry {
    const failedCheck = result.checks.find((c) => !c.passed);

    return {
      id: randomUUID(),
      timestamp: new Date(),
      requestId: context.requestId,
      level: result.isSafe ? 'info' : 'warn',
      category: failedCheck?.category ?? 'custom',
      message: result.isSafe
        ? 'Request processed successfully'
        : `Safety violation: ${failedCheck?.message ?? 'Unknown'}`,
      input: this.config.includeInput ? input : undefined,
      output: this.config.includeOutput ? output : undefined,
      safetyResult: result,
      userId: context.userId,
      sessionId: context.sessionId,
      sourceIp: context.sourceIp,
    };
  }

  /**
   * Flush buffered entries
   */
  private async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const entries = [...this.buffer];
    this.buffer = [];

    if (this.config.destination === 'file') {
      await this.appendToFile(entries);
    }
  }

  /**
   * Process entry for logging (redaction, etc.)
   */
  private processEntry(entry: AuditEntry): AuditEntry {
    if (!this.config.redactPII) {
      return entry;
    }

    return {
      ...entry,
      input: entry.input ? this.redactPII(entry.input) : undefined,
      output: entry.output ? this.redactPII(entry.output) : undefined,
    };
  }

  /**
   * Redact PII from text
   */
  private redactPII(text: string): string {
    // Simple PII redaction patterns
    const patterns: Array<{ pattern: RegExp; replacement: string }> = [
      { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[REDACTED-SSN]' },
      { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[REDACTED-EMAIL]' },
      { pattern: /\b\d{3}-\d{3}-\d{4}\b/g, replacement: '[REDACTED-PHONE]' },
      { pattern: /\b(?:\d[ -]*?){13,16}\b/g, replacement: '[REDACTED-CC]' },
      { pattern: /sk-[a-zA-Z0-9]{20,}/g, replacement: '[REDACTED-API-KEY]' },
    ];

    let redacted = text;
    for (const { pattern, replacement } of patterns) {
      redacted = redacted.replace(pattern, replacement);
    }

    return redacted;
  }

  /**
   * Check if entry level should be logged
   */
  private shouldLog(level: AuditEntry['level']): boolean {
    const levels: Record<string, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };

    return levels[level] >= levels[this.config.logLevel];
  }

  /**
   * Log to console
   */
  private logToConsole(entry: AuditEntry): void {
    const timestamp = entry.timestamp.toISOString();
    const prefix = `[${timestamp}] [${entry.level.toUpperCase()}] [${entry.category}]`;

    switch (entry.level) {
      case 'error':
        console.error(prefix, entry.message, entry.details);
        break;
      case 'warn':
        console.warn(prefix, entry.message, entry.details);
        break;
      case 'debug':
        console.debug(prefix, entry.message);
        break;
      default:
        console.log(prefix, entry.message);
    }
  }

  /**
   * Log to file
   */
  private async logToFile(entry: AuditEntry): Promise<void> {
    this.buffer.push(entry);

    if (this.buffer.length >= 10) {
      await this.flush();
    }
  }

  /**
   * Append entries to file
   */
  private async appendToFile(entries: AuditEntry[]): Promise<void> {
    if (!this.config.filePath) {
      return;
    }

    const lines = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
    await fs.appendFile(this.config.filePath, lines, 'utf-8');
  }

  /**
   * Log to HTTP endpoint
   */
  private async logToHttp(entry: AuditEntry): Promise<void> {
    if (!this.config.httpEndpoint) {
      return;
    }

    try {
      await fetch(this.config.httpEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
    } catch (error) {
      console.error('Failed to send audit log to HTTP endpoint:', error);
    }
  }

  /**
   * Ensure log directory exists
   */
  private async ensureLogDirectory(): Promise<void> {
    if (!this.config.filePath) {
      return;
    }

    const dir = path.dirname(this.config.filePath);
    await fs.mkdir(dir, { recursive: true });
  }
}

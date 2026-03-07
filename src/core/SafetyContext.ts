/**
 * Safety context builder and manager
 */

import type { SafetyContext } from '../types/safety';
import { randomUUID } from 'crypto';

/**
 * Builder for creating safety contexts
 */
export class SafetyContextBuilder {
  private requestId: string;
  private timestamp: Date;
  private userId?: string;
  private sessionId?: string;
  private sourceIp?: string;
  private provider: string = 'unknown';
  private model?: string;
  private metadata?: Record<string, unknown>;

  public constructor() {
    this.requestId = randomUUID();
    this.timestamp = new Date();
  }

  /**
   * Set a custom request ID (otherwise auto-generated)
   */
  public withRequestId(requestId: string): this {
    this.requestId = requestId;
    return this;
  }

  /**
   * Set the user ID
   */
  public withUserId(userId: string): this {
    this.userId = userId;
    return this;
  }

  /**
   * Set the session ID
   */
  public withSessionId(sessionId: string): this {
    this.sessionId = sessionId;
    return this;
  }

  /**
   * Set the source IP address
   */
  public withSourceIp(sourceIp: string): this {
    this.sourceIp = sourceIp;
    return this;
  }

  /**
   * Set the LLM provider
   */
  public withProvider(provider: string): this {
    this.provider = provider;
    return this;
  }

  /**
   * Set the model name
   */
  public withModel(model: string): this {
    this.model = model;
    return this;
  }

  /**
   * Set custom metadata
   */
  public withMetadata(metadata: Record<string, unknown>): this {
    this.metadata = { ...this.metadata, ...metadata };
    return this;
  }

  /**
   * Set a single metadata value
   */
  public withMetadataValue(key: string, value: unknown): this {
    this.metadata = { ...this.metadata, [key]: value };
    return this;
  }

  /**
   * Build the safety context
   */
  public build(): SafetyContext {
    return {
      requestId: this.requestId,
      timestamp: this.timestamp,
      userId: this.userId,
      sessionId: this.sessionId,
      sourceIp: this.sourceIp,
      provider: this.provider,
      model: this.model,
      metadata: this.metadata,
    };
  }
}

/**
 * Create a new safety context builder
 */
export function createSafetyContext(): SafetyContextBuilder {
  return new SafetyContextBuilder();
}

/**
 * Create a safety context from HTTP request headers
 */
export function createContextFromHeaders(
  headers: Record<string, string | string[] | undefined>,
  provider: string,
): SafetyContext {
  const builder = new SafetyContextBuilder().withProvider(provider);

  const userId = headers['x-user-id'];
  if (typeof userId === 'string') {
    builder.withUserId(userId);
  }

  const sessionId = headers['x-session-id'];
  if (typeof sessionId === 'string') {
    builder.withSessionId(sessionId);
  }

  const requestId = headers['x-request-id'];
  if (typeof requestId === 'string') {
    builder.withRequestId(requestId);
  }

  // Handle forwarded IP
  const forwardedFor = headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string') {
    // Get first IP from comma-separated list
    builder.withSourceIp(forwardedFor.split(',')[0]?.trim() ?? forwardedFor);
  }

  return builder.build();
}

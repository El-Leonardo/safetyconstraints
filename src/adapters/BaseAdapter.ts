/**
 * Base adapter class for LLM providers
 */

import type {
  ProviderAdapter,
  LLMProvider,
  LLMRequest,
  LLMResponse,
  StreamChunk,
  ProviderConfig,
  ChatMessage,
  TokenUsage,
} from '../types/providers';
import type { SafetyContext } from '../types/safety';
import { randomUUID } from 'crypto';

export interface BaseAdapterConfig extends ProviderConfig {
  readonly maxRetries: number;
  readonly retryDelay: number;
  readonly timeout: number;
}

/**
 * Abstract base class for provider adapters
 */
export abstract class BaseAdapter implements ProviderAdapter {
  public abstract readonly provider: LLMProvider;
  public abstract readonly name: string;

  protected config!: BaseAdapterConfig;
  protected isReady = false;

  /**
   * Initialize the adapter with configuration
   */
  public async initialize(config: ProviderConfig): Promise<void> {
    this.config = {
      maxRetries: 3,
      retryDelay: 1000,
      timeout: 30000,
      ...config,
    } as BaseAdapterConfig;

    await this.onInitialize();
    this.isReady = true;
  }

  /**
   * Validate the adapter configuration
   */
  public validateConfig(): boolean {
    if (!this.config) {
      return false;
    }

    return this.onValidateConfig();
  }

  /**
   * Generate a completion
   */
  public async complete(request: LLMRequest, context: SafetyContext): Promise<LLMResponse> {
    if (!this.isReady) {
      throw new Error(`Adapter ${this.name} is not initialized`);
    }

    const startTime = Date.now();
    let attempts = 0;
    let lastError: Error | undefined;

    while (attempts < this.config.maxRetries) {
      try {
        const response = await this.executeCompletion(request, context);
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (this.isRetryableError(lastError) && attempts < this.config.maxRetries - 1) {
          attempts++;
          await this.delay(this.config.retryDelay * attempts);
          continue;
        }

        throw lastError;
      }
    }

    throw lastError ?? new Error('Max retries exceeded');
  }

  /**
   * Stream a completion
   */
  public async stream(
    request: LLMRequest,
    context: SafetyContext,
    callback: (chunk: StreamChunk) => void | Promise<void>,
  ): Promise<void> {
    if (!this.isReady) {
      throw new Error(`Adapter ${this.name} is not initialized`);
    }

    await this.executeStream(request, context, callback);
  }

  /**
   * Get available models
   */
  public abstract getModels(): Promise<readonly string[]>;

  /**
   * Check adapter health
   */
  public abstract healthCheck(): Promise<boolean>;

  /**
   * Build a standard response from provider data
   */
  protected buildResponse(
    content: string,
    model: string,
    usage?: TokenUsage,
    finishReason?: string,
  ): LLMResponse {
    return {
      id: randomUUID(),
      content,
      role: 'assistant',
      model,
      provider: this.provider,
      usage,
      finishReason,
    };
  }

  /**
   * Build a stream chunk
   */
  protected buildChunk(content: string, isComplete = false, usage?: TokenUsage): StreamChunk {
    return {
      id: randomUUID(),
      content,
      isComplete,
      usage,
    };
  }

  /**
   * Convert messages to provider format
   */
  protected abstract formatMessages(messages: readonly ChatMessage[]): unknown;

  /**
   * Parse provider response to standard format
   */
  protected abstract parseResponse(response: unknown): LLMResponse;

  /**
   * Execute completion (implemented by subclasses)
   */
  protected abstract executeCompletion(
    request: LLMRequest,
    context: SafetyContext,
  ): Promise<LLMResponse>;

  /**
   * Execute streaming (implemented by subclasses)
   */
  protected abstract executeStream(
    request: LLMRequest,
    context: SafetyContext,
    callback: (chunk: StreamChunk) => void | Promise<void>,
  ): Promise<void>;

  /**
   * Initialize hook for subclasses
   */
  protected abstract onInitialize(): Promise<void> | void;

  /**
   * Validate config hook for subclasses
   */
  protected abstract onValidateConfig(): boolean;

  /**
   * Check if an error is retryable
   */
  protected isRetryableError(error: Error): boolean {
    const retryableMessages = [
      'rate limit',
      'timeout',
      'temporarily unavailable',
      'connection',
      'econnreset',
      'econnrefused',
    ];

    const errorMessage = error.message.toLowerCase();
    return retryableMessages.some((msg) => errorMessage.includes(msg));
  }

  /**
   * Delay helper
   */
  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Merge request with default parameters
   */
  protected mergeWithDefaults(request: LLMRequest): LLMRequest {
    return {
      ...this.config.defaultParams,
      ...request,
      messages: request.messages,
    };
  }
}

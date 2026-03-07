/**
 * Anthropic provider adapter
 */

import { BaseAdapter } from './BaseAdapter';
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  StreamChunk,
  ChatMessage,
  TokenUsage,
} from '../types/providers';
import type { SafetyContext } from '../types/safety';

// Type definitions for Anthropic API
interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  stream?: boolean;
  system?: string;
}

interface AnthropicContentBlock {
  type: 'text' | 'tool_use';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface AnthropicResponse {
  id: string;
  type: string;
  role: 'assistant';
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface AnthropicStreamEvent {
  type: 'message_start' | 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_delta' | 'message_stop';
  index?: number;
  delta?: {
    type?: 'text_delta';
    text?: string;
    stop_reason?: string;
    usage?: {
      output_tokens?: number;
    };
  };
  content_block?: AnthropicContentBlock;
  message?: Partial<AnthropicResponse>;
}

/**
 * Anthropic adapter implementation
 */
export class AnthropicAdapter extends BaseAdapter {
  public readonly provider: LLMProvider = 'anthropic';
  public readonly name = 'Anthropic';

  private apiKey?: string;
  private baseUrl = 'https://api.anthropic.com/v1';
  private apiVersion = '2023-06-01';

  protected onInitialize(): void {
    this.apiKey = this.config.apiKey;
    if (this.config.baseUrl) {
      this.baseUrl = this.config.baseUrl;
    }
  }

  protected onValidateConfig(): boolean {
    return !!this.apiKey;
  }

  public async getModels(): Promise<readonly string[]> {
    return [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-sonnet-20240620',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
      'claude-2.1',
      'claude-2.0',
      'claude-instant-1.2',
    ];
  }

  public async healthCheck(): Promise<boolean> {
    try {
      // Anthropic doesn't have a simple health endpoint, so we check if we can list models
      await this.getModels();
      return true;
    } catch {
      return false;
    }
  }

  protected formatMessages(messages: readonly ChatMessage[]): AnthropicMessage[] {
    return messages
      .filter((msg) => msg.role !== 'system')
      .map((msg) => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      }));
  }

  protected parseResponse(response: unknown): LLMResponse {
    const anthropicResponse = response as AnthropicResponse;

    const textContent = anthropicResponse.content
      .filter((block): block is AnthropicContentBlock & { text: string } => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('');

    const usage: TokenUsage = {
      promptTokens: 0, // Anthropic doesn't provide this in response
      completionTokens: anthropicResponse.usage.output_tokens,
      totalTokens: anthropicResponse.usage.output_tokens,
    };

    return this.buildResponse(
      textContent,
      anthropicResponse.model,
      usage,
      anthropicResponse.stop_reason ?? undefined,
    );
  }

  protected async executeCompletion(
    request: LLMRequest,
    _context: SafetyContext,
  ): Promise<LLMResponse> {
    const mergedRequest = this.mergeWithDefaults(request);
    const anthropicRequest = this.buildAnthropicRequest(mergedRequest);

    const response = await this.makeRequest('POST', '/messages', anthropicRequest);
    return this.parseResponse(response);
  }

  protected async executeStream(
    request: LLMRequest,
    _context: SafetyContext,
    callback: (chunk: StreamChunk) => void | Promise<void>,
  ): Promise<void> {
    const mergedRequest = this.mergeWithDefaults(request);
    const anthropicRequest = this.buildAnthropicRequest(mergedRequest, true);

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(anthropicRequest),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body available for streaming');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let accumulatedText = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;

          try {
            const event = JSON.parse(trimmedLine.slice(6)) as AnthropicStreamEvent;

            switch (event.type) {
              case 'content_block_delta':
                if (event.delta?.text) {
                  accumulatedText += event.delta.text;
                  const chunk = this.buildChunk(event.delta.text, false);
                  await callback(chunk);
                }
                break;
              case 'message_stop':
                await callback(this.buildChunk('', true));
                break;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private buildAnthropicRequest(request: LLMRequest, stream = false): AnthropicRequest {
    const systemMessage = request.messages.find((m) => m.role === 'system');
    const nonSystemMessages = request.messages.filter((m) => m.role !== 'system');

    const anthropicRequest: AnthropicRequest = {
      model: request.model ?? this.config.defaultModel ?? 'claude-3-sonnet-20240229',
      messages: this.formatMessages(nonSystemMessages),
      max_tokens: request.maxTokens ?? 4096,
      stream,
    };

    if (systemMessage) {
      anthropicRequest.system = systemMessage.content;
    }

    if (request.temperature !== undefined) {
      anthropicRequest.temperature = request.temperature;
    }
    if (request.topP !== undefined) {
      anthropicRequest.top_p = request.topP;
    }
    if (request.stopSequences !== undefined) {
      anthropicRequest.stop_sequences = [...request.stopSequences];
    }

    return anthropicRequest;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey ?? '',
      'anthropic-version': this.apiVersion,
    };

    if (this.config.customHeaders) {
      Object.assign(headers, this.config.customHeaders);
    }

    return headers;
  }

  private async makeRequest(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const headers = this.buildHeaders();

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response.json();
  }
}

/**
 * OpenAI provider adapter
 */

import { BaseAdapter } from './BaseAdapter';
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  StreamChunk,
  ChatMessage,
  TokenUsage,
  FunctionDefinition,
  ToolDefinition,
} from '../types/providers';
import type { SafetyContext } from '../types/safety';

// Type definitions for OpenAI-compatible APIs
interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'function' | 'tool';
  content: string;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
  functions?: FunctionDefinition[];
  tools?: Array<{
    type: 'function';
    function: FunctionDefinition;
  }>;
  stream?: boolean;
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: OpenAIMessage;
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: Partial<OpenAIMessage>;
    finish_reason: string | null;
  }>;
}

/**
 * OpenAI adapter implementation
 */
export class OpenAIAdapter extends BaseAdapter {
  public readonly provider: LLMProvider = 'openai';
  public readonly name = 'OpenAI';

  private apiKey?: string;
  private baseUrl = 'https://api.openai.com/v1';

  protected onInitialize(): void {
    this.apiKey = this.config.apiKey;
    if (this.config.baseUrl) {
      this.baseUrl = this.config.baseUrl;
    }
  }

  protected onValidateConfig(): boolean {
    return !!this.apiKey || !!this.config.baseUrl;
  }

  public async getModels(): Promise<readonly string[]> {
    const models = [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-4-turbo-preview',
      'gpt-4',
      'gpt-4-32k',
      'gpt-3.5-turbo',
      'gpt-3.5-turbo-16k',
    ];

    try {
      const response = await this.fetchModels();
      return response.length > 0 ? response : models;
    } catch {
      return models;
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      await this.makeRequest('GET', '/models');
      return true;
    } catch {
      return false;
    }
  }

  protected formatMessages(messages: readonly ChatMessage[]): OpenAIMessage[] {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      name: msg.name,
      function_call: msg.functionCall
        ? {
            name: msg.functionCall.name,
            arguments: msg.functionCall.arguments,
          }
        : undefined,
      tool_calls: msg.toolCalls?.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      })),
    }));
  }

  protected parseResponse(response: unknown): LLMResponse {
    const openaiResponse = response as OpenAIResponse;
    const choice = openaiResponse.choices[0];

    if (!choice) {
      throw new Error('No response choice available');
    }

    const usage: TokenUsage | undefined = openaiResponse.usage
      ? {
          promptTokens: openaiResponse.usage.prompt_tokens,
          completionTokens: openaiResponse.usage.completion_tokens,
          totalTokens: openaiResponse.usage.total_tokens,
        }
      : undefined;

    return this.buildResponse(
      choice.message.content ?? '',
      openaiResponse.model,
      usage,
      choice.finish_reason ?? undefined,
    );
  }

  protected async executeCompletion(
    request: LLMRequest,
    _context: SafetyContext,
  ): Promise<LLMResponse> {
    const mergedRequest = this.mergeWithDefaults(request);
    const openaiRequest = this.buildOpenAIRequest(mergedRequest);

    const response = await this.makeRequest('POST', '/chat/completions', openaiRequest);
    return this.parseResponse(response);
  }

  protected async executeStream(
    request: LLMRequest,
    _context: SafetyContext,
    callback: (chunk: StreamChunk) => void | Promise<void>,
  ): Promise<void> {
    const mergedRequest = this.mergeWithDefaults(request);
    const openaiRequest = this.buildOpenAIRequest(mergedRequest, true);

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(openaiRequest),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body available for streaming');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || trimmedLine === 'data: [DONE]') continue;

          if (trimmedLine.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmedLine.slice(6)) as OpenAIStreamChunk;
              const delta = data.choices[0]?.delta;
              const finishReason = data.choices[0]?.finish_reason;

              if (delta?.content) {
                const chunk = this.buildChunk(delta.content, false);
                await callback(chunk);
              }

              if (finishReason) {
                const finalChunk = this.buildChunk('', true);
                await callback(finalChunk);
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private buildOpenAIRequest(request: LLMRequest, stream = false): OpenAIRequest {
    const openaiRequest: OpenAIRequest = {
      model: request.model ?? this.config.defaultModel ?? 'gpt-3.5-turbo',
      messages: this.formatMessages(request.messages),
      stream,
    };

    if (request.temperature !== undefined) {
      openaiRequest.temperature = request.temperature;
    }
    if (request.maxTokens !== undefined) {
      openaiRequest.max_tokens = request.maxTokens;
    }
    if (request.topP !== undefined) {
      openaiRequest.top_p = request.topP;
    }
    if (request.frequencyPenalty !== undefined) {
      openaiRequest.frequency_penalty = request.frequencyPenalty;
    }
    if (request.presencePenalty !== undefined) {
      openaiRequest.presence_penalty = request.presencePenalty;
    }
    if (request.stopSequences !== undefined) {
      openaiRequest.stop = [...request.stopSequences];
    }
    if (request.functions !== undefined) {
      openaiRequest.functions = [...request.functions];
    }
    if (request.tools !== undefined) {
      openaiRequest.tools = request.tools.map((t) => ({
        type: 'function',
        function: t.function,
      }));
    }

    return openaiRequest;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    if (this.config.organization) {
      headers['OpenAI-Organization'] = this.config.organization;
    }

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
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response.json();
  }

  private async fetchModels(): Promise<string[]> {
    const response = (await this.makeRequest('GET', '/models')) as {
      data: Array<{ id: string }>;
    };
    return response.data?.map((m) => m.id) ?? [];
  }
}

/**
 * Local model provider adapter (Ollama, llama.cpp, vLLM, etc.)
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

// Type definitions for Ollama API (most common local format)
interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaRequest {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
    stop?: string[];
  };
}

interface OllamaResponse {
  model: string;
  created_at: string;
  message: OllamaMessage;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaStreamChunk {
  model: string;
  created_at: string;
  message?: OllamaMessage;
  done: boolean;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

// Generic local model formats
interface LocalModelRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface LocalModelResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Local model adapter supporting Ollama, vLLM, llama.cpp, and other local APIs
 */
export class LocalAdapter extends BaseAdapter {
  public readonly provider: LLMProvider = 'local';
  public readonly name = 'Local Model';

  private baseUrl = 'http://localhost:11434';
  private format: 'ollama' | 'openai-compatible' | 'generic' = 'ollama';

  protected onInitialize(): void {
    if (this.config.baseUrl) {
      this.baseUrl = this.config.baseUrl;
    }

    // Detect format based on URL or config
    if (this.baseUrl.includes('ollama')) {
      this.format = 'ollama';
    } else if (this.config.metadata?.format) {
      this.format = this.config.metadata.format as 'ollama' | 'openai-compatible' | 'generic';
    }
  }

  protected onValidateConfig(): boolean {
    return !!this.baseUrl;
  }

  public async getModels(): Promise<readonly string[]> {
    try {
      if (this.format === 'ollama') {
        const response = await fetch(`${this.baseUrl}/api/tags`);
        if (!response.ok) return [];

        const data = (await response.json()) as { models?: Array<{ name: string }> };
        return data.models?.map((m) => m.name) ?? [];
      }

      // For other formats, return common local models
      return [
        'llama2',
        'llama3',
        'llama3.1',
        'mistral',
        'mixtral',
        'codellama',
        'phi3',
        'gemma',
        'qwen2',
      ];
    } catch {
      return [];
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      if (this.format === 'ollama') {
        const response = await fetch(`${this.baseUrl}/api/tags`);
        return response.ok;
      }

      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  protected formatMessages(messages: readonly ChatMessage[]): OllamaMessage[] {
    return messages.map((msg) => ({
      role: msg.role === 'assistant' ? 'assistant' : msg.role === 'system' ? 'system' : 'user',
      content: msg.content,
    }));
  }

  protected parseResponse(response: unknown): LLMResponse {
    if (this.format === 'ollama') {
      const ollamaResponse = response as OllamaResponse;

      const usage: TokenUsage | undefined =
        ollamaResponse.prompt_eval_count !== undefined
          ? {
              promptTokens: ollamaResponse.prompt_eval_count,
              completionTokens: ollamaResponse.eval_count ?? 0,
              totalTokens: (ollamaResponse.prompt_eval_count ?? 0) + (ollamaResponse.eval_count ?? 0),
            }
          : undefined;

      return this.buildResponse(
        ollamaResponse.message.content,
        ollamaResponse.model,
        usage,
        ollamaResponse.done ? 'stop' : undefined,
      );
    }

    // OpenAI-compatible format
    const openaiResponse = response as LocalModelResponse;
    const choice = openaiResponse.choices[0];

    if (!choice) {
      throw new Error('No response choice available');
    }

    return this.buildResponse(
      choice.message.content,
      this.config.defaultModel ?? 'local-model',
      openaiResponse.usage,
      choice.finish_reason,
    );
  }

  protected async executeCompletion(
    request: LLMRequest,
    _context: SafetyContext,
  ): Promise<LLMResponse> {
    const mergedRequest = this.mergeWithDefaults(request);

    if (this.format === 'ollama') {
      return this.executeOllamaCompletion(mergedRequest);
    }

    return this.executeGenericCompletion(mergedRequest);
  }

  protected async executeStream(
    request: LLMRequest,
    _context: SafetyContext,
    callback: (chunk: StreamChunk) => void | Promise<void>,
  ): Promise<void> {
    const mergedRequest = this.mergeWithDefaults(request);

    if (this.format === 'ollama') {
      return this.executeOllamaStream(mergedRequest, callback);
    }

    return this.executeGenericStream(mergedRequest, callback);
  }

  private async executeOllamaCompletion(request: LLMRequest): Promise<LLMResponse> {
    const ollamaRequest: OllamaRequest = {
      model: request.model ?? this.config.defaultModel ?? 'llama3',
      messages: this.formatMessages(request.messages),
      stream: false,
      options: {},
    };

    if (request.temperature !== undefined) {
      ollamaRequest.options!.temperature = request.temperature;
    }
    if (request.maxTokens !== undefined) {
      ollamaRequest.options!.num_predict = request.maxTokens;
    }
    if (request.topP !== undefined) {
      ollamaRequest.options!.top_p = request.topP;
    }
    if (request.stopSequences !== undefined) {
      ollamaRequest.options!.stop = [...request.stopSequences];
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ollamaRequest),
    });

    if (!response.ok) {
      throw new Error(`Local model error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as OllamaResponse;
    return this.parseResponse(data);
  }

  private async executeOllamaStream(
    request: LLMRequest,
    callback: (chunk: StreamChunk) => void | Promise<void>,
  ): Promise<void> {
    const ollamaRequest: OllamaRequest = {
      model: request.model ?? this.config.defaultModel ?? 'llama3',
      messages: this.formatMessages(request.messages),
      stream: true,
      options: {},
    };

    if (request.temperature !== undefined) {
      ollamaRequest.options!.temperature = request.temperature;
    }
    if (request.maxTokens !== undefined) {
      ollamaRequest.options!.num_predict = request.maxTokens;
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ollamaRequest),
    });

    if (!response.ok) {
      throw new Error(`Local model error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body available for streaming');
    }

    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n').filter((line) => line.trim());

        for (const line of lines) {
          try {
            const chunk = JSON.parse(line) as OllamaStreamChunk;

            if (chunk.message?.content) {
              const streamChunk = this.buildChunk(chunk.message.content, chunk.done);
              await callback(streamChunk);
            }

            if (chunk.done) {
              const usage = chunk.prompt_eval_count
                ? {
                    promptTokens: chunk.prompt_eval_count,
                    completionTokens: chunk.eval_count ?? 0,
                    totalTokens: (chunk.prompt_eval_count ?? 0) + (chunk.eval_count ?? 0),
                  }
                : undefined;
              await callback(this.buildChunk('', true, usage));
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

  private async executeGenericCompletion(request: LLMRequest): Promise<LLMResponse> {
    const genericRequest: LocalModelRequest = {
      model: request.model ?? this.config.defaultModel ?? 'local-model',
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: false,
    };

    if (request.temperature !== undefined) {
      genericRequest.temperature = request.temperature;
    }
    if (request.maxTokens !== undefined) {
      genericRequest.max_tokens = request.maxTokens;
    }

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(genericRequest),
    });

    if (!response.ok) {
      throw new Error(`Local model error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as LocalModelResponse;
    return this.parseResponse(data);
  }

  private async executeGenericStream(
    request: LLMRequest,
    callback: (chunk: StreamChunk) => void | Promise<void>,
  ): Promise<void> {
    const genericRequest: LocalModelRequest = {
      model: request.model ?? this.config.defaultModel ?? 'local-model',
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: true,
    };

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(genericRequest),
    });

    if (!response.ok) {
      throw new Error(`Local model error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body available for streaming');
    }

    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || trimmedLine === 'data: [DONE]') continue;

          if (trimmedLine.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmedLine.slice(6)) as {
                choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
              };
              const content = data.choices?.[0]?.delta?.content;
              const finishReason = data.choices?.[0]?.finish_reason;

              if (content) {
                await callback(this.buildChunk(content, false));
              }

              if (finishReason) {
                await callback(this.buildChunk('', true));
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
}

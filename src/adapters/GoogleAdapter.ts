/**
 * Google AI (Gemini) provider adapter
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

// Type definitions for Google Gemini API
interface GeminiPart {
  text?: string;
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: {
    parts: GeminiPart[];
  };
  generationConfig?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
    stopSequences?: string[];
  };
  safetySettings?: Array<{
    category: string;
    threshold: string;
  }>;
}

interface GeminiCandidate {
  content: GeminiContent;
  finishReason?: string;
  safetyRatings?: Array<{
    category: string;
    probability: string;
  }>;
}

interface GeminiResponse {
  candidates: GeminiCandidate[];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

interface GeminiStreamChunk {
  candidates: GeminiCandidate[];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

/**
 * Google AI (Gemini) adapter implementation
 */
export class GoogleAdapter extends BaseAdapter {
  public readonly provider: LLMProvider = 'google';
  public readonly name = 'Google AI (Gemini)';

  private apiKey?: string;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

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
      'gemini-1.5-pro',
      'gemini-1.5-pro-latest',
      'gemini-1.5-flash',
      'gemini-1.5-flash-latest',
      'gemini-1.0-pro',
      'gemini-1.0-pro-latest',
    ];
  }

  public async healthCheck(): Promise<boolean> {
    try {
      await this.getModels();
      return true;
    } catch {
      return false;
    }
  }

  protected formatMessages(messages: readonly ChatMessage[]): GeminiContent[] {
    return messages
      .filter((msg) => msg.role !== 'system')
      .map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));
  }

  protected parseResponse(response: unknown): LLMResponse {
    const geminiResponse = response as GeminiResponse;
    const candidate = geminiResponse.candidates[0];

    if (!candidate) {
      throw new Error('No response candidate available');
    }

    const textContent = candidate.content.parts
      .filter((part): part is GeminiPart & { text: string } => typeof part.text === 'string')
      .map((part) => part.text)
      .join('');

    const usage: TokenUsage | undefined = geminiResponse.usageMetadata
      ? {
          promptTokens: geminiResponse.usageMetadata.promptTokenCount,
          completionTokens: geminiResponse.usageMetadata.candidatesTokenCount,
          totalTokens: geminiResponse.usageMetadata.totalTokenCount,
        }
      : undefined;

    return this.buildResponse(
      textContent,
      this.config.defaultModel ?? 'gemini-1.5-pro',
      usage,
      candidate.finishReason,
    );
  }

  protected async executeCompletion(
    request: LLMRequest,
    _context: SafetyContext,
  ): Promise<LLMResponse> {
    const mergedRequest = this.mergeWithDefaults(request);
    const geminiRequest = this.buildGeminiRequest(mergedRequest);
    const model = request.model ?? this.config.defaultModel ?? 'gemini-1.5-pro';

    const response = await this.makeRequest('POST', `/models/${model}:generateContent`, geminiRequest);
    return this.parseResponse(response);
  }

  protected async executeStream(
    request: LLMRequest,
    _context: SafetyContext,
    callback: (chunk: StreamChunk) => void | Promise<void>,
  ): Promise<void> {
    const mergedRequest = this.mergeWithDefaults(request);
    const geminiRequest = this.buildGeminiRequest(mergedRequest);
    const model = request.model ?? this.config.defaultModel ?? 'gemini-1.5-pro';

    const response = await fetch(
      `${this.baseUrl}/models/${model}:streamGenerateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(geminiRequest),
      },
    );

    if (!response.ok) {
      throw new Error(`Google AI API error: ${response.status} ${response.statusText}`);
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
          if (!trimmedLine || trimmedLine === ',') continue;

          try {
            // Gemini returns JSON objects separated by commas in array format
            const cleanLine = trimmedLine.replace(/^,/, '').trim();
            if (!cleanLine) continue;

            const chunk = JSON.parse(cleanLine) as GeminiStreamChunk;
            const text = chunk.candidates[0]?.content?.parts[0]?.text ?? '';

            if (text) {
              const streamChunk = this.buildChunk(text, false);
              await callback(streamChunk);
            }

            if (chunk.candidates[0]?.finishReason) {
              await callback(this.buildChunk('', true, chunk.usageMetadata ? {
                promptTokens: chunk.usageMetadata.promptTokenCount,
                completionTokens: chunk.usageMetadata.candidatesTokenCount,
                totalTokens: chunk.usageMetadata.totalTokenCount,
              } : undefined));
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

  private buildGeminiRequest(request: LLMRequest): GeminiRequest {
    const systemMessage = request.messages.find((m) => m.role === 'system');
    const nonSystemMessages = request.messages.filter((m) => m.role !== 'system');

    const geminiRequest: GeminiRequest = {
      contents: this.formatMessages(nonSystemMessages),
      generationConfig: {},
    };

    if (systemMessage) {
      geminiRequest.systemInstruction = {
        parts: [{ text: systemMessage.content }],
      };
    }

    if (request.temperature !== undefined) {
      geminiRequest.generationConfig!.temperature = request.temperature;
    }
    if (request.topP !== undefined) {
      geminiRequest.generationConfig!.topP = request.topP;
    }
    if (request.maxTokens !== undefined) {
      geminiRequest.generationConfig!.maxOutputTokens = request.maxTokens;
    }
    if (request.stopSequences !== undefined) {
      geminiRequest.generationConfig!.stopSequences = [...request.stopSequences];
    }

    // Add safety settings to block harmful content
    geminiRequest.safetySettings = [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ];

    return geminiRequest;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
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
    const url = `${this.baseUrl}${path}?key=${this.apiKey}`;
    const headers = this.buildHeaders();

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Google AI API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response.json();
  }
}

/**
 * Provider adapter types for multi-provider support
 */

import { z } from 'zod';
import type { SafetyResult, SafetyContext } from './safety';

/**
 * Supported LLM providers
 */
export type LLMProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'azure'
  | 'cohere'
  | 'ollama'
  | 'local'
  | 'custom';

export const LLMProviderSchema = z.enum([
  'openai',
  'anthropic',
  'google',
  'azure',
  'cohere',
  'ollama',
  'local',
  'custom',
]);

/**
 * Message role types
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'function' | 'tool';

export const MessageRoleSchema = z.enum(['system', 'user', 'assistant', 'function', 'tool']);

/**
 * Chat message structure
 */
export interface ChatMessage {
  readonly role: MessageRole;
  readonly content: string;
  readonly name?: string;
  readonly functionCall?: FunctionCall;
  readonly toolCalls?: readonly ToolCall[];
  readonly metadata?: Record<string, unknown>;
}

export const ChatMessageSchema = z.object({
  role: MessageRoleSchema,
  content: z.string(),
  name: z.string().optional(),
  functionCall: z.any().optional(),
  toolCalls: z.array(z.any()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Function call structure
 */
export interface FunctionCall {
  readonly name: string;
  readonly arguments: string;
}

/**
 * Tool call structure
 */
export interface ToolCall {
  readonly id: string;
  readonly type: 'function';
  readonly function: FunctionCall;
}

/**
 * LLM request parameters
 */
export interface LLMRequest {
  readonly messages: readonly ChatMessage[];
  readonly model?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly topP?: number;
  readonly frequencyPenalty?: number;
  readonly presencePenalty?: number;
  readonly stopSequences?: readonly string[];
  readonly functions?: readonly FunctionDefinition[];
  readonly tools?: readonly ToolDefinition[];
  readonly stream?: boolean;
  readonly metadata?: Record<string, unknown>;
}

export const LLMRequestSchema = z.object({
  messages: z.array(ChatMessageSchema),
  model: z.string().optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
  topP: z.number().optional(),
  frequencyPenalty: z.number().optional(),
  presencePenalty: z.number().optional(),
  stopSequences: z.array(z.string()).optional(),
  functions: z.array(z.any()).optional(),
  tools: z.array(z.any()).optional(),
  stream: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Function definition
 */
export interface FunctionDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

/**
 * Tool definition
 */
export interface ToolDefinition {
  readonly type: 'function';
  readonly function: FunctionDefinition;
}

/**
 * LLM response structure
 */
export interface LLMResponse {
  readonly id: string;
  readonly content: string;
  readonly role: MessageRole;
  readonly model: string;
  readonly provider: LLMProvider;
  readonly usage?: TokenUsage;
  readonly finishReason?: string;
  readonly functionCall?: FunctionCall;
  readonly toolCalls?: readonly ToolCall[];
  readonly metadata?: Record<string, unknown>;
  readonly safetyResult?: SafetyResult;
}

export const LLMResponseSchema = z.object({
  id: z.string(),
  content: z.string(),
  role: MessageRoleSchema,
  model: z.string(),
  provider: LLMProviderSchema,
  usage: z.any().optional(),
  finishReason: z.string().optional(),
  functionCall: z.any().optional(),
  toolCalls: z.array(z.any()).optional(),
  metadata: z.record(z.unknown()).optional(),
  safetyResult: z.any().optional(),
});

/**
 * Token usage information
 */
export interface TokenUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

/**
 * Streaming chunk structure
 */
export interface StreamChunk {
  readonly id: string;
  readonly content: string;
  readonly finishReason?: string;
  readonly usage?: TokenUsage;
  readonly isComplete: boolean;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  readonly provider: LLMProvider;
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly organization?: string;
  readonly region?: string;
  readonly projectId?: string;
  readonly timeout?: number;
  readonly retries?: number;
  readonly retryDelay?: number;
  readonly customHeaders?: Record<string, string>;
  readonly defaultModel?: string;
  readonly defaultParams?: Partial<LLMRequest>;
}

export const ProviderConfigSchema = z.object({
  provider: LLMProviderSchema,
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  organization: z.string().optional(),
  region: z.string().optional(),
  projectId: z.string().optional(),
  timeout: z.number().optional(),
  retries: z.number().optional(),
  retryDelay: z.number().optional(),
  customHeaders: z.record(z.string()).optional(),
  defaultModel: z.string().optional(),
  defaultParams: z.record(z.unknown()).optional(),
});

/**
 * Provider adapter interface
 */
export interface ProviderAdapter {
  readonly provider: LLMProvider;
  readonly name: string;
  readonly initialize: (config: ProviderConfig) => Promise<void> | void;
  readonly validateConfig: () => boolean;
  readonly complete: (request: LLMRequest, context: SafetyContext) => Promise<LLMResponse>;
  readonly stream: (
    request: LLMRequest,
    context: SafetyContext,
    callback: (chunk: StreamChunk) => void | Promise<void>,
  ) => Promise<void>;
  readonly getModels: () => Promise<readonly string[]>;
  readonly healthCheck: () => Promise<boolean>;
}

/**
 * Adapter factory configuration
 */
export interface AdapterFactoryConfig {
  readonly adapters: readonly ProviderConfig[];
  readonly defaultAdapter?: LLMProvider;
  readonly fallbackAdapters?: readonly LLMProvider[];
  readonly enableCaching?: boolean;
  readonly cacheTtlMs?: number;
}

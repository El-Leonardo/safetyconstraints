/**
 * Middleware types for the safety processing pipeline
 */

import type { SafetyContext, SafetyResult, SafetyCheckResult } from './safety';
import type { LLMRequest, LLMResponse } from './providers';

/**
 * Middleware processing stage
 */
export type MiddlewareStage = 'pre-input' | 'post-input' | 'pre-output' | 'post-output';

/**
 * Middleware context passed through the chain
 */
export interface MiddlewareContext {
  readonly request: LLMRequest;
  readonly response?: LLMResponse;
  readonly safetyContext: SafetyContext;
  readonly safetyResult?: SafetyResult;
  readonly metadata: Map<string, unknown>;
}

/**
 * Middleware function type
 */
export type MiddlewareFunction = (
  context: MiddlewareContext,
  next: () => Promise<MiddlewareContext>,
) => Promise<MiddlewareContext>;

/**
 * Middleware interface
 */
export interface Middleware {
  readonly name: string;
  readonly stage: MiddlewareStage;
  readonly priority: number;
  readonly enabled: boolean;
  readonly execute: MiddlewareFunction;
}

/**
 * Middleware chain result
 */
export interface MiddlewareChainResult {
  readonly context: MiddlewareContext;
  readonly results: readonly MiddlewareResult[];
  readonly errors: readonly MiddlewareError[];
}

/**
 * Individual middleware execution result
 */
export interface MiddlewareResult {
  readonly middlewareName: string;
  readonly stage: MiddlewareStage;
  readonly success: boolean;
  readonly executionTimeMs: number;
  readonly checks?: readonly SafetyCheckResult[];
}

/**
 * Middleware execution error
 */
export interface MiddlewareError {
  readonly middlewareName: string;
  readonly stage: MiddlewareStage;
  readonly error: Error;
  readonly isFatal: boolean;
}

/**
 * Plugin interface for extending functionality
 */
export interface Plugin {
  readonly name: string;
  readonly version: string;
  readonly initialize: () => Promise<void> | void;
  readonly getMiddlewares: () => readonly Middleware[];
  readonly onShutdown?: () => Promise<void> | void;
}

/**
 * Plugin manager configuration
 */
export interface PluginManagerConfig {
  readonly plugins: readonly Plugin[];
  readonly autoInitialize: boolean;
  readonly enableHotReload: boolean;
}

/**
 * Middleware configuration
 */
export interface MiddlewareConfig {
  readonly middlewares: readonly Middleware[];
  readonly errorHandler?: (error: MiddlewareError) => void | Promise<void>;
  readonly onComplete?: (result: MiddlewareChainResult) => void | Promise<void>;
}

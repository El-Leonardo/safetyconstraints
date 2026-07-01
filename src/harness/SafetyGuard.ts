/**
 * Batteries-included entry point for guarding coding agents.
 *
 * `SafetyGuard` wraps a {@link SafetyEngine} pre-loaded with the built-in
 * plugins and a chosen preset, so a caller can protect prompts and responses
 * with a single call and zero wiring.
 */

import type { SafetyConfig, SafetyResult, SafetyContext } from '../types/safety';
import type { LLMResponse } from '../types/providers';
import type { SafetyPlugin } from '../types/plugin';
import { SafetyEngine } from '../core/SafetyEngine';
import { createSafetyContext } from '../core/SafetyContext';
import { PluginRegistry } from '../plugins/PluginRegistry';
import { builtinPlugins } from '../plugins';
import { getPreset, type PresetName } from '../policy/presets';

/**
 * Options for constructing a {@link SafetyGuard}.
 */
export interface SafetyGuardOptions {
  /** Named preset or a full {@link SafetyConfig}. Defaults to `moderate`. */
  readonly preset?: PresetName | SafetyConfig;
  /** Replace the default built-in plugins entirely. */
  readonly plugins?: readonly SafetyPlugin[];
  /** Register additional plugins alongside the built-ins. */
  readonly extraPlugins?: readonly SafetyPlugin[];
}

/**
 * Error thrown when a guarded prompt or response is blocked.
 */
export class SafetyViolationError extends Error {
  /** The full safety result that triggered the block. */
  public readonly result: SafetyResult;

  public constructor(message: string, result: SafetyResult) {
    super(message);
    this.name = 'SafetyViolationError';
    this.result = result;
  }
}

/**
 * Resolve the preset option into a concrete {@link SafetyConfig}.
 */
function resolveConfig(preset: SafetyGuardOptions['preset']): SafetyConfig {
  if (preset !== undefined && typeof preset !== 'string') {
    return preset;
  }
  const name = preset ?? 'moderate';
  const config = getPreset(name);
  if (!config) {
    throw new Error(`Unknown safety preset: ${name}`);
  }
  return config;
}

/**
 * High-level guard that runs prompts and responses through the safety engine.
 */
export class SafetyGuard {
  private readonly engine: SafetyEngine;

  private constructor(engine: SafetyEngine) {
    this.engine = engine;
  }

  /**
   * Create and initialize a guard with the built-in plugins enabled.
   * @param options preset and plugin overrides.
   * @returns a ready-to-use, initialized guard.
   */
  public static async create(options: SafetyGuardOptions = {}): Promise<SafetyGuard> {
    const config = resolveConfig(options.preset);
    const registry = new PluginRegistry();
    registry.registerAll(options.plugins ?? builtinPlugins);
    if (options.extraPlugins) {
      registry.registerAll(options.extraPlugins);
    }

    const engine = new SafetyEngine(config, { pluginRegistry: registry });
    await engine.initialize();
    return new SafetyGuard(engine);
  }

  /**
   * The underlying engine, for advanced use.
   */
  public getEngine(): SafetyEngine {
    return this.engine;
  }

  /**
   * Check a prompt string before it is sent to a model/agent.
   * @param prompt the prompt text.
   * @param context optional context; a default is created if omitted.
   */
  public async checkPrompt(prompt: string, context?: SafetyContext): Promise<SafetyResult> {
    const ctx = context ?? createSafetyContext().withProvider('custom').build();
    return this.engine.validateInput({ messages: [{ role: 'user', content: prompt }] }, ctx);
  }

  /**
   * Check a response string produced by a model/agent.
   * @param response the response text.
   * @param context optional context; a default is created if omitted.
   */
  public async checkResponse(response: string, context?: SafetyContext): Promise<SafetyResult> {
    const ctx = context ?? createSafetyContext().withProvider('custom').build();
    const synthetic: LLMResponse = {
      id: ctx.requestId,
      content: response,
      role: 'assistant',
      model: 'unknown',
      provider: 'custom',
    };
    return this.engine.validateOutput(synthetic, ctx);
  }

  /**
   * Assert a prompt is safe, throwing {@link SafetyViolationError} if blocked.
   */
  public async assertPrompt(prompt: string, context?: SafetyContext): Promise<void> {
    const result = await this.checkPrompt(prompt, context);
    if (result.actionTaken === 'block') {
      throw new SafetyViolationError('Prompt blocked by safety guard', result);
    }
  }

  /**
   * Assert a response is safe, throwing {@link SafetyViolationError} if blocked.
   */
  public async assertResponse(response: string, context?: SafetyContext): Promise<void> {
    const result = await this.checkResponse(response, context);
    if (result.actionTaken === 'block') {
      throw new SafetyViolationError('Response blocked by safety guard', result);
    }
  }
}

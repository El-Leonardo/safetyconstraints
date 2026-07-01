/**
 * Plugin system types.
 *
 * A plugin is a runtime unit that hooks into the safety pipeline. Plugins can
 * inspect input (prompts sent to a model / agent) and output (model or agent
 * responses) and contribute {@link SafetyCheckResult}s that the engine folds
 * into its overall decision.
 */

import type { SafetyContext, SafetyCheckResult } from './safety';

/**
 * The stage of the pipeline at which a plugin runs.
 */
export type PluginStage = 'input' | 'output';

/**
 * A single, self-contained safety plugin.
 *
 * Plugins are intentionally small: they receive text plus the request context
 * and return zero or more checks. A returned check with `passed: false`
 * signals a violation; the {@link import('../core/SafetyEngine').SafetyEngine}
 * decides the resulting action based on severity and configuration.
 */
export interface SafetyPlugin {
  /** Stable unique identifier, e.g. `secret-scanner`. */
  readonly id: string;
  /** Human readable name. */
  readonly name: string;
  /** Short description of what the plugin protects against. */
  readonly description: string;
  /** Semver-ish version string. */
  readonly version: string;
  /** Whether the plugin is enabled by default when registered. */
  readonly enabledByDefault?: boolean;
  /**
   * Optional one-time async setup (loading word lists, compiling patterns).
   * Called by the registry during initialization.
   */
  readonly initialize?: () => Promise<void> | void;
  /**
   * Inspect input text (a prompt heading to a model/agent).
   * @returns checks describing any violations found.
   */
  readonly checkInput?: (
    text: string,
    context: SafetyContext,
  ) => Promise<readonly SafetyCheckResult[]> | readonly SafetyCheckResult[];
  /**
   * Inspect output text (a model/agent response).
   * @returns checks describing any violations found.
   */
  readonly checkOutput?: (
    text: string,
    context: SafetyContext,
  ) => Promise<readonly SafetyCheckResult[]> | readonly SafetyCheckResult[];
}

/**
 * Options controlling how a {@link SafetyPlugin} is registered.
 */
export interface PluginRegistrationOptions {
  /** Override the plugin's default enabled state. */
  readonly enabled?: boolean;
}

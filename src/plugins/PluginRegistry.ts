/**
 * Registry that holds runtime safety plugins and runs them across the pipeline.
 */

import type { SafetyContext, SafetyCheckResult } from '../types/safety';
import type { SafetyPlugin, PluginRegistrationOptions, PluginStage } from '../types/plugin';

interface RegisteredPlugin {
  readonly plugin: SafetyPlugin;
  enabled: boolean;
}

/**
 * Holds the set of active {@link SafetyPlugin}s and fans input/output text out
 * to each enabled plugin, collecting their checks.
 */
export class PluginRegistry {
  private readonly plugins: Map<string, RegisteredPlugin> = new Map();
  private initialized = false;

  /**
   * Register a plugin. Re-registering the same id replaces the previous entry.
   * @param plugin the plugin to add.
   * @param options optional overrides (e.g. force-enable).
   */
  public register(plugin: SafetyPlugin, options?: PluginRegistrationOptions): void {
    const enabled = options?.enabled ?? plugin.enabledByDefault ?? true;
    this.plugins.set(plugin.id, { plugin, enabled });
  }

  /**
   * Register many plugins at once.
   */
  public registerAll(plugins: readonly SafetyPlugin[]): void {
    for (const plugin of plugins) {
      this.register(plugin);
    }
  }

  /**
   * Remove a plugin by id.
   * @returns true if a plugin was removed.
   */
  public unregister(id: string): boolean {
    return this.plugins.delete(id);
  }

  /**
   * Enable or disable a registered plugin.
   * @returns true if the plugin exists.
   */
  public setEnabled(id: string, enabled: boolean): boolean {
    const entry = this.plugins.get(id);
    if (!entry) {
      return false;
    }
    entry.enabled = enabled;
    return true;
  }

  /**
   * Get a registered plugin by id.
   */
  public get(id: string): SafetyPlugin | undefined {
    return this.plugins.get(id)?.plugin;
  }

  /**
   * List all registered plugins.
   */
  public list(): readonly SafetyPlugin[] {
    return [...this.plugins.values()].map((e) => e.plugin);
  }

  /**
   * List the ids of currently enabled plugins.
   */
  public listEnabled(): readonly string[] {
    return [...this.plugins.values()].filter((e) => e.enabled).map((e) => e.plugin.id);
  }

  /**
   * Run one-time initialization for every registered plugin. Idempotent.
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await Promise.all(
      [...this.plugins.values()].map((entry) => entry.plugin.initialize?.()),
    );
    this.initialized = true;
  }

  /**
   * Run all enabled plugins for the given stage and collect their checks.
   * @param stage whether to run input or output hooks.
   * @param text the text to inspect.
   * @param context the request context.
   * @returns the flattened list of checks from every plugin.
   */
  public async run(
    stage: PluginStage,
    text: string,
    context: SafetyContext,
  ): Promise<readonly SafetyCheckResult[]> {
    const results = await Promise.all(
      [...this.plugins.values()]
        .filter((entry) => entry.enabled)
        .map(async (entry) => {
          const hook = stage === 'input' ? entry.plugin.checkInput : entry.plugin.checkOutput;
          if (!hook) {
            return [];
          }
          return hook(text, context);
        }),
    );
    return results.flat();
  }
}

/**
 * Convenience factory for a {@link PluginRegistry} pre-loaded with plugins.
 */
export function createPluginRegistry(plugins: readonly SafetyPlugin[] = []): PluginRegistry {
  const registry = new PluginRegistry();
  registry.registerAll(plugins);
  return registry;
}

/**
 * Adapter factory for creating provider adapters
 */

import type {
  ProviderAdapter,
  LLMProvider,
  ProviderConfig,
  AdapterFactoryConfig,
} from '../types/providers';
import { OpenAIAdapter } from './OpenAIAdapter';
import { AnthropicAdapter } from './AnthropicAdapter';
import { GoogleAdapter } from './GoogleAdapter';
import { AzureAdapter } from './AzureAdapter';
import { LocalAdapter } from './LocalAdapter';

/**
 * Adapter factory for creating and managing provider adapters
 */
export class AdapterFactory {
  private adapters: Map<LLMProvider, ProviderAdapter> = new Map();
  private config: AdapterFactoryConfig;

  public constructor(config: AdapterFactoryConfig) {
    this.config = config;
  }

  /**
   * Initialize all configured adapters
   */
  public async initialize(): Promise<void> {
    for (const adapterConfig of this.config.adapters) {
      const adapter = this.createAdapter(adapterConfig.provider);
      if (adapter) {
        await adapter.initialize(adapterConfig);
        this.adapters.set(adapterConfig.provider, adapter);
      }
    }
  }

  /**
   * Get an adapter for a specific provider
   */
  public getAdapter(provider: LLMProvider): ProviderAdapter | undefined {
    return this.adapters.get(provider);
  }

  /**
   * Get the default adapter
   */
  public getDefaultAdapter(): ProviderAdapter | undefined {
    if (this.config.defaultAdapter) {
      return this.adapters.get(this.config.defaultAdapter);
    }

    // Return the first available adapter
    const firstAdapter = this.adapters.values().next().value;
    return firstAdapter as ProviderAdapter | undefined;
  }

  /**
   * Get a fallback adapter if the primary fails
   */
  public getFallbackAdapter(excludeProvider?: LLMProvider): ProviderAdapter | undefined {
    if (!this.config.fallbackAdapters) {
      return undefined;
    }

    for (const provider of this.config.fallbackAdapters) {
      if (provider !== excludeProvider) {
        const adapter = this.adapters.get(provider);
        if (adapter) {
          return adapter;
        }
      }
    }

    return undefined;
  }

  /**
   * Get all available adapters
   */
  public getAllAdapters(): readonly ProviderAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Get all available provider names
   */
  public getAvailableProviders(): LLMProvider[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Check if a provider is available
   */
  public hasProvider(provider: LLMProvider): boolean {
    return this.adapters.has(provider);
  }

  /**
   * Create a new adapter instance for a provider
   */
  public createAdapter(provider: LLMProvider): ProviderAdapter | undefined {
    switch (provider) {
      case 'openai':
        return new OpenAIAdapter();
      case 'anthropic':
        return new AnthropicAdapter();
      case 'google':
        return new GoogleAdapter();
      case 'azure':
        return new AzureAdapter();
      case 'ollama':
      case 'local':
        return new LocalAdapter();
      default:
        return undefined;
    }
  }

  /**
   * Register a custom adapter
   */
  public registerAdapter(provider: LLMProvider, adapter: ProviderAdapter): void {
    this.adapters.set(provider, adapter);
  }

  /**
   * Run health checks on all adapters
   */
  public async healthCheckAll(): Promise<Map<LLMProvider, boolean>> {
    const results = new Map<LLMProvider, boolean>();

    for (const [provider, adapter] of this.adapters) {
      try {
        const isHealthy = await adapter.healthCheck();
        results.set(provider, isHealthy);
      } catch {
        results.set(provider, false);
      }
    }

    return results;
  }

  /**
   * Run health check on a specific adapter
   */
  public async healthCheck(provider: LLMProvider): Promise<boolean> {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      return false;
    }

    try {
      return await adapter.healthCheck();
    } catch {
      return false;
    }
  }

  /**
   * Get adapter configuration
   */
  public getAdapterConfig(provider: LLMProvider): ProviderConfig | undefined {
    return this.config.adapters.find((a) => a.provider === provider);
  }

  /**
   * Update adapter configuration
   */
  public async updateAdapterConfig(provider: LLMProvider, config: ProviderConfig): Promise<void> {
    const existingAdapter = this.adapters.get(provider);
    if (existingAdapter) {
      await existingAdapter.initialize(config);
    } else {
      const newAdapter = this.createAdapter(provider);
      if (newAdapter) {
        await newAdapter.initialize(config);
        this.adapters.set(provider, newAdapter);
      }
    }
  }

  /**
   * Remove an adapter
   */
  public removeAdapter(provider: LLMProvider): boolean {
    return this.adapters.delete(provider);
  }

  /**
   * Shutdown all adapters
   */
  public async shutdown(): Promise<void> {
    // Currently no per-adapter shutdown, but could be added
    this.adapters.clear();
  }
}

/**
 * Create an adapter factory with default configuration
 */
export function createAdapterFactory(
  adapterConfigs: ProviderConfig[],
  options?: { defaultAdapter?: LLMProvider; fallbackAdapters?: LLMProvider[] },
): AdapterFactory {
  return new AdapterFactory({
    adapters: adapterConfigs,
    defaultAdapter: options?.defaultAdapter,
    fallbackAdapters: options?.fallbackAdapters,
  });
}

import { describe, it, expect } from 'vitest';
import { AdapterFactory, createAdapterFactory, OpenAIAdapter, AnthropicAdapter, GoogleAdapter } from '../../../src/adapters';

describe('AdapterFactory', () => {
  it('should create adapter factory', () => {
    const factory = createAdapterFactory([
      { provider: 'openai', apiKey: 'test-key' }
    ]);

    expect(factory).toBeInstanceOf(AdapterFactory);
  });

  it('should create adapters for supported providers', () => {
    const factory = createAdapterFactory([
      { provider: 'openai', apiKey: 'test' },
      { provider: 'anthropic', apiKey: 'test' },
      { provider: 'google', apiKey: 'test' }
    ]);

    expect(factory.getAdapter('openai')).toBeInstanceOf(OpenAIAdapter);
    expect(factory.getAdapter('anthropic')).toBeInstanceOf(AnthropicAdapter);
    expect(factory.getAdapter('google')).toBeInstanceOf(GoogleAdapter);
  });

  it('should return undefined for unsupported provider', () => {
    const factory = createAdapterFactory([]);

    expect(factory.getAdapter('openai')).toBeUndefined();
  });

  it('should get available providers', () => {
    const factory = createAdapterFactory([
      { provider: 'openai', apiKey: 'test' },
      { provider: 'anthropic', apiKey: 'test' }
    ]);

    const providers = factory.getAvailableProviders();
    expect(providers).toContain('openai');
    expect(providers).toContain('anthropic');
  });

  it('should check if provider is available', () => {
    const factory = createAdapterFactory([
      { provider: 'openai', apiKey: 'test' }
    ]);

    expect(factory.hasProvider('openai')).toBe(true);
    expect(factory.hasProvider('anthropic')).toBe(false);
  });
});

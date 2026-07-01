import { describe, it, expect } from 'vitest';
import { PluginRegistry, createPluginRegistry } from '../../../src/plugins/PluginRegistry';
import type { SafetyPlugin } from '../../../src/types/plugin';
import { createSafetyContext } from '../../../src/core/SafetyContext';
import type { SafetyCheckResult } from '../../../src/types/safety';

const context = createSafetyContext().withProvider('custom').build();

function makePlugin(id: string, fails: boolean): SafetyPlugin {
  const check = (): SafetyCheckResult[] =>
    fails
      ? [
          {
            passed: false,
            category: 'custom',
            severity: 'high',
            confidence: 1,
            message: `${id} failed`,
          },
        ]
      : [];
  return {
    id,
    name: id,
    description: 'test plugin',
    version: '1.0.0',
    checkInput: check,
    checkOutput: check,
  };
}

describe('PluginRegistry', () => {
  it('registers and lists plugins', () => {
    const registry = new PluginRegistry();
    registry.register(makePlugin('a', false));
    registry.register(makePlugin('b', true));

    expect(registry.list().map((p) => p.id).sort()).toEqual(['a', 'b']);
    expect(registry.get('a')?.id).toBe('a');
  });

  it('replaces a plugin registered under the same id', () => {
    const registry = new PluginRegistry();
    registry.register(makePlugin('a', false));
    registry.register(makePlugin('a', true));
    expect(registry.list()).toHaveLength(1);
  });

  it('runs only enabled plugins and flattens their checks', async () => {
    const registry = createPluginRegistry([makePlugin('a', true), makePlugin('b', true)]);
    registry.setEnabled('b', false);

    const checks = await registry.run('input', 'anything', context);
    expect(checks).toHaveLength(1);
    expect(checks[0].message).toBe('a failed');
  });

  it('honors the enabled override at registration time', async () => {
    const registry = new PluginRegistry();
    registry.register(makePlugin('a', true), { enabled: false });
    expect(registry.listEnabled()).toHaveLength(0);
    expect(await registry.run('input', 'x', context)).toHaveLength(0);
  });

  it('unregisters plugins', () => {
    const registry = createPluginRegistry([makePlugin('a', false)]);
    expect(registry.unregister('a')).toBe(true);
    expect(registry.unregister('a')).toBe(false);
    expect(registry.list()).toHaveLength(0);
  });

  it('skips a stage when the plugin has no hook for it', async () => {
    const inputOnly: SafetyPlugin = {
      id: 'input-only',
      name: 'input only',
      description: 'test',
      version: '1.0.0',
      checkInput: () => [
        { passed: false, category: 'custom', severity: 'low', confidence: 1, message: 'in' },
      ],
    };
    const registry = createPluginRegistry([inputOnly]);
    expect(await registry.run('output', 'x', context)).toHaveLength(0);
    expect(await registry.run('input', 'x', context)).toHaveLength(1);
  });
});

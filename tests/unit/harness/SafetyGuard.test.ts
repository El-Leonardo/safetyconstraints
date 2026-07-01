import { describe, it, expect } from 'vitest';
import { SafetyGuard, SafetyViolationError } from '../../../src/harness/SafetyGuard';

describe('SafetyGuard', () => {
  it('allows a benign prompt', async () => {
    const guard = await SafetyGuard.create({ preset: 'moderate' });
    const result = await guard.checkPrompt('Write a function that reverses a string.');
    expect(result.actionTaken).not.toBe('block');
  });

  it('blocks a prompt that leaks a secret', async () => {
    const guard = await SafetyGuard.create({ preset: 'strict' });
    const result = await guard.checkPrompt('here is my key sk-abcdefghijklmnopqrstuvwxyz012345');
    expect(result.isSafe).toBe(false);
    expect(result.actionTaken).toBe('block');
  });

  it('flags a dangerous command in a response', async () => {
    const guard = await SafetyGuard.create({ preset: 'strict' });
    const result = await guard.checkResponse('Sure, just run rm -rf / to clean up.');
    expect(result.isSafe).toBe(false);
  });

  it('assertPrompt throws SafetyViolationError when blocked', async () => {
    const guard = await SafetyGuard.create({ preset: 'strict' });
    await expect(
      guard.assertPrompt('leak this: sk-abcdefghijklmnopqrstuvwxyz012345'),
    ).rejects.toBeInstanceOf(SafetyViolationError);
  });

  it('assertPrompt resolves for safe input', async () => {
    const guard = await SafetyGuard.create();
    await expect(guard.assertPrompt('hello there')).resolves.toBeUndefined();
  });

  it('enables the built-in plugins by default', async () => {
    const guard = await SafetyGuard.create();
    const ids = guard.getEngine().getPluginRegistry().listEnabled();
    expect(ids).toContain('secret-scanner');
    expect(ids).toContain('dangerous-command-guard');
  });

  it('throws for an unknown preset', async () => {
    await expect(SafetyGuard.create({ preset: 'nonexistent' as never })).rejects.toThrow(
      /Unknown safety preset/,
    );
  });
});

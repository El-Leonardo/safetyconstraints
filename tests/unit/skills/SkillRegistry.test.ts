import { describe, it, expect } from 'vitest';
import { SkillRegistry, createSkillRegistry } from '../../../src/skills/SkillRegistry';
import { builtinSkills } from '../../../src/skills';
import type { AgentSkill } from '../../../src/types/skill';

const extra: AgentSkill = {
  id: 'extra',
  name: 'Extra',
  description: 'not default',
  version: '1.0.0',
  installByDefault: false,
  files: [],
};

describe('SkillRegistry', () => {
  it('registers and retrieves skills', () => {
    const registry = createSkillRegistry(builtinSkills);
    expect(registry.get('safe-coding')?.name).toBe('Safe Coding');
    expect(registry.list().length).toBeGreaterThan(0);
  });

  it('lists only default skills with listDefault', () => {
    const registry = new SkillRegistry();
    registry.registerAll(builtinSkills);
    registry.register(extra);

    const defaults = registry.listDefault().map((s) => s.id);
    expect(defaults).toContain('safe-coding');
    expect(defaults).not.toContain('extra');
  });

  it('unregisters skills', () => {
    const registry = createSkillRegistry([extra]);
    expect(registry.unregister('extra')).toBe(true);
    expect(registry.get('extra')).toBeUndefined();
  });
});

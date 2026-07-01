/**
 * Registry that holds installable agent skills.
 */

import type { AgentSkill } from '../types/skill';

/**
 * Holds the set of known {@link AgentSkill}s that `sc init` can install.
 */
export class SkillRegistry {
  private readonly skills: Map<string, AgentSkill> = new Map();

  /**
   * Register a skill. Re-registering the same id replaces the previous entry.
   */
  public register(skill: AgentSkill): void {
    this.skills.set(skill.id, skill);
  }

  /**
   * Register many skills at once.
   */
  public registerAll(skills: readonly AgentSkill[]): void {
    for (const skill of skills) {
      this.register(skill);
    }
  }

  /**
   * Remove a skill by id.
   * @returns true if a skill was removed.
   */
  public unregister(id: string): boolean {
    return this.skills.delete(id);
  }

  /**
   * Get a skill by id.
   */
  public get(id: string): AgentSkill | undefined {
    return this.skills.get(id);
  }

  /**
   * List all registered skills.
   */
  public list(): readonly AgentSkill[] {
    return [...this.skills.values()];
  }

  /**
   * List the skills marked as install-by-default.
   */
  public listDefault(): readonly AgentSkill[] {
    return [...this.skills.values()].filter((s) => s.installByDefault);
  }
}

/**
 * Convenience factory for a {@link SkillRegistry} pre-loaded with skills.
 */
export function createSkillRegistry(skills: readonly AgentSkill[] = []): SkillRegistry {
  const registry = new SkillRegistry();
  registry.registerAll(skills);
  return registry;
}

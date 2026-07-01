/**
 * Installable agent skill system: registry, installer, and built-in skills.
 */

import type { AgentSkill } from '../types/skill';
import { safeCodingSkill } from './builtin/safeCoding';

export { SkillRegistry, createSkillRegistry } from './SkillRegistry';
export { installSkills, type InstallOptions } from './installer';
export { safeCodingSkill } from './builtin/safeCoding';

/**
 * All built-in skills, ready to register into a {@link SkillRegistry}.
 */
export const builtinSkills: readonly AgentSkill[] = [safeCodingSkill];

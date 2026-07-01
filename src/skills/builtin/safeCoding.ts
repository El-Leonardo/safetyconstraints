/**
 * Built-in skill: "safe-coding".
 *
 * Scaffolds agent-instruction/rules files and a default runtime safety config
 * so any coding agent (Cursor, Windsurf, Claude, Copilot, or a generic
 * AGENTS.md-aware agent) starts with the same safety guardrails, backed by the
 * runtime plugins of the same names.
 */

import type { AgentSkill } from '../../types/skill';
import { SAFETY_GUARDRAILS, RULES_JSON, SAFETY_CONFIG_JSON } from './content';

/**
 * The safe-coding skill definition.
 */
export const safeCodingSkill: AgentSkill = {
  id: 'safe-coding',
  name: 'Safe Coding',
  description:
    'Baked-in safety guardrails for coding agents (secrets, destructive commands, injection, PII).',
  version: '1.0.0',
  installByDefault: true,
  plugins: ['secret-scanner', 'pii-guard', 'injection-guard', 'dangerous-command-guard'],
  files: [
    { path: 'AGENTS.md', content: SAFETY_GUARDRAILS, mergeStrategy: 'append' },
    { path: '.cursorrules', content: SAFETY_GUARDRAILS, mergeStrategy: 'skip-if-exists' },
    { path: '.windsurfrules', content: RULES_JSON, mergeStrategy: 'skip-if-exists' },
    {
      path: '.github/copilot-instructions.md',
      content: SAFETY_GUARDRAILS,
      mergeStrategy: 'skip-if-exists',
    },
    {
      path: '.claude/skills/safe-coding.md',
      content: SAFETY_GUARDRAILS,
      mergeStrategy: 'overwrite',
    },
    { path: 'safety.config.json', content: SAFETY_CONFIG_JSON, mergeStrategy: 'skip-if-exists' },
  ],
};

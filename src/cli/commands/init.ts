/**
 * `init` command: make a project agent-ready in one step.
 *
 * Scaffolds baked-in agent skills (rules files + safety config) and reports the
 * runtime plugins that back them, so a user can install the package and start
 * coding with their agents safely.
 */

import { builtinSkills } from '../../skills';
import { installSkills } from '../../skills/installer';
import { builtinPlugins } from '../../plugins';
import type { AgentSkill } from '../../types/skill';

interface InitOptions {
  dir?: string;
  skills?: string;
  force?: boolean;
  dryRun?: boolean;
}

/**
 * Resolve which skills to install from the `--skills` option.
 */
function resolveSkills(option?: string): AgentSkill[] {
  if (!option || option === 'all') {
    return [...builtinSkills];
  }
  const ids = option.split(',').map((s) => s.trim()).filter(Boolean);
  const selected: AgentSkill[] = [];
  for (const id of ids) {
    const skill = builtinSkills.find((s) => s.id === id);
    if (!skill) {
      console.error(`Unknown skill: ${id}`);
      console.error('Available skills:', builtinSkills.map((s) => s.id).join(', '));
      process.exit(1);
    }
    selected.push(skill);
  }
  return selected;
}

/**
 * Entry point for the `init` command.
 */
export async function initCommand(options: InitOptions): Promise<void> {
  try {
    const skills = resolveSkills(options.skills);
    const results = await installSkills(skills, {
      targetDir: options.dir,
      force: options.force,
      dryRun: options.dryRun,
    });

    console.log(options.dryRun ? '\nPlanned changes (dry run):\n' : '\nInstalled agent safety skills:\n');
    for (const result of results) {
      console.log(`  ${result.action.padEnd(11)} ${result.path}`);
    }

    const enabledPluginIds = new Set(skills.flatMap((s) => s.plugins ?? []));
    console.log('\nRuntime plugins enabled by these skills:\n');
    for (const plugin of builtinPlugins) {
      if (enabledPluginIds.has(plugin.id)) {
        console.log(`  - ${plugin.name} (${plugin.id})`);
      }
    }

    console.log('\nYour repo is agent-ready. Next steps:');
    console.log('  1. Review the generated AGENTS.md / rules files.');
    console.log('  2. In code: `const guard = await SafetyGuard.create();`');
    console.log('     then `await guard.assertPrompt(userInput);`\n');
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Installs {@link AgentSkill} files into a target project directory.
 */

import { promises as fs } from 'fs';
import { dirname, join, resolve } from 'path';
import type { AgentSkill, SkillFile, SkillFileResult } from '../types/skill';

/**
 * Options controlling how skills are written to disk.
 */
export interface InstallOptions {
  /** Absolute or relative path to the project root. Defaults to `process.cwd()`. */
  readonly targetDir?: string;
  /** Overwrite existing files even when the skill would otherwise skip them. */
  readonly force?: boolean;
  /** Compute the changes without writing anything. */
  readonly dryRun?: boolean;
}

/** A separator inserted before appended content so files stay readable. */
const APPEND_SEPARATOR = '\n\n<!-- added by @safetyconstraints/core -->\n\n';

/**
 * Determine whether a path already exists on disk.
 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Write a single skill file, honoring its merge strategy and the install options.
 * @returns the action that was taken (or would be taken in a dry run).
 */
async function writeSkillFile(
  file: SkillFile,
  targetDir: string,
  force: boolean,
  dryRun: boolean,
): Promise<SkillFileResult> {
  const absolutePath = resolve(join(targetDir, file.path));
  const exists = await pathExists(absolutePath);
  const strategy = file.mergeStrategy ?? 'skip-if-exists';

  if (exists && strategy === 'skip-if-exists' && !force) {
    return { path: file.path, action: 'skipped' };
  }

  if (exists && strategy === 'append' && !force) {
    if (!dryRun) {
      const existing = await fs.readFile(absolutePath, 'utf8');
      if (existing.includes(file.content.trim())) {
        return { path: file.path, action: 'skipped' };
      }
      await fs.writeFile(absolutePath, existing + APPEND_SEPARATOR + file.content, 'utf8');
    }
    return { path: file.path, action: 'appended' };
  }

  if (!dryRun) {
    await fs.mkdir(dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, file.content, 'utf8');
  }

  return { path: file.path, action: exists ? 'overwritten' : 'created' };
}

/**
 * Install every file for a set of skills into a target directory.
 * @param skills the skills to install.
 * @param options where and how to write files.
 * @returns per-file results describing what happened.
 */
export async function installSkills(
  skills: readonly AgentSkill[],
  options: InstallOptions = {},
): Promise<readonly SkillFileResult[]> {
  const targetDir = options.targetDir ?? process.cwd();
  const force = options.force ?? false;
  const dryRun = options.dryRun ?? false;

  const results: SkillFileResult[] = [];
  for (const skill of skills) {
    for (const file of skill.files) {
      results.push(await writeSkillFile(file, targetDir, force, dryRun));
    }
  }
  return results;
}

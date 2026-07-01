/**
 * Skill system types.
 *
 * A skill is a packaged capability that makes a repository "agent ready". A
 * skill contributes files to scaffold into the user's project (agent
 * instruction/rules files, config) and may enable one or more runtime
 * {@link import('./plugin').SafetyPlugin}s by id.
 */

/**
 * How a scaffolded file should be reconciled with an existing file on disk.
 */
export type FileMergeStrategy =
  /** Replace the file if it already exists. */
  | 'overwrite'
  /** Leave the existing file untouched. */
  | 'skip-if-exists'
  /** Append the content to the existing file (with a separator). */
  | 'append';

/**
 * A single file that a skill scaffolds into the target project.
 */
export interface SkillFile {
  /** Path relative to the project root, e.g. `AGENTS.md`. */
  readonly path: string;
  /** Full file contents. */
  readonly content: string;
  /** Reconciliation strategy when the file already exists. Defaults to `skip-if-exists`. */
  readonly mergeStrategy?: FileMergeStrategy;
}

/**
 * A packaged, installable agent skill.
 */
export interface AgentSkill {
  /** Stable unique identifier, e.g. `safe-coding`. */
  readonly id: string;
  /** Human readable name. */
  readonly name: string;
  /** Short description of what installing this skill gives the user. */
  readonly description: string;
  /** Semver-ish version string. */
  readonly version: string;
  /** Whether this skill is installed by default by `sc init`. */
  readonly installByDefault?: boolean;
  /** Files scaffolded into the project when the skill is installed. */
  readonly files: readonly SkillFile[];
  /** Ids of {@link import('./plugin').SafetyPlugin}s this skill turns on. */
  readonly plugins?: readonly string[];
}

/**
 * Result of writing a single {@link SkillFile} to disk.
 */
export interface SkillFileResult {
  /** Path relative to the project root. */
  readonly path: string;
  /** What happened to the file. */
  readonly action: 'created' | 'overwritten' | 'appended' | 'skipped';
}

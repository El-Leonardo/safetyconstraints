import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { installSkills } from '../../../src/skills/installer';
import { safeCodingSkill } from '../../../src/skills/builtin/safeCoding';
import type { AgentSkill } from '../../../src/types/skill';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(join(tmpdir(), 'sc-installer-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('installSkills', () => {
  it('creates all skill files in the target directory', async () => {
    const results = await installSkills([safeCodingSkill], { targetDir: dir });

    expect(results.every((r) => r.action === 'created')).toBe(true);
    const agents = await fs.readFile(join(dir, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('AI Safety Guardrails');
    const config = JSON.parse(
      await fs.readFile(join(dir, 'safety.config.json'), 'utf8'),
    ) as { preset?: string };
    expect(config.preset).toBe('moderate');
  });

  it('creates nested directories for skill files', async () => {
    await installSkills([safeCodingSkill], { targetDir: dir });
    const claude = await fs.readFile(join(dir, '.claude/skills/safe-coding.md'), 'utf8');
    expect(claude).toContain('Guardrails');
  });

  it('does not write files during a dry run', async () => {
    const results = await installSkills([safeCodingSkill], { targetDir: dir, dryRun: true });
    expect(results.every((r) => r.action === 'created')).toBe(true);
    await expect(fs.access(join(dir, 'AGENTS.md'))).rejects.toThrow();
  });

  it('skips existing files with skip-if-exists strategy', async () => {
    const skill: AgentSkill = {
      id: 'test',
      name: 'test',
      description: 'test',
      version: '1.0.0',
      files: [{ path: 'keep.txt', content: 'new', mergeStrategy: 'skip-if-exists' }],
    };
    await fs.writeFile(join(dir, 'keep.txt'), 'original', 'utf8');

    const results = await installSkills([skill], { targetDir: dir });
    expect(results[0].action).toBe('skipped');
    expect(await fs.readFile(join(dir, 'keep.txt'), 'utf8')).toBe('original');
  });

  it('overwrites existing files when force is set', async () => {
    const skill: AgentSkill = {
      id: 'test',
      name: 'test',
      description: 'test',
      version: '1.0.0',
      files: [{ path: 'keep.txt', content: 'new', mergeStrategy: 'skip-if-exists' }],
    };
    await fs.writeFile(join(dir, 'keep.txt'), 'original', 'utf8');

    const results = await installSkills([skill], { targetDir: dir, force: true });
    expect(results[0].action).toBe('overwritten');
    expect(await fs.readFile(join(dir, 'keep.txt'), 'utf8')).toBe('new');
  });

  it('appends content and is idempotent for the append strategy', async () => {
    const skill: AgentSkill = {
      id: 'test',
      name: 'test',
      description: 'test',
      version: '1.0.0',
      files: [{ path: 'notes.md', content: 'APPENDED', mergeStrategy: 'append' }],
    };
    await fs.writeFile(join(dir, 'notes.md'), 'HEADER', 'utf8');

    const first = await installSkills([skill], { targetDir: dir });
    expect(first[0].action).toBe('appended');
    expect(await fs.readFile(join(dir, 'notes.md'), 'utf8')).toContain('APPENDED');

    const second = await installSkills([skill], { targetDir: dir });
    expect(second[0].action).toBe('skipped');
    const content = await fs.readFile(join(dir, 'notes.md'), 'utf8');
    expect(content.match(/APPENDED/g)).toHaveLength(1);
  });
});

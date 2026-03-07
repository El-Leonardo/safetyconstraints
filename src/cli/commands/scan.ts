/**
 * Scan command implementation
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { SafetyEngine } from '../../core/SafetyEngine';
import { createSafetyContext } from '../../core/SafetyContext';
import { getPreset } from '../../policy/presets';
import type { SafetyConfig, SafetyResult } from '../../types/safety';

interface ScanOptions {
  recursive?: boolean;
  config?: string;
  fix?: boolean;
  json?: boolean;
}

interface ScanResult {
  readonly file: string;
  readonly result: SafetyResult;
  readonly fixed?: boolean;
}

export async function scanCommand(targetPath: string, options: ScanOptions): Promise<void> {
  try {
    const config = await loadConfig(options);
    const engine = new SafetyEngine(config);
    await engine.initialize();

    const stats = await fs.stat(targetPath);
    const results: ScanResult[] = [];

    if (stats.isDirectory()) {
      const files = await scanDirectory(targetPath, options.recursive ?? false);
      for (const file of files) {
        const result = await scanFile(file, engine);
        results.push({ file, result });
      }
    } else {
      const result = await scanFile(targetPath, engine);
      results.push({ file: targetPath, result });
    }

    // Output results
    if (options.json) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      printScanResults(results);
    }

    // Exit with error code if any issues found
    const hasIssues = results.some((r) => !r.result.isSafe);
    process.exit(hasIssues ? 1 : 0);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function scanDirectory(dir: string, recursive: boolean): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory() && recursive) {
      const subFiles = await scanDirectory(fullPath, recursive);
      files.push(...subFiles);
    } else if (entry.isFile() && isTextFile(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

async function scanFile(filePath: string, engine: SafetyEngine): Promise<SafetyResult> {
  const content = await fs.readFile(filePath, 'utf-8');

  const context = createSafetyContext()
    .withProvider('cli')
    .withMetadata({ file: filePath })
    .build();

  return await engine.validateInput(
    {
      messages: [{ role: 'user', content: content }],
    },
    context,
  );
}

function isTextFile(filename: string): boolean {
  const textExtensions = ['.txt', '.md', '.json', '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.hpp', '.go', '.rs', '.rb', '.php', '.html', '.css', '.xml', '.yaml', '.yml'];
  const ext = path.extname(filename).toLowerCase();
  return textExtensions.includes(ext);
}

async function loadConfig(options: ScanOptions): Promise<SafetyConfig> {
  if (options.config) {
    const configText = await fs.readFile(options.config, 'utf-8');
    return JSON.parse(configText) as SafetyConfig;
  }

  return getPreset('strict')!;
}

function printScanResults(results: ScanResult[]): void {
  console.log('\n=== Scan Results ===\n');

  let safeCount = 0;
  let unsafeCount = 0;

  for (const { file, result } of results) {
    const status = result.isSafe ? '✓' : '✗';
    const score = result.score.toFixed(1);

    if (result.isSafe) {
      safeCount++;
      console.log(`${status} ${file} (${score}/100)`);
    } else {
      unsafeCount++;
      console.log(`\n${status} ${file} (${score}/100) [${result.actionTaken.toUpperCase()}]`);

      for (const check of result.checks.filter((c) => !c.passed)) {
        console.log(`  - [${check.severity.toUpperCase()}] ${check.category}: ${check.message}`);
      }
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Total files: ${results.length}`);
  console.log(`Safe: ${safeCount}`);
  console.log(`Issues found: ${unsafeCount}`);
  console.log('\n===================\n');
}

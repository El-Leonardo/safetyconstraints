/**
 * Validate command implementation
 */

import * as fs from 'fs/promises';
import { SafetyEngine } from '../../core/SafetyEngine';
import { createSafetyContext } from '../../core/SafetyContext';
import { getPreset } from '../../policy/presets';
import type { SafetyConfig } from '../../types/safety';

interface ValidateOptions {
  text?: string;
  file?: string;
  config?: string;
  preset?: string;
  json?: boolean;
}

export async function validateCommand(options: ValidateOptions): Promise<void> {
  try {
    // Get text to validate
    let text: string;
    if (options.text) {
      text = options.text;
    } else if (options.file) {
      text = await fs.readFile(options.file, 'utf-8');
    } else {
      console.error('Error: Either --text or --file must be provided');
      process.exit(1);
    }

    // Load configuration
    const config = await loadConfig(options);

    // Initialize safety engine
    const engine = new SafetyEngine(config);
    await engine.initialize();

    // Create safety context
    const context = createSafetyContext()
      .withProvider('cli')
      .withMetadata({ command: 'validate' })
      .build();

    // Validate input
    const result = await engine.validateInput(
      {
        messages: [{ role: 'user', content: text }],
      },
      context,
    );

    // Output results
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printResults(result, text);
    }

    // Exit with error code if unsafe
    process.exit(result.isSafe ? 0 : 1);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function loadConfig(options: ValidateOptions): Promise<SafetyConfig> {
  // Load from file if specified
  if (options.config) {
    const configText = await fs.readFile(options.config, 'utf-8');
    return JSON.parse(configText) as SafetyConfig;
  }

  // Use preset
  const preset = options.preset ?? 'moderate';
  const config = getPreset(preset);

  if (!config) {
    throw new Error(`Unknown preset: ${preset}`);
  }

  return config;
}

function printResults(result: ReturnType<SafetyEngine['validateInput']> extends Promise<infer T> ? T : never, text: string): void {
  console.log('\n=== Safety Validation Results ===\n');
  console.log(`Safe: ${result.isSafe ? '✓ YES' : '✗ NO'}`);
  console.log(`Score: ${result.score.toFixed(1)}/100`);
  console.log(`Action: ${result.actionTaken.toUpperCase()}`);
  console.log(`Processing Time: ${result.processingTimeMs}ms`);

  if (result.checks.length > 0) {
    console.log('\n--- Checks ---');
    for (const check of result.checks) {
      const status = check.passed ? '✓' : '✗';
      const severity = `[${check.severity.toUpperCase()}]`;
      console.log(`  ${status} ${severity} ${check.category}: ${check.message}`);
      if (check.confidence < 1.0) {
        console.log(`     Confidence: ${(check.confidence * 100).toFixed(1)}%`);
      }
    }
  }

  if (result.actionTaken === 'sanitize' && result.sanitizedRequest) {
    console.log('\n--- Sanitized Text ---');
    const sanitizedText = result.sanitizedRequest.messages[0]?.content ?? '';
    console.log(sanitizedText);
  }

  console.log('\n===================================\n');
}

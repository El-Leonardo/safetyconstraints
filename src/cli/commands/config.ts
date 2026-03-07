/**
 * Config command implementation
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getPreset, getAvailablePresets, permissivePreset, moderatePreset, strictPreset, maximumPreset, developmentPreset } from '../../policy/presets';
import type { SafetyConfig } from '../../types/safety';

interface ConfigOptions {
  init?: boolean;
  preset?: string;
  output?: string;
  show?: boolean;
}

export async function configCommand(options: ConfigOptions): Promise<void> {
  try {
    if (options.show) {
      await showConfig(options);
    } else if (options.init) {
      await initConfig(options);
    } else {
      console.log('Use --init to create a new configuration or --show to display current config');
      console.log('Available presets:', getAvailablePresets().join(', '));
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function initConfig(options: ConfigOptions): Promise<void> {
  const presetName = options.preset ?? 'moderate';
  const config = getPreset(presetName);

  if (!config) {
    console.error(`Error: Unknown preset "${presetName}"`);
    console.error('Available presets:', getAvailablePresets().join(', '));
    process.exit(1);
  }

  const outputPath = options.output ?? 'safety-config.json';

  // Add metadata to config
  const configWithMeta = {
    _meta: {
      version: '0.1.0',
      preset: presetName,
      created: new Date().toISOString(),
    },
    ...config,
  };

  await fs.writeFile(outputPath, JSON.stringify(configWithMeta, null, 2), 'utf-8');
  console.log(`Configuration created at: ${outputPath}`);
  console.log(`Using preset: ${presetName}`);
}

async function showConfig(options: ConfigOptions): Promise<void> {
  if (options.preset) {
    const preset = getPreset(options.preset);
    if (!preset) {
      console.error(`Error: Unknown preset "${options.preset}"`);
      process.exit(1);
    }
    console.log(JSON.stringify(preset, null, 2));
    return;
  }

  // Show all presets summary
  console.log('\n=== Available Presets ===\n');

  const presets: Array<{ name: string; config: SafetyConfig; description: string }> = [
    { name: 'permissive', config: permissivePreset, description: 'Minimal safety checks for trusted environments' },
    { name: 'moderate', config: moderatePreset, description: 'Balanced checks for consumer applications' },
    { name: 'strict', config: strictPreset, description: 'Comprehensive checks for high-risk applications' },
    { name: 'maximum', config: maximumPreset, description: 'Maximum security for enterprise/regulated environments' },
    { name: 'development', config: developmentPreset, description: 'Minimal interference for development' },
  ];

  for (const { name, config, description } of presets) {
    console.log(`${name}:`);
    console.log(`  Description: ${description}`);
    console.log(`  Mode: ${config.mode}`);
    console.log(`  Strictness: ${config.strictness}`);
    console.log(`  Categories: ${config.categories.join(', ')}`);
    console.log(`  PII Detection: ${config.piiConfig?.enabled ? 'enabled' : 'disabled'}`);
    console.log(`  Rate Limiting: ${config.rateLimitConfig?.enabled ? 'enabled' : 'disabled'}`);
    console.log(`  Audit Logging: ${config.auditConfig?.enabled ? 'enabled' : 'disabled'}`);
    console.log('');
  }
}

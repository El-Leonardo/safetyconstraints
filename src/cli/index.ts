#!/usr/bin/env node

/**
 * CLI interface for the AI Safety Constraints toolkit
 */

import { Command } from 'commander';
import { validateCommand } from './commands/validate';
import { scanCommand } from './commands/scan';
import { configCommand } from './commands/config';

const program = new Command();

program
  .name('safety-constraints')
  .description('AI Safety Constraints Toolkit CLI')
  .version('0.1.0');

// Validate command
program
  .command('validate')
  .description('Validate text against safety policies')
  .option('-t, --text <text>', 'Text to validate')
  .option('-f, --file <file>', 'File to validate')
  .option('-c, --config <config>', 'Configuration file path')
  .option('-p, --preset <preset>', 'Use a preset configuration', 'moderate')
  .option('--json', 'Output as JSON')
  .action(validateCommand);

// Scan command
program
  .command('scan')
  .description('Scan files or directories for safety issues')
  .argument('<path>', 'File or directory to scan')
  .option('-r, --recursive', 'Scan recursively', false)
  .option('-c, --config <config>', 'Configuration file path')
  .option('--fix', 'Attempt to fix issues automatically', false)
  .option('--json', 'Output as JSON')
  .action(scanCommand);

// Config command
program
  .command('config')
  .description('Manage configuration')
  .option('-i, --init', 'Initialize a new configuration file')
  .option('-p, --preset <preset>', 'Configuration preset to use')
  .option('-o, --output <output>', 'Output file path')
  .option('--show', 'Show current configuration')
  .action(configCommand);

// Health command
program
  .command('health')
  .description('Check the health of configured providers')
  .option('-c, --config <config>', 'Configuration file path')
  .action(async (options) => {
    console.log('Health check functionality would be implemented here');
    console.log('Options:', options);
  });

program.parse();

/**
 * Custom rules example
 */

import { SafetyEngine, createSafetyContext, moderatePreset } from '../src/index';
import type { SafetyConfig } from '../src/types/safety';

async function main() {
  // Create custom configuration with additional rules
  const customConfig: SafetyConfig = {
    ...moderatePreset,
    strictness: 'strict',
    customRules: [
      {
        id: 'no-internal-ips',
        name: 'No Internal IP Addresses',
        category: 'data_exfiltration',
        severity: 'high',
        pattern: /\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2[0-9]|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/,
        description: 'Blocks internal IP addresses from being processed',
        action: 'block'
      },
      {
        id: 'no-aws-keys',
        name: 'No AWS Access Keys',
        category: 'pii_exposure',
        severity: 'critical',
        pattern: /\bAKIA[0-9A-Z]{16}\b/,
        description: 'Blocks AWS access key IDs',
        action: 'block'
      },
      {
        id: 'domain-restriction',
        name: 'Domain Restriction',
        category: 'custom',
        severity: 'medium',
        pattern: /\b(competitor1\.com|competitor2\.com)\b/i,
        description: 'Flags mentions of specific competitors',
        action: 'flag'
      }
    ]
  };

  const engine = new SafetyEngine(customConfig);
  await engine.initialize();

  const context = createSafetyContext()
    .withProvider('test')
    .withUserId('user-123')
    .build();

  // Test 1: Internal IP
  console.log('=== Test 1: Internal IP ===');
  const ipResult = await engine.validateInput({
    messages: [{ role: 'user', content: 'Connect to 192.168.1.1 for admin access' }]
  }, context);

  console.log('Safe:', ipResult.isSafe);
  console.log('Action:', ipResult.actionTaken);
  console.log('Violations:', ipResult.checks.filter(c => !c.passed).map(c => c.message));

  // Test 2: AWS Key
  console.log('\n=== Test 2: AWS Key ===');
  const awsResult = await engine.validateInput({
    messages: [{ role: 'user', content: 'My AWS key is AKIAIOSFODNN7EXAMPLE' }]
  }, context);

  console.log('Safe:', awsResult.isSafe);
  console.log('Action:', awsResult.actionTaken);

  // Test 3: Competitor mention
  console.log('\n=== Test 3: Competitor Mention ===');
  const competitorResult = await engine.validateInput({
    messages: [{ role: 'user', content: 'Check out competitor1.com for comparison' }]
  }, context);

  console.log('Safe:', competitorResult.isSafe);
  console.log('Action:', competitorResult.actionTaken);

  // Show policy engine rules
  console.log('\n=== Active Rules ===');
  const policyEngine = (engine as unknown as { policyEngine: { getRules: () => Array<{ id: string; name: string }> } }).policyEngine;
  console.log('Number of rules:', policyEngine.getRules().length);
  console.log('Rules:', policyEngine.getRules().map(r => r.name));
}

main().catch(console.error);

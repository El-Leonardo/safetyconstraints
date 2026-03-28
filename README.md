<div align="center">
  <img src="https://img.shields.io/badge/Made%20by-Interlabs-blue?style=for-the-badge&logo=interlabs" alt="Made by Interlabs" />
</div>

<br />

# 🛡️ AI Safety Constraints Toolkit

A comprehensive, production-ready, enterprise-grade TypeScript library for AI safety guardrails. Features prompt injection detection, input/output filtering, policy enforcement, and multi-provider LLM adapters for OpenAI, Anthropic, Google, Azure, and local models.

[![npm version](https://img.shields.io/npm/v/@safetyconstraints/core.svg?style=flat-square)](https://www.npmjs.org/package/@safetyconstraints/core)
[![Build Status](https://img.shields.io/github/actions/workflow/status/safetyconstraints/core/ci.yml?branch=main&style=flat-square)](https://github.com/safetyconstraints/core/actions)
[![Coverage Status](https://img.shields.io/coveralls/github/safetyconstraints/core/main.svg?style=flat-square)](https://coveralls.io/github/safetyconstraints/core?branch=main)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg?style=flat-square)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg?style=flat-square)](https://www.typescriptlang.org/)

## ✨ Features

- **🛡️ Prompt Injection Defense**: Pattern-based detection, heuristic analysis, and semantic analysis for known attack signatures including DAN, developer mode, jailbreaks, and indirect injection
- **🔒 Input/Output Filtering**: Content sanitization, PII detection and masking, toxic content filtering, and bias detection
- **📋 Policy Enforcement**: Rule-based policy engine with configurable strictness levels and custom rules
- **🔌 Multi-Provider Support**: Built-in adapters for OpenAI, Anthropic (Claude), Google (Gemini), Azure OpenAI, Ollama, and other local models
- **📊 Monitoring & Audit**: Structured audit logging, Prometheus-compatible metrics, and health checks
- **⚡ Rate Limiting**: Token bucket rate limiter with sliding window support
- **🛠️ CLI Tools**: Command-line interface for validation, scanning, and configuration management

## Installation

```bash
npm install @safetyconstraints/core
```

### Optional Dependencies

For specific provider support, install the corresponding SDK:

```bash
# OpenAI
npm install openai

# Anthropic
npm install @anthropic-ai/sdk

# Google
npm install @google/generative-ai
```

## Quick Start

```typescript
import { SafetyEngine, createSafetyContext, getPreset } from '@safetyconstraints/core';

// Create safety engine with a preset configuration
const config = getPreset('moderate');
const engine = new SafetyEngine(config);
await engine.initialize();

// Validate input
const context = createSafetyContext()
  .withProvider('openai')
  .withUserId('user-123')
  .build();

const result = await engine.validateInput({
  messages: [{ role: 'user', content: 'Hello, how are you?' }]
}, context);

if (!result.isSafe) {
  console.log('Blocked:', result.checks.filter(c => !c.passed));
}
```

## Configuration Presets

Choose from predefined safety configurations:

| Preset | Use Case | Strictness |
|--------|----------|------------|
| `permissive` | Trusted internal applications | Low |
| `moderate` | Consumer applications | Medium |
| `strict` | High-risk applications | High |
| `maximum` | Enterprise/regulated environments | Maximum |
| `development` | Development environments | Minimal |

```typescript
import { getPreset, permissivePreset } from '@safetyconstraints/core';

// Use a preset
const config = getPreset('strict');

// Customize a preset
const customConfig = {
  ...permissivePreset,
  strictness: 'strict',
  customRules: [...]
};
```

## Provider Adapters

### OpenAI

```typescript
import { OpenAIAdapter, AdapterFactory } from '@safetyconstraints/core';

const factory = new AdapterFactory({
  adapters: [{
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    defaultModel: 'gpt-4'
  }]
});

await factory.initialize();
const adapter = factory.getAdapter('openai');
```

### Anthropic

```typescript
const factory = new AdapterFactory({
  adapters: [{
    provider: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY,
    defaultModel: 'claude-3-sonnet-20240229'
  }]
});
```

### Google (Gemini)

```typescript
const factory = new AdapterFactory({
  adapters: [{
    provider: 'google',
    apiKey: process.env.GOOGLE_API_KEY,
    defaultModel: 'gemini-1.5-pro'
  }]
});
```

### Azure OpenAI

```typescript
const factory = new AdapterFactory({
  adapters: [{
    provider: 'azure',
    apiKey: process.env.AZURE_OPENAI_KEY,
    baseUrl: 'https://your-resource.openai.azure.com',
    defaultModel: 'gpt-4'
  }]
});
```

### Local Models (Ollama)

```typescript
const factory = new AdapterFactory({
  adapters: [{
    provider: 'local',
    baseUrl: 'http://localhost:11434',
    defaultModel: 'llama3'
  }]
});
```

## Safety Engine Usage

### Input Validation

```typescript
import { SafetyEngine, createSafetyContext } from '@safetyconstraints/core';

const engine = new SafetyEngine(config);
await engine.initialize();

const result = await engine.validateInput({
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: userInput }
  ],
  model: 'gpt-4',
  temperature: 0.7
}, context);

if (result.actionTaken === 'block') {
  throw new Error('Input blocked due to safety concerns');
}

if (result.actionTaken === 'sanitize') {
  // Use sanitized request
  const safeRequest = result.sanitizedRequest;
}
```

### Output Validation

```typescript
// After getting LLM response
const outputResult = await engine.validateOutput({
  content: llmResponse,
  model: 'gpt-4',
  provider: 'openai'
}, context);

if (!outputResult.isSafe) {
  // Handle unsafe output
  console.log('Output filtered:', outputResult.checks);
}
```

### Bidirectional Validation

```typescript
const { inputResult, outputResult } = await engine.validate(
  request,
  response,
  context
);
```

## Prompt Injection Detection

The library detects various prompt injection techniques:

```typescript
import { InjectionDetector, getAllPatterns } from '@safetyconstraints/core';

const detector = new InjectionDetector(config);
await detector.initialize();

const result = await detector.detect(userInput, context);

// Access detected patterns
for (const check of result.checks) {
  if (!check.passed) {
    console.log(`Detected: ${check.message}`);
    console.log(`Category: ${check.category}`);
    console.log(`Confidence: ${check.confidence}`);
  }
}
```

### Supported Attack Patterns

- **Jailbreaks**: DAN, developer mode, simulator attacks
- **Instruction Overrides**: System prompt injection, role confusion
- **Context Manipulation**: Delimiter attacks, XML/JSON injection
- **Encoding Obfuscation**: Base64, Unicode escapes, zero-width characters
- **Social Engineering**: Authority claims, emergency pleas
- **Indirect Injection**: Embedded instructions in content

## Custom Rules

Define custom safety rules:

```typescript
const config = {
  ...getPreset('moderate'),
  customRules: [
    {
      id: 'custom-1',
      name: 'No Competitor Mentions',
      category: 'custom',
      severity: 'low',
      pattern: /\b(competitor-name)\b/i,
      description: 'Blocks mentions of specific competitors',
      action: 'flag'
    }
  ]
};
```

## PII Detection

Configure PII detection and masking:

```typescript
const config = {
  piiConfig: {
    enabled: true,
    entities: ['email', 'phone', 'ssn', 'credit_card', 'api_key'],
    maskingStyle: 'redact' // 'redact', 'mask', 'hash', 'tokenize'
  }
};
```

## Rate Limiting

Configure rate limiting:

```typescript
const config = {
  rateLimitConfig: {
    enabled: true,
    requestsPerSecond: 10,
    burstSize: 20,
    windowMs: 60000
  }
};

// Check rate limit
const rateLimitResult = await engine.validateInput(request, context);
```

## Audit Logging

Configure audit logging:

```typescript
const config = {
  auditConfig: {
    enabled: true,
    logLevel: 'info',
    includeInput: false,
    includeOutput: false,
    redactPII: true,
    destination: 'file',
    filePath: './logs/safety-audit.log'
  }
};
```

## CLI Usage

### Validate Text

```bash
# Validate text directly
npx safety-constraints validate -t "Hello world"

# Validate a file
npx safety-constraints validate -f input.txt --preset strict

# Output as JSON
npx safety-constraints validate -t "Hello" --json
```

### Scan Files

```bash
# Scan a single file
npx safety-constraints scan file.txt

# Scan directory recursively
npx safety-constraints scan ./docs --recursive

# Output as JSON
npx safety-constraints scan ./src --json
```

### Configuration

```bash
# Initialize config with preset
npx safety-constraints config --init --preset strict -o safety-config.json

# Show available presets
npx safety-constraints config --show
```

## Metrics

Access Prometheus-compatible metrics:

```typescript
import { MetricsCollectorImpl } from '@safetyconstraints/core';

const metrics = new MetricsCollectorImpl();

// Record request
metrics.recordRequest(context, result);

// Get snapshot
const snapshot = metrics.getMetrics();
console.log(`Total requests: ${snapshot.totalRequests}`);
console.log(`Blocked: ${snapshot.blockedRequests}`);
console.log(`P95 latency: ${snapshot.p95LatencyMs}ms`);

// Export Prometheus format
const prometheusMetrics = metrics.exportPrometheus();
```

## Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

## API Reference

### Core Classes

- `SafetyEngine` - Main orchestrator for safety checks
- `InjectionDetector` - Prompt injection detection
- `InputSanitizer` - Input preprocessing and sanitization
- `OutputFilter` - Output content filtering
- `PolicyEngine` - Rule-based policy enforcement
- `RateLimiter` - Rate limiting with token bucket

### Provider Adapters

- `OpenAIAdapter` - OpenAI GPT models
- `AnthropicAdapter` - Claude models
- `GoogleAdapter` - Gemini models
- `AzureAdapter` - Azure OpenAI
- `LocalAdapter` - Ollama and other local models

### Types

See `src/types/` for complete TypeScript type definitions.

## Security Considerations

1. **No Silver Bullet**: This toolkit provides defense in depth but cannot guarantee 100% protection against all attacks
2. **Keep Updated**: Regularly update the library to get the latest detection patterns
3. **Monitor Metrics**: Watch for unusual patterns that might indicate new attack vectors
4. **Customize for Your Domain**: Add custom rules specific to your use case
5. **Test Thoroughly**: Use red team testing to validate your safety configuration

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

Apache License 2.0 - See [LICENSE](LICENSE) for details.

## Support

- 📖 [Documentation](https://docs.safetyconstraints.io)
- 🐛 [Issue Tracker](https://github.com/safetyconstraints/core/issues)
- 💬 [Discussions](https://github.com/safetyconstraints/core/discussions)

---

<div align="center">
  <b>Made by Interlabs</b><br/>
  Enterprise-Grade AI Infrastructure
</div>

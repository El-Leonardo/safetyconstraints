/**
 * Express.js integration example
 */

import express from 'express';
import { SafetyEngine, createContextFromHeaders, getPreset, createSafetyContext } from '../src/index';
import type { LLMRequest } from '../src/types/providers';

const app = express();
app.use(express.json());

// Initialize safety engine
const engine = new SafetyEngine(getPreset('strict'));

// Middleware to validate requests
function safetyMiddleware() {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      // Create safety context from request
      const context = createContextFromHeaders(req.headers, 'openai')
        .withUserId(req.headers['x-user-id'] as string)
        .withMetadata({ path: req.path })
        .build();

      // Validate the request body as an LLM request
      const llmRequest: LLMRequest = {
        messages: req.body.messages || [{ role: 'user', content: req.body.prompt || '' }],
        model: req.body.model,
        temperature: req.body.temperature,
        maxTokens: req.body.max_tokens,
      };

      const result = await engine.validateInput(llmRequest, context);

      if (result.actionTaken === 'block') {
        return res.status(400).json({
          error: 'Safety violation detected',
          details: result.checks.filter(c => !c.passed).map(c => ({
            category: c.category,
            message: c.message,
            severity: c.severity
          }))
        });
      }

      if (result.actionTaken === 'sanitize' && result.sanitizedRequest) {
        // Use sanitized request
        req.body = result.sanitizedRequest;
      }

      // Attach safety result for logging
      (req as express.Request & { safetyResult: typeof result }).safetyResult = result;

      next();
    } catch (error) {
      next(error);
    }
  };
}

// Health check endpoint
app.get('/health', async (req, res) => {
  const metrics = engine.getMetrics();
  res.json({
    status: 'ok',
    metrics: {
      totalRequests: metrics.totalRequests,
      blockedRequests: metrics.blockedRequests
    }
  });
});

// Chat completion endpoint with safety validation
app.post('/v1/chat/completions', safetyMiddleware(), async (req, res) => {
  // Forward to your actual LLM provider here
  // This is just a mock response
  res.json({
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: Date.now(),
    model: req.body.model || 'gpt-4',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: 'This is a mock response. Integrate with your actual LLM provider.'
      },
      finish_reason: 'stop'
    }]
  });
});

// Metrics endpoint (Prometheus format)
app.get('/metrics', (req, res) => {
  // In a real implementation, export Prometheus metrics
  res.type('text/plain');
  res.send('# Prometheus metrics would go here');
});

async function start() {
  await engine.initialize();

  app.listen(3000, () => {
    console.log('Server running on port 3000');
    console.log('POST /v1/chat/completions - Chat with safety validation');
    console.log('GET /health - Health check');
    console.log('GET /metrics - Prometheus metrics');
  });
}

start().catch(console.error);

import type { FailureCode, FailureCategory } from '../outputs/failure.js';

export const failureCategoryByCode: Readonly<
  Record<FailureCode, FailureCategory>
> = {
  'invalid-input': 'input',
  'context-limit': 'input',
  'missing-configuration': 'configuration',
  'authentication-error': 'configuration',
  'rate-limit': 'integration',
  'api-error': 'integration',
  timeout: 'runtime',
  'tool-call-limit': 'runtime',
  'model-turn-limit': 'runtime',
  'interrupted-request': 'runtime',
  'interrupted-stream': 'runtime',
  'runtime-error': 'runtime',
  'malformed-json': 'model-output',
  'schema-invalid-output': 'model-output',
  'structured-output-retries-exhausted': 'model-output',
};

export const interruptionByMode = {
  complete: {
    code: 'interrupted-request',
    message: 'Request interrupted before a completed response was received.',
  },
  stream: {
    code: 'interrupted-stream',
    message: 'Stream interrupted. The partial response was rejected.',
  },
} as const;

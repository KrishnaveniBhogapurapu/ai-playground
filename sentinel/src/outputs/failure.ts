export type FailureCategory =
  | 'input'
  | 'configuration'
  | 'integration'
  | 'runtime'
  | 'model-output';

export type FailureCode =
  | 'invalid-input'
  | 'context-limit'
  | 'missing-configuration'
  | 'authentication-error'
  | 'rate-limit'
  | 'api-error'
  | 'timeout'
  | 'tool-call-limit'
  | 'model-turn-limit'
  | 'interrupted-request'
  | 'interrupted-stream'
  | 'runtime-error'
  | 'malformed-json'
  | 'schema-invalid-output'
  | 'structured-output-retries-exhausted';

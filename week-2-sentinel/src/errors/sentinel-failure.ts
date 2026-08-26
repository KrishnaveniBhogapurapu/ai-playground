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
  | 'interrupted-request'
  | 'interrupted-stream'
  | 'runtime-error'
  | 'malformed-json'
  | 'schema-invalid-output'
  | 'structured-output-retries-exhausted';

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
  'interrupted-request': 'runtime',
  'interrupted-stream': 'runtime',
  'runtime-error': 'runtime',
  'malformed-json': 'model-output',
  'schema-invalid-output': 'model-output',
  'structured-output-retries-exhausted': 'model-output',
};

export class SentinelFailure extends Error {
  readonly category: FailureCategory;
  readonly code: FailureCode;

  constructor(code: FailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SentinelFailure';
    this.code = code;
    this.category = failureCategoryByCode[code];
  }
}

export function classifyThrownFailure(error: unknown): SentinelFailure {
  if (error instanceof SentinelFailure) {
    return error;
  }

  const message = error instanceof Error ? error.message : 'Unexpected error.';
  const normalizedMessage = message.toLowerCase();

  if (/\b(401|403)\b|unauthori[sz]ed|authentication|invalid token/.test(normalizedMessage)) {
    return new SentinelFailure('authentication-error', message, {
      cause: error,
    });
  }

  if (/\b429\b|rate.?limit|too many requests/.test(normalizedMessage)) {
    return new SentinelFailure('rate-limit', message, { cause: error });
  }

  if (/timed?\s*out|timeout/.test(normalizedMessage)) {
    return new SentinelFailure('timeout', message, { cause: error });
  }

  if (/context.*(limit|length)|prompt.*too long/.test(normalizedMessage)) {
    return new SentinelFailure('context-limit', message, { cause: error });
  }

  return new SentinelFailure('runtime-error', message, { cause: error });
}

export function formatFailure(error: unknown): string {
  const failure = classifyThrownFailure(error);

  return JSON.stringify(
    {
      accepted: false,
      failure: {
        category: failure.category,
        code: failure.code,
        message: failure.message,
      },
    },
    null,
    2,
  );
}

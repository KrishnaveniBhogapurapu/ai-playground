import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  IncidentAnalysis,
  MultimodalIncidentAnalysis,
} from '../contracts/incident-analysis.js';
import {
  classifyThrownFailure,
  formatFailure,
  SentinelFailure,
} from '../errors/sentinel-failure.js';
import {
  parseIncidentMetricInput,
  readIncidentMetric,
} from '../tools/incident-metrics.js';
import {
  parseIncidentAnalysis,
  validateIncidentAnalysisValue,
  validateMultimodalIncidentAnalysisValue,
} from '../validation/parse-incident-analysis.js';

const validAnalysis: IncidentAnalysis = {
  facts: ['Checkout error rate was 9% at 10:04 UTC.'],
  assumptions: ['The recorded metric is representative of the incident.'],
  hypotheses: [
    {
      claim: 'A dependency may be degraded.',
      supporting_evidence: [],
      contradicting_evidence: ['No dependency telemetry was supplied.'],
    },
  ],
  missing_information: ['Dependency telemetry is missing.'],
  reversible_next_actions: ['Inspect dependency health dashboards.'],
  uncertainty: {
    level: 'high',
    reason: 'The available evidence does not establish a root cause.',
  },
};

test('parses a valid incident-analysis JSON response', () => {
  assert.deepEqual(
    parseIncidentAnalysis(JSON.stringify(validAnalysis)),
    validAnalysis,
  );
});

test('classifies malformed JSON as a model-output failure', () => {
  assert.throws(
    () => parseIncidentAnalysis('{"facts": ['),
    (error: unknown) =>
      error instanceof SentinelFailure &&
      error.category === 'model-output' &&
      error.code === 'malformed-json',
  );
});

test('rejects JSON that does not satisfy the incident schema', () => {
  const { uncertainty: _omitted, ...missingUncertainty } = validAnalysis;

  assert.throws(
    () => validateIncidentAnalysisValue(missingUncertainty),
    (error: unknown) =>
      error instanceof SentinelFailure &&
      error.category === 'model-output' &&
      error.code === 'schema-invalid-output',
  );
});

test('rejects unexpected properties from structured output', () => {
  assert.throws(
    () =>
      validateIncidentAnalysisValue({
        ...validAnalysis,
        confirmed_root_cause: 'deployment',
      }),
    (error: unknown) =>
      error instanceof SentinelFailure &&
      error.code === 'schema-invalid-output',
  );
});

test('validates the multimodal evidence-classification contract', () => {
  const multimodalAnalysis: MultimodalIncidentAnalysis = {
    ...validAnalysis,
    evidence_classification: {
      text_observations: ['The incident text reports checkout failures.'],
      image_observations: ['The dashboard shows a 9% error rate.'],
      inferences: ['The two observations may describe the same event.'],
      unsupported_claims: [],
    },
  };

  assert.deepEqual(
    validateMultimodalIncidentAnalysisValue(multimodalAnalysis),
    multimodalAnalysis,
  );
});

test('maps common thrown SDK messages to typed failures', async (context) => {
  const cases = [
    ['401 unauthorized', 'authentication-error'],
    ['429 rate limit exceeded', 'rate-limit'],
    ['Request timed out', 'timeout'],
    ['Prompt exceeded context length', 'context-limit'],
    ['Unexpected transport failure', 'runtime-error'],
  ] as const;

  for (const [message, expectedCode] of cases) {
    await context.test(expectedCode, () => {
      assert.equal(classifyThrownFailure(new Error(message)).code, expectedCode);
    });
  }
});

test('formats a typed failure as the application rejection contract', () => {
  const formatted = JSON.parse(
    formatFailure(new SentinelFailure('interrupted-stream', 'Stopped.')),
  ) as unknown;

  assert.deepEqual(formatted, {
    accepted: false,
    failure: {
      category: 'runtime',
      code: 'interrupted-stream',
      message: 'Stopped.',
    },
  });
});

test('accepts only the supported incident metric tool input', () => {
  const input = parseIncidentMetricInput({
    incident_id: 'INC-104',
    metric: 'checkout_error_rate',
  });

  assert.deepEqual(input, {
    incident_id: 'INC-104',
    metric: 'checkout_error_rate',
  });
  assert.throws(() =>
    parseIncidentMetricInput({
      incident_id: 'INC-999',
      metric: 'checkout_error_rate',
    }),
  );
  assert.throws(() =>
    parseIncidentMetricInput({
      incident_id: 'INC-104',
      metric: 'deployment_status',
    }),
  );
});

test('returns the fictional metric only after valid input is supplied', () => {
  const input = parseIncidentMetricInput({
    incident_id: 'INC-104',
    metric: 'checkout_error_rate',
  });

  assert.deepEqual(readIncidentMetric(input), {
    value: 9,
    unit: 'percent',
    observed_at: '10:04 UTC',
    source: 'fictional Sentinel monitoring snapshot',
  });
});

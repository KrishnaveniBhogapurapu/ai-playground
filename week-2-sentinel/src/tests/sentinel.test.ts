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
import { executeEvidenceTool, createEvidenceTools } from '../tools/evidence-tools.js';
import { validateServiceMetricsOutput, validateDependencyHealthOutput } from '../tools/evidence-contracts.js';
import { TurnAcceptanceGuard } from '../runtime/turn-acceptance.js';
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

test('parses a valid incident-analysis JSON response', async () => {
  assert.deepEqual(
    parseIncidentAnalysis(JSON.stringify(validAnalysis)),
    validAnalysis,
  );
});

test('classifies malformed JSON as a model-output failure', async () => {
  assert.throws(
    () => parseIncidentAnalysis('{"facts": ['),
    (error: unknown) =>
      error instanceof SentinelFailure &&
      error.category === 'model-output' &&
      error.code === 'malformed-json',
  );
});

test('rejects JSON that does not satisfy the incident schema', async () => {
  const { uncertainty: _omitted, ...missingUncertainty } = validAnalysis;

  assert.throws(
    () => validateIncidentAnalysisValue(missingUncertainty),
    (error: unknown) =>
      error instanceof SentinelFailure &&
      error.category === 'model-output' &&
      error.code === 'schema-invalid-output',
  );
});

test('rejects unexpected properties from structured output', async () => {
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

test('validates the multimodal evidence-classification contract', async () => {
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
    await context.test(expectedCode, async () => {
      assert.equal(classifyThrownFailure(new Error(message)).code, expectedCode);
    });
  }
});

test('formats a typed failure as the application rejection contract', async () => {
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

test('rejects streamed partial output when the turn is interrupted', async () => {
  const abortController = new AbortController();
  const acceptanceGuard = new TurnAcceptanceGuard('stream');

  acceptanceGuard.recordPartialOutput('{"facts":["partial');
  abortController.abort();

  assert.equal(acceptanceGuard.hasPartialOutput, true);
  assert.throws(
    () =>
      acceptanceGuard.acceptValidatedResult(
        validAnalysis,
        abortController.signal,
      ),
    (error: unknown) =>
      error instanceof SentinelFailure &&
      error.category === 'runtime' &&
      error.code === 'interrupted-stream' &&
      error.message === 'Stream interrupted. The partial response was rejected.',
  );
  assert.equal(acceptanceGuard.hasAcceptedResult, false);
});

test('accepts a validated final result when the turn was not interrupted', async () => {
  const abortController = new AbortController();
  const acceptanceGuard = new TurnAcceptanceGuard('stream');

  acceptanceGuard.recordPartialOutput('{"facts":');
  assert.equal(
    acceptanceGuard.acceptValidatedResult(
      validAnalysis,
      abortController.signal,
    ),
    validAnalysis,
  );
  acceptanceGuard.assertCompleted(abortController.signal);
  assert.equal(acceptanceGuard.hasAcceptedResult, true);
});

const metricsInput = {
  service: 'checkout-api' as const, metric: 'error_rate' as const,
  start_time: '2026-08-21T10:00:00Z', end_time: '2026-08-21T10:10:00Z',
};
const healthInput = {
  service: 'checkout-api' as const, dependency: 'database' as const,
  requested_time: '2026-08-21T10:04:00Z',
};

test('retrieves fictional evidence from both tools and preserves provenance', async () => {
  const metrics = await executeEvidenceTool('get_service_metrics', metricsInput);
  assert.equal(metrics.ok, true);
  if (!metrics.ok) return;
  assert.deepEqual(metrics.data.observations, [
    { time: '2026-08-21T10:00:00Z', value: 0.4 },
    { time: '2026-08-21T10:04:00Z', value: 9 },
  ]);
  assert.equal(metrics.data.source, 'fictional Sentinel INC-104 fixture');
  for (const dependency of ['database', 'payment-provider']) {
    const health = await executeEvidenceTool('get_dependency_health', { ...healthInput, dependency });
    assert.equal(health.ok, true);
    if (health.ok) {
      assert.equal(health.data.dependency, dependency);
      assert.equal(health.data.status, 'degraded');
    }
  }
});

test('filters metrics by inclusive range and explicitly reports truncation', async () => {
  const limited = await executeEvidenceTool('get_service_metrics', { ...metricsInput, max_results: 1 });
  assert.equal(limited.ok, true);
  if (limited.ok) {
    assert.equal(limited.data.truncated, true);
    assert.equal((limited.data.observations as unknown[]).length, 1);
  }
  const exact = await executeEvidenceTool('get_service_metrics', {
    ...metricsInput, start_time: healthInput.requested_time, end_time: healthInput.requested_time,
  });
  assert.equal(exact.ok, true);
  if (exact.ok) assert.deepEqual(exact.data.observations, [{ time: healthInput.requested_time, value: 9 }]);
});

test('rejects invalid names, extra fields, time ranges, services and result counts', async () => {
  for (const change of [
    { service: 'production-admin' }, { metric: 'passwords' }, { extra: true },
    { start_time: '10:00' }, { start_time: '2026-02-30T10:00:00Z' },
    { end_time: '2026-08-21T09:59:00Z' }, { end_time: '2026-08-21T11:01:00Z' },
    { max_results: 0 }, { max_results: 101 }, { max_results: 1.5 },
  ]) {
    const result = await executeEvidenceTool('get_service_metrics', { ...metricsInput, ...change });
    assert.equal(result.ok, false, JSON.stringify(change));
    if (!result.ok) assert.equal(result.error.code, 'invalid-input');
  }
  for (const change of [{ dependency: 'secrets' }, { service: 'admin' }, { requested_time: 'now' }]) {
    assert.equal((await executeEvidenceTool('get_dependency_health', { ...healthInput, ...change })).ok, false);
  }
  const unknown = await executeEvidenceTool('get_incident_metric', {});
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.error.code, 'unknown-tool');
});

test('missing snapshots produce explicit errors instead of invented evidence', async () => {
  for (const [name, input] of [
    ['get_service_metrics', { ...metricsInput, start_time: '2026-08-22T10:00:00Z', end_time: '2026-08-22T10:10:00Z' }],
    ['get_dependency_health', { ...healthInput, requested_time: '2026-08-21T10:05:00Z' }],
  ] as const) {
    const result = await executeEvidenceTool(name, input);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'evidence-unavailable');
  }
});

test('rejects malformed, out-of-range and mismatched tool output', async () => {
  const result = await executeEvidenceTool('get_service_metrics', metricsInput);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  for (const change of [
    { unit: 'seconds' }, { source: 'production' },
    { observations: [{ time: healthInput.requested_time, value: 101 }] },
    { observations: [{ time: '2026-08-21T10:11:00Z', value: 9 }] },
    { observations: Array(101).fill({ time: healthInput.requested_time, value: 9 }) },
    { end_time: '2026-08-21T10:09:00Z' },
  ]) assert.throws(() => validateServiceMetricsOutput({ ...result.data, ...change }, metricsInput));
  assert.throws(() => validateServiceMetricsOutput(result.data, { ...metricsInput, max_results: 1 }));
  const health = await executeEvidenceTool('get_dependency_health', healthInput);
  assert.equal(health.ok, true);
  if (health.ok) {
    assert.throws(() => validateDependencyHealthOutput({ ...health.data, detail: 'x'.repeat(1001) }, healthInput));
    assert.throws(() => validateDependencyHealthOutput({ ...health.data, dependency: 'payment-provider' }, healthInput));
  }
});

test('creates independent SDK tool servers and trace histories', async () => {
  const first = createEvidenceTools();
  const second = createEvidenceTools();
  assert.ok(first.server);
  first.trace.requests.push({ id: 'toolu_1', name: 'get_service_metrics', input: metricsInput });
  assert.equal(second.trace.requests.length, 0);
  first.close();
  second.close();
});

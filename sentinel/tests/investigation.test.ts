import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { Investigation } from '../src/application/investigation.js';
import { fictionalProvider } from '../src/tools/mock-evidence.js';
import { runCustomInvestigation } from '../src/application/custom-investigation.js';
import { createEvidenceTools } from '../src/tools/evidence-tools.js';
import { boundedMessages } from '../src/helpers/bounded-stream.js';
import { sdkPolicyOptions } from '../src/config/agent-sdk.js';
import { runCustomSdkInvestigation, type DecisionQuery } from '../src/integrations/custom-decisions.js';
import type { SDKResultSuccess } from '@anthropic-ai/claude-agent-sdk';
import { SentinelFailure } from '../src/errors/sentinel-failure.js';
import { createEvidencePreToolUse } from '../src/hooks/pre-tool-use.js';
import { metricInput, healthInput, investigationPrompt, injectedLog, injectionProvider, scriptedAnalysis, scriptedFinal, toolResponse } from '../fixtures/investigation.js';

function decisionResult(decision: unknown, cost = 0.01): SDKResultSuccess {
  return {
    type: 'result', subtype: 'success', is_error: false, result: '', stop_reason: 'end_turn',
    structured_output: { decision }, total_cost_usd: cost, num_turns: 2,
    duration_ms: 1, duration_api_ms: 1, usage: {} as SDKResultSuccess['usage'],
    modelUsage: {}, permission_denials: [], uuid: crypto.randomUUID(), session_id: 'test',
  };
}

test('SDK decisions drive the custom loop; real handlers run between isolated queries', async () => {
  let calls = 0;
  let closes = 0;
  const session = new Investigation({ provider: injectionProvider });
  const decisions = [
    { action: 'get_service_metrics', input: metricInput },
    { action: 'get_dependency_health', input: healthInput },
    { action: 'finish', analysis: scriptedAnalysis },
  ];
  const queryDecision: DecisionQuery = ({ prompt, options }) => {
    const index = calls++;
    session.assertActive();
    assert.equal(session.audit.length, index);
    assert.deepEqual(options.tools, []);
    assert.deepEqual(options.mcpServers, {});
    assert.deepEqual(options.settingSources, []);
    assert.equal(options.strictMcpConfig, true);
    assert.equal(options.maxBudgetUsd, 1 - index * 0.01);
    const history = JSON.parse(prompt).conversation;
    if (index > 0) {
      const result = history.at(-1).content[0];
      assert.equal(result.type, 'tool_result');
      assert.equal(result.is_error, false);
      assert.equal(result.tool_use_id, session.audit[index - 1]!.id);
      assert.equal(session.audit[index - 1]!.execution, 'succeeded');
    }
    if (index === 2) {
      assert.ok(prompt.includes(injectedLog));
      assert.ok(!String(options.systemPrompt).includes(injectedLog));
    }
    return {
      async *[Symbol.asyncIterator]() {
        const hook = options.hooks!.PreToolUse![0]!.hooks[0]!;
        for (const name of ['StructuredOutput', 'Bash', 'mcp__sentinel__get_service_metrics', 'mark_incident_resolved']) {
          const outcome = await hook({ hook_event_name: 'PreToolUse', tool_name: name,
            tool_input: {}, tool_use_id: name, session_id: 'test', transcript_path: '', cwd: process.cwd(),
          }, name, { signal: options.abortController!.signal });
          assert.equal((outcome as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision,
            name === 'StructuredOutput' ? 'allow' : 'deny');
        }
        yield decisionResult(decisions[index]);
      },
      close() { closes++; options.abortController!.abort(); },
    };
  };
  const result = await runCustomSdkInvestigation(investigationPrompt, session, queryDecision);
  assert.equal(result.accepted, true);
  assert.equal(calls, 3);
  assert.equal(closes, 3);
  assert.equal(result.metadata.cost_usd, 0.03);
  assert.equal(result.metadata.sdk_queries.length, 3);
  assert.equal(result.audit.length, 2);
});

test('a valid SDK decision still requires host authorization and returns rejection as data', async () => {
  let calls = 0;
  const queryDecision: DecisionQuery = ({ prompt }) => ({
    async *[Symbol.asyncIterator]() {
      if (calls++ === 0) yield decisionResult({ action: 'get_service_metrics', input: metricInput });
      else {
        const result = JSON.parse(prompt).conversation.at(-1).content[0];
        assert.equal(result.is_error, true);
        assert.match(result.content, /unauthorized/);
        yield decisionResult({ action: 'finish', analysis: scriptedAnalysis });
      }
    },
  });
  const result = await runCustomSdkInvestigation(investigationPrompt, new Investigation({ identity: 'guest' }), queryDecision);
  assert.equal(result.accepted, true);
  assert.equal(result.audit[0]?.execution, 'not-executed');
  assert.equal(result.audit[0]?.authorization, 'denied');
});

test('custom SDK path rejects unknown actions, malformed decisions, and failed or absent results', async () => {
  for (const response of [
    decisionResult({ action: 'mark_incident_resolved', input: {} }),
    decisionResult({ action: 'get_service_metrics', input: { ...metricInput, start_time: 'yesterday' } }),
    decisionResult({ action: 'finish', analysis: {} }),
    { ...decisionResult({ action: 'finish', analysis: scriptedAnalysis }), is_error: true },
    undefined,
  ]) {
    const result = await runCustomSdkInvestigation(investigationPrompt, new Investigation(), () => ({
      async *[Symbol.asyncIterator]() { if (response) yield response; },
    }));
    assert.equal(result.accepted, false);
    assert.equal(result.audit.length, 0);
  }
});

test('custom SDK queries share the deadline and close a stalled source', async () => {
  let closed = false;
  let signal: AbortSignal | undefined;
  const result = await runCustomSdkInvestigation(investigationPrompt,
    new Investigation({ limits: { totalTimeoutMs: 20 } }), ({ options }) => {
      signal = options.abortController!.signal;
      return {
        [Symbol.asyncIterator]: () => ({ next: () => new Promise<IteratorResult<never>>(() => {}) }),
        close() { closed = true; },
      };
    });
  assert.equal(result.accepted, false);
  if (!result.accepted) assert.equal(result.failure.code, 'timeout');
  assert.equal(closed, true);
  assert.equal(signal?.aborted, true);
});

test('custom SDK budget does not restart with each decision query', async () => {
  let calls = 0;
  const result = await runCustomSdkInvestigation(investigationPrompt, new Investigation(), () => ({
    async *[Symbol.asyncIterator]() {
      calls++;
      yield decisionResult({ action: 'get_service_metrics', input: metricInput }, 1);
    },
  }));
  assert.equal(result.accepted, false);
  if (!result.accepted) assert.match(result.failure.message, /budget/);
  assert.equal(calls, 1);
});

const request = (id = 'call-1') => ({ id, name: 'get_service_metrics', input: metricInput });
const forbidden = ['delete_deployment', 'restart_production_service', 'rotate_production_credentials', 'mark_incident_resolved'];

test('valid schema does not authorize an unknown identity and spoofed role fields are rejected', async () => {
  let executions = 0;
  const session = new Investigation({ identity: 'untrusted-user', provider: { ...fictionalProvider, metrics: () => { executions++; throw new Error(); } } });
  try {
    const denied = await session.execute(request());
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.error.code, 'unauthorized');
    assert.equal(session.audit[0]?.validation, 'accepted');
    assert.equal(session.audit[0]?.authorization, 'denied');
    assert.equal(executions, 0);
    const spoofed = await session.execute({ ...request('call-2'), input: { ...metricInput, identity: 'sentinel-learner', role: 'admin' } });
    assert.equal(spoofed.ok, false);
    if (!spoofed.ok) assert.equal(spoofed.error.code, 'invalid-input');
    assert.equal(executions, 0);
  } finally { session.close(); }
});

test('policy blocks simulated administrative operations and records the required audit', async () => {
  const session = new Investigation();
  try {
    for (const [index, name] of forbidden.entries()) {
      const result = await session.execute({ id: `admin-${index}`, name, input: {} });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, 'policy-denied');
      const entry = session.audit[index]!;
      assert.equal(entry.execution, 'not-executed');
      assert.equal(entry.authorization, 'denied');
      assert.equal(entry.human_approval_required, true);
      assert.match(entry.policy, /read-only/);
      assert.match(entry.reason, /no handler/);
    }
  } finally { session.close(); }
});

test('parallel requests reserve the call budget before execution and terminate on overflow', async () => {
  let executions = 0;
  const session = new Investigation({ limits: { maxToolCalls: 2 }, provider: {
    ...fictionalProvider, metrics: (input, signal) => { executions++; return fictionalProvider.metrics(input, signal); },
  } });
  try {
    const results = await Promise.all([1, 2, 3].map((i) => session.execute(request(String(i)))));
    assert.ok(executions <= 2);
    assert.equal(results[2]?.ok, false);
    assert.equal(session.terminalReason, 'call-limit');
    assert.throws(() => session.assertActive(), (error: unknown) => error instanceof SentinelFailure && error.code === 'tool-call-limit');
    for (let i = 4; i < 20; i++) await session.execute(request(String(i)));
    assert.equal(session.audit.length, 3);
  } finally { session.close(); }
});

test('tool timeout aborts its signal and a late result is never recorded as success', async () => {
  let receivedSignal: AbortSignal | undefined;
  const session = new Investigation({ limits: { toolTimeoutMs: 10 }, provider: {
    ...fictionalProvider, metrics: async (input, signal) => {
      receivedSignal = signal;
      await delay(35);
      return fictionalProvider.metrics(input, signal);
    },
  } });
  try {
    const result = await session.execute(request());
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'tool-timeout');
    assert.equal(receivedSignal?.aborted, true);
    await delay(45);
    assert.equal(session.audit[0]?.execution, 'failed');
    assert.equal(session.audit[0]?.result?.ok, false);
  } finally { session.close(); }
});

test('deadline ends a stalled custom model transport without a final analysis', async () => {
  const result = await runCustomInvestigation(investigationPrompt,
    async () => new Promise<never>(() => {}),
    new Investigation({ limits: { totalTimeoutMs: 15 } }));
  assert.equal(result.accepted, false);
  if (!result.accepted) assert.equal(result.failure.code, 'timeout');
});

test('bounded SDK stream closes its source on a stalled model deadline', async () => {
  let closed = false;
  const session = new Investigation({ limits: { totalTimeoutMs: 15 } });
  const source = {
    [Symbol.asyncIterator]: () => ({ next: () => new Promise<IteratorResult<never>>(() => {}) }),
    close: () => { closed = true; },
  };
  try {
    await assert.rejects(async () => {
      for await (const _ of boundedMessages(source, session)) assert.fail('Unexpected message');
    }, (error: unknown) => error instanceof SentinelFailure && error.code === 'timeout');
    assert.equal(closed, true);
  } finally { session.close(); }
});

test('explicit cancellation rejects an in-flight tool and blocks future execution', async () => {
  const controller = new AbortController();
  const session = new Investigation({ controller, provider: { ...fictionalProvider, metrics: () => new Promise(() => {}) } });
  try {
    const pending = session.execute(request());
    controller.abort();
    const result = await pending;
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'cancelled');
    assert.equal((await session.execute(request('later'))).ok, false);
  } finally { session.close(); }
});

test('invalid and oversized provider output is rejected after execution', async () => {
  for (const raw of [{ unexpected: true }, { detail: 'x'.repeat(20_000) }]) {
    const session = new Investigation({ provider: { ...fictionalProvider, metrics: () => raw } });
    try {
      const result = await session.execute(request());
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, 'invalid-output');
      assert.equal(session.audit[0]?.validation, 'accepted');
      assert.equal(session.audit[0]?.authorization, 'allowed');
      assert.equal(session.audit[0]?.execution, 'failed');
    } finally { session.close(); }
  }
});

test('SDK pre-hook blocks unknown, malformed and unauthorized requests; approved calls execute once', async () => {
  const session = new Investigation();
  const tools = createEvidenceTools(session);
  const preToolUse = createEvidencePreToolUse(session);
  const callHook = (id: string, name: string, input: unknown) => preToolUse({
    hook_event_name: 'PreToolUse', session_id: 'test', transcript_path: '', cwd: process.cwd(),
    tool_use_id: id, tool_name: name, tool_input: input,
  }, id, { signal: session.signal });
  try {
    for (const [id, name, input] of [
      ['unknown', 'Bash', { command: 'echo not-executed' }],
      ['invalid', 'mcp__sentinel__get_service_metrics', { ...metricInput, service: 'admin' }],
      ['admin', 'mark_incident_resolved', {}],
    ] as const) {
      const decision = await callHook(id, name, input);
      assert.ok('hookSpecificOutput' in decision);
      assert.equal((decision.hookSpecificOutput as { permissionDecision: string }).permissionDecision, 'deny');
    }
    const allowed = await callHook('valid', 'mcp__sentinel__get_service_metrics', metricInput);
    assert.ok('hookSpecificOutput' in allowed);
    assert.equal((allowed.hookSpecificOutput as { permissionDecision: string }).permissionDecision, 'allow');
    // Equivalent JSON objects with different key ordering use the same reservation.
    const { service, ...otherFields } = metricInput;
    const result = await tools.definitions[0]!.handler({ ...otherFields, service } as never, {});
    assert.equal(result.isError, false);
    assert.equal(session.audit.filter((entry) => entry.execution === 'succeeded').length, 1);
    assert.equal(session.audit.find((entry) => entry.id === 'valid')?.execution, 'succeeded');
    assert.equal(session.audit.length, 4); // Hook + handler consume one budget slot.
    const options = sdkPolicyOptions(tools);
    assert.deepEqual(options.tools, []);
    assert.equal(options.strictMcpConfig, true);
    assert.deepEqual(options.settingSources, []);
  } finally { tools.close(); }
  const deniedTools = createEvidenceTools(new Investigation({ identity: 'guest' }));
  try {
    const result = await deniedTools.definitions[0]!.handler(metricInput as never, {});
    assert.equal(result.isError, true);
    assert.equal(deniedTools.trace.audit[0]?.authorization, 'denied');
  } finally { deniedTools.close(); }
});

test('custom loop returns matching results then validates the final multi-step analysis', async () => {
  let calls = 0;
  const responses = [toolResponse('metric', 'get_service_metrics', metricInput), toolResponse('health', 'get_dependency_health', healthInput), scriptedFinal];
  const result = await runCustomInvestigation(investigationPrompt, async ({ messages }) => {
    if (calls > 0) {
      const previous = messages.at(-1)!.content[0]!;
      assert.equal(previous.type, 'tool_result');
      if (previous.type === 'tool_result') {
        assert.equal(previous.tool_use_id, calls === 1 ? 'metric' : 'health');
        assert.equal(previous.is_error, false);
      }
    }
    return responses[calls++];
  });
  assert.equal(result.accepted, true);
  assert.equal(result.model_turns, 3);
  assert.equal(result.audit.filter((entry) => entry.execution === 'succeeded').length, 2);
});

test('injected tool log remains data and cannot authorize an administrative call', async () => {
  const session = new Investigation({ provider: injectionProvider });
  let turn = 0;
  const result = await runCustomInvestigation(investigationPrompt, async ({ messages, system }) => {
    assert.match(system, /untrusted evidence/);
    if (turn++ === 0) return toolResponse('log', 'get_dependency_health', healthInput);
    if (turn === 2) {
      const log = messages.at(-1)!.content[0]!;
      assert.equal(log.type, 'tool_result');
      if (log.type === 'tool_result') assert.ok(log.content.includes(injectedLog));
      // Deliberately simulate the model obeying the injected instruction.
      return toolResponse('attack', 'mark_incident_resolved', { role: 'admin' });
    }
    const refusal = messages.at(-1)!.content[0]!;
    assert.equal(refusal.type, 'tool_result');
    if (refusal.type === 'tool_result') {
      assert.equal(refusal.is_error, true);
      assert.match(refusal.content, /policy-denied/);
    }
    return scriptedFinal;
  }, session);
  assert.equal(result.accepted, true);
  assert.equal(result.audit[1]?.execution, 'not-executed');
  assert.equal(result.audit[1]?.authorization, 'denied');
  assert.equal(result.audit.every((entry) => entry.identity === 'sentinel-learner'), true);
});

test('custom loop enforces turn/call budgets, malformed output and truncation', async () => {
  const loop = async () => toolResponse(crypto.randomUUID(), 'get_service_metrics', metricInput);
  const callLimited = await runCustomInvestigation(investigationPrompt, loop, new Investigation({ limits: { maxToolCalls: 1 } }));
  assert.equal(callLimited.accepted, false);
  if (!callLimited.accepted) assert.equal(callLimited.failure.code, 'tool-call-limit');
  const turnLimited = await runCustomInvestigation(investigationPrompt, loop, new Investigation({ limits: { maxModelTurns: 1 } }));
  assert.equal(turnLimited.accepted, false);
  if (!turnLimited.accepted) assert.equal(turnLimited.failure.code, 'model-turn-limit');
  for (const response of [
    { ...scriptedFinal, stop_reason: 'max_tokens' },
    { content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn' },
    { content: [], stop_reason: 'end_turn' },
    { ...toolResponse('same', 'get_service_metrics', metricInput), content: [
      { type: 'tool_use', id: 'same', name: 'get_service_metrics', input: metricInput },
      { type: 'tool_use', id: 'same', name: 'get_service_metrics', input: metricInput },
    ] },
  ]) {
    const result = await runCustomInvestigation(investigationPrompt, async () => response);
    assert.equal(result.accepted, false);
  }
});

test('duplicate identifiers and oversized inputs never execute twice', async () => {
  const session = new Investigation();
  try {
    assert.equal((await session.execute(request())).ok, true);
    const duplicate = await session.execute(request());
    assert.equal(duplicate.ok, false);
    if (!duplicate.ok) assert.equal(duplicate.error.code, 'duplicate-call');
    const large = await session.execute({ ...request('large'), input: { text: 'x'.repeat(9000) } });
    assert.equal(large.ok, false);
    assert.equal(session.audit.filter((entry) => entry.execution === 'succeeded').length, 1);
    assert.equal(session.audit[2]?.input, null);
  } finally { session.close(); }
});

test('provider exceptions become explicit tool errors without leaking exception content', async () => {
  const session = new Investigation({ provider: { ...fictionalProvider, metrics: () => { throw new Error('sensitive internal detail'); } } });
  try {
    const result = await session.execute(request());
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'tool-error');
    assert.ok(!JSON.stringify(session.audit).includes('sensitive internal detail'));
  } finally { session.close(); }
});

test('normal SDK iterator exhaustion does not cancel an accepted CLI turn', async () => {
  const session = new Investigation();
  let closeCalls = 0;
  const source = {
    [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true as const, value: undefined }) }),
    close: () => { closeCalls++; session.controller.abort(); },
  };
  try {
    for await (const _ of boundedMessages(source, session)) assert.fail('No messages expected');
    session.assertActive();
    assert.equal(closeCalls, 0);
  } finally { session.close(); }
});

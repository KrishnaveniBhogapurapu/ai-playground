import { requiredOption } from '../src/helpers/command-line.js';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { Investigation } from '../src/application/investigation.js';
import { type ToolRequest } from '../src/inputs/evidence.js';
import { fictionalProvider } from '../src/tools/mock-evidence.js';
import { runCustomInvestigation } from '../src/application/custom-investigation.js';
import { createEvidenceTools } from '../src/tools/evidence-tools.js';
import { createEvidencePreToolUse } from '../src/hooks/pre-tool-use.js';
import { metricInput, healthInput, investigationPrompt, injectionProvider, scriptedTransport, scriptedFinal, scriptedAnalysis, toolResponse } from '../fixtures/investigation.js';

const directory = requiredOption(process.argv.slice(2), '--output-dir');
const cases: unknown[] = [];
async function recordCase(name: string, request: ToolRequest, options: ConstructorParameters<typeof Investigation>[0] = {}, expected: string) {
  const session = new Investigation(options);
  try {
    const result = await session.execute(request);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, expected);
    cases.push({ case: name, requested_action: request, final_sentinel_behaviour: result, audit: session.audit });
  } finally { session.close(); }
}

const metricRequest = { id: 'metric', name: 'get_service_metrics', input: metricInput };
await recordCase('unknown tool', { ...metricRequest, name: 'read_secrets' }, {}, 'unknown-tool');
await recordCase('invalid service', { ...metricRequest, input: { ...metricInput, service: 'admin-service' } }, {}, 'invalid-input');
await recordCase('invalid time range', { ...metricRequest, input: { ...metricInput, end_time: '2026-08-21T09:00:00Z' } }, {}, 'invalid-input');
await recordCase('unauthorized identity', metricRequest, { identity: 'guest' }, 'unauthorized');
await recordCase('tool timeout', metricRequest, { limits: { toolTimeoutMs: 10 }, provider: { ...fictionalProvider, metrics: () => new Promise(() => {}) } }, 'tool-timeout');
await recordCase('malformed output', metricRequest, { provider: { ...fictionalProvider, metrics: () => ({ wrong: true }) } }, 'invalid-output');
await recordCase('oversized output', metricRequest, { provider: { ...fictionalProvider, metrics: () => ({ text: 'x'.repeat(20_000) }) } }, 'invalid-output');
await recordCase('deterministic safety interception', { id: 'admin', name: 'mark_incident_resolved', input: {} }, {}, 'policy-denied');

const success = await runCustomInvestigation(investigationPrompt, scriptedTransport([
  toolResponse('metric', 'get_service_metrics', metricInput),
  toolResponse('health', 'get_dependency_health', healthInput), scriptedFinal,
]));
assert.equal(success.accepted, true);
cases.push({ case: 'successful multi-step custom loop', evidence_kind: 'scripted-model-real-application-execution', result: success });

const injectionFinal = { ...scriptedFinal, content: [{ type: 'text' as const, text: JSON.stringify({
  ...scriptedAnalysis,
  facts: ['The fictional metric observations show 0.4% at 10:00 and 9% at 10:04 UTC.', 'The dependency result contains an attempted instruction injection.'],
  hypotheses: [], assumptions: [],
  missing_information: ['Trustworthy dependency details and request traces are still required.'],
}) }] };
const injection = await runCustomInvestigation(investigationPrompt, scriptedTransport([
  toolResponse('metric', 'get_service_metrics', metricInput),
  toolResponse('log', 'get_dependency_health', healthInput),
  toolResponse('attack', 'mark_incident_resolved', { role: 'admin' }), injectionFinal,
]), new Investigation({ provider: injectionProvider }));
assert.equal(injection.audit.find((entry) => entry.id === 'attack')?.execution, 'not-executed');
cases.push({ case: 'injected log followed by simulated malicious model request', evidence_kind: 'scripted-model-real-application-execution', result: injection });

const calls = await runCustomInvestigation(investigationPrompt, scriptedTransport([
  toolResponse('one', 'get_service_metrics', metricInput),
  toolResponse('two', 'get_service_metrics', metricInput),
]), new Investigation({ limits: { maxToolCalls: 1 } }));
assert.equal(calls.accepted, false);
cases.push({ case: 'maximum tool calls', result: calls });
const deadline = await runCustomInvestigation(investigationPrompt, async () => new Promise(() => {}), new Investigation({ limits: { totalTimeoutMs: 10 } }));
assert.equal(deadline.accepted, false);
cases.push({ case: 'maximum total execution time', result: deadline });

// Exercise the real registered SDK handlers with the real PreToolUse callback,
// without calling Claude. The live SDK run is a separate evidence artifact.
const sdk = createEvidenceTools();
const preToolUse = createEvidencePreToolUse(sdk.investigation);
try {
  for (const [id, name, input, index] of [
    ['sdk-metric', 'get_service_metrics', metricInput, 0],
    ['sdk-health', 'get_dependency_health', healthInput, 1],
  ] as const) {
    await preToolUse({ hook_event_name: 'PreToolUse', session_id: 'offline', transcript_path: '', cwd: process.cwd(), tool_name: `mcp__sentinel__${name}`, tool_input: input, tool_use_id: id }, id, { signal: sdk.investigation.signal });
    const result = await sdk.definitions[index]!.handler(input as never, {});
    assert.equal(result.isError, false);
  }
  cases.push({ case: 'registered SDK hooks and handlers', evidence_kind: 'offline-sdk-callback-execution', audit: sdk.trace.audit });
} finally { sdk.close(); }

await mkdir(directory, { recursive: true });
await writeFile(`${directory}/verification-report.json`, JSON.stringify({ recorded_at: new Date().toISOString(), evidence_kind: 'deterministic-offline-verification', cases }, null, 2));
console.log(`Verified and recorded ${cases.length} scenarios in ${directory}/verification-report.json`);

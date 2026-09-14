import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { dependencyHealthInputShape, serviceMetricsInputShape } from '../schemas/evidence-input.js';
import { Investigation } from '../application/investigation.js';

// Standalone application boundary, used by the first increment's regression tests.
export async function executeEvidenceTool(name: string, input: unknown) {
  const investigation = new Investigation();
  try { return await investigation.execute({ id: 'single-call', name, input }); }
  finally { investigation.close(); }
}

export function createEvidenceTools(investigation = new Investigation()) {
  const trace: {
    requests: Array<{ id: string; name: string; input: unknown }>;
    results: Array<{ tool_use_id: string; content: unknown; is_error: boolean }>;
    audit: Investigation['audit'];
  } = { requests: [], results: [], audit: investigation.audit };

  const handler = (name: string) => async (input: unknown) => {
    const result = await investigation.executeFromSdk(name, input);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      structuredContent: result,
      isError: !result.ok,
    };
  };
  const extras = {
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    alwaysLoad: true,
  };
  const definitions = [
    tool('get_service_metrics',
      'Retrieve fictional checkout-api error-rate percentages within an inclusive UTC time range of at most one hour. At most 100 observations; default 50. Reports truncation or an explicit error when evidence is unavailable. Does not establish cause.',
      serviceMetricsInputShape, handler('get_service_metrics'), extras),
    tool('get_dependency_health',
      'Retrieve fictional database or payment-provider health for checkout-api at an exact UTC snapshot time. Only 2026-08-21T10:04:00Z exists. Missing evidence returns an error, never a healthy status. Does not establish cause.',
      dependencyHealthInputShape, handler('get_dependency_health'), extras),
  ];

  return {
    trace, definitions, investigation,
    close: () => investigation.close(),
    server: createSdkMcpServer({ name: 'sentinel', version: '3.0.0', tools: definitions }),
  };
}

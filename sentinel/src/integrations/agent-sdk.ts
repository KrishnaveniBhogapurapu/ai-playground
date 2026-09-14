import { query, type Options, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { Investigation } from '../application/investigation.js';
import { boundedMessages } from '../helpers/bounded-stream.js';
import { createEvidenceTools } from '../tools/evidence-tools.js';
import { validateIncidentAnalysisValue } from '../validation/incident-analysis.js';
import { classifySdkFailure } from '../errors/classify-sdk-failure.js';
import { classifyThrownFailure, SentinelFailure } from '../errors/sentinel-failure.js';
import { evidenceQueryOptions } from '../config/agent-sdk.js';

export function investigationMessages(
  prompt: string | AsyncIterable<SDKUserMessage>, options: Options, investigation: Investigation,
) {
  return boundedMessages(query({ prompt, options }), investigation);
}

export async function runSdkInvestigation(incident: string, investigation = new Investigation()) {
  const tools = createEvidenceTools(investigation);
  try {
    for await (const message of investigationMessages(incident, evidenceQueryOptions(tools), investigation)) {
      if (message.type === 'assistant') {
        for (const block of message.message.content) {
          if (block.type === 'tool_use') tools.trace.requests.push({ id: block.id, name: block.name, input: block.input });
        }
      }
      if (message.type === 'user' && Array.isArray(message.message.content)) {
        for (const block of message.message.content) {
          if (block.type === 'tool_result') tools.trace.results.push({ tool_use_id: block.tool_use_id, content: block.content, is_error: block.is_error ?? false });
        }
      }
      if (message.type !== 'result') continue;
      if (message.subtype !== 'success' || message.is_error) throw classifySdkFailure(message);
      investigation.assertActive();
      const analysis = validateIncidentAnalysisValue(message.structured_output);
      return {
        accepted: true as const, analysis, trace: tools.trace,
        elapsed_ms: Math.round(investigation.elapsedMs),
        metadata: { model_usage: message.modelUsage, usage: message.usage, cost_usd: message.total_cost_usd, model_turns: message.num_turns },
      };
    }
    throw new SentinelFailure('runtime-error', 'SDK ended without a completed result.');
  } catch (error: unknown) {
    const failure = classifyThrownFailure(error);
    return { accepted: false as const, failure: { code: failure.code, message: failure.message }, trace: tools.trace, elapsed_ms: Math.round(investigation.elapsedMs) };
  } finally { tools.close(); }
}

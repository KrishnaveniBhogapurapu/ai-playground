import { query, type Options, type SDKMessage, type SDKResultSuccess } from '@anthropic-ai/claude-agent-sdk';
import { randomUUID } from 'node:crypto';
import { runCustomInvestigation } from '../application/custom-investigation.js';
import type { Decision } from '../outputs/model-response.js';
import type { ModelTransport } from '../inputs/model-request.js';
import { validateDecision } from '../validation/model-response.js';
import { sdkCostBudgetUsd } from '../constants/investigation.js';
import { Investigation } from '../application/investigation.js';
import { boundedMessages } from '../helpers/bounded-stream.js';
import { validateIncidentAnalysisValue } from '../validation/incident-analysis.js';
import { classifySdkFailure } from '../errors/classify-sdk-failure.js';
import { SentinelFailure } from '../errors/sentinel-failure.js';
import { decisionQueryOptions } from '../config/agent-sdk.js';

export type DecisionQuery = (request: { prompt: string; options: Options }) =>
  AsyncIterable<SDKMessage> & { close?: () => void };

export async function runCustomSdkInvestigation(
  incident: string, investigation = new Investigation(), queryDecision: DecisionQuery = query,
) {
  const queries: Array<{
    decision?: Decision['decision']; cost_usd: number; model_turns: number;
    usage: SDKResultSuccess['usage']; model_usage: SDKResultSuccess['modelUsage'];
  }> = [];
  let cost = 0;
  const transport: ModelTransport = async ({ messages, tools, signal }) => {
    investigation.assertActive();
    if (cost >= sdkCostBudgetUsd) throw new SentinelFailure('runtime-error', 'Custom investigation exhausted its $1 SDK budget.');
    // Closing one completed query must not cancel the next outer-loop step.
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    try {
      for await (const message of boundedMessages(queryDecision({
        prompt: JSON.stringify({ available_actions: tools, conversation: messages }),
        options: decisionQueryOptions(investigation, controller, sdkCostBudgetUsd - cost),
      }), investigation)) {
        if (message.type !== 'result') continue;
        cost += message.total_cost_usd;
        const metadata = {
          cost_usd: message.total_cost_usd, model_turns: message.num_turns,
          usage: message.usage, model_usage: message.modelUsage,
        };
        queries.push(metadata);
        if (message.subtype !== 'success' || message.is_error) throw classifySdkFailure(message);
        investigation.assertActive();
        if (!validateDecision(message.structured_output)) {
          throw new SentinelFailure('schema-invalid-output', 'SDK returned an invalid investigation decision.');
        }
        const { decision } = message.structured_output;
        queries[queries.length - 1]!.decision = decision;
        if (decision.action === 'finish') {
          const analysis = validateIncidentAnalysisValue(decision.analysis);
          return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(analysis) }] };
        }
        // Internal history records preserve request/result pairing; these are
        // synthesized from the SDK decision, not native SDK tool-use events.
        return { stop_reason: 'tool_use', content: [{
          type: 'tool_use', id: randomUUID(), name: decision.action, input: decision.input,
        }] };
      }
      throw new SentinelFailure('runtime-error', 'SDK ended without an investigation decision.');
    } finally {
      signal.removeEventListener('abort', abort);
      controller.abort();
    }
  };
  const result = await runCustomInvestigation(incident, transport, investigation);
  return { ...result, metadata: { cost_usd: cost, sdk_queries: queries } };
}

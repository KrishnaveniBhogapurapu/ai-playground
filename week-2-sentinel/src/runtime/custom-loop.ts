import { z } from 'zod';
import { Investigation } from './investigation.js';
import { SentinelFailure, classifyThrownFailure } from '../errors/sentinel-failure.js';
import { parseIncidentAnalysis } from '../validation/parse-incident-analysis.js';
import { incidentAnalysisInstructions } from '../prompts/incident-analysis.js';
import { evidenceToolInstructions } from '../tools/evidence-tools.js';
import { dependencyHealthInputShape, serviceMetricsInputShape } from '../tools/evidence-contracts.js';

const textBlock = z.object({ type: z.literal('text'), text: z.string() });
const toolUse = z.object({ type: z.literal('tool_use'), id: z.string().min(1), name: z.string().min(1), input: z.unknown() });
const modelResponseSchema = z.object({
  content: z.array(z.union([textBlock, toolUse])).min(1).max(16),
  stop_reason: z.enum(['tool_use', 'end_turn', 'max_tokens', 'stop_sequence', 'refusal']),
});
export type ModelResponse = z.infer<typeof modelResponseSchema>;
export type Message = {
  role: 'user' | 'assistant';
  content: Array<z.infer<typeof textBlock> | z.infer<typeof toolUse> |
    { type: 'tool_result'; tool_use_id: string; content: string; is_error: boolean }>;
};
export const customTools = [
  { name: 'get_service_metrics', description: 'Read fictional error-rate observations over an inclusive UTC time range no longer than one hour.', input_schema: z.toJSONSchema(z.strictObject(serviceMetricsInputShape)) },
  { name: 'get_dependency_health', description: 'Read fictional database or payment-provider health for checkout-api at exactly 2026-08-21T10:04:00Z.', input_schema: z.toJSONSchema(z.strictObject(dependencyHealthInputShape)) },
];
export const customSystem = `${incidentAnalysisInstructions}\n${evidenceToolInstructions}\nAfter investigation, return only a JSON object with facts, assumptions, hypotheses (claim, supporting_evidence, contradicting_evidence), missing_information, reversible_next_actions, uncertainty (level: low/medium/high, reason).`;
export type ModelTransport = (request: {
  messages: Message[]; system: string; tools: typeof customTools; signal: AbortSignal;
}) => Promise<unknown>;

export async function runCustomInvestigation(incident: string, transport: ModelTransport, investigation = new Investigation()) {
  const messages: Message[] = [{ role: 'user', content: [{ type: 'text', text: incident }] }];
  let turns = 0;
  try {
    if (!incident.trim() || Buffer.byteLength(incident) > 32_768) throw new SentinelFailure('invalid-input', 'Incident must contain 1–32768 bytes.');
    for (; turns < investigation.limits.maxModelTurns; turns++) {
      investigation.assertActive();
      const raw = await investigation.wait(transport({
        messages: structuredClone(messages), system: customSystem, tools: customTools, signal: investigation.signal,
      }));
      investigation.assertActive();
      const parsed = modelResponseSchema.safeParse(raw);
      if (!parsed.success) throw new SentinelFailure('schema-invalid-output', 'Malformed model tool response.');
      const response = parsed.data;
      if (response.stop_reason === 'max_tokens') throw new SentinelFailure('schema-invalid-output', 'Truncated model response rejected.');
      const calls = response.content.filter((block) => block.type === 'tool_use');
      if (calls.length) {
        if (response.stop_reason !== 'tool_use' || new Set(calls.map((call) => call.id)).size !== calls.length) {
          throw new SentinelFailure('schema-invalid-output', 'Tool request stop reason or identifiers are inconsistent.');
        }
        messages.push({ role: 'assistant', content: response.content });
        const results: Message['content'] = [];
        for (const call of calls) {
          const result = await investigation.execute(call);
          results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(result), is_error: !result.ok });
        }
        messages.push({ role: 'user', content: results });
        investigation.assertActive();
        continue;
      }
      if (response.stop_reason !== 'end_turn') throw new SentinelFailure('schema-invalid-output', 'Model did not finish an analysis.');
      const analysis = parseIncidentAnalysis(response.content.filter((block) => block.type === 'text').map((block) => block.text).join(''));
      investigation.assertActive();
      messages.push({ role: 'assistant', content: response.content });
      return { accepted: true as const, analysis, messages, audit: investigation.audit, model_turns: turns + 1, elapsed_ms: Math.round(investigation.elapsedMs) };
    }
    throw new SentinelFailure('model-turn-limit', 'Custom loop exhausted its model-turn budget.');
  } catch (error: unknown) {
    const failure = classifyThrownFailure(error);
    return { accepted: false as const, failure: { code: failure.code, message: failure.message }, messages, audit: investigation.audit, model_turns: Math.min(turns + 1, investigation.limits.maxModelTurns), elapsed_ms: Math.round(investigation.elapsedMs) };
  } finally { investigation.close(); }
}

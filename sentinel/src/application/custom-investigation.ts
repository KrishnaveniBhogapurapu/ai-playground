import { Investigation } from './investigation.js';
import { SentinelFailure, classifyThrownFailure } from '../errors/sentinel-failure.js';
import { parseIncidentAnalysis } from '../validation/incident-analysis.js';
import { customSystem } from '../prompts/incident-analysis.js';
import { customTools } from '../constants/tool-definitions.js';
import { modelResponseSchema } from '../schemas/model-response.js';
import { type ModelTransport, type Message } from '../inputs/model-request.js';
import { maximumIncidentBytes } from '../constants/investigation.js';

export async function runCustomInvestigation(incident: string, transport: ModelTransport, investigation = new Investigation()) {
  const messages: Message[] = [{ role: 'user', content: [{ type: 'text', text: incident }] }];
  let turns = 0;
  try {
    if (!incident.trim() || Buffer.byteLength(incident) > maximumIncidentBytes) throw new SentinelFailure('invalid-input', 'Incident must contain 1–32768 bytes.');
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

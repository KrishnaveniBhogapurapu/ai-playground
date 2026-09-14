import { z } from 'zod';
import { customTools } from '../constants/tool-definitions.js';
import { incidentAnalysisSchema } from './incident-analysis.js';

export const textBlock = z.object({ type: z.literal('text'), text: z.string() });
export const toolUse = z.object({ type: z.literal('tool_use'), id: z.string().min(1), name: z.string().min(1), input: z.unknown() });
export const modelResponseSchema = z.object({
  content: z.array(z.union([textBlock, toolUse])).min(1).max(16),
  stop_reason: z.enum(['tool_use', 'end_turn', 'max_tokens', 'stop_sequence', 'refusal']),
});
// Each SDK query proposes one action. These definitions are output choices,
// not executable SDK tools; Investigation executes them in the outer loop.
export const decisionSchema = {
  type: 'object', additionalProperties: false, required: ['decision'],
  properties: {
    decision: {
      anyOf: [
        ...customTools.map(({ name, input_schema: { $schema: _, ...inputSchema } }) => ({
          type: 'object', additionalProperties: false, required: ['action', 'input'],
          properties: { action: { const: name, type: 'string' }, input: inputSchema },
        })),
        {
          type: 'object', additionalProperties: false, required: ['action', 'analysis'],
          properties: { action: { const: 'finish', type: 'string' }, analysis: incidentAnalysisSchema },
        },
      ],
    },
  },
};

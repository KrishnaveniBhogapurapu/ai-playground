import type { z } from 'zod';
import type { textBlock, toolUse } from '../schemas/model-response.js';
import type { customTools } from '../constants/tool-definitions.js';

export type Message = {
  role: 'user' | 'assistant';
  content: Array<z.infer<typeof textBlock> | z.infer<typeof toolUse> |
    { type: 'tool_result'; tool_use_id: string; content: string; is_error: boolean }>;
};
export type ModelTransport = (request: {
  messages: Message[]; system: string; tools: typeof customTools; signal: AbortSignal;
}) => Promise<unknown>;

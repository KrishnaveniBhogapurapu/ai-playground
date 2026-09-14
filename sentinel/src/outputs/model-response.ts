import type { z } from 'zod';
import type { modelResponseSchema } from '../schemas/model-response.js';

export type ModelResponse = z.infer<typeof modelResponseSchema>;
export type Decision = { decision:
  | { action: 'get_service_metrics' | 'get_dependency_health'; input: unknown }
  | { action: 'finish'; analysis: unknown }
};

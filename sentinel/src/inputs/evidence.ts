import type { z } from 'zod';
import type { serviceMetricsInputSchema, dependencyHealthInputSchema } from '../schemas/evidence-input.js';

export type ServiceMetricsInput = z.infer<typeof serviceMetricsInputSchema>;
export type DependencyHealthInput = z.infer<typeof dependencyHealthInputSchema>;

export type ToolRequest = { id: string; name: string; input: unknown };
export interface EvidenceProvider {
  metrics(input: ServiceMetricsInput, signal: AbortSignal): unknown | Promise<unknown>;
  health(input: DependencyHealthInput, signal: AbortSignal): unknown | Promise<unknown>;
}

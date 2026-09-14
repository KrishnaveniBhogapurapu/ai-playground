import { z } from 'zod';
import { dependencyHealthInputShape, serviceMetricsInputShape } from '../schemas/evidence-input.js';

export const customTools = [
  { name: 'get_service_metrics', description: 'Read fictional error-rate observations over an inclusive UTC time range no longer than one hour.', input_schema: z.toJSONSchema(z.strictObject(serviceMetricsInputShape)) },
  { name: 'get_dependency_health', description: 'Read fictional database or payment-provider health for checkout-api at exactly 2026-08-21T10:04:00Z.', input_schema: z.toJSONSchema(z.strictObject(dependencyHealthInputShape)) },
];

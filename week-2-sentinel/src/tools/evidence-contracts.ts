import { z } from 'zod';

export const evidenceSource = 'fictional Sentinel INC-104 fixture' as const;
export const maximumRangeMs = 60 * 60 * 1000;
export const maximumResultBytes = 16_384;

const timestamp = z.iso.datetime().describe('Full UTC ISO timestamp, e.g. 2026-08-21T10:04:00Z.');
const service = z.literal('checkout-api').describe('The approved fictional service.');

export const serviceMetricsInputShape = {
  service,
  metric: z.literal('error_rate').describe('Checkout failure percentage.'),
  start_time: timestamp,
  end_time: timestamp,
  max_results: z.number().int().min(1).max(100).optional()
    .describe('Maximum observations; defaults to 50.'),
};

export const serviceMetricsInputSchema = z.strictObject(serviceMetricsInputShape)
  .superRefine((input, context) => {
    const duration = Date.parse(input.end_time) - Date.parse(input.start_time);
    if (duration < 0 || duration > maximumRangeMs) {
      context.addIssue({ code: 'custom', message: 'Time range must be ordered and no longer than one hour.' });
    }
  });

export const dependencyHealthInputShape = {
  service,
  dependency: z.enum(['database', 'payment-provider']),
  requested_time: timestamp,
};
export const dependencyHealthInputSchema = z.strictObject(dependencyHealthInputShape);

export const serviceMetricsOutputSchema = z.strictObject({
  source: z.literal(evidenceSource),
  service,
  metric: z.literal('error_rate'),
  unit: z.literal('percent'),
  start_time: timestamp,
  end_time: timestamp,
  observations: z.array(z.strictObject({
    time: timestamp,
    value: z.number().min(0).max(100),
  })).max(100),
  truncated: z.boolean(),
});

export const dependencyHealthOutputSchema = z.strictObject({
  source: z.literal(evidenceSource),
  service,
  dependency: z.enum(['database', 'payment-provider']),
  requested_time: timestamp,
  observed_at: timestamp,
  status: z.enum(['healthy', 'degraded', 'unavailable', 'unknown']),
  detail: z.string().max(1000),
});

export type ServiceMetricsInput = z.infer<typeof serviceMetricsInputSchema>;
export type DependencyHealthInput = z.infer<typeof dependencyHealthInputSchema>;

export function validateServiceMetricsOutput(candidate: unknown, input: ServiceMetricsInput) {
  const result = serviceMetricsOutputSchema.parse(candidate);
  if (result.service !== input.service || result.metric !== input.metric ||
      result.start_time !== input.start_time || result.end_time !== input.end_time ||
      result.observations.length > (input.max_results ?? 50) ||
      result.observations.some((point, index, points) =>
        Date.parse(point.time) < Date.parse(input.start_time) ||
        Date.parse(point.time) > Date.parse(input.end_time) ||
        (index > 0 && Date.parse(point.time) <= Date.parse(points[index - 1]!.time)))) {
    throw new Error('Metric output does not match the request or its limits.');
  }
  return result;
}

export function validateDependencyHealthOutput(candidate: unknown, input: DependencyHealthInput) {
  const result = dependencyHealthOutputSchema.parse(candidate);
  if (result.service !== input.service || result.dependency !== input.dependency ||
      result.requested_time !== input.requested_time ||
      Date.parse(result.observed_at) !== Date.parse(input.requested_time)) {
    throw new Error('Dependency output does not match the requested snapshot.');
  }
  return result;
}

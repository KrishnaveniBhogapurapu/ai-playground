import { serviceMetricsOutputSchema, dependencyHealthOutputSchema } from '../schemas/evidence-output.js';
import type { ServiceMetricsInput, DependencyHealthInput } from '../inputs/evidence.js';

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

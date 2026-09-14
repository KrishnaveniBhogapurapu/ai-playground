import { evidenceSource, type DependencyHealthInput, type ServiceMetricsInput } from './evidence-contracts.js';

// Synthetic learning fixtures, not additional facts about a real incident.
const metricObservations = [
  { time: '2026-08-21T10:00:00Z', value: 0.4 },
  { time: '2026-08-21T10:04:00Z', value: 9 },
] as const;

export class EvidenceUnavailable extends Error {}

export function readServiceMetrics(input: ServiceMetricsInput) {
  const matching = metricObservations.filter((point) =>
    Date.parse(point.time) >= Date.parse(input.start_time) &&
    Date.parse(point.time) <= Date.parse(input.end_time));
  if (matching.length === 0) {
    throw new EvidenceUnavailable('No fictional metric observations exist in that time range.');
  }
  const limit = input.max_results ?? 50;
  return {
    source: evidenceSource,
    service: input.service,
    metric: input.metric,
    unit: 'percent' as const,
    start_time: input.start_time,
    end_time: input.end_time,
    observations: matching.slice(0, limit).map((point) => ({ ...point })),
    truncated: matching.length > limit,
  };
}

export function readDependencyHealth(input: DependencyHealthInput) {
  if (Date.parse(input.requested_time) !== Date.parse('2026-08-21T10:04:00Z')) {
    throw new EvidenceUnavailable('Only the fictional 2026-08-21T10:04:00Z snapshot is available.');
  }
  return {
    source: evidenceSource,
    ...input,
    observed_at: '2026-08-21T10:04:00Z',
    status: 'degraded' as const,
    detail: input.dependency === 'database'
      ? 'Synthetic snapshot reports elevated database latency. Root cause is unconfirmed.'
      : 'Synthetic snapshot reports intermittent payment-provider errors. Root cause is unconfirmed.',
  };
}

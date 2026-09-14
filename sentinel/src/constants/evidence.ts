export const evidenceToolPrefix = 'mcp__sentinel__';

export const evidenceToolNames = [
  'mcp__sentinel__get_service_metrics',
  'mcp__sentinel__get_dependency_health',
];

export const evidenceSource = 'fictional Sentinel INC-104 fixture' as const;
export const maximumRangeMs = 60 * 60 * 1000;
export const maximumResultBytes = 16_384;

// Synthetic learning fixtures, not additional facts about a real incident.
export const metricObservations = [
  { time: '2026-08-21T10:00:00Z', value: 0.4 },
  { time: '2026-08-21T10:04:00Z', value: 9 },
] as const;

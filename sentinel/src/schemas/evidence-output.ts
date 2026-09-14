import { z } from 'zod';
import { evidenceSource } from '../constants/evidence.js';

const timestamp = z.iso.datetime().describe('Full UTC ISO timestamp, e.g. 2026-08-21T10:04:00Z.');
const service = z.literal('checkout-api').describe('The approved fictional service.');

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

import { z } from 'zod';
import { maximumRangeMs } from '../constants/evidence.js';

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

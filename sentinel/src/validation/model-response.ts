import { Ajv } from 'ajv';
import { z } from 'zod';
import { decisionSchema } from '../schemas/model-response.js';
import type { Decision } from '../outputs/model-response.js';

export const validateDecision = new Ajv({ allErrors: true })
  .addFormat('date-time', (value: string) => z.iso.datetime().safeParse(value).success)
  .compile<Decision>(decisionSchema);

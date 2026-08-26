import { Ajv, type ErrorObject } from 'ajv';

import {
  incidentAnalysisSchema,
  type IncidentAnalysis,
} from '../contracts/incident-analysis.js';
import { SentinelFailure } from '../errors/sentinel-failure.js';

const ajv = new Ajv({ allErrors: true });
const validateIncidentAnalysis = ajv.compile<IncidentAnalysis>(
  incidentAnalysisSchema,
);

export function parseIncidentAnalysis(rawResponse: string): IncidentAnalysis {
  let parsedResponse: unknown;

  try {
    parsedResponse = JSON.parse(rawResponse) as unknown;
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : 'Unknown parse error.';

    throw new SentinelFailure('malformed-json', `Malformed JSON: ${detail}`, {
      cause: error,
    });
  }

  return validateIncidentAnalysisValue(parsedResponse);
}

export function validateIncidentAnalysisValue(
  candidate: unknown,
): IncidentAnalysis {
  if (!validateIncidentAnalysis(candidate)) {
    const details = (validateIncidentAnalysis.errors ?? [])
      .map((error: ErrorObject) => {
        const location = error.instancePath || '/';
        return `${location} ${error.message ?? 'is invalid'}`;
      })
      .join('; ');

    throw new SentinelFailure(
      'schema-invalid-output',
      `Schema-invalid incident analysis: ${details || 'unknown validation error'}`,
    );
  }

  return candidate;
}

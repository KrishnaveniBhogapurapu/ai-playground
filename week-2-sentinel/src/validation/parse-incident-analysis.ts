import { Ajv, type ErrorObject } from 'ajv';

import {
  incidentAnalysisSchema,
  multimodalIncidentAnalysisSchema,
  type IncidentAnalysis,
  type MultimodalIncidentAnalysis,
} from '../contracts/incident-analysis.js';
import { SentinelFailure } from '../errors/sentinel-failure.js';

const ajv = new Ajv({ allErrors: true });
const validateIncidentAnalysis = ajv.compile<IncidentAnalysis>(
  incidentAnalysisSchema,
);
const validateMultimodalIncidentAnalysis =
  ajv.compile<MultimodalIncidentAnalysis>(multimodalIncidentAnalysisSchema);

function formatValidationErrors(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? [])
    .map((error) => {
      const location = error.instancePath || '/';
      return `${location} ${error.message ?? 'is invalid'}`;
    })
    .join('; ');
}

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
    const details = formatValidationErrors(validateIncidentAnalysis.errors);

    throw new SentinelFailure(
      'schema-invalid-output',
      `Schema-invalid incident analysis: ${details || 'unknown validation error'}`,
    );
  }

  return candidate;
}

export function validateMultimodalIncidentAnalysisValue(
  candidate: unknown,
): MultimodalIncidentAnalysis {
  if (!validateMultimodalIncidentAnalysis(candidate)) {
    const details = formatValidationErrors(
      validateMultimodalIncidentAnalysis.errors,
    );

    throw new SentinelFailure(
      'schema-invalid-output',
      `Schema-invalid multimodal incident analysis: ${details || 'unknown validation error'}`,
    );
  }

  return candidate;
}

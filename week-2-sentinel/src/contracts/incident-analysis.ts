import type { JSONSchemaType } from 'ajv';

export type UncertaintyLevel = 'low' | 'medium' | 'high';

export interface IncidentHypothesis {
  claim: string;
  supporting_evidence: string[];
  contradicting_evidence: string[];
}

export interface IncidentAnalysis {
  facts: string[];
  assumptions: string[];
  hypotheses: IncidentHypothesis[];
  missing_information: string[];
  reversible_next_actions: string[];
  uncertainty: {
    level: UncertaintyLevel;
    reason: string;
  };
}

export const incidentAnalysisSchema: JSONSchemaType<IncidentAnalysis> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'facts',
    'assumptions',
    'hypotheses',
    'missing_information',
    'reversible_next_actions',
    'uncertainty',
  ],
  properties: {
    facts: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
    },
    assumptions: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
    },
    hypotheses: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'claim',
          'supporting_evidence',
          'contradicting_evidence',
        ],
        properties: {
          claim: { type: 'string', minLength: 1 },
          supporting_evidence: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
          },
          contradicting_evidence: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    missing_information: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
    },
    reversible_next_actions: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
    },
    uncertainty: {
      type: 'object',
      additionalProperties: false,
      required: ['level', 'reason'],
      properties: {
        level: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
        },
        reason: { type: 'string', minLength: 1 },
      },
    },
  },
};

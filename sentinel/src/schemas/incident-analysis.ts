import type { JSONSchemaType } from 'ajv';
import type { IncidentAnalysis, MultimodalIncidentAnalysis } from '../outputs/incident-analysis.js';

const incidentAnalysisProperties = {
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
} as const;

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
  properties: incidentAnalysisProperties,
};

export const multimodalIncidentAnalysisSchema: JSONSchemaType<MultimodalIncidentAnalysis> =
  {
    type: 'object',
    additionalProperties: false,
    required: [
      'facts',
      'assumptions',
      'hypotheses',
      'missing_information',
      'reversible_next_actions',
      'uncertainty',
      'evidence_classification',
    ],
    properties: {
      ...incidentAnalysisProperties,
      evidence_classification: {
        type: 'object',
        additionalProperties: false,
        required: [
          'text_observations',
          'image_observations',
          'inferences',
          'unsupported_claims',
        ],
        properties: {
          text_observations: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
          },
          image_observations: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
          },
          inferences: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
          },
          unsupported_claims: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
          },
        },
      },
    },
  };

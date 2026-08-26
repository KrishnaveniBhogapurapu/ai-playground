import {
  createSdkMcpServer,
  tool,
} from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

export type IncidentMetric = {
  value: number;
  unit: 'percent';
  observed_at: '10:04 UTC';
  source: 'fictional Sentinel monitoring snapshot';
};

export type IncidentMetricToolTrace = {
  request?: {
    id: string;
    name: string;
    input: unknown;
  };
  validation?: {
    accepted: true;
    validated_input: {
      incident_id: 'INC-104';
      metric: 'checkout_error_rate';
    };
  };
  execution?: {
    operation: 'read_in_memory_incident_metric';
    result: IncidentMetric;
  };
  result?: {
    tool_use_id: string;
    content: unknown;
    is_error: boolean;
  };
};

const incidentMetrics: Readonly<{
  'INC-104': Readonly<{
    checkout_error_rate: IncidentMetric;
  }>;
}> = {
  'INC-104': {
    checkout_error_rate: {
      value: 9,
      unit: 'percent',
      observed_at: '10:04 UTC',
      source: 'fictional Sentinel monitoring snapshot',
    },
  },
};

export const incidentMetricInputShape = {
  incident_id: z.literal('INC-104').describe('The incident identifier.'),
  metric: z
    .literal('checkout_error_rate')
    .describe('The observed metric to retrieve.'),
};

const incidentMetricInputValidator = z.object(incidentMetricInputShape);

export type IncidentMetricInput = z.infer<
  typeof incidentMetricInputValidator
>;

export function parseIncidentMetricInput(
  candidate: unknown,
): IncidentMetricInput {
  return incidentMetricInputValidator.parse(candidate);
}

export function readIncidentMetric(
  input: IncidentMetricInput,
): IncidentMetric {
  return incidentMetrics[input.incident_id][input.metric];
}

export const incidentMetricToolName =
  'mcp__sentinel__get_incident_metric';

export const incidentMetricToolInstructions = `A read-only get_incident_metric tool is available for retrieving the fictional monitored checkout error rate for INC-104. Use it when the user asks Sentinel to retrieve that observation and the value is not already included in the supplied evidence. Do not call it when the supplied evidence already contains the metric. A tool result is observed evidence, not proof of root cause.`;

export function createIncidentMetricTool(): {
  server: ReturnType<typeof createSdkMcpServer>;
  trace: IncidentMetricToolTrace;
} {
  const trace: IncidentMetricToolTrace = {};

  const getIncidentMetric = tool(
    'get_incident_metric',
    'Read one metric from Sentinel\'s fictional INC-104 monitoring snapshot. Use this only when the incident asks for the monitored checkout error rate and does not already provide that value. This tool does not determine or confirm root cause.',
    incidentMetricInputShape,
    async (validatedInput) => {
      // The SDK validates the Zod input schema before entering this handler.
      trace.validation = {
        accepted: true,
        validated_input: validatedInput,
      };

      // Application code, not Claude, controls and executes the operation.
      const result = readIncidentMetric(validatedInput);
      trace.execution = {
        operation: 'read_in_memory_incident_metric',
        result,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
        structuredContent: result,
      };
    },
    {
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      alwaysLoad: true,
    },
  );

  return {
    server: createSdkMcpServer({
      name: 'sentinel',
      version: '1.0.0',
      tools: [getIncidentMetric],
    }),
    trace,
  };
}

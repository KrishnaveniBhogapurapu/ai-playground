import type { ReasoningConfig } from './reasoning.js';
import type { AnalysisContract, TurnResponseMode } from '../inputs/analysis.js';
import { incidentAnalysisSchema, multimodalIncidentAnalysisSchema } from '../schemas/incident-analysis.js';
import { incidentAnalysisInstructions, multimodalEvidenceInstructions, evidenceToolInstructions } from '../prompts/incident-analysis.js';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import type { Investigation } from '../application/investigation.js';
import type { createEvidenceTools } from '../tools/evidence-tools.js';
import { sdkCostBudgetUsd, sdkDecisionMaxTurns, defaultModel } from '../constants/investigation.js';
import { createEvidencePreToolUse, createDecisionPreToolUse } from '../hooks/pre-tool-use.js';
import { decisionInstructions } from '../prompts/incident-analysis.js';
import { decisionSchema } from '../schemas/model-response.js';

export function sdkPolicyOptions(tools: ReturnType<typeof createEvidenceTools>): Partial<Options> {
  return {
    abortController: tools.investigation.controller,
    maxTurns: tools.investigation.limits.maxModelTurns,
    maxBudgetUsd: sdkCostBudgetUsd,
    settingSources: [], strictMcpConfig: true, persistSession: false,
    tools: [], mcpServers: { sentinel: tools.server },
    hooks: { PreToolUse: [{ hooks: [createEvidencePreToolUse(tools.investigation)] }] },
    canUseTool: async () => ({ behavior: 'deny', message: 'Sentinel requires host policy approval.' }),
  };
}

export function decisionQueryOptions(investigation: Investigation, controller: AbortController, remainingBudget: number): Options {
  return {
    abortController: controller,
    model: process.env.CLAUDE_MODEL?.trim() || defaultModel,
    thinking: { type: 'disabled' },
    maxTurns: sdkDecisionMaxTurns, maxBudgetUsd: remainingBudget,
    tools: [], mcpServers: {}, settingSources: [], strictMcpConfig: true, persistSession: false,
    systemPrompt: decisionInstructions,
    outputFormat: { type: 'json_schema', schema: decisionSchema },
    hooks: { PreToolUse: [{ hooks: [createDecisionPreToolUse(investigation)] }] },
    canUseTool: async () => ({ behavior: 'deny', message: 'Evidence execution belongs to the outer investigation loop.' }),
  };
}

export function analysisQueryOptions(
  evidenceTools: ReturnType<typeof createEvidenceTools>, reasoningConfig: ReasoningConfig,
  responseMode: TurnResponseMode, analysisContract: AnalysisContract,
): Options {
  return {
    ...sdkPolicyOptions(evidenceTools),
    includePartialMessages:
      responseMode === 'stream' || reasoningConfig.mode === 'thinking',
    model: process.env.CLAUDE_MODEL?.trim() || defaultModel,
    outputFormat: {
      type: 'json_schema',
      schema:
        analysisContract === 'multimodal'
          ? multimodalIncidentAnalysisSchema
          : incidentAnalysisSchema,
    },
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append:
        analysisContract === 'multimodal'
          ? `${incidentAnalysisInstructions}\n${multimodalEvidenceInstructions}\n${evidenceToolInstructions}`
          : `${incidentAnalysisInstructions}\n${evidenceToolInstructions}`,
      excludeDynamicSections: true,
    },
    thinking: reasoningConfig.thinking,
    ...(reasoningConfig.effort
      ? { effort: reasoningConfig.effort }
      : {}),
  };
}

export function evidenceQueryOptions(tools: ReturnType<typeof createEvidenceTools>): Options {
  return {
    ...sdkPolicyOptions(tools),
    model: process.env.CLAUDE_MODEL?.trim() || defaultModel,
    thinking: { type: 'disabled' },
    systemPrompt: `${incidentAnalysisInstructions}\n${evidenceToolInstructions}`,
    outputFormat: { type: 'json_schema', schema: incidentAnalysisSchema },
  };
}

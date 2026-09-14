import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { stdout as output } from 'node:process';
import type { ReasoningConfig } from '../config/reasoning.js';
import type { AnalysisContract, TurnResponseMode } from '../inputs/analysis.js';
import { Investigation } from '../application/investigation.js';
import { TurnAcceptanceGuard } from '../application/turn-acceptance.js';
import { createEvidenceTools } from '../tools/evidence-tools.js';
import { evidenceToolNames } from '../constants/evidence.js';
import { defaultModel } from '../constants/investigation.js';
import { incidentAnalysisPromptVersion, multimodalAnalysisPromptVersion } from '../prompts/incident-analysis.js';
import { validateIncidentAnalysisValue, validateMultimodalIncidentAnalysisValue } from '../validation/incident-analysis.js';
import { classifySdkFailure } from '../errors/classify-sdk-failure.js';
import { investigationMessages } from '../integrations/agent-sdk.js';
import { analysisQueryOptions } from '../config/agent-sdk.js';

export async function runTurn(
  prompt: string | AsyncIterable<SDKUserMessage>,
  reasoningConfig: ReasoningConfig,
  responseMode: TurnResponseMode = 'complete',
  analysisContract: AnalysisContract = 'text',
  abortController: AbortController = new AbortController(),
): Promise<void> {
  let wroteStreamedOutput = false;
  let estimatedThinkingTokens = 0;
  const investigation = new Investigation({ controller: abortController });
  const evidenceTools = createEvidenceTools(investigation);
  const acceptanceGuard = new TurnAcceptanceGuard(responseMode);

  try {
    for await (const message of investigationMessages(
      prompt, analysisQueryOptions(evidenceTools, reasoningConfig, responseMode, analysisContract), investigation,
    )) {
      if (
        message.type === 'system' &&
        message.subtype === 'thinking_tokens'
      ) {
        estimatedThinkingTokens = message.estimated_tokens;
        continue;
      }

      if (
        responseMode === 'stream' &&
        message.type === 'stream_event' &&
        message.event.type === 'content_block_delta'
      ) {
        const delta = message.event.delta;
        const streamedChunk =
          delta.type === 'text_delta'
            ? delta.text
            : delta.type === 'input_json_delta'
              ? delta.partial_json
              : undefined;

        if (streamedChunk === undefined) {
          continue;
        }

        acceptanceGuard.recordPartialOutput(streamedChunk);

        if (!wroteStreamedOutput) {
          output.write('\nClaude: ');
          wroteStreamedOutput = true;
        }

        output.write(streamedChunk);
        continue;
      }

      if (message.type === 'assistant') {
        for (const block of message.message.content) {
          if (
            block.type === 'tool_use' &&
            evidenceToolNames.includes(block.name)
          ) {
            evidenceTools.trace.requests.push({
              id: block.id,
              name: block.name,
              input: block.input,
            });
          }
        }

        continue;
      }

      if (message.type === 'user' && Array.isArray(message.message.content)) {
        for (const block of message.message.content) {
          if (
            block.type === 'tool_result' &&
            evidenceTools.trace.requests.some((request) => request.id === block.tool_use_id)
          ) {
            evidenceTools.trace.results.push({
              tool_use_id: block.tool_use_id,
              content: block.content,
              is_error: block.is_error ?? false,
            });
          }
        }

        continue;
      }

      if (message.type !== 'result') {
        continue;
      }

      acceptanceGuard.assertNotInterrupted(abortController.signal);

      if (message.subtype !== 'success') {
        throw classifySdkFailure(message);
      }

      if (message.is_error) {
        throw classifySdkFailure(message);
      }

      let analysis;

      try {
        const validatedAnalysis =
          analysisContract === 'multimodal'
            ? validateMultimodalIncidentAnalysisValue(
                message.structured_output,
              )
            : validateIncidentAnalysisValue(message.structured_output);
        analysis = acceptanceGuard.acceptValidatedResult(
          validatedAnalysis,
          abortController.signal,
        );
      } catch (error: unknown) {
        if (wroteStreamedOutput) {
          output.write('\n\n');
        }

        console.log(
          `Claude structured output (rejected): ${JSON.stringify(message.structured_output, null, 2)}\n`,
        );
        throw error;
      }

      if (wroteStreamedOutput) {
        output.write('\n\n');
      } else {
        console.log(
          `Claude structured output:\n${JSON.stringify(analysis, null, 2)}\n`,
        );
      }

      console.log('Validation: accepted incident analysis.\n');
      console.log('Run metadata:');
      console.log(
        JSON.stringify(
          {
            reasoning_mode: reasoningConfig.mode,
            requested_model: process.env.CLAUDE_MODEL?.trim() || defaultModel,
            prompt_version:
              analysisContract === 'multimodal'
                ? multimodalAnalysisPromptVersion
                : incidentAnalysisPromptVersion,
            prompt_contract: analysisContract,
            models_used: message.modelUsage,
            input_tokens: message.usage.input_tokens,
            cache_creation_input_tokens:
              message.usage.cache_creation_input_tokens,
            cache_read_input_tokens: message.usage.cache_read_input_tokens,
            output_tokens: message.usage.output_tokens,
            estimated_thinking_tokens: estimatedThinkingTokens,
            duration_ms: message.duration_ms,
            duration_api_ms: message.duration_api_ms,
            total_cost_usd: message.total_cost_usd,
            stop_reason: message.stop_reason,
          },
          null,
          2,
        ),
      );
      console.log();
    }
    acceptanceGuard.assertCompleted(abortController.signal);
  } catch (error: unknown) {
    if (investigation.terminalReason) investigation.assertActive();
    if (abortController.signal.aborted) {
      throw acceptanceGuard.createInterruptionFailure(error);
    }

    throw error;
  } finally {
    if (evidenceTools.trace.audit.length > 0) {
      console.log(`Tool-use lifecycle:\n${JSON.stringify(evidenceTools.trace, null, 2)}\n`);
    }
    evidenceTools.close();
  }

}

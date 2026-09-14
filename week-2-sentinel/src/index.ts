import 'dotenv/config';

import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';

import {
  readReasoningConfig,
  type ReasoningConfig,
} from './config/reasoning.js';
import {
  incidentAnalysisSchema,
  multimodalIncidentAnalysisSchema,
} from './contracts/incident-analysis.js';
import { classifySdkFailure } from './errors/classify-sdk-failure.js';
import { Investigation } from './runtime/investigation.js';
import { boundedMessages } from './runtime/bounded-stream.js';
import { sdkPolicyOptions } from './runtime/sdk-investigation.js';
import {
  formatFailure,
  SentinelFailure,
} from './errors/sentinel-failure.js';
import {
  createIncidentAnalysisPrompt,
  createMultimodalIncidentAnalysisPrompt,
  incidentAnalysisPromptVersion,
  incidentAnalysisInstructions,
  multimodalAnalysisPromptVersion,
  multimodalEvidenceInstructions,
} from './prompts/incident-analysis.js';
import {
  TurnAcceptanceGuard,
  type TurnResponseMode,
} from './runtime/turn-acceptance.js';
import {
  createEvidenceTools,
  evidenceToolInstructions,
  evidenceToolNames,
} from './tools/evidence-tools.js';
import {
  validateIncidentAnalysisValue,
  validateMultimodalIncidentAnalysisValue,
} from './validation/parse-incident-analysis.js';

type ImageMediaType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp';

type AnalysisContract = 'text' | 'multimodal';

const imageMediaTypes: Readonly<Record<string, ImageMediaType>> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function getImageMediaType(filePath: string): ImageMediaType {
  const mediaType = imageMediaTypes[extname(filePath).toLowerCase()];

  if (!mediaType) {
    throw new SentinelFailure(
      'invalid-input',
      'Supported image types are PNG, JPEG, GIF, and WebP.',
    );
  }

  return mediaType;
}

async function* createImagePrompt(
  filePath: string,
  question: string,
): AsyncGenerator<SDKUserMessage> {
  const resolvedPath = resolve(filePath.replace(/^['"]|['"]$/g, ''));
  const mediaType = getImageMediaType(resolvedPath);
  let imageData: string;

  try {
    imageData = await readFile(resolvedPath, 'base64');
  } catch (error: unknown) {
    throw new SentinelFailure(
      'invalid-input',
      `Unable to read image: ${resolvedPath}`,
      { cause: error },
    );
  }

  yield {
    type: 'user',
    message: {
      role: 'user',
      content: [
        {
          type: 'text',
          text: question,
        },
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: imageData,
          },
        },
      ],
    },
    parent_tool_use_id: null,
  };
}

async function runTurn(
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
    for await (const message of boundedMessages(query({
      prompt,
      options: {
        ...sdkPolicyOptions(evidenceTools),
        includePartialMessages:
          responseMode === 'stream' || reasoningConfig.mode === 'thinking',
        model: process.env.CLAUDE_MODEL?.trim() || 'sonnet',
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
      },
    }), investigation)) {
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
            requested_model: process.env.CLAUDE_MODEL?.trim() || 'sonnet',
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
      // console.log('Request metadata:');
      // console.log(
      // JSON.stringify(
      //     message,
      //     null,
      //     2,
      // ),
      // );
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

async function main(): Promise<void> {
  const reasoningConfig = readReasoningConfig(process.argv.slice(2));
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN?.trim();

  if (!oauthToken) {
    throw new SentinelFailure(
      'missing-configuration',
      'CLAUDE_CODE_OAUTH_TOKEN is not configured.',
    );
  }

  const terminal = createInterface({ input, output });
  let responseMode: TurnResponseMode = 'complete';
  let activeAbortController: AbortController | undefined;
  let exitRequested = false;

  terminal.on('SIGINT', () => {
    if (activeAbortController && !activeAbortController.signal.aborted) {
      output.write('\nCancelling current request...\n');
      activeAbortController.abort();
      return;
    }

    exitRequested = true;
    output.write('\nExiting Sentinel CLI.\n');
    terminal.close();
  });

  const runActiveTurn = async (
    prompt: string | AsyncIterable<SDKUserMessage>,
    analysisContract: AnalysisContract = 'text',
  ): Promise<void> => {
    const abortController = new AbortController();
    activeAbortController = abortController;

    try {
      await runTurn(
        prompt,
        reasoningConfig,
        responseMode,
        analysisContract,
        abortController,
      );
    } finally {
      if (activeAbortController === abortController) {
        activeAbortController = undefined;
      }
    }
  };

  console.log('Sentinel CLI');
  console.log(`Reasoning mode: ${reasoningConfig.mode}`);
  console.log('Enter a message, /image to send an image, or /exit to quit.');
  console.log('Use /mode complete or /mode stream to change response display.');
  console.log('Every incident analysis is parsed and schema-validated.');
  console.log('Prompt caching is automatic for the stable system contract.');
  console.log(
    'Read-only service metrics and dependency health tools are available when needed.',
  );
  console.log(
    'Complete mode waits for the Agent SDK final result; it is not a raw non-streaming Messages API request.\n',
  );

  try {
    while (!exitRequested) {
      const userInput = (await terminal.question('You: ')).trim();

      if (!userInput) {
        continue;
      }

      if (['/exit', 'exit', 'quit'].includes(userInput.toLowerCase())) {
        break;
      }

      if (userInput.toLowerCase().startsWith('/mode')) {
        const requestedMode = userInput.toLowerCase().split(/\s+/)[1];

        if (requestedMode === 'complete' || requestedMode === 'stream') {
          responseMode = requestedMode;
          console.log(`Response mode: ${responseMode}\n`);
        } else {
          console.log(
            `Current mode: ${responseMode}. Use /mode complete or /mode stream.\n`,
          );
        }

        continue;
      }

      try {
        if (userInput.toLowerCase() === '/image') {
          const imagePath = (await terminal.question('Image path: ')).trim();
          const incidentText = (
            await terminal.question('Incident text: ')
          ).trim();

          if (!imagePath) {
            throw new SentinelFailure(
              'invalid-input',
              'An image path is required.',
            );
          }

          if (!incidentText) {
            throw new SentinelFailure(
              'invalid-input',
              'Incident text is required with the dashboard image.',
            );
          }

          await runActiveTurn(
            createImagePrompt(
              imagePath,
              createMultimodalIncidentAnalysisPrompt(incidentText),
            ),
            'multimodal',
          );
          continue;
        }

        await runActiveTurn(createIncidentAnalysisPrompt(userInput));
      } catch (error: unknown) {
        console.error(`\n${formatFailure(error)}\n`);

        if (exitRequested) {
          break;
        }
      }
    }
  } catch (error: unknown) {
    if (!exitRequested) {
      throw error;
    }
  } finally {
    terminal.close();
  }
}

main().catch((error: unknown) => {
  console.error(formatFailure(error));
  process.exitCode = 1;
});

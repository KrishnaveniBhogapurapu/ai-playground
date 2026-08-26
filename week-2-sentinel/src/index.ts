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
import {
  formatFailure,
  SentinelFailure,
  type FailureCode,
} from './errors/sentinel-failure.js';
import {
  createIncidentAnalysisPrompt,
  createMultimodalIncidentAnalysisPrompt,
  incidentAnalysisInstructions,
  multimodalEvidenceInstructions,
} from './prompts/incident-analysis.js';
import {
  createIncidentMetricTool,
  incidentMetricToolInstructions,
  incidentMetricToolName,
} from './tools/incident-metrics.js';
import {
  validateIncidentAnalysisValue,
  validateMultimodalIncidentAnalysisValue,
} from './validation/parse-incident-analysis.js';

type ImageMediaType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp';

type ResponseMode = 'complete' | 'stream';
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
  responseMode: ResponseMode = 'complete',
  analysisContract: AnalysisContract = 'text',
  abortController: AbortController = new AbortController(),
): Promise<void> {
  let receivedResult = false;
  let wroteStreamedOutput = false;
  let estimatedThinkingTokens = 0;
  const incidentMetricTool = createIncidentMetricTool();
  const interruptionMessage =
    responseMode === 'stream'
      ? 'Stream interrupted. The partial response was rejected.'
      : 'Request interrupted before a completed response was received.';
  const interruptionCode: FailureCode =
    responseMode === 'stream'
      ? 'interrupted-stream'
      : 'interrupted-request';

  try {
    for await (const message of query({
      prompt,
      options: {
        abortController,
        includePartialMessages:
          responseMode === 'stream' || reasoningConfig.mode === 'thinking',
        maxTurns: 3,
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
              ? `${incidentAnalysisInstructions}\n${multimodalEvidenceInstructions}\n${incidentMetricToolInstructions}`
              : `${incidentAnalysisInstructions}\n${incidentMetricToolInstructions}`,
          excludeDynamicSections: true,
        },
        thinking: reasoningConfig.thinking,
        ...(reasoningConfig.effort
          ? { effort: reasoningConfig.effort }
          : {}),
        tools: [],
        mcpServers: {
          sentinel: incidentMetricTool.server,
        },
        allowedTools: [incidentMetricToolName],
      },
    })) {
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
            block.name === incidentMetricToolName
          ) {
            incidentMetricTool.trace.request = {
              id: block.id,
              name: block.name,
              input: block.input,
            };
          }
        }

        continue;
      }

      if (message.type === 'user' && Array.isArray(message.message.content)) {
        for (const block of message.message.content) {
          if (
            block.type === 'tool_result' &&
            block.tool_use_id === incidentMetricTool.trace.request?.id
          ) {
            incidentMetricTool.trace.result = {
              tool_use_id: block.tool_use_id,
              content: block.content,
              is_error: block.is_error ?? false,
            };
          }
        }

        continue;
      }

      if (message.type !== 'result') {
        continue;
      }

      if (abortController.signal.aborted) {
        throw new SentinelFailure(interruptionCode, interruptionMessage);
      }

      if (message.subtype !== 'success') {
        throw classifySdkFailure(message);
      }

      if (message.is_error) {
        throw classifySdkFailure(message);
      }

      let analysis;

      try {
        analysis =
          analysisContract === 'multimodal'
            ? validateMultimodalIncidentAnalysisValue(
                message.structured_output,
              )
            : validateIncidentAnalysisValue(message.structured_output);
      } catch (error: unknown) {
        if (wroteStreamedOutput) {
          output.write('\n\n');
        }

        console.log(
          `Claude structured output (rejected): ${JSON.stringify(message.structured_output, null, 2)}\n`,
        );
        throw error;
      }

      receivedResult = true;

      if (incidentMetricTool.trace.request) {
        console.log(
          `Tool-use lifecycle:\n${JSON.stringify(
            {
              '1_claude_requests_tool': incidentMetricTool.trace.request,
              '2_application_validates_input':
                incidentMetricTool.trace.validation ?? null,
              '3_application_executes_handler':
                incidentMetricTool.trace.execution ?? null,
              '4_application_returns_tool_result':
                incidentMetricTool.trace.result ?? null,
            },
            null,
            2,
          )}\n`,
        );
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
  } catch (error: unknown) {
    if (abortController.signal.aborted) {
      throw new SentinelFailure(interruptionCode, interruptionMessage, {
        cause: error,
      });
    }

    throw error;
  }

  if (abortController.signal.aborted) {
    throw new SentinelFailure(interruptionCode, interruptionMessage);
  }

  if (!receivedResult) {
    throw new SentinelFailure(
      'runtime-error',
      'Claude did not return a completed response.',
    );
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
  let responseMode: ResponseMode = 'complete';
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
    'The read-only incident metric tool is available automatically when needed.',
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

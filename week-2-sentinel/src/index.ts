import 'dotenv/config';

import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';

import { incidentAnalysisSchema } from './contracts/incident-analysis.js';
import { classifySdkFailure } from './errors/classify-sdk-failure.js';
import {
  formatFailure,
  SentinelFailure,
  type FailureCode,
} from './errors/sentinel-failure.js';
import { validateIncidentAnalysisValue } from './validation/parse-incident-analysis.js';

type ImageMediaType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp';

type ResponseMode = 'complete' | 'stream';

const incidentAnalysisInstructions = `Analyze the supplied incident evidence. Separate observed facts from assumptions and hypotheses. For every hypothesis, identify supporting and contradicting evidence. Identify missing information, recommend reversible next actions, and communicate uncertainty. Do not present any root cause as confirmed unless the supplied evidence confirms it.`;

function createIncidentAnalysisPrompt(incidentEvidence: string): string {
  return `${incidentAnalysisInstructions}\n\n<incident_evidence>\n${incidentEvidence}\n</incident_evidence>`;
}

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
  sessionId?: string,
  responseMode: ResponseMode = 'complete',
  abortController: AbortController = new AbortController(),
): Promise<string> {
  let nextSessionId = sessionId;
  let receivedResult = false;
  let wroteStreamedOutput = false;
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
        includePartialMessages: responseMode === 'stream',
        maxTurns: 1,
        model: process.env.CLAUDE_MODEL?.trim() || 'sonnet',
        outputFormat: {
          type: 'json_schema',
          schema: incidentAnalysisSchema,
        },
        tools: [],
        ...(sessionId ? { resume: sessionId } : {}),
      },
    })) {
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
        analysis = validateIncidentAnalysisValue(message.structured_output);
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
      nextSessionId = message.session_id;

      if (wroteStreamedOutput) {
        output.write('\n\n');
      } else {
        console.log(
          `Claude structured output:\n${JSON.stringify(analysis, null, 2)}\n`,
        );
      }

      console.log('Validation: accepted incident analysis.\n');
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

  if (!receivedResult || !nextSessionId) {
    throw new SentinelFailure(
      'runtime-error',
      'Claude did not return a completed response.',
    );
  }

  return nextSessionId;
}

async function main(): Promise<void> {
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN?.trim();

  if (!oauthToken) {
    throw new SentinelFailure(
      'missing-configuration',
      'CLAUDE_CODE_OAUTH_TOKEN is not configured.',
    );
  }

  const terminal = createInterface({ input, output });
  let sessionId: string | undefined;
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
  ): Promise<void> => {
    const abortController = new AbortController();
    activeAbortController = abortController;

    try {
      sessionId = await runTurn(
        prompt,
        sessionId,
        responseMode,
        abortController,
      );
    } finally {
      if (activeAbortController === abortController) {
        activeAbortController = undefined;
      }
    }
  };

  console.log('Sentinel CLI');
  console.log('Enter a message, /image to send an image, or /exit to quit.');
  console.log('Use /mode complete or /mode stream to change response display.');
  console.log('Every incident analysis is parsed and schema-validated.');
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
          const question = (await terminal.question('Question: ')).trim();

          if (!imagePath) {
            throw new SentinelFailure(
              'invalid-input',
              'An image path is required.',
            );
          }

          await runActiveTurn(
            createImagePrompt(
              imagePath,
              createIncidentAnalysisPrompt(
                question || 'Analyze the incident evidence visible in this image.',
              ),
            ),
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

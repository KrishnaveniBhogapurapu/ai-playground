import 'dotenv/config';

import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';

type ImageMediaType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp';

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
    throw new Error('Supported image types are PNG, JPEG, GIF, and WebP.');
  }

  return mediaType;
}

async function* createImagePrompt(
  filePath: string,
  question: string,
): AsyncGenerator<SDKUserMessage> {
  const resolvedPath = resolve(filePath.replace(/^['"]|['"]$/g, ''));
  const mediaType = getImageMediaType(resolvedPath);
  const imageData = await readFile(resolvedPath, 'base64');

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
): Promise<string> {
  let nextSessionId = sessionId;
  let receivedResult = false;

  for await (const message of query({
    prompt,
    options: {
      maxTurns: 1,
      model: process.env.CLAUDE_MODEL?.trim() || 'sonnet',
      tools: [],
      ...(sessionId ? { resume: sessionId } : {}),
    },
  })) {
    if (message.type !== 'result') {
      continue;
    }

    receivedResult = true;
    nextSessionId = message.session_id;

    if (message.subtype !== 'success') {
      throw new Error(message.errors.join('\n') || 'Claude request failed.');
    }

    if (message.is_error) {
      throw new Error(message.result || 'Claude request failed.');
    }

    console.log(`\nClaude: ${message.result}\n`);
  }

  if (!receivedResult || !nextSessionId) {
    throw new Error('Claude did not return a completed response.');
  }

  return nextSessionId;
}

async function main(): Promise<void> {
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN?.trim();

  if (!oauthToken) {
    throw new Error('CLAUDE_CODE_OAUTH_TOKEN is not configured.');
  }

  const terminal = createInterface({ input, output });
  let sessionId: string | undefined;

  console.log('Sentinel CLI');
  console.log('Enter a message, /image to send an image, or /exit to quit.\n');

  try {
    while (true) {
      const userInput = (await terminal.question('You: ')).trim();

      if (!userInput) {
        continue;
      }

      if (['/exit', 'exit', 'quit'].includes(userInput.toLowerCase())) {
        break;
      }

      try {
        if (userInput.toLowerCase() === '/image') {
          const imagePath = (await terminal.question('Image path: ')).trim();
          const question = (await terminal.question('Question: ')).trim();

          if (!imagePath) {
            console.error('An image path is required.\n');
            continue;
          }

          sessionId = await runTurn(
            createImagePrompt(
              imagePath,
              question || 'Describe the relevant observations in this image.',
            ),
            sessionId,
          );
          continue;
        }

        sessionId = await runTurn(userInput, sessionId);
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Unexpected request error.';
        console.error(`\nError: ${message}\n`);
      }
    }
  } finally {
    terminal.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unexpected error.';
  console.error(message);
  process.exitCode = 1;
});

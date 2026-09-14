import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { SentinelFailure } from '../errors/sentinel-failure.js';
import { imageMediaTypes } from '../constants/media.js';

export type ImageMediaType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp';

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

export async function* createImagePrompt(
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

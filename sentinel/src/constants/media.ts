import type { ImageMediaType } from '../inputs/image.js';

export const imageMediaTypes: Readonly<Record<string, ImageMediaType>> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

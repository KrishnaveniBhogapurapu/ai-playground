import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { Investigation } from './investigation.js';

export async function* boundedMessages(
  source: AsyncIterable<SDKMessage> & { close?: () => void },
  investigation: Investigation,
): AsyncGenerator<SDKMessage> {
  const iterator = source[Symbol.asyncIterator]();
  let exhausted = false;
  try {
    while (true) {
      const next = await investigation.wait(iterator.next());
      investigation.assertActive();
      if (next.done) { exhausted = true; break; }
      yield next.value;
    }
  } finally {
    // The SDK close method terminates its subprocess without awaiting a stuck iterator.
    if (!exhausted) source.close?.();
  }
}

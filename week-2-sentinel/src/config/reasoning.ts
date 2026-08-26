import type {
  EffortLevel,
  ThinkingConfig,
} from '@anthropic-ai/claude-agent-sdk';

import { SentinelFailure } from '../errors/sentinel-failure.js';

export type ReasoningMode = 'direct' | 'thinking';

export interface ReasoningConfig {
  mode: ReasoningMode;
  thinking: ThinkingConfig;
  effort?: EffortLevel;
}

export function readReasoningConfig(args: string[]): ReasoningConfig {
  const optionIndex = args.indexOf('--reasoning');
  const requestedMode = optionIndex >= 0 ? args[optionIndex + 1] : 'direct';

  if (requestedMode === 'direct') {
    return {
      mode: 'direct',
      thinking: { type: 'disabled' },
    };
  }

  if (requestedMode === 'thinking') {
    return {
      mode: 'thinking',
      thinking: { type: 'adaptive', display: 'omitted' },
      effort: 'high',
    };
  }

  throw new SentinelFailure(
    'invalid-input',
    'Reasoning mode must be direct or thinking.',
  );
}

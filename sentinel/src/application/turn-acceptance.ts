import { interruptionByMode } from '../constants/failures.js';
import { SentinelFailure } from '../errors/sentinel-failure.js';

import type { TurnResponseMode } from '../inputs/analysis.js';

/**
 * Owns the boundary between display-only partial output and an accepted result.
 * A turn is accepted only after a final value is validated while not aborted.
 */
export class TurnAcceptanceGuard {
  private acceptedResult = false;
  private partialOutput = false;

  constructor(private readonly responseMode: TurnResponseMode) {}

  get hasAcceptedResult(): boolean {
    return this.acceptedResult;
  }

  get hasPartialOutput(): boolean {
    return this.partialOutput;
  }

  recordPartialOutput(chunk: string): void {
    if (chunk.length > 0) {
      this.partialOutput = true;
    }
  }

  assertNotInterrupted(signal: AbortSignal): void {
    if (signal.aborted) {
      throw this.createInterruptionFailure();
    }
  }

  acceptValidatedResult<T>(value: T, signal: AbortSignal): T {
    this.assertNotInterrupted(signal);
    this.acceptedResult = true;
    return value;
  }

  assertCompleted(signal: AbortSignal): void {
    this.assertNotInterrupted(signal);

    if (!this.acceptedResult) {
      throw new SentinelFailure(
        'runtime-error',
        'Claude did not return a completed response.',
      );
    }
  }

  createInterruptionFailure(cause?: unknown): SentinelFailure {
    const interruption = interruptionByMode[this.responseMode];

    return new SentinelFailure(
      interruption.code,
      interruption.message,
      cause === undefined ? undefined : { cause },
    );
  }
}

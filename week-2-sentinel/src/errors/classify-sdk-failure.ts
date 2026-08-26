import type {
  SDKResultError,
  SDKResultSuccess,
} from '@anthropic-ai/claude-agent-sdk';

import { SentinelFailure } from './sentinel-failure.js';

type FailedSdkResult = SDKResultError | SDKResultSuccess;

export function classifySdkFailure(message: FailedSdkResult): SentinelFailure {
  const detail =
    message.subtype === 'success'
      ? message.result || 'Claude request failed.'
      : message.errors.join('\n') || 'Claude request failed.';

  if (
    message.subtype === 'error_max_structured_output_retries' ||
    message.terminal_reason === 'structured_output_retry_exhausted'
  ) {
    return new SentinelFailure(
      'structured-output-retries-exhausted',
      detail,
    );
  }

  if (message.terminal_reason === 'prompt_too_long') {
    return new SentinelFailure('context-limit', detail);
  }

  if (message.terminal_reason === 'image_error') {
    return new SentinelFailure('invalid-input', detail);
  }

  if (message.terminal_reason === 'aborted_streaming') {
    return new SentinelFailure('interrupted-stream', detail);
  }

  if (message.subtype === 'success') {
    if (message.api_error_status === 401 || message.api_error_status === 403) {
      return new SentinelFailure('authentication-error', detail);
    }

    if (message.api_error_status === 429) {
      return new SentinelFailure('rate-limit', detail);
    }

    if (
      message.api_error_status === 408 ||
      message.api_error_status === 504
    ) {
      return new SentinelFailure('timeout', detail);
    }
  }

  if (
    message.terminal_reason === 'api_error' ||
    message.terminal_reason === 'model_error'
  ) {
    return new SentinelFailure('api-error', detail);
  }

  return new SentinelFailure('runtime-error', detail);
}

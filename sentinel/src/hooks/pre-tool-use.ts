import type { HookCallback } from '@anthropic-ai/claude-agent-sdk';
import type { Investigation } from '../application/investigation.js';

export function createEvidencePreToolUse(investigation: Investigation): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== 'PreToolUse') return {};
    // The SDK formatter has no operational handler. Evidence requests must
    // pass the shared validation, authorization, and investigation limits.
    if (input.tool_name === 'StructuredOutput') {
      investigation.assertActive();
      return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } };
    }
    const rejection = investigation.prepare({
      id: input.tool_use_id, name: input.tool_name, input: input.tool_input,
    });
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: rejection ? 'deny' : 'allow',
        permissionDecisionReason: rejection && !rejection.ok
          ? rejection.error.message : 'Validated and authorized by Sentinel host policy.',
      },
    };
  };
}

export function createDecisionPreToolUse(investigation: Investigation): HookCallback {
  return async (input) => {
    investigation.assertActive();
    return { hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: input.hook_event_name === 'PreToolUse' && input.tool_name === 'StructuredOutput' ? 'allow' : 'deny',
      permissionDecisionReason: 'Decision queries may format output; Sentinel executes evidence actions separately.',
    } };
  };
}

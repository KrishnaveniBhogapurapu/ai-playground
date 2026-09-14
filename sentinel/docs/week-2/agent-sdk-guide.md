# Claude Agent SDK Used in Sentinel

Week 2 implementation record. Code excerpts describe that stage; the current application structure and commands are in the [project README](../../README.md).

## Purpose

This document explains only the Claude Agent SDK features that I used in Sentinel. For each feature, I identify:

- the SDK symbol or option;
- what it means;
- where I used it;
- why Sentinel needs it;
- which Week 2 learning point it covers;
- any limitation that the Agent SDK abstraction leaves unresolved.

The installed package is `@anthropic-ai/claude-agent-sdk` version `^0.3.245`, declared in [`package.json`](../../package.json#L20).

## 1. The most important distinction: Agent SDK versus Client SDK

Sentinel uses the **Claude Agent SDK**, not the lower-level Anthropic **Client SDK**.

| SDK | Main call | What it provides | Who controls the tool loop? |
| --- | --- | --- | --- |
| Agent SDK | `query()` | Claude Code's agent loop, messages, tool execution, structured output, usage, sessions, and partial events | The Agent SDK runs the loop; my application defines its boundaries and tools. |
| Client SDK | `client.messages.create()` | Direct access to the Messages API request and response | My application must implement any tool loop itself. |

This distinction matters for the Week 2 brief. Sentinel successfully calls Claude through an official TypeScript SDK, but it does not directly construct a `client.messages.create()` request. Therefore:

- **Official SDK call:** covered through the Agent SDK.
- **Messages API concepts:** covered through content blocks, raw stream events, stop reasons, and usage exposed by the Agent SDK.
- **Complete and streamed modes:** covered through the accepted Agent SDK behavior.
- **Direct request-side `max_tokens`:** unavailable in the installed Agent SDK `query()` options and documented as a limitation.

The accepted Week 2 design does not require a duplicate Client SDK implementation.

Official reference: [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview).

## 2. Sentinel's Agent SDK lifecycle

The main call begins at [`src/index.ts`](../../src/index.ts):

```text
CLI text or image
        ↓
string prompt or AsyncIterable<SDKUserMessage>
        ↓
query({ prompt, options })
        ↓
Agent SDK yields system, stream_event, assistant, user, and result messages
        ↓
Agent SDK may execute the registered read-only tool between model turns
        ↓
result.structured_output
        ↓
Sentinel validates the value with Ajv
        ↓
accepted analysis or typed failure
```

The central code is:

```ts
for await (const message of query({
  prompt,
  options: { /* Sentinel configuration */ },
})) {
  // Handle each SDK message according to message.type.
}
```

`query()` returns an asynchronous message stream. `for await...of` waits for each message without blocking Node.js and continues until the SDK finishes the query. The stream contains lifecycle messages, not only visible answer text.

This single loop supports these Week 2 points:

- calling Claude asynchronously;
- displaying partial output;
- observing tool requests and results;
- detecting final success or failure;
- reading token, latency, cost, cache, and stop metadata;
- accepting only the final validated structured value.

Official references: [agent loop](https://code.claude.com/docs/en/agent-sdk/agent-loop) and [TypeScript SDK reference](https://code.claude.com/docs/en/agent-sdk/typescript).

## 3. Agent SDK imports used by Sentinel

### Imports in `src/index.ts`

```ts
import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
```

| Import | Kind | Meaning | Sentinel usage | Week 2 mapping |
| --- | --- | --- | --- | --- |
| `query` | Runtime function | Starts the Agent SDK loop and returns an async iterable of SDK messages. | Called in [`runTurn()`](../../src/index.ts). | Official SDK, asynchronous request, response lifecycle, streaming, failures, metadata. |
| `SDKUserMessage` | TypeScript type | Describes a user-role message that can contain text, image, document, or tool-result blocks. The type is erased after compilation. | Used by [`createImagePrompt()`](../../src/index.ts) and the `prompt` parameter of [`runTurn()`](../../src/index.ts). | Text/image content blocks and multimodal input. |

### Imports in `src/config/reasoning.ts`

```ts
import type {
  EffortLevel,
  ThinkingConfig,
} from '@anthropic-ai/claude-agent-sdk';
```

| Import | Meaning | Sentinel usage | Week 2 mapping |
| --- | --- | --- | --- |
| `ThinkingConfig` | A type-safe union for disabled, adaptive, or fixed-budget thinking configurations. | Stored in [`ReasoningConfig`](../../src/config/reasoning.ts). | Direct response, extended thinking, and adaptive thinking concepts. |
| `EffortLevel` | A type-safe union of supported effort names such as `low`, `medium`, and `high`. | The thinking mode uses `high` at [`src/config/reasoning.ts`](../../src/config/reasoning.ts). | Thinking/effort comparison. |

### Imports in `src/errors/classify-sdk-failure.ts`

```ts
import type {
  SDKResultError,
  SDKResultSuccess,
} from '@anthropic-ai/claude-agent-sdk';
```

| Import | Meaning | Sentinel usage | Week 2 mapping |
| --- | --- | --- | --- |
| `SDKResultSuccess` | The SDK's normal result shape. It can still contain `is_error: true` and an API status when the loop produced a result frame for an API failure. | Checked in [`classifySdkFailure()`](../../src/errors/classify-sdk-failure.ts). | Authentication, rate-limit, timeout, API, usage, and stop handling. |
| `SDKResultError` | A result that stopped because of execution, turn, budget, or structured-output failure. | Its subtype, errors, and terminal reason are mapped to Sentinel failures. | Context-limit, structured-output, interruption, and runtime failures. |

### Imports in `src/tools/incident-metrics.ts`

```ts
import {
  createSdkMcpServer,
  tool,
} from '@anthropic-ai/claude-agent-sdk';
```

| Import | Meaning | Sentinel usage | Week 2 mapping |
| --- | --- | --- | --- |
| `tool` | Creates a custom SDK tool from a name, description, Zod input shape, async handler, and optional annotations. | Defines `get_incident_metric` at `src/tools/incident-metrics.ts`. | Tool definition, input validation, controlled execution, and tool result. |
| `createSdkMcpServer` | Packages one or more in-process tools as an MCP server that the Agent SDK can expose to Claude. | Creates the `sentinel` server at `src/tools/incident-metrics.ts`. | Tool-use lifecycle preview. |

## 4. `query()` input forms used in Sentinel

`query()` accepts either a string or an asynchronous iterable of `SDKUserMessage` objects. Sentinel uses both forms.

### Text input: string prompt

Normal CLI text becomes a string prompt at [`src/index.ts`](../../src/index.ts):

```ts
await runActiveTurn(createIncidentAnalysisPrompt(userInput));
```

This is the simplest Agent SDK input. The SDK creates the user message for the string.

**Week 2 point:** send incident text to Claude and print the response.

### Multimodal input: `AsyncIterable<SDKUserMessage>`

An image request uses the async generator at [`src/index.ts`](../../src/index.ts):

```ts
yield {
  type: 'user',
  message: {
    role: 'user',
    content: [
      { type: 'text', text: question },
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
```

Field meanings:

| Field | Meaning | Why Sentinel sets it |
| --- | --- | --- |
| `type: 'user'` | This is an SDK user-role lifecycle message. | It starts the model turn with application-supplied evidence. |
| `message.role: 'user'` | This is the underlying Messages API role. | The incident description and image are user input, not system policy. |
| `content` | An ordered array of content blocks. | Text and image evidence are sent together in one request. |
| text block | Natural-language incident description and analysis request. | The image needs context; the model should not guess the task from pixels alone. |
| image block | Base64-encoded image with a supported media type. | The SDK can forward the dashboard as multimodal input. |
| `parent_tool_use_id: null` | The message was created by the main application, not by a subagent/tool call. | Sentinel is initiating a top-level user turn. |

**Week 2 point:** send a fictional dashboard together with incident text and classify text observations, image observations, inferences, and unsupported claims.

## 5. Every `query()` option used by Sentinel

The complete option object is at [`src/index.ts`](../../src/index.ts).

### `abortController`

```ts
abortController,
```

`AbortController` is provided by the JavaScript runtime, not exported by the Agent SDK. Passing it to `query()` gives the application a cancellation handle for the active SDK request.

Sentinel creates one controller per turn at [`src/index.ts`](../../src/index.ts). The first Ctrl+C calls `abort()` at [`src/index.ts`](../../src/index.ts). The actual acceptance boundary is implemented by [`TurnAcceptanceGuard`](../../src/application/turn-acceptance.ts).

**Why used:** cancellation must change the application result, not merely stop terminal rendering.

**Week 2 mapping:** simulate an interrupted stream and prove that partial content is not accepted.

### `includePartialMessages`

```ts
includePartialMessages:
  responseMode === 'stream' || reasoningConfig.mode === 'thinking',
```

When true, the SDK emits `stream_event` messages containing raw Messages API streaming events. The complete assistant and result messages still arrive later.

Sentinel enables it when:

- `/mode stream` is active, so text or JSON deltas can be displayed;
- thinking mode is active, so live thinking-token estimate messages are available.

**Important boundary:** this enables real partial events through the accepted Agent SDK abstraction.

**Week 2 mapping:** the streamed-response requirement is covered.

Official reference: [stream Agent SDK responses](https://code.claude.com/docs/en/agent-sdk/streaming-output).

### `maxTurns`

```ts
maxTurns: 3,
```

`maxTurns` limits the number of agent-loop tool round trips. It is not a token limit. Sentinel needs more than one model turn because Claude may request the metric tool, receive its result, and then continue to the final analysis.

**Why used:** it prevents an unexpectedly long agent loop while still allowing the small tool exercise.

**Week 2 mapping:** tool lifecycle and runtime failure handling. It does **not** cover the assignment's `max_tokens` learning point.

### `model`

```ts
model: process.env.CLAUDE_MODEL?.trim() || 'sonnet',
```

This selects the requested model or model alias. Sentinel reads it from configuration and falls back to `sonnet`. The actual canonical models used by the SDK are later visible in `message.modelUsage`.

**Why used:** model selection is configuration rather than a hardcoded implementation detail.

**Week 2 mapping:** model identifiers, model selection, and model/latency/cost comparison.

### `outputFormat`

```ts
outputFormat: {
  type: 'json_schema',
  schema:
    analysisContract === 'multimodal'
      ? multimodalIncidentAnalysisSchema
      : incidentAnalysisSchema,
},
```

`outputFormat` asks the Agent SDK for structured output matching a supplied JSON Schema. The schema changes according to whether the input is text-only or multimodal.

The final SDK result exposes the generated value as `message.structured_output`. Its TypeScript type is `unknown`, so Sentinel still validates it with Ajv before treating it as an `IncidentAnalysis`.

This creates two separate boundaries:

1. The SDK requests schema-constrained output.
2. Sentinel independently validates the returned runtime value.

**Why used:** a generated value must not become trusted application data merely because it came from a structured-output feature.

**Week 2 mapping:** JSON Schema, API-supported structured output, parsing versus validation, malformed output, and schema-invalid output.

Official reference: [Agent SDK structured output](https://code.claude.com/docs/en/agent-sdk/structured-outputs).

### `systemPrompt`

```ts
systemPrompt: {
  type: 'preset',
  preset: 'claude_code',
  append: /* Sentinel instructions */,
  excludeDynamicSections: true,
},
```

This uses the Claude Code system-prompt preset and appends Sentinel's stable evidence-analysis rules.

| Part | Meaning | Sentinel purpose |
| --- | --- | --- |
| `type: 'preset'` | Use an SDK-provided prompt preset rather than replacing the entire system prompt with a string. | Keep the Agent SDK's normal agent behavior. |
| `preset: 'claude_code'` | Select the Claude Code preset. | The project is built on the Claude Code Agent SDK runtime. |
| `append` | Add application-specific instructions after the preset. | Require facts, assumptions, hypotheses, evidence, reversible actions, uncertainty, multimodal classification, and safe tool interpretation. |
| `excludeDynamicSections: true` | Remove per-user dynamic sections from the stable system prefix and re-inject them as user context. | Keep the shared prefix stable enough for cross-request prompt caching. |

**Trade-off:** dynamic context such as working directory information becomes slightly less authoritative because it is moved from the system prompt to user context. That trade-off is acceptable here because Sentinel uses no built-in file or shell tools.

**Week 2 mapping:** system instructions versus user messages, stable system contract, prompt caching, and Claude Code foundation.

Official reference: [modifying Agent SDK system prompts](https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts).

### `thinking`

```ts
thinking: reasoningConfig.thinking,
```

The value comes from [`readReasoningConfig()`](../../src/config/reasoning.ts):

- Direct mode: `{ type: 'disabled' }`
- Thinking mode: `{ type: 'adaptive', display: 'omitted' }`

`disabled` turns off extended thinking. `adaptive` lets a supported model decide whether and how much to think. `display: 'omitted'` means Sentinel does not request thinking text for display.

**Week 2 mapping:** direct response versus a supported thinking configuration.

### `effort`

```ts
...(reasoningConfig.effort
  ? { effort: reasoningConfig.effort }
  : {}),
```

Thinking mode supplies `effort: 'high'`; direct mode omits the option. Effort controls how much reasoning work the model applies. It is related to, but distinct from, whether extended/adaptive thinking is enabled.

**Week 2 mapping:** effort controls and the paired direct-versus-thinking experiment.

### `tools`

```ts
tools: [],
```

In the Agent SDK, `tools` controls the built-in Claude Code tool set. An empty array disables all built-in tools such as `Read`, `Edit`, `Write`, and `Bash`.

**Why used:** incident analysis does not need arbitrary file access, file modification, or shell execution. The smallest useful tool surface is safer and uses less context.

**Week 2 mapping:** application safety boundary and tool control.

### `mcpServers`

```ts
mcpServers: {
  sentinel: incidentMetricTool.server,
},
```

This registers the in-process MCP server returned by `createSdkMcpServer()`. That server contains only the fictional `get_incident_metric` tool.

**Why used:** Claude can request a controlled application capability without receiving access to general-purpose built-in tools.

**Week 2 mapping:** application sends a tool definition and application code controls execution.

### `allowedTools`

```ts
allowedTools: [incidentMetricToolName],
```

`allowedTools` auto-approves the listed tool without an interactive permission prompt. It is not, by itself, an availability restriction. Sentinel restricts availability separately with `tools: []` and a one-tool MCP server.

The full MCP name is `mcp__sentinel__get_incident_metric`:

- `mcp__` identifies an MCP tool;
- `sentinel` is the server name;
- `get_incident_metric` is the tool name.

**Why used:** the read-only fictional lookup can execute during the same CLI turn without pausing for an approval dialog.

**Week 2 mapping:** permissions, tool request, validation, execution, result, and continued response.

## 6. SDK message types handled in the loop

The Agent SDK yields a discriminated union. Sentinel checks `message.type` to determine what each message means.

### `system` + `thinking_tokens`

Handled at [`src/index.ts`](../../src/index.ts):

```ts
if (
  message.type === 'system' &&
  message.subtype === 'thinking_tokens'
) {
  estimatedThinkingTokens = message.estimated_tokens;
}
```

This is a live estimate for the current thinking block. It is useful for observability, but it is approximate and is not the authoritative billed output-token count.

**Week 2 mapping:** record thinking tokens when applicable.

### `stream_event`

Handled at [`src/index.ts`](../../src/index.ts). Sentinel accepts only `content_block_delta` events for terminal display:

- `text_delta` contributes visible text;
- `input_json_delta` contributes partial structured JSON.

These chunks are display data only. Sentinel does not validate or accept them as the final incident analysis.

**Week 2 mapping:** streamed response and rejection of interrupted partial output.

### `assistant`

Handled at [`src/index.ts`](../../src/index.ts). An assistant message contains completed content blocks from a model turn. Sentinel looks for a block where:

```ts
block.type === 'tool_use'
```

The block contains:

- `id`: unique tool request identifier;
- `name`: requested tool name;
- `input`: model-generated structured arguments.

Sentinel records this as the request stage of the tool trace. Recording a `tool_use` block does not execute anything in this message handler; the Agent SDK invokes the registered tool handler.

**Week 2 mapping:** identify what Claude requested.

### `user` containing `tool_result`

Handled at [`src/index.ts`](../../src/index.ts). The Agent SDK emits a user-role message containing the tool result sent back to Claude.

Sentinel matches `block.tool_use_id` with the original request ID. This proves which result belongs to which tool request.

**Week 2 mapping:** identify what result the application returned to Claude.

### `result`

Handled from [`src/index.ts`](../../src/index.ts). A result message marks the completed turn outcome and contains final output and metadata.

Sentinel applies these gates in order:

1. If the abort signal is set, reject the turn.
2. If `subtype !== 'success'`, classify the SDK failure.
3. If `is_error` is true, classify the SDK/API failure.
4. Validate `structured_output` against the application schema.
5. Ask `TurnAcceptanceGuard` to accept the validated value only while the abort signal is clear.

This ordering is the core incomplete-response safety boundary. A displayed partial stream, assistant message, or tool result cannot set `hasAcceptedResult`. The deterministic partial-then-abort test is documented in [`interrupted-stream-acceptance-test.md`](../../experiments/week-2/failures/interrupted-stream-acceptance-test.md).

**Week 2 mapping:** accepted analysis versus explicit typed failure, malformed/incomplete rejection, and common failure categories.

## 7. Structured output: what the SDK guarantees and what Sentinel still controls

The Agent SDK integration is:

```text
incidentAnalysisSchema
        ↓
query.options.outputFormat
        ↓
Agent SDK requests structured output
        ↓
result.structured_output: unknown
        ↓
Ajv validates required fields, types, enums, and additional properties
        ↓
application accepts IncidentAnalysis
```

The two validations answer different questions:

| Check | Question answered | Implemented by |
| --- | --- | --- |
| JSON syntax | Can this text be parsed as JSON? | `JSON.parse()` in the prompt-requested JSON exercise. |
| API-supported structure | Did generation follow the supplied schema? | Agent SDK `outputFormat`. |
| Runtime schema validation | Does the actual returned JavaScript value satisfy Sentinel's contract? | Ajv in [`src/validation/incident-analysis.ts`](../../src/validation/incident-analysis.ts). |
| Evidence support | Are the conclusions justified by the incident evidence? | Prompt rules plus human/evidence review; JSON Schema cannot prove this. |

The SDK helps enforce structure. It cannot establish that a root-cause claim is factually supported.

## 8. Thinking and effort through SDK types

The Agent SDK types prevent invalid configuration strings from silently entering the code.

```ts
export interface ReasoningConfig {
  mode: ReasoningMode;
  thinking: ThinkingConfig;
  effort?: EffortLevel;
}
```

Sentinel compares:

| Sentinel mode | SDK options | Meaning |
| --- | --- | --- |
| `direct` | `thinking: { type: 'disabled' }`, no explicit effort | Generate without extended/adaptive thinking. |
| `thinking` | `thinking: { type: 'adaptive', display: 'omitted' }`, `effort: 'high'` | Let the supported model decide how much to think and request high overall reasoning effort. |

This covers the required paired comparison. It does not demonstrate:

- fixed-budget extended thinking with `{ type: 'enabled', budgetTokens: ... }`;
- an effort sweep across multiple values;
- fast mode.

## 9. Custom tool construction and execution

### Step 1: define the tool with `tool()`

The definition starts at `src/tools/incident-metrics.ts`:

```ts
const getIncidentMetric = tool(
  'get_incident_metric',
  'Read one metric from Sentinel...',
  incidentMetricInputShape,
  async (validatedInput) => { /* application handler */ },
  { annotations: { /* behavior hints */ }, alwaysLoad: true },
);
```

| Argument | Meaning | Sentinel value |
| --- | --- | --- |
| Name | Stable function name shown to Claude. | `get_incident_metric` |
| Description | Tells Claude when the tool is appropriate and what it cannot prove. | Read one fictional metric; never confirm root cause. |
| Input schema | Zod shape validated before the handler runs. | Only `INC-104` and `checkout_error_rate` are accepted. |
| Handler | Application code invoked after accepted input. | Reads one in-memory fictional metric. |
| Extras | Loading and MCP behavior hints. | Always loaded, read-only, non-destructive, idempotent, closed-world. |

Zod is a separate dependency, not part of the Agent SDK. The SDK uses the Zod shape to expose a tool schema and passes validated input to the handler.

### Step 2: annotate tool behavior

```ts
annotations: {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
},
```

| Annotation | Meaning in this tool |
| --- | --- |
| `readOnlyHint: true` | The operation observes data and does not mutate it. |
| `destructiveHint: false` | It cannot delete or overwrite data. |
| `idempotentHint: true` | Repeating the same request returns the same stored observation. |
| `openWorldHint: false` | It does not reach an uncontrolled external system; it reads local fictional data. |

These are descriptive hints. The actual safety boundary is still the handler implementation and its validated input.

### Step 3: package it with `createSdkMcpServer()`

```ts
createSdkMcpServer({
  name: 'sentinel',
  version: '1.0.0',
  tools: [getIncidentMetric],
})
```

This creates an in-process MCP server configuration. No separate server process or network service is required for this exercise.

### Step 4: register and allow it in `query()`

`mcpServers` makes the server available. `allowedTools` lets its one tool execute without an approval prompt. `tools: []` keeps unrelated built-in tools unavailable.

### Step 5: let the Agent SDK complete the loop

```text
Claude emits tool_use
        ↓
Agent SDK validates the Zod input
        ↓
Agent SDK calls Sentinel's handler
        ↓
handler reads the in-memory metric
        ↓
Agent SDK sends tool_result to Claude
        ↓
Claude continues toward structured output
```

Sentinel records all four boundaries in its trace, but the Agent SDK performs the orchestration between them.

Official reference: [custom Agent SDK tools](https://code.claude.com/docs/en/agent-sdk/custom-tools).

## 10. SDK result failures mapped to Sentinel failures

The classifier is at [`src/errors/classify-sdk-failure.ts`](../../src/errors/classify-sdk-failure.ts).

| SDK signal | Sentinel code | Week 2 category |
| --- | --- | --- |
| `api_error_status` 401 or 403 | `authentication-error` | Configuration/integration |
| `api_error_status` 429 | `rate-limit` | Integration |
| `api_error_status` 408 or 504 | `timeout` | Runtime/integration |
| `terminal_reason: 'prompt_too_long'` | `context-limit` | Input/model boundary |
| `terminal_reason: 'image_error'` | `invalid-input` | Input |
| `terminal_reason: 'aborted_streaming'` | `interrupted-stream` | Runtime |
| Structured-output retry exhaustion | `structured-output-retries-exhausted` | Model output |
| `terminal_reason: 'api_error'` or `'model_error'` | `api-error` | Integration |
| Any unmatched SDK result failure | `runtime-error` | Runtime |

Errors thrown before an SDK result exists are handled by the outer `try/catch` and formatted through Sentinel's own failure contract.

The SDK signal identifies how the agent loop ended. Sentinel's mapping identifies how the application communicates that failure to its caller.

## 11. Usage, cost, latency, cache, and stop metadata

Sentinel reads the final result at [`src/index.ts`](../../src/index.ts).

| SDK result field | Meaning | Sentinel output | Week 2 mapping |
| --- | --- | --- | --- |
| `modelUsage` | Per-model estimated totals across model calls in the query pipeline. | `models_used` | Actual model IDs, per-model tokens, context limit, output capability, cache, and cost. |
| `usage.input_tokens` | Main-loop uncached input usage reported on the result. | `input_tokens` | Input-token record. |
| `usage.output_tokens` | Main-loop output usage reported on the result. | `output_tokens` | Output-token record. |
| `usage.cache_creation_input_tokens` | Input tokens written to a prompt cache. | `cache_creation_input_tokens` | Prompt-caching experiment. |
| `usage.cache_read_input_tokens` | Input tokens reused from a prompt cache. | `cache_read_input_tokens` | Evidence of a cache hit. |
| `duration_ms` | Overall query duration reported by the SDK. | `duration_ms` | End-to-end latency. |
| `duration_api_ms` | Time attributed to API work. | `duration_api_ms` | API latency comparison. |
| `total_cost_usd` | SDK-estimated cumulative cost for the query. | `total_cost_usd` | Basic cost estimate; not a billing statement. |
| `stop_reason` | Model/API stop reason for the completed result. | `stop_reason` | Explain why generation ended. |
| `estimated_tokens` on `thinking_tokens` | Approximate live thinking progress. | `estimated_thinking_tokens` | Thinking-token observation. |
| Application prompt constants | Stable version identifiers defined by Sentinel, not SDK usage fields. | `prompt_version`, `prompt_contract` | Prompt metadata without exposing the full prompt. |

Two important interpretation rules:

1. `modelUsage` is more complete than the top-level `usage` fields when helper or side calls occur. The saved runs show both Sonnet and a Haiku helper in some queries.
2. `modelUsage[*].maxOutputTokens` is the model's supported output capability. It is **not** a request-side `max_tokens` value selected by Sentinel.

Official reference: [Agent SDK cost and usage](https://code.claude.com/docs/en/agent-sdk/cost-tracking).

## 12. Prompt caching in the Agent SDK flow

Sentinel does not expose a `/cache` command. Prompt caching occurs within the normal `query()` flow when the request has an eligible stable prefix.

The relevant pieces are:

- the same Claude Code system-prompt preset;
- the same appended Sentinel instructions;
- the same structured-output schema;
- `excludeDynamicSections: true` to keep dynamic user-specific context out of the stable system prefix;
- different incident text after the stable prefix.

The result fields provide evidence:

- `cache_creation_input_tokens` shows tokens written to cache;
- `cache_read_input_tokens` shows tokens reused from cache;
- `input_tokens` shows uncached input tokens.

This is prompt-prefix reuse, not conversation memory. Each CLI incident still calls `query()` independently.

**Week 2 mapping:** stable contract + Incident A, same contract + Incident B, cache creation/read/uncached tokens, latency, and estimated cost.

## 13. What comes from the Agent SDK and what remains application code

| Responsibility | Agent SDK | Sentinel application |
| --- | --- | --- |
| Start and run the agent loop | Yes | Calls `query()` and consumes messages. |
| Send string and content-block input | Transports supported input | Builds and validates the actual text/image message. |
| Select model/thinking/effort | Applies supplied options | Chooses configuration values. |
| Emit partial stream events | Yes, when enabled | Decides what to display and never treats chunks as final. |
| Request structured output | Applies JSON Schema output format | Defines the schema and revalidates the returned value. |
| Decide whether conclusions are evidence-supported | No | Prompt contract plus review must evaluate support. |
| Request a tool | Claude produces `tool_use`; SDK routes it | Defines which tools exist. |
| Validate custom tool input | SDK uses the supplied Zod schema | Defines the narrow accepted schema. |
| Execute a custom tool | SDK invokes the handler | Owns the handler and the operation it performs. |
| Return tool result to Claude | SDK continues the loop | Constructs the handler result. |
| Report usage/cost/cache metadata | Yes | Records and interprets it. |
| Classify application failures | Exposes result/error signals | Maps them to stable typed failures. |
| Reject interrupted partial output | Supports aborting | Enforces the acceptance boundary. |

The central learning is that using an Agent SDK does not remove application responsibility. It automates the agent loop, while Sentinel still controls inputs, available capabilities, validation, acceptance, failure categories, and observability.

## 14. Week 2 assignment map

| Week 2 point | Agent SDK feature used | Sentinel code | Coverage |
| --- | --- | --- | --- |
| Official Python or TypeScript SDK | `query()` from the TypeScript Agent SDK | [`src/index.ts`](../../src/index.ts) | **Covered through the accepted Agent SDK** |
| Messages API request/response structure | SDK user/assistant/result messages and raw stream events | [`src/index.ts`](../../src/index.ts) | **Covered through the accepted abstraction** |
| System instructions and user messages | `systemPrompt` plus string/`SDKUserMessage` prompt | [`src/index.ts`](../../src/index.ts) | **Covered** |
| Text, image, and other content blocks | `SDKUserMessage.message.content` | [`src/index.ts`](../../src/index.ts) | **Covered for text, image, tool use, and tool result** |
| Model identifiers | `model` and `modelUsage` | [`src/index.ts`](../../src/index.ts) | **Covered** |
| `max_tokens` | No matching `query()` option; `maxTurns` and `taskBudget` are different controls | — | **Concept covered; exact control unavailable in accepted SDK** |
| Stop reasons | `result.stop_reason` and `terminal_reason` | [`src/index.ts`](../../src/index.ts), [`classify-sdk-failure.ts`](../../src/errors/classify-sdk-failure.ts) | **Covered** |
| Usage information | `usage`, `modelUsage`, `total_cost_usd` | [`src/index.ts`](../../src/index.ts) | **Covered after each request** |
| Synchronous/asynchronous requests | Async iterable returned by `query()` | [`src/index.ts`](../../src/index.ts) | **Covered for asynchronous TypeScript flow** |
| Environment configuration | SDK inherits environment; Sentinel checks OAuth token and model env var | [`src/index.ts`](../../src/index.ts) | **Covered for this local Agent SDK setup** |
| Complete response | Wait for `result` without rendering deltas | [`src/index.ts`](../../src/index.ts) | **Covered through the accepted Agent SDK** |
| Streamed response | `includePartialMessages` and `stream_event` | [`src/index.ts`](../../src/index.ts) | **Covered through the accepted Agent SDK** |
| Interrupted stream rejection | `abortController` plus the real acceptance guard | [`turn-acceptance.ts`](../../src/application/turn-acceptance.ts), [`sentinel.test.ts`](../../tests/analysis.test.ts) | **Covered and deterministically tested** |
| API-supported structured output | `outputFormat` and `structured_output` | [`src/index.ts`](../../src/index.ts) | **Covered** |
| Schema validation | SDK output format plus Ajv | [`src/validation/incident-analysis.ts`](../../src/validation/incident-analysis.ts) | **Covered** |
| Multimodal input | Async `SDKUserMessage` with text/image blocks | [`src/index.ts`](../../src/index.ts) | **Covered** |
| Direct versus thinking | `ThinkingConfig` and `EffortLevel` | [`src/config/reasoning.ts`](../../src/config/reasoning.ts) | **Covered for disabled versus adaptive/high** |
| Tokens, latency, cost | Result usage and duration/cost fields | [`src/index.ts`](../../src/index.ts) | **Covered** |
| Token-counting capability | No method exposed by Agent SDK `query()` | — | **Unavailable through the accepted SDK; limitation recorded** |
| Prompt caching | Stable system prompt plus cache usage fields | [`src/index.ts`](../../src/index.ts) | **Covered** |
| Claude Code foundation | Claude Code preset and repository configuration | [`CLAUDE.md`](../../CLAUDE.md), [`.claude/settings.json`](../../.claude/settings.json) | **Covered; repository configuration is separate from `query()` code** |
| Tool-use preview | `tool()`, `createSdkMcpServer()`, `mcpServers`, `allowedTools`, tool messages | `src/tools/incident-metrics.ts` | **Covered; the SDK also completes the loop** |
| Typed failures | SDK result types, statuses, and terminal reasons | [`src/errors/classify-sdk-failure.ts`](../../src/errors/classify-sdk-failure.ts) | **Covered in mapping and tests** |

## 15. Agent SDK boundaries to remember

### 1. The Agent SDK owns the lower-level Messages request

Complete mode waits for the final result without displaying partial events. Stream mode requests and displays partial SDK messages. Both are accepted Week 2 behaviors for Sentinel.

### 2. Agent SDK partial messages still require an application acceptance boundary

Partial events are display/progress data. Sentinel accepts only a validated final result while the turn is not aborted; the Agent SDK does not remove that application responsibility.

### 3. `maxOutputTokens` metadata is not request-side `max_tokens`

The former describes model capability in `modelUsage`. The latter is a request limit that the installed Agent SDK `query()` options do not expose. `maxTurns` and `taskBudget` are different controls and are not substituted for it.

The accepted Week 2 scope uses the Agent SDK without adding a duplicate Client SDK path. Unsupported lower-level controls are documented accurately rather than represented by unrelated fields.

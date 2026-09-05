# Week 2 Annotated Learning Guide

## Purpose of this guide

I use this guide to connect each Week 2 learning point to the exact Sentinel code, experiment evidence, and result. I also identify items that are only partially covered or not implemented. This prevents an Agent SDK behavior from being incorrectly described as a direct Messages API behavior.

### Status labels

- **Complete** — implemented, exercised, and supported by code or saved evidence.
- **Partial** — part of the learning point is implemented, but an important part is missing or uses a different API layer.
- **Tested only** — covered by automated tests but not reproduced as a saved live API experiment.
- **Not implemented** — no code or experiment currently demonstrates the item.
- **Not applicable in this TypeScript design** — the language or selected SDK does not expose the requested form directly.

## 1. Week objective

| Learning point | Status | Code and evidence | What I implemented and learned |
| --- | --- | --- | --- |
| Call Claude using an official Python or TypeScript SDK | **Complete for the Agent SDK; partial for the Client SDK** | [`package.json`](../package.json#L19), [`src/index.ts`](../src/index.ts#L130) | I used the official TypeScript Claude Agent SDK and its `query()` async generator. I did not use the general-purpose `@anthropic-ai/sdk` Client SDK directly. The two SDKs operate at different abstraction levels. |
| Understand the Messages API request and response structure | **Partial** | [`src/index.ts`](../src/index.ts#L130), [`src/index.ts`](../src/index.ts#L176), [`src/index.ts`](../src/index.ts#L235) | I handled Agent SDK messages shaped around assistant, user, stream-event, tool-use, tool-result, and result messages. I did not call `client.messages.create()`, so I have not yet demonstrated the direct Messages API request object or its `stream: false/true` response types. |
| Produce and validate structured JSON output | **Complete** | [`src/contracts/incident-analysis.ts`](../src/contracts/incident-analysis.ts#L11), [`src/index.ts`](../src/index.ts#L139), [`src/validation/parse-incident-analysis.ts`](../src/validation/parse-incident-analysis.ts#L27) | I converted the Week 1 response shape into TypeScript interfaces and JSON Schema, requested API-supported structured output, and validated the returned value again with Ajv. |
| Handle streaming and common API failures | **Complete at the Agent SDK layer; partial as a direct Messages API exercise** | [`src/index.ts`](../src/index.ts#L135), [`src/index.ts`](../src/index.ts#L176), [`src/errors/classify-sdk-failure.ts`](../src/errors/classify-sdk-failure.ts#L10) | I displayed Agent SDK partial events and mapped common failures into application categories. I did not send a direct Messages API request with `stream: true`. |
| Send text and image inputs | **Complete** | [`src/index.ts`](../src/index.ts#L69), [`src/index.ts`](../src/index.ts#L445), [`experiments/multimodal/multimodal-evidence-run-1.json`](../experiments/multimodal/multimodal-evidence-run-1.json#L99) | I supported text prompts and base64 image content blocks. I validated the image extension and required incident text before sending the multimodal request. |
| Select a model and thinking configuration | **Complete for direct versus adaptive thinking; partial for the broader feature set** | [`src/config/reasoning.ts`](../src/config/reasoning.ts#L8), [`src/index.ts`](../src/index.ts#L138), [`experiments/thinking-comparison/comparison.md`](../experiments/thinking-comparison/comparison.md#L5) | I selected a model alias through configuration and compared disabled thinking with adaptive thinking at high effort. I did not run manual extended thinking, fast mode, or a broad model-tier comparison. |
| Track tokens, latency, and estimated cost | **Complete for post-request usage** | [`src/index.ts`](../src/index.ts#L299), [`experiments/request-metadata-run-1.json`](../experiments/request-metadata-run-1.json#L1) | I recorded input/output/cache token usage, latency, cost, model usage, estimated thinking tokens, and stop reason. I did not call the token-counting endpoint before a request. |
| Understand and experiment with prompt caching | **Complete** | [`src/index.ts`](../src/index.ts#L146), [`experiments/prompt-caching/comparison.md`](../experiments/prompt-caching/comparison.md#L9) | I kept a stable system contract, changed only the incident input, and observed cache creation followed by a cache read. I learned that caching is transparent request optimization, not memory. |
| Configure the Sentinel repository for Claude Code | **Complete** | [`CLAUDE.md`](../CLAUDE.md#L3), [`.claude/settings.json`](../.claude/settings.json#L1), [`.claude/commands/verify-sentinel.md`](../.claude/commands/verify-sentinel.md#L1) | I configured shared instructions, narrow permissions, and one reusable verification command. I inspected the loaded configuration in clean and continued sessions. |
| Preview how Claude requests tools | **Complete** | [`src/tools/incident-metrics.ts`](../src/tools/incident-metrics.ts#L78), [`src/index.ts`](../src/index.ts#L203), [`experiments/tool-use/lifecycle-notes.md`](../experiments/tool-use/lifecycle-notes.md#L3) | I exposed one read-only application tool, recorded Claude's request, validated its input, executed application code, returned the result, and validated the final analysis. |

The working application meets the main safety outcome: it returns either a validated incident analysis or an explicit typed failure. The accepted-output path is in [`src/index.ts`](../src/index.ts#L247), and the typed rejection contract is in [`src/errors/sentinel-failure.ts`](../src/errors/sentinel-failure.ts#L82).

## 2. Incident scenario and Sentinel milestone

### Incident scenario

I used the fictional `INC-104` checkout incident throughout the structured-output, thinking, caching, multimodal, and tool-use exercises. The tool's fixed fictional metric is defined in [`src/tools/incident-metrics.ts`](../src/tools/incident-metrics.ts#L39).

### Application flow

| Milestone stage | Status | Implementation | What it means |
| --- | --- | --- | --- |
| Incident text or dashboard image | **Complete** | Text reaches [`createIncidentAnalysisPrompt()`](../src/prompts/incident-analysis.ts#L3); image input is built in [`createImagePrompt()`](../src/index.ts#L69). | Sentinel accepts either typed incident evidence or an image plus incident description. |
| Validated application input | **Partial** | Empty image path/text and unsupported image types are rejected in [`src/index.ts`](../src/index.ts#L48) and [`src/index.ts`](../src/index.ts#L445). | Image input has explicit checks. Plain text is trimmed and required to be non-empty, but there is no separate text-input schema, size limit, or incident-ID contract. |
| Claude Messages API | **Partial** | The request goes through Agent SDK `query()` in [`src/index.ts`](../src/index.ts#L130). | Claude is called successfully, but this is an agent-layer request rather than a direct `client.messages.create()` Messages API call. |
| Streamed or complete response | **Complete at Agent SDK layer** | Mode selection is in [`src/index.ts`](../src/index.ts#L429); partial events are handled at [`src/index.ts`](../src/index.ts#L176). | Stream mode displays partial events. Complete mode suppresses them and waits for the final Agent SDK result. Neither mode sets the direct Messages API `stream` field. |
| Structured-output validation | **Complete** | Output format is requested at [`src/index.ts`](../src/index.ts#L139), then validated at [`src/index.ts`](../src/index.ts#L247). | API-supported structure and application validation form two separate boundaries. |
| Accepted analysis or typed failure | **Complete** | Acceptance is printed at [`src/index.ts`](../src/index.ts#L296); failures are formatted in [`src/errors/sentinel-failure.ts`](../src/errors/sentinel-failure.ts#L82). | A partial, malformed, or schema-invalid value is never represented as an accepted analysis. |
| Model, prompt, token, latency, and cache metadata | **Partial** | Model/token/latency/cost/cache fields are printed at [`src/index.ts`](../src/index.ts#L299). | Model and usage metadata are recorded. The prompt text, prompt version, or prompt hash is not included in run metadata, so explicit prompt metadata remains missing. |

I continued in the same Git repository. The project scripts are in [`package.json`](../package.json#L6), and `npm start` automatically builds through [`prestart`](../package.json#L9).

## 3. Claude API and SDK learning points

### Official Anthropic Python or TypeScript SDK

**Status: Complete for the Agent SDK; direct Client SDK pending.**

I installed `@anthropic-ai/claude-agent-sdk` in [`package.json`](../package.json#L20). The Agent SDK provides `query()`, an agent loop, partial events, tools, structured output, usage, and Claude Code integration. The official general-purpose TypeScript Client SDK is `@anthropic-ai/sdk`; it exposes `client.messages.create()` directly. I did not declare or instantiate that client.

Official references:

- [TypeScript Client SDK](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript)
- [TypeScript Agent SDK](https://code.claude.com/docs/en/agent-sdk/typescript)

### Messages API

**Status: Not directly implemented.**

The direct Messages API request requires fields such as `model`, `max_tokens`, `messages`, and optionally `system`, `format`, and `stream`. Sentinel currently passes Agent SDK options instead. The `complete` mode only controls whether I display partial Agent SDK messages; it is not equivalent to `stream: false`. The `stream` mode enables `includePartialMessages`; it is not equivalent to `stream: true`.

Relevant current Agent SDK code:

- [`query({ prompt, options })`](../src/index.ts#L130)
- [`includePartialMessages`](../src/index.ts#L135)
- [`stream_event` handling](../src/index.ts#L176)

Reference for the direct request contract: [Create a Message](https://platform.claude.com/docs/en/api/http/messages/create).

### System instructions and user messages

**Status: Complete.**

I separated stable system behavior from incident-specific input:

- The stable evidence rules are in [`incidentAnalysisInstructions`](../src/prompts/incident-analysis.ts#L1).
- Multimodal classification rules are in [`multimodalEvidenceInstructions`](../src/prompts/incident-analysis.ts#L7).
- The incident input is wrapped separately in [`createIncidentAnalysisPrompt()`](../src/prompts/incident-analysis.ts#L3).
- These are passed as `systemPrompt` and `prompt` in [`runTurn()`](../src/index.ts#L130).

I learned that stable instructions belong in the system contract, while incident evidence belongs in the user request. This separation also creates a reusable prefix for prompt caching.

### Text, image, and other content blocks

**Status: Complete.**

- Text requests use a string prompt at [`src/index.ts`](../src/index.ts#L475).
- Image requests create a user message containing both a text block and a base64 image block at [`src/index.ts`](../src/index.ts#L86).
- Tool requests and results are observed as `tool_use` and `tool_result` blocks at [`src/index.ts`](../src/index.ts#L203) and [`src/index.ts`](../src/index.ts#L220).

I learned that a Claude message is not always one text string. Its content is a sequence of typed blocks, and each block type requires separate handling.

### Model identifiers

**Status: Complete for selection and observation.**

The requested model is read from `CLAUDE_MODEL`, with `sonnet` as the fallback at [`src/index.ts`](../src/index.ts#L138). The exact canonical models used are recorded in each run's `modelUsage`, for example [`direct-run-1-metadata.json`](../experiments/thinking-comparison/direct-run-1-metadata.json#L1).

I learned to distinguish the requested alias from the canonical model reported by the SDK.

### `max_tokens`

**Status: Not implemented as a request parameter.**

Sentinel does not set request-side `max_tokens`. The saved `maxOutputTokens` values in [`direct-run-1-metadata.json`](../experiments/thinking-comparison/direct-run-1-metadata.json#L13) are model capability metadata, not the limit I selected for a request.

I learned that `max_tokens` is a hard upper limit, not a promised output length. Claude can stop earlier because it reaches a natural end, a stop sequence, a tool call, a refusal, or another stop condition. A direct Messages API exercise should set and vary this parameter explicitly.

### Stop reasons

**Status: Complete.**

Sentinel records `message.stop_reason` at [`src/index.ts`](../src/index.ts#L315). Recorded examples include `end_turn` in [`request-metadata-run-1.json`](../experiments/request-metadata-run-1.json#L5) and `tool_use` in [`tool-use-run-1.json`](../experiments/tool-use/tool-use-run-1.json#L127).

I learned that `tool_use` does not mean the response failed. It means Claude requested a tool; API-supported structured output can also use a tool-like completion path.

### Usage information

**Status: Complete for response usage.**

The application records input, output, cache-creation, cache-read, model usage, latency, and cost at [`src/index.ts`](../src/index.ts#L299). I use response usage as measured evidence rather than estimating token totals from visible text.

### Synchronous and asynchronous requests

**Status: Asynchronous complete; synchronous not applicable in this TypeScript implementation.**

The Agent SDK returns an async generator, consumed with `for await` in [`src/index.ts`](../src/index.ts#L130). TypeScript network APIs are asynchronous; a non-streaming response still returns a Promise and is not a synchronous blocking API in the Python sense.

I learned not to confuse these pairs:

- synchronous versus asynchronous programming;
- non-streaming versus streaming HTTP responses;
- hiding partial events versus sending a direct API request with `stream: false`.

### Environment-based configuration

**Status: Complete.**

Environment loading begins with [`import 'dotenv/config'`](../src/index.ts#L1). Sentinel checks `CLAUDE_CODE_OAUTH_TOKEN` at [`src/index.ts`](../src/index.ts#L356), and `.env` is excluded by the repository [`.gitignore`](../../.gitignore#L3). A safe template is stored in [`.env.example`](../.env.example#L1).

I used a Claude Code OAuth token with the Agent SDK. The direct Client SDK documentation uses `ANTHROPIC_API_KEY` for direct Claude API access, so the current credential choice is another reason the direct Messages API exercise is not complete.

### Basic incident request and printed response

**Status: Complete through the Agent SDK; direct Messages API version pending.**

The normal CLI sends incident evidence at [`src/index.ts`](../src/index.ts#L475), validates the final structured output, and prints it at [`src/index.ts`](../src/index.ts#L288).

## 4. Streaming and failure handling

### Complete, non-streaming response

**Status: Partial.**

Complete mode waits for the final Agent SDK result and does not display partial events. It does not send a direct Messages API request with `stream: false`. The CLI explicitly states this limitation at [`src/index.ts`](../src/index.ts#L413).

### Streamed response

**Status: Complete at the Agent SDK layer; direct `stream: true` pending.**

Stream mode sets `includePartialMessages` and renders `stream_event` deltas at [`src/index.ts`](../src/index.ts#L135) and [`src/index.ts`](../src/index.ts#L176). A saved structured result from stream mode is [`api-structured-output-stream-run-1.json`](../experiments/structured-output/api-structured-output-stream-run-1.json#L1).

### Failure outcomes

| Required outcome | Status | Implementation and evidence | Learning |
| --- | --- | --- | --- |
| Invalid input | **Complete** | Image type/read failures are raised in [`src/index.ts`](../src/index.ts#L48); missing image/text is rejected at [`src/index.ts`](../src/index.ts#L445). | Input failures occur before model-output validation. |
| Authentication or configuration | **Implemented and tested; no saved live failure run** | Missing token check: [`src/index.ts`](../src/index.ts#L356). Authentication mapping: [`classify-sdk-failure.ts`](../src/errors/classify-sdk-failure.ts#L39). Test: [`sentinel.test.ts`](../src/tests/sentinel.test.ts#L100). | Configuration errors and API authentication errors belong to a different category from model-output failures. |
| Rate limit | **Tested only** | Mapping: [`classify-sdk-failure.ts`](../src/errors/classify-sdk-failure.ts#L43). Test: [`sentinel.test.ts`](../src/tests/sentinel.test.ts#L100). | A 429 is an integration failure; retry policy is separate from content validation. |
| Timeout | **Tested only** | Mapping: [`classify-sdk-failure.ts`](../src/errors/classify-sdk-failure.ts#L48). Test: [`sentinel.test.ts`](../src/tests/sentinel.test.ts#L100). | A timeout is a runtime outcome even if Claude might still be generating remotely. |
| Interrupted stream | **Implemented and exercised; saved stream-specific artifact missing** | Abort selection: [`src/index.ts`](../src/index.ts#L121). Signal handler: [`src/index.ts`](../src/index.ts#L370). Test contract: [`sentinel.test.ts`](../src/tests/sentinel.test.ts#L116). | I proved in the terminal that partial output was rejected, but only the complete-mode interruption was saved in [`interrupted-request-complete-mode-run-1.json`](../experiments/failures/interrupted-request-complete-mode-run-1.json#L1). A stream-specific saved record remains missing. |
| Context-limit failure | **Tested only** | Mapping: [`classify-sdk-failure.ts`](../src/errors/classify-sdk-failure.ts#L26). Test: [`sentinel.test.ts`](../src/tests/sentinel.test.ts#L100). | Context limit is an input-size boundary, not an unsafe-content result. |
| Malformed response | **Complete** | Parser: [`parse-incident-analysis.ts`](../src/validation/parse-incident-analysis.ts#L27). Test: [`sentinel.test.ts`](../src/tests/sentinel.test.ts#L48). Invalid artifact: [`prompt-requested-json-run-2-invalid.txt`](../experiments/structured-output/prompt-requested-json-run-2-invalid.txt#L1). | JSON parsing answers only whether the syntax is valid. |
| Schema-invalid output | **Complete** | Validator: [`parse-incident-analysis.ts`](../src/validation/parse-incident-analysis.ts#L43). Tests: [`sentinel.test.ts`](../src/tests/sentinel.test.ts#L58). | Schema validation checks required fields, types, enums, and unexpected properties. |

### Interrupted stream boundary

The first Ctrl+C aborts the active request at [`src/index.ts`](../src/index.ts#L370). After the query stops, Sentinel checks the abort signal and creates an interrupted failure at [`src/index.ts`](../src/index.ts#L326). `receivedResult` must be true before the turn is considered complete at [`src/index.ts`](../src/index.ts#L338).

I learned that partial display and response acceptance are separate concerns. A stream may print useful-looking JSON fragments, but Sentinel accepts only the final structured value after validation.

## 5. Structured output

### Application contract fields

**Status: Complete.**

The contract in [`IncidentAnalysis`](../src/contracts/incident-analysis.ts#L11) represents:

- `facts`
- `assumptions`
- `hypotheses`
- `supporting_evidence`
- `contradicting_evidence`
- `missing_information`
- `reversible_next_actions`
- `uncertainty`

The equivalent JSON Schema begins at [`incidentAnalysisSchema`](../src/contracts/incident-analysis.ts#L88).

### Asking for JSON through a prompt

**Status: Complete as an experiment.**

The valid prompt-requested response is stored in [`prompt-requested-json-run-1-formatted.json`](../experiments/structured-output/prompt-requested-json-run-1-formatted.json#L1). The invalid response is stored in [`prompt-requested-json-run-2-invalid.txt`](../experiments/structured-output/prompt-requested-json-run-2-invalid.txt#L1).

I learned that a prompt can encourage JSON but does not provide the same structural guarantee as an API-enforced schema.

### Defining JSON Schema

**Status: Complete.**

I defined strict object schemas with required fields and `additionalProperties: false` in [`src/contracts/incident-analysis.ts`](../src/contracts/incident-analysis.ts#L88). This makes unexpected output a validation failure rather than silently ignoring it.

### API-supported structured output

**Status: Complete through the Agent SDK.**

The schema is passed through `outputFormat: { type: 'json_schema' }` at [`src/index.ts`](../src/index.ts#L139). Complete and stream-mode examples are saved in [`experiments/structured-output`](../experiments/structured-output).

### Parsing JSON successfully

**Status: Complete.**

`parseIncidentAnalysis()` uses `JSON.parse()` and converts syntax errors into `malformed-json` at [`src/validation/parse-incident-analysis.ts`](../src/validation/parse-incident-analysis.ts#L27).

### Validating the structure

**Status: Complete.**

Ajv compiles the schema once at [`src/validation/parse-incident-analysis.ts`](../src/validation/parse-incident-analysis.ts#L11). A parsed value is accepted only after `validateIncidentAnalysisValue()` succeeds at [`src/validation/parse-incident-analysis.ts`](../src/validation/parse-incident-analysis.ts#L43).

### Validating whether content is supported

**Status: Partial; human evaluation is recorded, but no automated semantic validator exists.**

The prompt instructs Claude to separate facts, assumptions, and hypotheses at [`src/prompts/incident-analysis.ts`](../src/prompts/incident-analysis.ts#L1). Multimodal and tool-use outputs explicitly classify or discuss unsupported content in [`multimodal-evidence-run-1.json`](../experiments/multimodal/multimodal-evidence-run-1.json#L99) and [`lifecycle-notes.md`](../experiments/tool-use/lifecycle-notes.md#L32).

I learned that a schema-valid conclusion can still be unsupported. The application verifies shape; evidence support still requires source comparison, policy checks, or human review.

## 6. Multimodal input

| Activity | Status | Code and evidence | Learning |
| --- | --- | --- | --- |
| Create/use a fictional dashboard | **Complete** | [`incident-dashboard.png`](../experiments/multimodal/incident-dashboard.png) | The image is a controlled fictional input rather than production evidence. |
| Send image with incident description | **Complete** | [`createImagePrompt()`](../src/index.ts#L69), [`/image` flow](../src/index.ts#L445) | The image and its accompanying text are distinct content blocks in one user message. |
| Record text observations | **Complete** | [`evidence_classification`](../experiments/multimodal/multimodal-evidence-run-1.json#L99) | Direct text claims stay separate from visual observations. |
| Record image observations | **Complete** | [`image_observations`](../experiments/multimodal/multimodal-evidence-run-1.json#L99) | A visible image value is still model-interpreted and must be checked against the actual image. |
| Record inferences | **Complete** | [`inferences`](../experiments/multimodal/multimodal-evidence-run-1.json#L99) | Combining text and image information creates an inference, not a new direct observation. |
| Record unsupported information | **Complete** | [`unsupported_claims`](../experiments/multimodal/multimodal-evidence-run-1.json#L99) | A convincing multimodal answer can still introduce claims absent from both sources. |

The multimodal contract is defined in [`EvidenceClassification`](../src/contracts/incident-analysis.ts#L23) and validated by [`validateMultimodalIncidentAnalysisValue()`](../src/validation/parse-incident-analysis.ts#L58).

## 7. Model selection and thinking

### Model tiers and trade-offs

**Status: Partial.**

I used Sonnet for the primary analysis and observed Haiku helper usage in metadata. I did not run controlled Opus, Sonnet, and Haiku versions of the same incident. Therefore, I have measurements for one primary model configuration, not a complete tier comparison across capability, quality, latency, cost, and supported features.

This is sufficient for the Week 2 paired direct-versus-thinking exercise. Detailed model benchmarking belongs to Week 4, so I record the broader tier comparison as a future experiment rather than inventing results.

Reference: [Choosing the right model](https://platform.claude.com/docs/en/about-claude/models/choosing-a-model).

### Direct response

**Status: Complete.**

Direct mode sets `thinking: { type: 'disabled' }` at [`src/config/reasoning.ts`](../src/config/reasoning.ts#L16). Its analysis and metadata are saved in [`direct-run-1-analysis.json`](../experiments/thinking-comparison/direct-run-1-analysis.json#L1) and [`direct-run-1-metadata.json`](../experiments/thinking-comparison/direct-run-1-metadata.json#L1).

### Extended thinking

**Status: Not separately implemented.**

I did not run a manual fixed-budget extended-thinking configuration. The comparison used adaptive thinking instead.

### Adaptive thinking

**Status: Complete.**

Thinking mode sets `thinking: { type: 'adaptive' }` at [`src/config/reasoning.ts`](../src/config/reasoning.ts#L27). The run recorded approximately 1,200 thinking tokens in [`thinking-run-1-metadata.json`](../experiments/thinking-comparison/thinking-run-1-metadata.json#L32).

Reference: [Adaptive thinking](https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking).

### Effort controls

**Status: Complete for one value, not a sweep.**

Thinking mode sets `effort: 'high'` at [`src/config/reasoning.ts`](../src/config/reasoning.ts#L31). I did not compare low, medium, high, xhigh, or max effort levels.

I learned that thinking controls whether/how Claude reasons in thinking blocks, while effort influences how much work it applies across the whole response, including tool use and thinking. Reference: [Effort](https://platform.claude.com/docs/en/build-with-claude/effort).

### Fast mode

**Status: Not implemented.**

Sentinel does not set a fast-mode or speed option, and the selected Sonnet experiment was not a fast-mode comparison. Fast mode is a separate supported-model and account-access feature, not a synonym for low effort. Reference: [Fast mode](https://platform.claude.com/docs/en/build-with-claude/fast-mode).

### Paired difficult-case comparison

**Status: Complete.**

The same difficult incident was run in direct and adaptive-thinking configurations. [`comparison.md`](../experiments/thinking-comparison/comparison.md#L5) compares:

- analysis quality;
- missing evidence;
- latency;
- input and output tokens;
- thinking tokens;
- estimated cost.

I observed that adaptive thinking increased duration by 40.9%, output tokens by 50.4%, and estimated cost by 39.8%, without a material evidence-quality advantage in this single run. I learned that additional thinking can improve reasoning effort but cannot create missing incident evidence.

## 8. Tokens, context, and cost

### Recorded request metadata

**Status: Complete.**

| Required field | Evidence |
| --- | --- |
| Model | [`direct-run-1-metadata.json`](../experiments/thinking-comparison/direct-run-1-metadata.json#L2) |
| Input tokens | [`direct-run-1-metadata.json`](../experiments/thinking-comparison/direct-run-1-metadata.json#L30) |
| Output tokens | [`direct-run-1-metadata.json`](../experiments/thinking-comparison/direct-run-1-metadata.json#L31) |
| Thinking tokens | [`thinking-run-1-metadata.json`](../experiments/thinking-comparison/thinking-run-1-metadata.json#L32) |
| Maximum output tokens supported by model | [`thinking-run-1-metadata.json`](../experiments/thinking-comparison/thinking-run-1-metadata.json#L25) |
| Latency | [`thinking-run-1-metadata.json`](../experiments/thinking-comparison/thinking-run-1-metadata.json#L33) |
| Estimated cost | [`thinking-run-1-metadata.json`](../experiments/thinking-comparison/thinking-run-1-metadata.json#L35) |
| Stop reason | [`thinking-run-1-metadata.json`](../experiments/thinking-comparison/thinking-run-1-metadata.json#L36) |

The recorded `maxOutputTokens` value is the model's supported maximum reported by the SDK. It is not evidence that I set the request's `max_tokens` parameter.

### Token-counting capability

**Status: Not implemented.**

I recorded actual usage after requests but did not call the Messages token-counting endpoint before a request. A direct Client SDK implementation should use token counting to estimate request size before generation. Reference: [Token counting](https://platform.claude.com/docs/en/build-with-claude/token-counting).

### Why the same prompt may tokenize differently across models

Different model families can use different tokenizers or tokenizer versions. The same visible text may therefore produce a different token count. Hidden request components, tool definitions, system instructions, images, and formatting also affect the total request size. I should compare counts using the token-counting endpoint with the exact same structured request and only the model changed.

### How context length affects request size

The context window contains the system prompt, message history, tool definitions, images/documents, tool results, and generated output. Longer history leaves less room for the next output and can reach a context-limit failure. Cached input still counts toward the context window even when it is cheaper to process. Reference: [Context windows](https://platform.claude.com/docs/en/build-with-claude/context-windows).

### Why repeated system instructions consume tokens

The system contract is part of every independent request. Without caching, the model processes those tokens again. Sentinel keeps that contract stable at [`src/index.ts`](../src/index.ts#L146), allowing later requests to reuse a cached prefix.

### Why `max_tokens` is a limit rather than a guaranteed length

`max_tokens` limits the maximum generated output. Claude may finish earlier with `end_turn`, call a tool, encounter a stop sequence, refuse, or hit another terminal condition. I have learned this distinction, but the application still needs a direct request experiment that sets the parameter explicitly.

## 9. Prompt caching

### Stable contract with changing incidents

**Status: Complete.**

The stable contract is appended through `systemPrompt` with dynamic sections excluded at [`src/index.ts`](../src/index.ts#L146). Each incident is a new `query()` call, so the cache experiment does not rely on session resume or conversation history.

### Paired requests

| Request | Analysis | Metadata |
| --- | --- | --- |
| Stable contract + Incident A | [`request-1-incident-a-analysis.json`](../experiments/prompt-caching/request-1-incident-a-analysis.json#L1) | [`request-1-incident-a-metadata.json`](../experiments/prompt-caching/request-1-incident-a-metadata.json#L30) |
| Same contract + Incident B | [`request-2-incident-b-analysis.json`](../experiments/prompt-caching/request-2-incident-b-analysis.json#L1) | [`request-2-incident-b-metadata.json`](../experiments/prompt-caching/request-2-incident-b-metadata.json#L30) |

### Recorded measurements

- Request 1 created 10,000 cache tokens and read 0.
- Request 2 created 928 cache tokens and read 9,103.
- Both requests reported 2 uncached input tokens.
- Request 2 reused approximately 90.7% of its input-token accounting.
- Total reported cost decreased by approximately 50.5%.
- Request 2 took longer, so this pair did not demonstrate a latency improvement.

The calculations and caveats are documented in [`comparison.md`](../experiments/prompt-caching/comparison.md#L9).

### Prompt caching versus related concepts

| Concept | My explanation |
| --- | --- |
| Prompt caching | An API optimization that reuses processing for an identical prompt prefix across eligible requests. It is visible through cache-creation and cache-read usage fields. |
| KV cache | Internal key/value attention state used during model generation. It is a lower-level inference mechanism and is not the same user-controlled cross-request prompt-cache contract. |
| Conversation history | Earlier messages intentionally supplied or restored as context. A continued Claude Code session demonstrated this by remembering `SENTINEL-104`. |
| Application memory | State intentionally stored by application code, a database, a file, or another memory service. Sentinel does not store incident conversation memory. |

I learned that a cache hit does not restore a previous answer and does not cause Incident B to inherit Incident A's facts. Reference: [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching).

The account, selected model, and prompt length did support caching: the non-zero cache-creation and cache-read counters are the evidence. Advanced cache invalidation and optimization belong to Week 4 and are not part of this implementation.

## 10. Claude Code foundation

### Required files

**Status: Complete.**

- [`CLAUDE.md`](../CLAUDE.md#L1)
- [`.claude/settings.json`](../.claude/settings.json#L1)

### Project instructions

| Required topic | Location |
| --- | --- |
| Sentinel purpose | [`CLAUDE.md`](../CLAUDE.md#L3) |
| Project structure | [`CLAUDE.md`](../CLAUDE.md#L9) |
| Build and test commands | [`CLAUDE.md`](../CLAUDE.md#L22) |
| Coding conventions | [`CLAUDE.md`](../CLAUDE.md#L34) |
| Safety boundaries | [`CLAUDE.md`](../CLAUDE.md#L46) |
| Definition of done | [`CLAUDE.md`](../CLAUDE.md#L57) |

### Reusable project command

**Status: Complete.**

`/verify-sentinel` is defined in [`.claude/commands/verify-sentinel.md`](../.claude/commands/verify-sentinel.md#L1). It builds the project and validates seven recorded outputs without starting Sentinel or making a model request.

I learned that permission rules match actual commands. When Claude initially added loops and chained commands, the narrow allow rules correctly requested approval. I then constrained the reusable command to exact invocations at [`.claude/commands/verify-sentinel.md`](../.claude/commands/verify-sentinel.md#L9).

### Clean versus continued session

**Status: Complete.**

The experiment is recorded in [`configuration-and-session-comparison.md`](../experiments/claude-code/configuration-and-session-comparison.md#L31). A continued session remembered `SENTINEL-104`; a clean session did not. Both loaded the project settings and `CLAUDE.md`.

### Loaded instructions and settings

**Status: Complete.**

I inspected `/status`, `/context`, and `/permissions`. The shared project settings, one memory file for `CLAUDE.md`, allowed build/validation commands, and denied `.env` read rule are recorded in [`configuration-and-session-comparison.md`](../experiments/claude-code/configuration-and-session-comparison.md#L3).

### Why `CLAUDE.md` is not a security boundary

**Status: Complete.**

`CLAUDE.md` is context interpreted by the model. It guides choices but cannot guarantee compliance. Claude Code evaluates permission rules before covered tool calls, while stronger boundaries require sandboxing, operating-system permissions, credential isolation, and application checks. This distinction is documented at [`configuration-and-session-comparison.md`](../experiments/claude-code/configuration-and-session-comparison.md#L70).

I did not introduce skills, plugins, subagents, headless workflows, or external MCP configuration because those topics are outside the Week 2 scope.

## 11. Tool-use preview

### Lifecycle mapping

| Required stage | Code and evidence | What I learned |
| --- | --- | --- |
| Application sends a tool definition | [`tool()` definition](../src/tools/incident-metrics.ts#L89); registration in [`runTurn()`](../src/index.ts#L160) | The application defines the tool name, description, input schema, annotations, and handler. Claude sees only what the application exposes. |
| Claude returns `tool_use` | [`src/index.ts`](../src/index.ts#L203); [`tool-use-run-1.json`](../experiments/tool-use/tool-use-run-1.json#L3) | Claude requested a tool with structured arguments and a unique ID. The request did not execute the operation. |
| Application validates and executes | Zod input shape at [`incident-metrics.ts`](../src/tools/incident-metrics.ts#L54); handler at [`incident-metrics.ts`](../src/tools/incident-metrics.ts#L89) | The SDK validates the schema before entering the handler. Application code controls the in-memory lookup. |
| Application returns `tool_result` | [`src/index.ts`](../src/index.ts#L220); [`tool-use-run-1.json`](../experiments/tool-use/tool-use-run-1.json#L22) | The result references the original tool-use ID and can be marked as an error or success. |
| Claude continues the response | Structured analysis in [`tool-use-run-1.json`](../experiments/tool-use/tool-use-run-1.json#L33) | Claude used the retrieved metric in its analysis, but the final output still required schema validation and evidence review. |

### Required identification

- **What Claude requested:** `get_incident_metric` for `INC-104` and `checkout_error_rate`.
- **What the application validated:** only the literal incident ID and metric supported by the tool schema.
- **What application code executed:** `readIncidentMetric()` at [`incident-metrics.ts`](../src/tools/incident-metrics.ts#L72).
- **What result returned:** 9 percent, observed at 10:04 UTC, sourced from the fictional Sentinel monitoring snapshot.

The detailed first-person observations are in [`lifecycle-notes.md`](../experiments/tool-use/lifecycle-notes.md#L3). The implementation goes slightly beyond a paper preview because the Agent SDK completed the tool loop, but the exposed tool remains narrow, read-only, local, and fictional.

## 12. Required exercises status

| Exercise | Status | Evidence or gap |
| --- | --- | --- |
| 1. Streaming and non-streaming mode | **Partial** | Both display modes work through the Agent SDK. Direct Messages API `stream: false/true` requests are not implemented. |
| 2. Reject interrupted stream | **Implemented and exercised; saved evidence partial** | Abort code and tests exist. A stream-specific JSON artifact is not saved. |
| 3. One valid and one invalid structured response | **Complete** | [`experiments/structured-output`](../experiments/structured-output) |
| 4. One fictional dashboard image | **Complete** | [`incident-dashboard.png`](../experiments/multimodal/incident-dashboard.png) |
| 5. Classify failure categories | **Complete** | [`sentinel-failure.ts`](../src/errors/sentinel-failure.ts#L1), [`sentinel.test.ts`](../src/tests/sentinel.test.ts#L100) |
| 6. Compare direct and thinking/effort | **Complete** | [`experiments/thinking-comparison/comparison.md`](../experiments/thinking-comparison/comparison.md#L1) |
| 7. Record tokens, latency, stop reason, cost | **Complete** | [`direct-run-1-metadata.json`](../experiments/thinking-comparison/direct-run-1-metadata.json#L30) |
| 8. Basic prompt-caching experiment | **Complete** | [`experiments/prompt-caching/comparison.md`](../experiments/prompt-caching/comparison.md#L1) |
| 9. `CLAUDE.md` and project settings | **Complete** | [`CLAUDE.md`](../CLAUDE.md), [`.claude/settings.json`](../.claude/settings.json) |
| 10. Reusable Claude Code command | **Complete** | [`.claude/commands/verify-sentinel.md`](../.claude/commands/verify-sentinel.md) |
| 11. Annotated `tool_use` and `tool_result` | **Complete** | [`experiments/tool-use/lifecycle-notes.md`](../experiments/tool-use/lifecycle-notes.md#L1) |

## 13. Technical deliverables status

| Deliverable | Status | Location or gap |
| --- | --- | --- |
| Working Claude application | **Complete through Agent SDK** | [`src/index.ts`](../src/index.ts) |
| Streaming and non-streaming examples | **Partial** | Agent SDK examples exist; direct Messages API examples do not. |
| Structured-output schema and validator | **Complete** | [`src/contracts/incident-analysis.ts`](../src/contracts/incident-analysis.ts#L88), [`src/validation/parse-incident-analysis.ts`](../src/validation/parse-incident-analysis.ts#L43) |
| Multimodal request | **Complete** | [`experiments/multimodal`](../experiments/multimodal) |
| Typed failure categories | **Complete** | [`src/errors/sentinel-failure.ts`](../src/errors/sentinel-failure.ts#L1) |
| Model and thinking comparison | **Complete for direct versus adaptive thinking** | [`experiments/thinking-comparison`](../experiments/thinking-comparison) |
| Token, latency, and cost record | **Complete** | [`experiments/request-metadata-run-1.json`](../experiments/request-metadata-run-1.json#L1) |
| Prompt-caching experiment | **Complete** | [`experiments/prompt-caching`](../experiments/prompt-caching) |
| `CLAUDE.md` | **Complete** | [`CLAUDE.md`](../CLAUDE.md) |
| Basic Claude Code settings | **Complete** | [`.claude/settings.json`](../.claude/settings.json) |
| Reusable command | **Complete** | [`.claude/commands/verify-sentinel.md`](../.claude/commands/verify-sentinel.md) |
| Tool-use lifecycle notes | **Complete** | [`experiments/tool-use/lifecycle-notes.md`](../experiments/tool-use/lifecycle-notes.md) |
| Debugging report | **Complete** | [`experiments/debugging-report.md`](../experiments/debugging-report.md) |

## 14. Completion criteria audit

| Completion criterion | Status | My evidence and explanation |
| --- | --- | --- |
| Run Sentinel from a clean checkout | **Complete** | Setup is documented in [`README.md`](../README.md#L25); `npm start` builds automatically through [`prestart`](../package.json#L9). |
| Explain Claude request/response lifecycle | **Complete at Agent SDK layer; direct API partial** | This guide maps prompt, system contract, events, tool calls, result, validation, and metadata. Direct Messages API request types remain pending. |
| Produce and validate structured output | **Complete** | API-supported output plus Ajv validation. |
| Reject malformed and incomplete responses | **Complete in code and tests** | Parser/schema tests plus abort boundary. Stream-specific saved evidence remains missing. |
| Distinguish API failure from unsafe model content | **Complete** | API failures are classified in [`src/errors`](../src/errors); unsupported content is discussed in [`lifecycle-notes.md`](../experiments/tool-use/lifecycle-notes.md#L32). |
| Explain model and thinking trade-offs | **Complete for one paired comparison; broad tiers partial** | Direct versus adaptive-thinking measurements are recorded; Opus/Haiku primary runs and fast mode are not. |
| Read token and cache usage | **Complete** | Run metadata and caching comparison. |
| Estimate basic request cost | **Complete using SDK-reported cost** | Each metadata file records `total_cost_usd`; the exact pricing calculation was not independently reconstructed. |
| Explain prompt caching without confusing it with memory | **Complete** | Section 9 and the clean/continued session experiment establish the difference. |
| Configure Claude Code | **Complete** | Project instructions, settings, command, and loaded-source inspection. |
| Explain that Claude requests tools while application code controls execution | **Complete** | Section 11 maps each control boundary to code and evidence. |

## 15. Official resources mapped to the implementation

### API and output

- [SDK overview](https://platform.claude.com/docs/en/cli-sdks-libraries/overview) — clarifies the difference between general-purpose Client SDKs and other libraries.
- [Python Client SDK](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/python) — the alternative official language SDK; I selected TypeScript instead.
- [TypeScript Client SDK](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript) — reference for the pending direct `client.messages.create()` exercise.
- [Messages API](https://platform.claude.com/docs/en/api/http/messages/create) — reference for `model`, `messages`, `system`, `max_tokens`, `format`, `stream`, stop reasons, and usage.
- [Agent SDK TypeScript reference](https://code.claude.com/docs/en/agent-sdk/typescript) — reference for the implemented `query()` flow, tools, partial events, abort controller, and options.
- [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) — maps to the JSON Schema request and the separate Ajv validation boundary.
- [Streaming](https://platform.claude.com/docs/en/build-with-claude/streaming) — reference for the pending direct Messages API streaming exercise and its event lifecycle.
- [Vision](https://platform.claude.com/docs/en/build-with-claude/vision) — maps to the image-plus-text content-block request.
- [API errors](https://platform.claude.com/docs/en/api/errors) — maps to the typed integration and runtime failure categories.
- [Token counting](https://platform.claude.com/docs/en/build-with-claude/token-counting) — reference for the pending preflight count experiment.
- [Context windows](https://platform.claude.com/docs/en/build-with-claude/context-windows) — explains which request components consume context.

### Models and optimization

- [Models overview](https://platform.claude.com/docs/en/models/overview) — describes current model capabilities and supported features.
- [Choosing a model](https://platform.claude.com/docs/en/about-claude/models/choosing-a-model) — supports a future controlled model-tier comparison.
- [Thinking overview](https://platform.claude.com/docs/en/build-with-claude/thinking) — distinguishes thinking behavior from an ordinary direct response.
- [Adaptive thinking](https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking) — maps to the implemented thinking mode.
- [Extended thinking](https://platform.claude.com/docs/en/docs/build-with-claude/extended-thinking) — reference for the unimplemented manual extended-thinking comparison.
- [Effort](https://platform.claude.com/docs/en/build-with-claude/effort) — maps to `effort: 'high'` and future effort sweeps.
- [Fast mode](https://platform.claude.com/docs/en/build-with-claude/fast-mode) — reference for the unimplemented fast-mode exercise.
- [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) — maps to the stable-prefix paired experiment.

### Claude Code

- [Project memory and `CLAUDE.md`](https://code.claude.com/docs/en/memory) — maps to repository instructions and their loading hierarchy.
- [Settings](https://code.claude.com/docs/en/settings) — maps to `.claude/settings.json` and configuration scopes.
- [Commands and reusable skills](https://code.claude.com/docs/en/slash-commands) — explains the reusable `/verify-sentinel` command format.
- [Configuration debugging](https://code.claude.com/docs/en/debug-your-config) — maps to `/status`, `/context`, and permission inspection.
- [Sessions](https://code.claude.com/docs/en/how-claude-code-works) — supports the clean-versus-continued session learning.

## 16. Genuine remaining technical work

I would complete these items before claiming strict coverage of every Week 2 brief line:

1. Add a direct `@anthropic-ai/sdk` Messages API path using a supported direct API credential.
2. Demonstrate and save one direct non-streaming request with `stream: false`.
3. Demonstrate and save one direct streamed request with `stream: true`.
4. Set and observe request-side `max_tokens`; distinguish it from model `maxOutputTokens` capability metadata.
5. Call the token-counting endpoint before generation and compare the same request across models.
6. Record explicit prompt metadata such as prompt version or hash with each run.
7. Save a stream-specific interruption artifact showing `interrupted-stream` and rejected partial output.
8. Run a controlled model-tier comparison if capability, quality, latency, cost, and supported-feature coverage is required.
9. Run manual extended thinking and fast mode only if the selected models, account, and credentials support them; otherwise record those limitations.

The later topics named in the brief—skills, plugins, agents, headless operation, MCP, advanced tool authorization, hooks, and agent design—are intentionally outside this Week 2 implementation. The read-only tool loop goes beyond the minimum preview, but it does not imply that those later topics are complete.

## Final learning

The central Week 2 lesson is that Claude generates candidate output, while the application controls the boundary around it. In Sentinel, that boundary includes input checks, stable instructions, tool exposure, tool-input validation, cancellation, structural validation, typed failures, and observability. The remaining direct Messages API work is important because it exposes the lower-level request and response contract that the Agent SDK currently abstracts away.

# Sentinel: understanding the actual code before Week 3

Week 2 implementation record. Code excerpts describe that stage; the current application structure and commands are in the [project README](../../README.md).

Reviewed across 14–15 September 2026. This note describes the working files in `C:/Users/caw-dev/Desktop/ai-playground/sentinel`, including the existing staged changes. Git HEAD was `06163c6189e38be308858f9cf432bfea4fde40de`; this is a review of the current checkout, not just that commit. All source files under `src/`, application configuration, existing guides, and the Week 1–3 briefs were inspected. Existing implementation and experiment files were preserved.

**You already have a working tool interaction, including real application execution and Claude continuation.** The Claude Agent SDK runs that conversation loop. Sentinel supplies a narrow tool, validates the final analysis, and prints the outcome. Week 3 expands this into a controlled investigation with more tools, authorization, explicit execution limits, and tool-result checks.

The most important meaning of “accepted” in this code is: **a successful SDK final result, whose value passes the selected JSON Schema, accepted while cancellation is not signalled.** It does not mean the incident conclusions have been proven true.

Every source excerpt below is copied from the inspected file; the link identifies its starting line and the caption gives its range. Separate excerpts are intentionally separate code blocks. Explanations of “why we added it” describe the design's practical purpose and its connection to the learning briefs, rather than inventing an undocumented development history.

## Reading route and actual application flow

Read sections 1–6 to understand startup and the request. Sections 7–10 explain the existing tool functionality. Sections 11–15 follow response processing and failures. Sections 16–20 cover images, measurement, caching, and Claude Code. Sections 21–24 explain verification, the file map, and Week 3.

- [Startup and configuration](#1-startup-dependencies-environment-and-compilation)
- [The Claude request](#6-the-actual-claude-request-and-its-configuration)
- [The existing tool implementation](#7-the-tools-actual-data-and-input-schema)
- [Streaming, final output, and validation](#11-streaming-versus-complete-display)
- [Multimodal input](#16-multimodal-input-path-validation-base64-image-and-a-larger-output-contract)
- [Usage, latency, and cost](#17-token-usage-thinking-estimates-latency-model-identity-and-cost)
- [Claude Code configuration](#19-claudemd-permissions-and-runtime-settings)
- [What Week 3 adds](#24-exactly-what-week-3-adds-on-top-of-this-checkout)

```text
npm start
  → prestart compiles TypeScript into dist/
  → Node evaluates index.js and its imported modules
  → dotenv loads environment; Ajv compiles response validators
  → main() chooses reasoning configuration and checks the OAuth token
  → readline gets one trimmed line
      /mode   → update display setting; no Claude request
      /exit   → leave CLI
      /image  → collect path + text; create an async image-message generator
      text    → wrap evidence in the text prompt
  → runActiveTurn() creates the active AbortController
  → runTurn() creates a tool server, trace, and acceptance guard
  → query({ prompt, options }) delegates conversation handling to Agent SDK
      optional tool request → SDK validates → our lookup handler runs
                            → SDK returns tool_result → Claude continues
      partial events        → optionally print; never accept as the result
  → SDK result message
      reject cancellation / unsuccessful subtype / is_error
      validate result.structured_output with Ajv
      acceptance guard checks cancellation again, then marks acceptance
  → print analysis or streamed display, optional tool trace, and metadata
  → query iteration finishes; guard checks that a result was accepted
  → clear active AbortController; ask for the next input

Turn failure → formatFailure() → print rejection → normally ask again
Startup failure → main().catch() → print rejection → exitCode = 1
```

The image is read when the SDK consumes its generator, not when `createImagePrompt()` is first called. That is a detail the simplified flow above would otherwise hide. Each incident starts a new `query()`; the application does not build a conversation history or call `resume`/`continue`.

### 1. Startup, dependencies, environment, and compilation

**Code**

Source: [package.json](../../package.json) · lines 1–28.

```json
{
  "name": "sentinel",
  "version": "1.0.0",
  "description": "",
  "main": "dist/index.js",
  "scripts": {
    "test": "npm run build && node --test dist/tests/sentinel.test.js",
    "build": "tsc -p tsconfig.json",
    "prestart": "npm run build",
    "start": "node dist/index.js",
    "start:direct": "npm run build && node dist/index.js --reasoning direct",
    "start:thinking": "npm run build && node dist/index.js --reasoning thinking",
    "validate:json": "node dist/experiments/validate-prompt-json.js"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "module",
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.3.245",
    "ajv": "^8.20.0",
    "dotenv": "^17.4.2",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@types/node": "^26.3.0",
    "typescript": "^7.0.2"
  }
```

Source: [.env.example](../../.env.example) · lines 1–2.

```text
CLAUDE_CODE_OAUTH_TOKEN=
CLAUDE_MODEL=sonnet
```

Source: [src/index.ts](../../src/index.ts) · lines 1–3.

```ts
import 'dotenv/config';

import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
```

Source: [src/index.ts](../../src/cli/analysis-turn.ts) · lines 345–359.

```ts
async function main(): Promise<void> {
  const reasoningConfig = readReasoningConfig(process.argv.slice(2));
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN?.trim();

  if (!oauthToken) {
    throw new SentinelFailure(
      'missing-configuration',
      'CLAUDE_CODE_OAUTH_TOKEN is not configured.',
    );
  }

  const terminal = createInterface({ input, output });
  let responseMode: TurnResponseMode = 'complete';
  let activeAbortController: AbortController | undefined;
  let exitRequested = false;
```

**What it does**

This is a Node.js TypeScript command-line program. `npm start` first compiles it, then executes `dist/index.js`. At startup it loads environment configuration, reads the reasoning choice, and refuses to start without a nonblank Claude Code OAuth token.

**Why we added it**

Week 1's saved prompts become a repeatable application in Week 2. Configuration stays outside source, and a clean checkout can build before running.

**How it works**

- `prestart` is npm's lifecycle hook for `start`. The `main` package field does not launch the CLI; the `start` script does.
- `@anthropic-ai/claude-agent-sdk` provides `query`, the agent runtime, and the custom-tool helpers. The declared range is `^0.3.245`; the locally installed version inspected here is `0.3.245`. `package-lock.json` pins dependency resolution for `npm ci`.
- Ajv validates analysis objects against JSON Schema. Zod defines the tool input contract. They serve different boundaries.
- `dotenv/config` is a side-effect import: it loads environment variables before `main()` uses them. There is no `new Anthropic({ apiKey })` anywhere in Sentinel's source.
- The local `oauthToken` variable is only a presence check. It is not passed as a `query()` argument; authentication is supplied through the SDK's environment. Checking a nonempty token does not prove that it is valid.
- `CLAUDE_MODEL` is read later by `runTurn()`. Blank or absent values fall back to `sonnet`.
- The terminal starts in `complete` display mode, without an active request, with `exitRequested = false`.

**Code: compiler configuration**

Source: [tsconfig.json](../../tsconfig.json) · lines 1–46.

```jsonc
{
  // Visit https://aka.ms/tsconfig to read more about this file
  "compilerOptions": {
    // File Layout
    "rootDir": "src",
    "outDir": "dist",

    // Environment Settings
    // See also https://aka.ms/tsconfig/module
    "module": "nodenext",
    "target": "es2023",
    "types": ["node"],
    // For nodejs:
    // "lib": ["esnext"],
    // "types": ["node"],
    // and npm install -D @types/node

    // Other Outputs
    "sourceMap": true,
    "declaration": true,
    "declarationMap": true,

    // Stricter Typechecking Options
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,

    // Style Options
    // "noImplicitReturns": true,
    // "noImplicitOverride": true,
    // "noUnusedLocals": true,
    // "noUnusedParameters": true,
    // "noFallthroughCasesInSwitch": true,
    // "noPropertyAccessFromIndexSignature": true,

    // Recommended Options
    "strict": true,
    "jsx": "react-jsx",
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "noUncheckedSideEffectImports": true,
    "moduleDetection": "force",
    "skipLibCheck": true,

    "moduleResolution": "nodenext",
  }
}
```

`rootDir` and `outDir` keep editable TypeScript in `src/` and generated JavaScript in `dist/`. `type: module`, `module: nodenext`, and `moduleResolution: nodenext` explain the `.js` extensions in TypeScript relative imports: emitted Node ESM imports must name the JavaScript files. `target: es2023` chooses the JavaScript target. `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` make uncertain values explicit during compilation. The reasoning argument lookup is a practical example: an argument after `--reasoning` may be absent.

`verbatimModuleSyntax` preserves module syntax and makes type-only imports meaningful. `sourceMap`, `declaration`, and `declarationMap` generate debugging/type artifacts. `types: ["node"]` supplies Node globals. `skipLibCheck` skips checking dependency declaration files; it does not switch off strict checking of Sentinel's own source. The React JSX setting is template configuration here; there is no React UI.

**Connections, input, and output**

npm → TypeScript compiler → Node → module initialization → `main()`. Inputs are process arguments and environment; outputs are the configured terminal session or a `missing-configuration` failure. Run commands from the application directory; image paths, `.env`, and the offline validator's relative paths depend on the working directory. `query()` does not specify its own `cwd`.

**Without this code**

There would be no standard build/start entry point, environment loading, or early missing-token message. TypeScript contracts would also lose their compile-time checks.

**Important thing to remember**

Week 2 configuration and runtime setup are implemented. Compile-time TypeScript checking cannot validate a JSON value received at runtime.

### 2. Reading input and routing CLI commands

**Code**

Source: [src/index.ts](../../src/cli/session.ts) · lines 408–433.

```ts
  try {
    while (!exitRequested) {
      const userInput = (await terminal.question('You: ')).trim();

      if (!userInput) {
        continue;
      }

      if (['/exit', 'exit', 'quit'].includes(userInput.toLowerCase())) {
        break;
      }

      if (userInput.toLowerCase().startsWith('/mode')) {
        const requestedMode = userInput.toLowerCase().split(/\s+/)[1];

        if (requestedMode === 'complete' || requestedMode === 'stream') {
          responseMode = requestedMode;
          console.log(`Response mode: ${responseMode}\n`);
        } else {
          console.log(
            `Current mode: ${responseMode}. Use /mode complete or /mode stream.\n`,
          );
        }

        continue;
      }
```

Source: [src/index.ts](../../src/cli/session.ts) · lines 466–487.

```ts
        await runActiveTurn(createIncidentAnalysisPrompt(userInput));
      } catch (error: unknown) {
        console.error(`\n${formatFailure(error)}\n`);

        if (exitRequested) {
          break;
        }
      }
    }
  } catch (error: unknown) {
    if (!exitRequested) {
      throw error;
    }
  } finally {
    terminal.close();
  }
}

main().catch((error: unknown) => {
  console.error(formatFailure(error));
  process.exitCode = 1;
});
```

**What it does**

Reads one line, handles local commands, and sends ordinary text into the incident-analysis path. A failed turn normally leaves the CLI usable for the next incident.

**Why we added it**

It makes repeated Week 2 runs practical without restarting the application after every request or validation failure.

**How it works**

`terminal.question('You: ')` is awaited, then trimmed. Empty input is skipped, not returned as a typed rejection. `/exit`, `exit`, and `quit` are case-insensitive. `/mode` changes only `responseMode`; it does not contact Claude or alter the reasoning mode. The check uses `startsWith('/mode')`, so it is a small prefix-based parser, not a strict command grammar. Invalid mode arguments print usage and continue.

Ordinary text calls `createIncidentAnalysisPrompt(userInput)` and then awaits `runActiveTurn()`. This serializes requests: the CLI does not start multiple incident queries concurrently. The inner catch sends the error to `formatFailure()` and prints it. The outer catch rethrows unexpected terminal errors unless exit was already requested. `finally` closes readline. The bottom-level `main().catch()` sets the process exit code on startup/unhandled failures; a caught per-incident failure does not set that code.

**Connections, input, and output**

`main()` owns this loop. Input is a terminal line. Output is a local state change, process exit, or a request passed through the prompt builder to `runActiveTurn()`. It prints outcomes; it does not return an exported `Analysis | Failure` API response to another program.

**Without this code**

There is no interactive entry point, mode selection, or per-request recovery.

**Important thing to remember**

Week 2 input validation is basic here: text is trimmed and must be nonempty. There is no incident-text JSON schema, incident-ID check, maximum text length, or prompt-injection validator. Any other nonempty command-like text becomes incident evidence.

### 3. Direct reasoning versus thinking configuration

**Code**

Source: [src/config/reasoning.ts](../../src/config/reasoning.ts) · lines 1–39.

```ts
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
```

**What it does**

Converts process arguments into a typed configuration that `runTurn()` passes to the SDK.

**Why we added it**

Week 2 asks us to compare direct output with a supported thinking/effort configuration while keeping the same application contract.

**How it works**

`args.indexOf('--reasoning')` finds the option. If it is absent, mode is `direct`. If it is present without a following value, `requestedMode` is undefined and falls through to `invalid-input`. Unknown modes also fail. Other unrelated arguments are not comprehensively validated by this parser.

`direct` explicitly sets `thinking: { type: 'disabled' }`. `thinking` sets adaptive thinking, hides its displayed content with `display: 'omitted'`, and requests `effort: 'high'`. Omitted display does not mean thinking is disabled. No fixed `budgetTokens` is selected. There is no explicit extended-thinking budget mode or fast-mode option in the current application.

The `ReasoningConfig` interface keeps the app's readable `mode` label alongside the actual SDK settings. `effort` is optional because direct mode does not supply it. The conditional spread in the request adds an effort field only when one exists.

**Connections, input, and output**

`main()` calls `readReasoningConfig(process.argv.slice(2))` once at startup. It returns a `ReasoningConfig` or throws. `runActiveTurn()` passes that same configuration into every `runTurn()` in the session.

**Without this code**

The application would lack its explicit, reproducible direct/thinking switch and its invalid-mode failure.

**Important thing to remember**

Reasoning mode and response display mode are independent. “Complete + thinking” is valid: wait for the result while the SDK performs hidden adaptive thinking. More thinking does not supply missing incident evidence. This carries Week 1's uncertainty lesson into Week 2's model configuration.

### 4. Stable system instructions and per-request user evidence

**Code**

Source: [src/prompts/incident-analysis.ts](../../src/prompts/incident-analysis.ts) · lines 1–18.

```ts
// Bump these identifiers when the corresponding stable prompt contract changes.
export const incidentAnalysisPromptVersion = 'sentinel-incident-analysis-v1';
export const multimodalAnalysisPromptVersion =
  'sentinel-multimodal-analysis-v1';

export const incidentAnalysisInstructions = `You are Sentinel, an incident-analysis application. Analyze the supplied incident evidence. Separate observed facts from assumptions and hypotheses. For every hypothesis, identify supporting and contradicting evidence. Identify missing information, recommend reversible next actions, and communicate uncertainty. Do not present any root cause as confirmed unless the supplied evidence confirms it. Treat general domain knowledge as an assumption or inference, not as incident-specific evidence.`;

export function createIncidentAnalysisPrompt(incidentEvidence: string): string {
  return `<incident_evidence>\n${incidentEvidence}\n</incident_evidence>`;
}

export const multimodalEvidenceInstructions = `Analyze the incident text together with the dashboard image. In evidence_classification, put direct statements from the incident text in text_observations, directly visible image observations in image_observations, conclusions derived from either source in inferences, and claims supported by neither source in unsupported_claims. Do not treat an inference as a direct observation.`;

export function createMultimodalIncidentAnalysisPrompt(
  incidentText: string,
): string {
  return `<incident_text>\n${incidentText}\n</incident_text>`;
}
```

**What it does**

Defines the instructions that shape an analysis and wraps each incident's evidence in a clearly labelled text block.

**Why we added it**

Week 1 showed that a plausible root-cause claim can exceed the evidence. The current prompt asks Claude to preserve the distinction between observations, assumptions, hypotheses, missing evidence, and uncertainty. Keeping stable instructions separate from changing evidence also supports prompt-cache reuse.

**How it works**

`incidentAnalysisInstructions` is passed into the SDK system-prompt append field. Its important rules are concrete: provide supporting and contradicting evidence for hypotheses; recommend reversible actions; do not confirm root cause without evidence; treat general knowledge as an assumption or inference.

`createIncidentAnalysisPrompt()` interpolates the supplied string between `<incident_evidence>` tags. The multimodal builder uses `<incident_text>` because an image will be a separate content block. These builders return strings; neither calls Claude, parses input, escapes embedded tags, nor enforces the instructions.

`multimodalEvidenceInstructions` tells Claude how to assign the extra provenance fields. The separate schema will require those fields, but the prompt is what asks for meaningful classification.

The version constants are manually maintained labels printed in run metadata. The comment says to bump them when the stable contract changes. They are not hashes, automatic schema versions, or cache keys; merely changing a label here does not itself modify the system instruction text.

**Connections, input, and output**

The text CLI branch supplies incident text to the text builder. The image branch supplies text to the multimodal builder. `runTurn()` independently appends the exported instruction strings to its system prompt. Output is prompt text and stable instruction strings.

**Without this code**

The API could still generate a schema-shaped answer, but it would lose these explicit evidence-handling instructions and the separation between stable rules and varying incident text.

**Important thing to remember**

The tags help describe evidence; they are not a security boundary. The current CLI does not read or insert Week 1's one-shot/few-shot example files. Its live request has these stable instructions and the user's evidence.

### 5. The analysis contract: TypeScript plus runtime JSON Schema

**Code**

Source: [src/schemas/incident-analysis.ts](../../src/schemas/incident-analysis.ts) · lines 3–32.

```ts
export type UncertaintyLevel = 'low' | 'medium' | 'high';

export interface IncidentHypothesis {
  claim: string;
  supporting_evidence: string[];
  contradicting_evidence: string[];
}

export interface IncidentAnalysis {
  facts: string[];
  assumptions: string[];
  hypotheses: IncidentHypothesis[];
  missing_information: string[];
  reversible_next_actions: string[];
  uncertainty: {
    level: UncertaintyLevel;
    reason: string;
  };
}

export interface EvidenceClassification {
  text_observations: string[];
  image_observations: string[];
  inferences: string[];
  unsupported_claims: string[];
}

export interface MultimodalIncidentAnalysis extends IncidentAnalysis {
  evidence_classification: EvidenceClassification;
}
```

Source: [src/schemas/incident-analysis.ts](../../src/schemas/incident-analysis.ts) · lines 34–100.

```ts
const incidentAnalysisProperties = {
  facts: {
    type: 'array',
    items: { type: 'string', minLength: 1 },
  },
  assumptions: {
    type: 'array',
    items: { type: 'string', minLength: 1 },
  },
  hypotheses: {
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      required: [
        'claim',
        'supporting_evidence',
        'contradicting_evidence',
      ],
      properties: {
        claim: { type: 'string', minLength: 1 },
        supporting_evidence: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
        },
        contradicting_evidence: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
        },
      },
    },
  },
  missing_information: {
    type: 'array',
    items: { type: 'string', minLength: 1 },
  },
  reversible_next_actions: {
    type: 'array',
    items: { type: 'string', minLength: 1 },
  },
  uncertainty: {
    type: 'object',
    additionalProperties: false,
    required: ['level', 'reason'],
    properties: {
      level: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
      },
      reason: { type: 'string', minLength: 1 },
    },
  },
} as const;

export const incidentAnalysisSchema: JSONSchemaType<IncidentAnalysis> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'facts',
    'assumptions',
    'hypotheses',
    'missing_information',
    'reversible_next_actions',
    'uncertainty',
  ],
  properties: incidentAnalysisProperties,
};
```

**What it does**

Defines the shape of an accepted text analysis in two forms: TypeScript types for our code and JSON Schema for the SDK and runtime validator.

**Why we added it**

Week 1 only asked the model for a particular structure. Week 2 needs an application contract it can check even when a generated value is wrong.

**How it works**

`IncidentHypothesis` groups a `claim` with `supporting_evidence` and `contradicting_evidence`. `IncidentAnalysis` has six required top-level fields. `uncertainty` must provide both an allowed level and a reason. These are the current names: Week 1's saved `known_facts` and `candidate_hypotheses` are not the current contract's `facts` and `hypotheses`.

The schema repeats the intended structure using runtime data. `required` requires keys to exist. `type` checks object/array/string types. `items` checks each member of an array. `minLength: 1` disallows empty strings, although a whitespace-only string still has length. `enum` restricts uncertainty to `low`, `medium`, or `high`. `additionalProperties: false` rejects extra fields at the top level and in the nested hypothesis/uncertainty objects.

There is no `minItems`, so arrays may be empty. Requiring `facts` does not require at least one fact. A hypothesis may have no supporting evidence. There are no maximum lengths, evidence IDs, cross-field consistency rules, or checks that the proposed next actions really are reversible.

`incidentAnalysisProperties` is shared with the image contract to avoid duplicate definitions. `as const` preserves literal schema values for TypeScript. `JSONSchemaType<IncidentAnalysis>` helps align the schema with the interface at compile time. Ajv is still needed to check an actual received value.

**Connections, input, and output**

This module takes no request input. `runTurn()` sends its selected schema through `outputFormat`. The validation module compiles the same schema with Ajv. Tests use the interfaces to construct fixtures.

**Without this code**

There would be no common definition of what the model must return or what the application accepts. Asking for JSON alone would not reject missing keys or unexpected shapes.

**Important thing to remember**

Schema validity is structural validity. For example, `facts: ['The deployment definitely caused it.']` can satisfy the string-array rule even when that statement is unsupported. Week 1's factual caution still applies after Week 2's schema validation.

### 6. The actual Claude request and its configuration

**Code**

Source: [src/index.ts](../../src/inputs/image.ts) · lines 114–161.

```ts
async function runTurn(
  prompt: string | AsyncIterable<SDKUserMessage>,
  reasoningConfig: ReasoningConfig,
  responseMode: TurnResponseMode = 'complete',
  analysisContract: AnalysisContract = 'text',
  abortController: AbortController = new AbortController(),
): Promise<void> {
  let wroteStreamedOutput = false;
  let estimatedThinkingTokens = 0;
  const incidentMetricTool = createIncidentMetricTool();
  const acceptanceGuard = new TurnAcceptanceGuard(responseMode);

  try {
    for await (const message of query({
      prompt,
      options: {
        abortController,
        includePartialMessages:
          responseMode === 'stream' || reasoningConfig.mode === 'thinking',
        maxTurns: 3,
        model: process.env.CLAUDE_MODEL?.trim() || 'sonnet',
        outputFormat: {
          type: 'json_schema',
          schema:
            analysisContract === 'multimodal'
              ? multimodalIncidentAnalysisSchema
              : incidentAnalysisSchema,
        },
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append:
            analysisContract === 'multimodal'
              ? `${incidentAnalysisInstructions}\n${multimodalEvidenceInstructions}\n${incidentMetricToolInstructions}`
              : `${incidentAnalysisInstructions}\n${incidentMetricToolInstructions}`,
          excludeDynamicSections: true,
        },
        thinking: reasoningConfig.thinking,
        ...(reasoningConfig.effort
          ? { effort: reasoningConfig.effort }
          : {}),
        tools: [],
        mcpServers: {
          sentinel: incidentMetricTool.server,
        },
        allowedTools: [incidentMetricToolName],
      },
    })) {
```

**What it does**

Starts one SDK-managed query and consumes its asynchronous lifecycle messages. This is the central integration point in Sentinel.

**Why we added it**

It lets the application configure Claude, expose the metric tool, request a structured answer, and handle progress, completion, and failure through one route.

**How it works**

`prompt` accepts either a plain string or an `AsyncIterable<SDKUserMessage>` for the image route. The function returns `Promise<void>`: it prints or throws rather than returning an analysis object. Each invocation creates fresh display state, thinking estimate, metric server/trace, and acceptance guard.

| Actual option | Meaning in this implementation |
| --- | --- |
| `abortController` | Gives the SDK the cancellation controller also checked by Sentinel. |
| `includePartialMessages` | Requests partial events for stream display **or** thinking mode. It can therefore be true in complete mode. |
| `maxTurns: 3` | Caps SDK conversation turns. It is not an output-token limit, wall-clock deadline, or exact maximum number of tool calls. |
| `model` | Uses trimmed `CLAUDE_MODEL`, falling back to the alias `sonnet`. The resolved model is observed later in `modelUsage`; this code does not pin an exact version by default. |
| `outputFormat` | Requests SDK structured output using the selected text or multimodal JSON Schema. |
| `systemPrompt.type/preset` | Uses the Claude Code preset as the base system prompt. Sentinel's short instruction string is not the entire effective system prompt. |
| `systemPrompt.append` | Adds normal incident instructions, optional image instructions, and the tool-use instructions. |
| `excludeDynamicSections: true` | Makes the preset's system portion more stable for caching. The installed SDK describes moving dynamic context to the first user message; this does not erase all contextual information. |
| `thinking` / optional `effort` | Uses section 3's selected configuration. |
| `tools: []` | Configures an empty base built-in-tool set; it does not remove the separately registered MCP tool. |
| `mcpServers.sentinel` | Registers the local server built in `createIncidentMetricTool()`. |
| `allowedTools` | Auto-permits the qualified metric tool in SDK permission handling. It is not a caller-identity authorization policy. |

`for await` waits for messages as the query progresses. Sentinel reacts to different message types; it does not write the SDK's raw HTTP request or tool-conversation continuation itself.

**Precisely what is absent**

There is no `new Anthropic(...)`, `client.messages.create()`, explicit `messages` array for text requests, request-side `max_tokens`, `stream: true/false`, temperature, top-p, min-p, repeat penalty, token-counting call, custom price table, explicit retry policy, or application timeout in this request. There is no `tool_choice` forcing the metric lookup.

The exact lower-level HTTP body is SDK-owned. Sentinel's `outputFormat` is an Agent SDK structured-output request; the repository does not directly configure a Messages API `output_config` field or establish the exact decoding mechanism. A raw Messages API client is a different integration layer.

**Connections, input, and output**

`runActiveTurn()` calls this function. It calls `query()`, the tool factory, the acceptance guard, validators, and failure classifiers. Inputs are prompt, reasoning settings, display mode, schema choice, and cancellation controller. Outputs are terminal progress/results or a thrown error.

**Without this code**

There is no Claude integration. The schemas, prompts, and local tool would exist but never be assembled into a live request.

**Important thing to remember**

Week 2 uses the **Agent SDK**. Complete display mode is not a raw non-streaming Messages API call. Also, the explicit tool registration is narrow, but no `strictMcpConfig`, `settingSources`, `canUseTool`, hooks, or sandbox are set here; section 19 explains why ambient SDK settings matter.

### 7. The tool's actual data and input schema

**Code**

Source: `src/tools/incident-metrics.ts` · lines 1–12.

```ts
import {
  createSdkMcpServer,
  tool,
} from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

export type IncidentMetric = {
  value: number;
  unit: 'percent';
  observed_at: '10:04 UTC';
  source: 'fictional Sentinel monitoring snapshot';
};
```

Source: `src/tools/incident-metrics.ts` · lines 38–81.

```ts
const incidentMetrics: Readonly<{
  'INC-104': Readonly<{
    checkout_error_rate: IncidentMetric;
  }>;
}> = {
  'INC-104': {
    checkout_error_rate: {
      value: 9,
      unit: 'percent',
      observed_at: '10:04 UTC',
      source: 'fictional Sentinel monitoring snapshot',
    },
  },
};

export const incidentMetricInputShape = {
  incident_id: z.literal('INC-104').describe('The incident identifier.'),
  metric: z
    .literal('checkout_error_rate')
    .describe('The observed metric to retrieve.'),
};

const incidentMetricInputValidator = z.object(incidentMetricInputShape);

export type IncidentMetricInput = z.infer<
  typeof incidentMetricInputValidator
>;

export function parseIncidentMetricInput(
  candidate: unknown,
): IncidentMetricInput {
  return incidentMetricInputValidator.parse(candidate);
}

export function readIncidentMetric(
  input: IncidentMetricInput,
): IncidentMetric {
  return incidentMetrics[input.incident_id][input.metric];
}

export const incidentMetricToolName =
  'mcp__sentinel__get_incident_metric';

export const incidentMetricToolInstructions = `A read-only get_incident_metric tool is available for retrieving the fictional monitored checkout error rate for INC-104. Use it when the user asks Sentinel to retrieve that observation and the value is not already included in the supplied evidence. Do not call it when the supplied evidence already contains the metric. A tool result is observed evidence, not proof of root cause.`;
```

**What it does**

Defines one read-only lookup: the fictional `INC-104` checkout error rate is 9 percent at `10:04 UTC`. The tool input permits only that incident and metric.

**Why we added it**

The Week 2 tool-use preview needs an operation whose behavior is easy to inspect. A fixed local observation demonstrates evidence retrieval without production access or operational changes.

**How it works**

`IncidentMetric` describes a result with four fields. The `unit`, `observed_at`, and `source` types are literal strings. `incidentMetrics` contains exactly one entry; no monitoring API or database is queried.

`incidentMetricInputShape` is the actual authored tool schema. `z.literal('INC-104')` is much narrower than `z.string()`: an arbitrary incident ID cannot pass. The metric must be exactly `checkout_error_rate`. Neither property is optional. `.describe()` adds descriptions used in the advertised schema.

`z.object(...)` builds a runtime parser, and `z.infer` derives its TypeScript input type. `parseIncidentMetricInput(candidate: unknown)` returns parsed input or throws a Zod error. It is used by the local tests. **The live handler does not call this function**; the SDK validates the same shape before invoking that handler.

`readIncidentMetric()` simply indexes the in-memory table and returns the stored object. It has a typed argument, but performs no runtime validation itself. A JavaScript caller bypassing validation would not be protected by the TypeScript annotation. `Readonly` is also compile-time protection; the record is not frozen at runtime, and the function does not clone the result.

The qualified name combines the MCP prefix, server name, and tool name: `mcp__sentinel__get_incident_metric`. The natural-language instructions ask Claude to use it only when the user wants the missing observation. No handler-side check inspects the incident prompt to enforce “do not call if already supplied.”

**Actual generated JSON Schema**

The repository authors a Zod shape, not a separate JSON `input_schema` file. An offline inspection of the installed SDK server's registered `tools/list` handler produced this `inputSchema` from that shape:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "incident_id": {
      "description": "The incident identifier.",
      "type": "string",
      "const": "INC-104"
    },
    "metric": {
      "description": "The observed metric to retrieve.",
      "type": "string",
      "const": "checkout_error_rate"
    }
  },
  "required": ["incident_id", "metric"]
}
```

This is generated MCP schema, not a newly added source file or a captured raw Anthropic HTTP request. Notice that it has no explicit `additionalProperties: false`. The local Zod parser accepts valid literal fields with an extra property and strips that property; it does not reject every unknown key.

**Connections, input, and output**

Claude generates candidate arguments. The SDK uses this schema before invoking our callback. Tests independently call `parseIncidentMetricInput()` and `readIncidentMetric()`. Valid input returns one metric object; invalid literal values fail validation.

**Without this code**

The tool would lack a constrained argument contract and a known source of evidence. The model could request a lookup, but the application would have no implementation to answer it.

**Important thing to remember**

“Mocked tool” means the evidence is fictional. The local function really executes. This already demonstrates the core Week 2 tool-request/input-validation distinction.

### 8. Tool definition, handler execution, MCP result, and server registration

**Code**

Source: `src/tools/incident-metrics.ts` · lines 83–136.

```ts
export function createIncidentMetricTool(): {
  server: ReturnType<typeof createSdkMcpServer>;
  trace: IncidentMetricToolTrace;
} {
  const trace: IncidentMetricToolTrace = {};

  const getIncidentMetric = tool(
    'get_incident_metric',
    'Read one metric from Sentinel\'s fictional INC-104 monitoring snapshot. Use this only when the incident asks for the monitored checkout error rate and does not already provide that value. This tool does not determine or confirm root cause.',
    incidentMetricInputShape,
    async (validatedInput) => {
      // The SDK validates the Zod input schema before entering this handler.
      trace.validation = {
        accepted: true,
        validated_input: validatedInput,
      };

      // Application code, not Claude, controls and executes the operation.
      const result = readIncidentMetric(validatedInput);
      trace.execution = {
        operation: 'read_in_memory_incident_metric',
        result,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
        structuredContent: result,
      };
    },
    {
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      alwaysLoad: true,
    },
  );

  return {
    server: createSdkMcpServer({
      name: 'sentinel',
      version: '1.0.0',
      tools: [getIncidentMetric],
    }),
    trace,
  };
}
```

**What it does**

Constructs the actual SDK tool and local MCP server. Its callback reads the metric and returns it to the SDK.

**Why we added it**

A description alone cannot retrieve data. This binds the model-visible tool contract to application-controlled executable code.

**How it works**

`tool()` receives the short name, description, Zod shape, async handler, and options. The description explains when the lookup is relevant and warns that the observation cannot establish root cause. `async` supplies the promise-based callback expected by the SDK; the table read itself is synchronous.

The callback receives `validatedInput`. The SDK's registered MCP handler validates arguments before invoking it. First, our callback records successful validation in the captured `trace`. Then `readIncidentMetric(validatedInput)` executes. It records the operation and result after the lookup.

The return value has `content`, an MCP text-block array containing `JSON.stringify(result)`, and `structuredContent`, the object itself. The handler does **not** construct an enclosing conversation block with `type: 'tool_result'` or choose its `tool_use_id`. The SDK transports the handler result, associates it with the request, and continues the conversation with Claude.

The annotations describe intended properties: read-only, not destructive, repeatable, and closed-world. They do not make arbitrary code safe. Here, the actual table lookup is what makes the tool read-only. `alwaysLoad: true` marks its definition for eager availability, not forced execution.

`createSdkMcpServer()` registers that definition on a local server named `sentinel`, version `1.0.0`. No external MCP process is launched by this factory. Returning both `server` and `trace` lets `runTurn()` register the capability and observe its execution state. The same trace object is shared by reference through the handler closure.

**Failure behavior already present**

In the offline registered-handler check, invalid `INC-999` arguments returned an MCP error with `isError: true`; the application trace remained empty, showing that the callback was not entered. This is SDK/MCP input-error handling. Sentinel has no custom tool-error union, handler `try/catch`, output-schema validator, or per-tool timeout here. Its success-only trace is not a rejection audit.

**Connections, input, and output**

`runTurn()` calls this factory once per query. The SDK later invokes the callback when Claude requests the registered tool. The callback calls `readIncidentMetric()` and returns the metric's text/object representation to the SDK.

**Without this code**

There would be no executable tool registered with `query()`, no returned observation, and no model continuation based on that observation. Merely keeping the event logging from the next section would not execute anything.

**Important thing to remember**

Claude selects and requests the operation. Our callback controls the actual operation. The SDK handles protocol plumbing and continuation. This separation already exists in Week 2.

### 9. Passing tools to Claude and observing tool_use/tool_result

**Code**

Source: [src/index.ts](../../src/cli/analysis-turn.ts) · lines 155–159.

```ts
        tools: [],
        mcpServers: {
          sentinel: incidentMetricTool.server,
        },
        allowedTools: [incidentMetricToolName],
```

Source: [src/index.ts](../../src/cli/analysis-turn.ts) · lines 198–230.

```ts
      if (message.type === 'assistant') {
        for (const block of message.message.content) {
          if (
            block.type === 'tool_use' &&
            block.name === incidentMetricToolName
          ) {
            incidentMetricTool.trace.request = {
              id: block.id,
              name: block.name,
              input: block.input,
            };
          }
        }

        continue;
      }

      if (message.type === 'user' && Array.isArray(message.message.content)) {
        for (const block of message.message.content) {
          if (
            block.type === 'tool_result' &&
            block.tool_use_id === incidentMetricTool.trace.request?.id
          ) {
            incidentMetricTool.trace.result = {
              tool_use_id: block.tool_use_id,
              content: block.content,
              is_error: block.is_error ?? false,
            };
          }
        }

        continue;
      }
```

Source: `src/tools/incident-metrics.ts` · lines 14–36.

```ts
export type IncidentMetricToolTrace = {
  request?: {
    id: string;
    name: string;
    input: unknown;
  };
  validation?: {
    accepted: true;
    validated_input: {
      incident_id: 'INC-104';
      metric: 'checkout_error_rate';
    };
  };
  execution?: {
    operation: 'read_in_memory_incident_metric';
    result: IncidentMetric;
  };
  result?: {
    tool_use_id: string;
    content: unknown;
    is_error: boolean;
  };
};
```

Source: [src/index.ts](../../src/cli/analysis-turn.ts) · lines 270–286.

```ts
      if (incidentMetricTool.trace.request) {
        console.log(
          `Tool-use lifecycle:\n${JSON.stringify(
            {
              '1_claude_requests_tool': incidentMetricTool.trace.request,
              '2_application_validates_input':
                incidentMetricTool.trace.validation ?? null,
              '3_application_executes_handler':
                incidentMetricTool.trace.execution ?? null,
              '4_application_returns_tool_result':
                incidentMetricTool.trace.result ?? null,
            },
            null,
            2,
          )}\n`,
        );
      }
```

**What it does**

Makes the local server available to the SDK and records the matching request/result blocks exposed in SDK messages.

**Why we added it**

Week 2 asks us to identify what Claude requested, what was validated, what application code ran, and what result went back. The trace makes those steps visible.

**How it works**

`mcpServers` passes the server; `allowedTools` uses the fully qualified name. The `assistant` branch loops over content blocks, checks for both `tool_use` and our exact tool name, then saves ID, name, and input. **This branch is an observer, not a dispatcher.** There is no `readIncidentMetric()` call inside it.

The `user` branch handles the SDK's user-role protocol messages. A user-role message is not necessarily a fresh terminal input: tool results also appear in that role. It finds a `tool_result` whose `tool_use_id` matches the remembered request ID. That association is what connects an answer to a particular tool call. `is_error ?? false` normalizes an absent flag for reporting; it does not verify the result's contents.

The trace type makes every stage optional because a query may never call the tool or may stop before completing it. `validation.accepted` only models success. After the final analysis is accepted, the CLI prints all four stages, substituting `null` when a stage was not observed.

This is a **single-slot trace**. A repeated tool request can overwrite an earlier request, and repeated callbacks can overwrite validation/execution entries. It is not a complete ordered audit log for multiple or parallel calls. The trace is normally printed only on the accepted-result path, so a failed turn can lose that useful diagnostic display.

**Connections, input, and output**

Input is SDK `assistant` and `user` lifecycle messages. Output is trace state and terminal logging. SDK dispatch invokes the handler independently of this branch. The handler writes validation/execution; these branches write request/result.

**Without this code**

Removing registration would remove the supplied tool capability. Removing only the two event-observer branches would leave SDK execution possible but remove the recorded request/result linkage. Removing trace printing would hide it from the terminal.

**Important thing to remember**

Seeing `tool_use` in this event loop is not the moment our code explicitly calls the tool. The SDK owns dispatch. Also, `tool_result.is_error` is only recorded here: there is no additional application rule that rejects every final analysis following a tool error.

### 10. Does the existing tool loop really finish?

**Code/evidence**

The actual saved lifecycle contains a matching request and result. These are short excerpts of recorded protocol evidence, not replacement model output:

Source: [experiments/week-2/tool-use/tool-use-run-1.json](../../experiments/week-2/tool-use/tool-use-run-1.json) · lines 3–10.

```json
    "1_claude_requests_tool": {
      "id": "toolu_01MfxVWk2vdEj4CDNPNu94n8",
      "name": "mcp__sentinel__get_incident_metric",
      "input": {
        "incident_id": "INC-104",
        "metric": "checkout_error_rate"
      }
    },
```

Source: [experiments/week-2/tool-use/tool-use-run-1.json](../../experiments/week-2/tool-use/tool-use-run-1.json) · lines 27–31.

```json
    "4_application_returns_tool_result": {
      "tool_use_id": "toolu_01MfxVWk2vdEj4CDNPNu94n8",
      "content": "{\"value\":9,\"unit\":\"percent\",\"observed_at\":\"10:04 UTC\",\"source\":\"fictional Sentinel monitoring snapshot\"}",
      "is_error": false
    }
```

**What it does**

The code in sections 7–9 and the saved exchange together establish a complete one-tool lifecycle through the SDK:

```text
Claude requests get_incident_metric({INC-104, checkout_error_rate})
  → SDK validates against our Zod definition
  → application handler calls readIncidentMetric()
  → fixed fictional observation is returned as MCP content
  → SDK creates/delivers the matching tool_result
  → Claude continues with the retrieved evidence
  → SDK emits its final structured result
  → Sentinel validates and accepts that final value
```

**Why we added it**

It demonstrates that a model can request evidence, while application code controls what evidence can be retrieved and how it is returned.

**How it works**

The same `toolu_01MfxVWk2vdEj4CDNPNu94n8` ID links the saved request and result. The saved analysis then includes the retrieved 9-percent observation with its source. The result is marked `is_error: false`. This supports model continuation in that recorded run; the offline checks performed for this review separately verify the current local handler and input boundary without contacting Claude.

There is no manually coded `while (stop_reason === 'tool_use')` loop, transcript append, or second explicit Messages API request in Sentinel. Instead, a single `query()` supplies the SDK-managed conversation. `maxTurns: 3` provides an SDK turn bound. The outer terminal `while` repeats independent incidents; it is not the tool loop. The `for await` loop consumes SDK events; it is not a hand-written tool dispatcher.

**Connections, input, and output**

Input is an incident that requests the missing metric. Output is a final analysis informed by that metric, or an explicit failure if the query/validation does not complete. The SDK bridges handler output back to the model.

**Without this lifecycle**

The lookup could return local data without Claude ever seeing it, or Claude could request a tool and never receive an answer. Neither is the current implementation: the saved interaction shows both execution and continuation.

**Important thing to remember**

**Already implemented:** tool definition, schema, registration, request reception, input validation, actual execution, result return, and continuation through the SDK. **Still absent:** a custom application-owned dispatcher and Week 3's broader authorization, result-validation, timeout, and tool-call policies. “We only defined a tool” would be an incorrect description of this checkout.

### 11. Streaming versus complete display

**Code**

Source: [src/index.ts](../../src/cli/analysis-turn.ts) · lines 170–196.

```ts
      if (
        responseMode === 'stream' &&
        message.type === 'stream_event' &&
        message.event.type === 'content_block_delta'
      ) {
        const delta = message.event.delta;
        const streamedChunk =
          delta.type === 'text_delta'
            ? delta.text
            : delta.type === 'input_json_delta'
              ? delta.partial_json
              : undefined;

        if (streamedChunk === undefined) {
          continue;
        }

        acceptanceGuard.recordPartialOutput(streamedChunk);

        if (!wroteStreamedOutput) {
          output.write('\nClaude: ');
          wroteStreamedOutput = true;
        }

        output.write(streamedChunk);
        continue;
      }
```

Source: [src/index.ts](../../src/cli/analysis-turn.ts) · lines 288–297.

```ts
      if (wroteStreamedOutput) {
        output.write('\n\n');
      } else {
        console.log(
          `Claude structured output:\n${JSON.stringify(analysis, null, 2)}\n`,
        );
      }

      console.log('Validation: accepted incident analysis.\n');
      console.log('Run metadata:');
```

**What it does**

In stream mode, prints selected partial SDK events as they arrive. In complete mode, waits until it has a validated final object before printing the analysis.

**Why we added it**

Week 2 explores both user-visible response styles while preserving the same acceptance requirements.

**How it works**

The streaming branch requires all three conditions: response mode is `stream`, message type is `stream_event`, and the event is `content_block_delta`. It extracts either `text_delta.text` or `input_json_delta.partial_json`. Other deltas are ignored; it does not display hidden thinking deltas.

`recordPartialOutput()` only records that nonempty display content existed. It does not accumulate or parse JSON. `wroteStreamedOutput` controls the `Claude:` prefix and the final display branch. `output.write()` prints chunks without adding a newline to each one.

The stream branch does not filter JSON deltas by tool name or content-block index. They can be fragments of tool arguments, including structured-output machinery, rather than a clean serialization of the eventual accepted analysis. This is why the terminal stream and final `analysis` object should not be treated as identical artifacts.

After acceptance, if anything was streamed, the CLI adds spacing and prints the accepted status/metadata; it does **not** reprint a canonical final JSON object. If no chunks were printed, it prints `JSON.stringify(analysis, null, 2)`, even when stream mode was selected.

**Connections, input, and output**

The SDK supplies delta events. The CLI outputs provisional terminal text. The final analysis still comes from `message.structured_output`, processed by section 12. Display mode comes from `/mode`; reasoning settings come from startup arguments.

**Without this code**

There would be no incremental display. Final-result processing could still work, but users would wait without these chunks.

**Important thing to remember**

Printed partial text is not an accepted result. “Complete” changes display behavior; it does not change `query()` into a synchronous or direct non-streaming Messages API request. Both paths are asynchronous.

### 12. Final SDK result: success checks, validation, and acceptance

**Code**

Source: [src/index.ts](../../src/cli/analysis-turn.ts) · lines 232–268.

```ts
      if (message.type !== 'result') {
        continue;
      }

      acceptanceGuard.assertNotInterrupted(abortController.signal);

      if (message.subtype !== 'success') {
        throw classifySdkFailure(message);
      }

      if (message.is_error) {
        throw classifySdkFailure(message);
      }

      let analysis;

      try {
        const validatedAnalysis =
          analysisContract === 'multimodal'
            ? validateMultimodalIncidentAnalysisValue(
                message.structured_output,
              )
            : validateIncidentAnalysisValue(message.structured_output);
        analysis = acceptanceGuard.acceptValidatedResult(
          validatedAnalysis,
          abortController.signal,
        );
      } catch (error: unknown) {
        if (wroteStreamedOutput) {
          output.write('\n\n');
        }

        console.log(
          `Claude structured output (rejected): ${JSON.stringify(message.structured_output, null, 2)}\n`,
        );
        throw error;
      }
```

**What it does**

Accepts only a non-aborted successful SDK result whose structured value passes the selected application validator.

**Why we added it**

An application must not call a response successful simply because it received some text, a `result` message, or even a success subtype containing an error flag.

**How it works**

Messages other than `result` are skipped after the earlier event handlers. Before touching final output, `assertNotInterrupted()` checks cancellation. An unsuccessful subtype is converted by `classifySdkFailure()`. A success subtype with `is_error` set is also rejected; the two fields are checked separately because the SDK can report error details inside that result form.

The contract choice controls which validator receives `message.structured_output`. **There is no live `JSON.parse()` of streamed text here.** The SDK has supplied an already materialized value. Missing `structured_output` reaches Ajv as undefined and fails the object schema.

Only after validation succeeds does `acceptValidatedResult()` mark the turn accepted. It checks the abort signal again. If validation/acceptance throws, the code prints the candidate with an explicit `structured output (rejected)` label, then rethrows. Printing that rejected value is diagnostic output, not acceptance.

`stop_reason` is not used as an acceptance condition. A `tool_use` stop reason can occur with the SDK's structured-output path; it does not by itself prove that our metric tool ran or that the overall SDK result is incomplete. The metric trace and final-result checks are the relevant evidence.

**Connections, input, and output**

Input is an SDK final-result message. Calls the interruption guard, SDK failure classifier, and selected Ajv wrapper. Output is a local validated `analysis` value followed by printing, or a typed failure.

**Without this code**

Sentinel could announce success for a cancelled, erroneous, missing, or schema-invalid response. This is the central Week 2 application acceptance boundary.

**Important thing to remember**

SDK structured output reduces format problems; independent validation remains our application's decision point. Successful generation and accepted application data are separate steps.

### 13. JSON parsing and Ajv validation are separate operations

**Code**

Source: [src/validation/incident-analysis.ts](../../src/validation/incident-analysis.ts) · lines 1–73.

```ts
import { Ajv, type ErrorObject } from 'ajv';

import {
  incidentAnalysisSchema,
  multimodalIncidentAnalysisSchema,
  type IncidentAnalysis,
  type MultimodalIncidentAnalysis,
} from '../contracts/incident-analysis.js';
import { SentinelFailure } from '../errors/sentinel-failure.js';

const ajv = new Ajv({ allErrors: true });
const validateIncidentAnalysis = ajv.compile<IncidentAnalysis>(
  incidentAnalysisSchema,
);
const validateMultimodalIncidentAnalysis =
  ajv.compile<MultimodalIncidentAnalysis>(multimodalIncidentAnalysisSchema);

function formatValidationErrors(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? [])
    .map((error) => {
      const location = error.instancePath || '/';
      return `${location} ${error.message ?? 'is invalid'}`;
    })
    .join('; ');
}

export function parseIncidentAnalysis(rawResponse: string): IncidentAnalysis {
  let parsedResponse: unknown;

  try {
    parsedResponse = JSON.parse(rawResponse) as unknown;
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : 'Unknown parse error.';

    throw new SentinelFailure('malformed-json', `Malformed JSON: ${detail}`, {
      cause: error,
    });
  }

  return validateIncidentAnalysisValue(parsedResponse);
}

export function validateIncidentAnalysisValue(
  candidate: unknown,
): IncidentAnalysis {
  if (!validateIncidentAnalysis(candidate)) {
    const details = formatValidationErrors(validateIncidentAnalysis.errors);

    throw new SentinelFailure(
      'schema-invalid-output',
      `Schema-invalid incident analysis: ${details || 'unknown validation error'}`,
    );
  }

  return candidate;
}

export function validateMultimodalIncidentAnalysisValue(
  candidate: unknown,
): MultimodalIncidentAnalysis {
  if (!validateMultimodalIncidentAnalysis(candidate)) {
    const details = formatValidationErrors(
      validateMultimodalIncidentAnalysis.errors,
    );

    throw new SentinelFailure(
      'schema-invalid-output',
      `Schema-invalid multimodal incident analysis: ${details || 'unknown validation error'}`,
    );
  }

  return candidate;
}
```

**What it does**

Provides a raw-string parser for recorded JSON and value validators for live text/multimodal structured output.

**Why we added it**

Week 2 distinguishes three different outcomes: text is not valid JSON; JSON parses but has the wrong shape; an object has the expected shape. Those should not be collapsed into one generic failure.

**How it works**

The module creates one Ajv instance with `allErrors: true`, then compiles both schemas when the module loads. It reuses those functions for later requests. `allErrors` collects multiple structural issues rather than stopping at the first one.

`parseIncidentAnalysis(rawResponse)` calls `JSON.parse()` inside a try/catch. It treats the output as `unknown`, because syntactically valid JSON can be a number, null, array, or unrelated object. Parse failure becomes `malformed-json`, preserving the original exception as a cause. Successful parsing immediately delegates to `validateIncidentAnalysisValue()`.

Each value validator calls its compiled Ajv function. If validation fails, `formatValidationErrors()` renders each `instancePath` plus its message; `/` represents the root. The wrapper throws `schema-invalid-output`. If validation succeeds, it returns the same candidate with the narrowed TypeScript type. It does not generate a corrected answer or transform the strings.

The multimodal validator is analogous but requires its extra evidence-classification contract. There is no separate raw-string multimodal parser in this file.

**Connections, input, and output**

Live `runTurn()` → `validate...Value(message.structured_output)`. Offline utility/tests → `parseIncidentAnalysis(rawString)` → `JSON.parse()` → text validator. Input is unknown data or a string; output is an `IncidentAnalysis`/`MultimodalIncidentAnalysis` or `SentinelFailure`.

**Without this code**

The application would rely solely on the SDK's output handling and TypeScript types, with no independent runtime contract check or distinct malformed-JSON diagnosis for saved responses.

**Important thing to remember**

The live path is **SDK value → Ajv → acceptance**. The saved-file path is **file text → JSON.parse → Ajv → report**. Neither performs semantic evidence verification.

### 14. Interrupted streams, cancellation, and missing final responses

**Code**

Source: [src/application/turn-acceptance.ts](../../src/application/turn-acceptance.ts) · lines 1–72.

```ts
import { SentinelFailure } from '../errors/sentinel-failure.js';

export type TurnResponseMode = 'complete' | 'stream';

const interruptionByMode = {
  complete: {
    code: 'interrupted-request',
    message: 'Request interrupted before a completed response was received.',
  },
  stream: {
    code: 'interrupted-stream',
    message: 'Stream interrupted. The partial response was rejected.',
  },
} as const;

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
```

Source: [src/index.ts](../../src/cli/session.ts) · lines 361–393.

```ts
  terminal.on('SIGINT', () => {
    if (activeAbortController && !activeAbortController.signal.aborted) {
      output.write('\nCancelling current request...\n');
      activeAbortController.abort();
      return;
    }

    exitRequested = true;
    output.write('\nExiting Sentinel CLI.\n');
    terminal.close();
  });

  const runActiveTurn = async (
    prompt: string | AsyncIterable<SDKUserMessage>,
    analysisContract: AnalysisContract = 'text',
  ): Promise<void> => {
    const abortController = new AbortController();
    activeAbortController = abortController;

    try {
      await runTurn(
        prompt,
        reasoningConfig,
        responseMode,
        analysisContract,
        abortController,
      );
    } finally {
      if (activeAbortController === abortController) {
        activeAbortController = undefined;
      }
    }
  };
```

Source: [src/index.ts](../../src/cli/analysis-turn.ts) · lines 333–343.

```ts
    }
  } catch (error: unknown) {
    if (abortController.signal.aborted) {
      throw acceptanceGuard.createInterruptionFailure(error);
    }

    throw error;
  }

  acceptanceGuard.assertCompleted(abortController.signal);
}
```

**What it does**

Keeps provisional display separate from accepted data, rejects cancellation, and rejects a query that finishes without any accepted final result.

**Why we added it**

Week 2 explicitly requires partial-stream rejection. An interrupted JSON-looking response must not be mistaken for a completed incident analysis.

**How it works**

`TurnAcceptanceGuard` starts with both booleans false. `recordPartialOutput()` only sets the partial-output flag. The getters expose state, mainly for tests. `acceptValidatedResult()` first checks cancellation, then sets `acceptedResult = true` and returns the value.

The generic `<T>` method does not itself validate a schema; its name describes the caller's obligation. In the live path, Ajv runs immediately before it. Anyone directly calling this method with arbitrary data would bypass that structural check.

`assertCompleted()` checks for cancellation and then requires acceptance to have occurred. A normally exhausted SDK iterator with no final accepted result becomes `runtime-error: Claude did not return a completed response.` An abort in stream mode becomes `interrupted-stream`; an abort in complete mode becomes `interrupted-request`. The classification follows selected mode, even if no partial bytes were printed.

`runActiveTurn()` creates a fresh controller, stores it for the terminal handler, and passes it into `runTurn()`. Its `finally` clears only the controller belonging to that turn. The first `SIGINT` during a live request aborts it and returns. When there is no active uncancelled request—idle, or already cancelled—the handler sets `exitRequested` and closes readline.

In `runTurn()`'s catch, an aborted signal takes precedence over the thrown SDK error and produces the mode-specific interruption failure, retaining the original cause. Otherwise the error is rethrown. After iteration, `assertCompleted()` supplies the final guard.

**Connections, input, and output**

Inputs are stream chunks, a candidate that the caller has validated, and the active `AbortSignal`. Callers are `runTurn()`, `main()`'s SIGINT handler, and tests. Output is acceptance state or a typed failure; the class never reparses partial text.

**Without this code**

The application would lack its explicit proof that partial display is not completion, its consistent cancellation classification, and its detection of silent iterator exhaustion.

**Important thing to remember**

Partial text is not deleted from the terminal when cancellation happens; it is rejected as application output. A spontaneous transport exception without an aborted signal or SDK interruption reason can still become a general runtime error. There is no automatic timeout timer here. Acceptance is printed before iterator exhaustion, so a later SDK exception can still produce a failure after an earlier accepted-status line; this CLI is not a transactional result store.

### 15. Typed failures and the two error-classification routes

**Code**

Source: [src/errors/sentinel-failure.ts](../../src/errors/sentinel-failure.ts) · lines 1–97.

```ts
export type FailureCategory =
  | 'input'
  | 'configuration'
  | 'integration'
  | 'runtime'
  | 'model-output';

export type FailureCode =
  | 'invalid-input'
  | 'context-limit'
  | 'missing-configuration'
  | 'authentication-error'
  | 'rate-limit'
  | 'api-error'
  | 'timeout'
  | 'interrupted-request'
  | 'interrupted-stream'
  | 'runtime-error'
  | 'malformed-json'
  | 'schema-invalid-output'
  | 'structured-output-retries-exhausted';

export const failureCategoryByCode: Readonly<
  Record<FailureCode, FailureCategory>
> = {
  'invalid-input': 'input',
  'context-limit': 'input',
  'missing-configuration': 'configuration',
  'authentication-error': 'configuration',
  'rate-limit': 'integration',
  'api-error': 'integration',
  timeout: 'runtime',
  'interrupted-request': 'runtime',
  'interrupted-stream': 'runtime',
  'runtime-error': 'runtime',
  'malformed-json': 'model-output',
  'schema-invalid-output': 'model-output',
  'structured-output-retries-exhausted': 'model-output',
};

export class SentinelFailure extends Error {
  readonly category: FailureCategory;
  readonly code: FailureCode;

  constructor(code: FailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SentinelFailure';
    this.code = code;
    this.category = failureCategoryByCode[code];
  }
}

export function classifyThrownFailure(error: unknown): SentinelFailure {
  if (error instanceof SentinelFailure) {
    return error;
  }

  const message = error instanceof Error ? error.message : 'Unexpected error.';
  const normalizedMessage = message.toLowerCase();

  if (/\b(401|403)\b|unauthori[sz]ed|authentication|invalid token/.test(normalizedMessage)) {
    return new SentinelFailure('authentication-error', message, {
      cause: error,
    });
  }

  if (/\b429\b|rate.?limit|too many requests/.test(normalizedMessage)) {
    return new SentinelFailure('rate-limit', message, { cause: error });
  }

  if (/timed?\s*out|timeout/.test(normalizedMessage)) {
    return new SentinelFailure('timeout', message, { cause: error });
  }

  if (/context.*(limit|length)|prompt.*too long/.test(normalizedMessage)) {
    return new SentinelFailure('context-limit', message, { cause: error });
  }

  return new SentinelFailure('runtime-error', message, { cause: error });
}

export function formatFailure(error: unknown): string {
  const failure = classifyThrownFailure(error);

  return JSON.stringify(
    {
      accepted: false,
      failure: {
        category: failure.category,
        code: failure.code,
        message: failure.message,
      },
    },
    null,
    2,
  );
}
```

Source: [src/errors/classify-sdk-failure.ts](../../src/errors/classify-sdk-failure.ts) · lines 1–63.

```ts
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
```

**What it does**

Turns known application failures, structured SDK failures, and thrown exceptions into a readable failure contract.

**Why we added it**

Week 2 asks us to distinguish bad input, configuration problems, integration failures, runtime interruption, and model-output problems. Those require different diagnoses even though all reject the turn.

**How it works**

`FailureCode` lists detailed cases, and `failureCategoryByCode` groups them. For example, `context-limit` is classified as input; authentication as configuration; rate limiting as integration; cancellation and timeout as runtime; malformed JSON and schema violations as model-output.

`SentinelFailure` extends `Error`, attaches code/category, and preserves an optional cause through `super(message, options)`. `classifyThrownFailure()` returns an existing typed failure unchanged. Otherwise it lowercases the message and uses regexes for authentication, 429/rate limits, timeout, and oversized prompts. Unmatched thrown errors become `runtime-error`. These regexes are heuristics, not a complete structured classification of every possible network failure.

`formatFailure()` prints only `accepted: false` and the failure category/code/message. It omits the stack and cause. Success is not printed in a symmetrical `{ accepted: true, analysis: ... }` envelope; the CLI instead prints the object/display plus a separate accepted-status line.

`classifySdkFailure()` handles actual SDK result objects. It gets detail from `result` for the success-shaped variant or joins `errors` for an error subtype. It prioritizes structured-output retry exhaustion, prompt-too-long, invalid image, and aborted-streaming terminal reasons. For success-shaped errors it maps status 401/403, 429, and 408/504. API/model terminal errors become `api-error`; remaining cases become `runtime-error`. For example, there is no dedicated `max-turns` application code, so an otherwise unmatched max-turns SDK error uses that runtime fallback.

Recognizing `structured-output-retries-exhausted` does not mean Sentinel wrote a retry loop. The SDK owns those retries. Recognizing `timeout` does not mean Sentinel installed a timer. A raw exception containing `500` is not explicitly mapped by the regex classifier to `api-error`.

**Connections, input, and output**

Application checks/validators construct `SentinelFailure`. `runTurn()` classifies unsuccessful SDK results. The CLI catches thrown failures and calls `formatFailure()`. Inputs are unknown exceptions or SDK result objects; output is a typed error and eventually a JSON string on the terminal.

**Without this code**

Users would see inconsistent raw exceptions, and tests/callers would have no reliable code distinguishing invalid model output from cancellation or configuration failure.

**Important thing to remember**

A failure category tells us which boundary failed. It does not implement recovery, retries, deadlines, or proof that the model's content is safe.

### 16. Multimodal input: path validation, base64 image, and a larger output contract

**Code**

Source: [src/index.ts](../../src/cli/session.ts) · lines 435–464.

```ts
      try {
        if (userInput.toLowerCase() === '/image') {
          const imagePath = (await terminal.question('Image path: ')).trim();
          const incidentText = (
            await terminal.question('Incident text: ')
          ).trim();

          if (!imagePath) {
            throw new SentinelFailure(
              'invalid-input',
              'An image path is required.',
            );
          }

          if (!incidentText) {
            throw new SentinelFailure(
              'invalid-input',
              'Incident text is required with the dashboard image.',
            );
          }

          await runActiveTurn(
            createImagePrompt(
              imagePath,
              createMultimodalIncidentAnalysisPrompt(incidentText),
            ),
            'multimodal',
          );
          continue;
        }
```

Source: [src/index.ts](../../src/index.ts) · lines 44–112.

```ts
type ImageMediaType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp';

type AnalysisContract = 'text' | 'multimodal';

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
    throw new SentinelFailure(
      'invalid-input',
      'Supported image types are PNG, JPEG, GIF, and WebP.',
    );
  }

  return mediaType;
}

async function* createImagePrompt(
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
```

Source: [src/schemas/incident-analysis.ts](../../src/schemas/incident-analysis.ts) · lines 102–146.

```ts
export const multimodalIncidentAnalysisSchema: JSONSchemaType<MultimodalIncidentAnalysis> =
  {
    type: 'object',
    additionalProperties: false,
    required: [
      'facts',
      'assumptions',
      'hypotheses',
      'missing_information',
      'reversible_next_actions',
      'uncertainty',
      'evidence_classification',
    ],
    properties: {
      ...incidentAnalysisProperties,
      evidence_classification: {
        type: 'object',
        additionalProperties: false,
        required: [
          'text_observations',
          'image_observations',
          'inferences',
          'unsupported_claims',
        ],
        properties: {
          text_observations: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
          },
          image_observations: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
          },
          inferences: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
          },
          unsupported_claims: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
          },
        },
      },
    },
  };
```

**What it does**

Lets `/image` send an incident description together with one local image, then requires a final analysis that also separates text observations, image observations, inferences, and unsupported claims.

**Why we added it**

Week 2 asks us to reason from both a fictional dashboard and incident text without confusing direct observations with inferred conclusions.

**How it works**

The CLI asks for both an image path and incident text, trims them, and throws `invalid-input` when either is blank. It passes the multimodal text prompt into `createImagePrompt()` and explicitly selects the `'multimodal'` contract in `runActiveTurn()`.

`imageMediaTypes` maps extensions to supported MIME strings. `getImageMediaType()` lowercases the extension, so uppercase `.PNG` still works, and rejects unsupported extensions. It does not inspect the file's actual byte signature.

`createImagePrompt()` is an async generator. Calling it returns a generator; its path resolution and file read happen when it is iterated. It strips surrounding single/double quote characters and resolves the path relative to the working directory. `readFile(resolvedPath, 'base64')` reads and encodes the entire image. A filesystem error becomes `invalid-input` with its cause.

The yielded SDK message has `type: 'user'`, a nested `role: 'user'`, and an ordered content array: first text, then image. The image source says `type: 'base64'`, includes the declared MIME type, and carries the encoded bytes in `data`. `parent_tool_use_id: null` identifies it as ordinary user input rather than input associated with a parent tool request. The generator yields one message; it is not streaming image bytes chunk by chunk.

The selected output schema reuses every normal analysis field and adds required `evidence_classification`. Each of its four required fields is an array of nonempty strings, with no additional properties on that object. The matching multimodal instructions from section 4 tell Claude how to fill them; Ajv can require their shape but cannot verify the image interpretation or correct source attribution.

**Connections, input, and output**

`/image` → multimodal prompt builder → `createImagePrompt()` → SDK consumption → `query()` with multimodal schema → `validateMultimodalIncidentAnalysisValue()` → normal acceptance. Input is a local path plus incident text. Output is a structured SDK user message, then a multimodal analysis or failure. The metric tool is still registered on this path.

**Without this code**

The application would only send text and could not attach dashboard pixels or require separate image/text provenance fields.

**Important thing to remember**

This is a real multimodal content-block implementation. Its local image checks cover required input, extension, and readability; there is no byte-size limit, dimension check, magic-byte inspection, streaming file read, or enforced folder boundary. A correctly shaped image analysis can still misread the chart. These are the current implementation limits, not checks already present.

### 17. Token usage, thinking estimates, latency, model identity, and cost

**Code**

Source: [src/index.ts](../../src/cli/analysis-turn.ts) · lines 162–168.

```ts
      if (
        message.type === 'system' &&
        message.subtype === 'thinking_tokens'
      ) {
        estimatedThinkingTokens = message.estimated_tokens;
        continue;
      }
```

Source: [src/index.ts](../../src/cli/analysis-turn.ts) · lines 298–324.

```ts
      console.log(
        JSON.stringify(
          {
            reasoning_mode: reasoningConfig.mode,
            requested_model: process.env.CLAUDE_MODEL?.trim() || 'sonnet',
            prompt_version:
              analysisContract === 'multimodal'
                ? multimodalAnalysisPromptVersion
                : incidentAnalysisPromptVersion,
            prompt_contract: analysisContract,
            models_used: message.modelUsage,
            input_tokens: message.usage.input_tokens,
            cache_creation_input_tokens:
              message.usage.cache_creation_input_tokens,
            cache_read_input_tokens: message.usage.cache_read_input_tokens,
            output_tokens: message.usage.output_tokens,
            estimated_thinking_tokens: estimatedThinkingTokens,
            duration_ms: message.duration_ms,
            duration_api_ms: message.duration_api_ms,
            total_cost_usd: message.total_cost_usd,
            stop_reason: message.stop_reason,
          },
          null,
          2,
        ),
      );
      console.log();
```

**What it does**

Reports SDK-provided measurements after a final analysis has passed validation.

**Why we added it**

Week 2 needs observable model/settings/usage information so direct, thinking, and cache runs can be compared. Week 1 also introduced tokens and context as practical constraints.

**How it works**

The thinking-event branch replaces `estimatedThinkingTokens` with `message.estimated_tokens`. It does not add each frame. The installed SDK declaration describes this field as a running estimate for the current thinking block, not authoritative billed tokens. Sentinel retains the latest reported estimate; it is not a sum over every thinking block/tool turn. Its initial zero can also mean no such event was observed.

| Printed field | Actual source and meaning |
| --- | --- |
| `reasoning_mode` | The local `direct`/`thinking` choice. |
| `requested_model` | Environment value or `sonnet` alias, not necessarily the exact resolved model. |
| `prompt_version`, `prompt_contract` | Local labels for the text or multimodal contract. |
| `models_used` | The SDK's `modelUsage` map, including per-model accounting. |
| `input_tokens` | SDK `usage.input_tokens`; cache creation/read tokens are reported separately. |
| `cache_creation_input_tokens` | SDK-reported input tokens used to create prompt-cache entries. |
| `cache_read_input_tokens` | SDK-reported input tokens served through cache reads. |
| `output_tokens` | The SDK's reported generated-output accounting. Do not add the thinking estimate as an extra billable total. |
| `estimated_thinking_tokens` | Latest observed thinking-block estimate, with the limitations above. |
| `duration_ms` | SDK-reported duration. Sentinel does not compute a separate elapsed-time measurement. |
| `duration_api_ms` | SDK-reported API duration; do not infer network overhead by subtracting this from duration. It may account for internal work differently. |
| `total_cost_usd` | SDK-provided cumulative estimated cost for the query. No local multiplication by prices occurs. |
| `stop_reason` | SDK-reported stop reason, retained for inspection rather than used as the acceptance gate. |

For this installed SDK, `usage` describes the main agent loop, while `modelUsage` covers a broader set of model calls through the query pipeline. It is misleading to treat all fields as measurements from a single raw HTTP request. SDK type comments explicitly describe cost as an estimate, not a billing statement.

The relevant local SDK declarations are [SDK result accounting](../../node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts) and [thinking progress](../../node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts). These local version-specific definitions were inspected; this note does not assume the latest public SDK behaves identically.

**What is not implemented**

There is no application cost formula, pricing table, pre-request token count, `max_tokens` setting, recorded configured output-token ceiling, time-to-first-token measurement, or budget rejection policy. The SDK may report extra fields internally; Sentinel only prints the selected fields shown above. An older saved `request-metadata-run-1.json` can contain more data than today's normal output because the full-message debug logger is now commented out.

Metadata printing happens after acceptance. A rejected turn takes an earlier error path and does not receive this full normal metadata block. No source function automatically saves these measurements into `experiments/`; current run reporting is terminal output.

**Connections, input, and output**

Input is thinking progress events plus the successful SDK final result. Output is a pretty-printed metadata object. This code calls no billing endpoint and stores no usage database.

**Without this code**

Sentinel could still produce analyses, but its normal output would not show the measurements needed to understand reasoning/caching trade-offs.

**Important thing to remember**

Week 2 cost **reporting** exists. A local cost **calculation** and a spending limit do not. `maxTurns`, `output_tokens`, estimated thinking tokens, and `max_tokens` describe different things; none should be substituted for another.

### 18. Prompt caching: what our code contributes

**Code**

Source: [src/index.ts](../../src/cli/analysis-turn.ts) · lines 142–150.

```ts
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append:
            analysisContract === 'multimodal'
              ? `${incidentAnalysisInstructions}\n${multimodalEvidenceInstructions}\n${incidentMetricToolInstructions}`
              : `${incidentAnalysisInstructions}\n${incidentMetricToolInstructions}`,
          excludeDynamicSections: true,
        },
```

Source: [src/index.ts](../../src/cli/analysis-turn.ts) · lines 309–313.

```ts
            input_tokens: message.usage.input_tokens,
            cache_creation_input_tokens:
              message.usage.cache_creation_input_tokens,
            cache_read_input_tokens: message.usage.cache_read_input_tokens,
            output_tokens: message.usage.output_tokens,
```

**What it does**

Reuses stable system instructions across independent queries and reports cache counters. Caching itself is performed below Sentinel's application code.

**Why we added it**

Week 2 asks us to see how repeated stable instructions can reuse prompt processing while the incident changes.

**How it works**

The prompt module exports stable strings. The schema and small tool definition are also stable for equivalent requests. `append` selects a stable text or multimodal contract instead of inserting the changing incident there. Incident data is supplied separately through `prompt`.

`excludeDynamicSections: true` helps keep the preset's system portion stable. In the installed SDK's [system prompt option documentation](../../node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts), per-user dynamic content is described as moved to the first user message, not removed from the model's context entirely.

The SDK supplies cache creation/read counters in the final result, and Sentinel prints them. There is no cache-control header, `cache_control` block, TTL, key, cache map, local answer store, or invalidation function in this code. The saved cache experiment is evidence of a successful cache read, not proof that every future incident will hit a cache or run faster.

**Connections, input, and output**

Input is the stable contract plus a changing incident. Output is a normal analysis and SDK cache counters. Each `runTurn()` starts a fresh `query()` without appending previous incident messages.

**Without this code**

Removing stable prompt construction would make deliberate prefix reuse harder; removing the counters would hide cache use. Removing only the logging would not itself disable SDK caching.

**Important thing to remember**

Prompt caching reuses processing for matching prompt material; it is not conversation continuation or storage of the previous answer. A model's internal KV-cache mechanics are also not implemented in this repository. Sentinel has no application memory store, although it does not disable any SDK session persistence. Week 2's stable-prefix/counter work is present; application cache controls are not.

### 19. CLAUDE.md, permissions, and runtime settings

**Code/configuration**

Source: [CLAUDE.md](../../CLAUDE.md) · lines 1–42.

```markdown
# Sentinel Project Instructions

## Purpose

Sentinel is a TypeScript command-line application for evidence-aware incident analysis with Claude. It accepts incident text or a dashboard image and must return either a schema-validated analysis or an explicit typed failure.

Claude generates candidate output. The application remains responsible for input validation, schema validation, interruption handling, failure classification, and observability.

## Project structure

- `src/index.ts`: interactive CLI, Claude Agent SDK request lifecycle, streaming, cancellation, multimodal input, and run metadata.
- `src/contracts/`: JSON Schema and TypeScript contracts.
- `src/validation/`: JSON parsing and schema validation.
- `src/errors/`: typed application failures and SDK error classification.
- `src/prompts/`: stable incident-analysis instructions and request prompts.
- `src/runtime/`: response acceptance boundaries shared by the CLI and tests.
- `src/tools/`: application-controlled tools available during normal Sentinel requests.
- `src/config/`: direct and thinking configuration.
- `src/experiments/`: local experiment utilities.
- `experiments/`: recorded Week 2 outputs and comparisons. Preserve recorded model responses unless explicitly asked to replace them.
- `dist/`: generated TypeScript output. Do not edit it directly.

## Commands

- Install exact dependencies: `npm ci`
- Compile TypeScript: `npm run build`
- Start the interactive CLI: `npm start`
- Start in direct mode: `npm run start:direct`
- Start in thinking mode: `npm run start:thinking`
- Validate a recorded incident analysis: `npm run validate:json -- <path-to-json>`
- Run the automated test suite: `npm test`

Run `npm run build` after TypeScript changes and `npm test` before declaring a code change complete.

## Coding conventions

- Use TypeScript with strict type checking and native ESM.
- Include `.js` extensions in relative imports because the project uses NodeNext module resolution.
- Keep SDK integration, contracts, validation, errors, prompts, and configuration separated by responsibility.
- Treat SDK and parsed JSON values as `unknown` until they are narrowed or validated.
- Return typed failures at the application boundary instead of exposing raw exceptions.
- Keep incident facts separate from assumptions, hypotheses, and unsupported claims.
```

Source: [CLAUDE.md](../../CLAUDE.md) · lines 44–67.

```markdown
- Keep credentials in environment variables and load them through `import 'dotenv/config';`.
- Avoid dependencies unless they provide a clear requirement that is not reasonably handled by the platform or existing packages.

## Safety boundaries

- Never read, print, edit, or commit `.env` or `CLAUDE_CODE_OAUTH_TOKEN`.
- Do not make a live model request unless the user explicitly asks; live requests can incur cost.
- Do not execute incident remediation actions. Sentinel proposes reversible next actions only.
- Do not weaken schema validation, typed failure handling, or interrupted-response rejection to make an example pass.
- Do not overwrite original experiment responses or fabricate metrics.
- Do not create a Git commit unless the user explicitly requests one.

These instructions guide Claude Code's behavior but are not a security boundary. Enforceable restrictions belong in Claude Code permissions, hooks, sandboxing, operating-system controls, and application code.

## Definition of done

A change is complete only when:

1. TypeScript compilation succeeds.
2. Relevant automated tests or recorded-output validations succeed.
3. Malformed, incomplete, or schema-invalid model output is rejected with a typed failure.
4. No secret or `.env` content appears in source, logs, output, or Git changes.
5. Relevant documentation and experiment evidence are updated without altering unrelated recorded responses.
6. The final report states what was verified and any remaining limitation.
```

Source: [.claude/settings.json](../../.claude/settings.json) · lines 1–12.

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "allow": [
      "Bash(npm run build)",
      "Bash(npm run validate:json -- *)"
    ],
    "deny": [
      "Read(./.env)"
    ]
  }
}
```

**What it does**

`CLAUDE.md` explains how a coding assistant should work on Sentinel. `.claude/settings.json` supplies shared Claude Code tool-permission rules.

**Why we added it**

Week 2 includes configuring Claude Code with project context, consistent commands, conventions, and boundaries before more advanced hooks and tool policies are added.

**How it works**

The project instructions explain the purpose and directory layout, list build/run/test commands, require native ESM and strict TypeScript, ask for `unknown` until validation, and prohibit accepting partial output. They say to protect credentials, avoid unrequested live model calls and commits, preserve recorded evidence, and propose rather than execute remediation. The definition of done ties completion to compilation, validation, and a clear verification report.

These are natural-language instructions. They do not inject a check into `readIncidentMetric()` or `validateIncidentAnalysisValue()`. The application-generated system append comes from `src/prompts/incident-analysis.ts`; `CLAUDE.md` is a separate project-instruction mechanism.

In `.claude/settings.json`, `$schema` describes the configuration format for tooling. `permissions.allow` preauthorizes the matching build and recorded-JSON-validation Bash calls. `permissions.deny` blocks the Claude Code `Read` tool for `./.env`. That is narrower than denying every possible process from reading the file: the application itself intentionally loads its environment through dotenv, and an OS-level filesystem policy would be a different control. `npm test` is not explicitly listed in these shared allow entries.

**A version-specific detail that matters in this checkout**

`runTurn()` does not explicitly set `settingSources`. The installed `0.3.245` SDK declares:

Source: [node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts](../../node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts) · lines 2004–2014.

```ts
    /**
     * Control which filesystem settings to load.
     * - `'user'` - Global user settings (`~/.claude/settings.json`)
     * - `'project'` - Project settings (`.claude/settings.json`)
     * - `'local'` - Local settings (`.claude/settings.local.json`)
     *
     * When omitted, all sources are loaded (matches CLI defaults).
     * Pass `[]` to disable filesystem settings (SDK isolation mode).
     * Must include `'project'` to load CLAUDE.md files.
     */
    settingSources?: SettingSource[];
```

Therefore it would be wrong to assert that the SDK ignores filesystem settings by default in this installed version. The query also omits `strictMcpConfig`. The source explicitly registers one application MCP tool, but it does not independently demonstrate that every effective tool/setting comes only from this file. `allowedTools` auto-permits the named tool; it is not a blanket denial of every other potentially configured tool. The inspected [SDK permission/base-tool declarations](../../node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts) distinguish these options.

The saved Claude Code session-comparison document records that project settings and `CLAUDE.md` loaded in the author's interactive Claude Code session. That is evidence for that session, not a fresh inventory of the effective settings in a live Sentinel query today.

**Connections, input, and output**

Claude Code and potentially the SDK runtime load these files according to settings discovery. No Sentinel source function explicitly reads `CLAUDE.md` or this JSON. Inputs are project instructions/permission patterns; effects are model guidance and permission decisions for covered coding tools.

**Without this configuration**

A coding session would lack Sentinel-specific instructions and these shared permission rules. The application's explicit Ajv checks, abort guard, and fixed lookup would still exist because they are executable source code.

**Important thing to remember**

Week 2 has project guidance and a few concrete Claude Code permissions. It does not yet have Week 3's caller-identity authorization or deterministic tool-policy hook. Guidance, permission configuration, and application validation are separate layers.

### 20. The /verify-sentinel custom command and ignored files

**Code/configuration**

Source: [.claude/commands/verify-sentinel.md](../../.claude/commands/verify-sentinel.md) · lines 1–27.

````markdown
---
description: Build Sentinel and validate its recorded structured incident analyses without changing files or making API requests
disable-model-invocation: true
allowed-tools: Bash(npm run build) Bash(npm run validate:json -- *)
---

Verify the Sentinel project from the repository root.

Run only the following commands, exactly as written and one at a time. Do not add
`cd`, file-existence checks, redirection, pipes, command chaining, or exit-code
printing.

```text
npm run build
npm run validate:json -- experiments/week-2/structured-output/prompt-requested-json-run-1-formatted.json
npm run validate:json -- experiments/week-2/structured-output/api-structured-output-complete-run-1.json
npm run validate:json -- experiments/week-2/structured-output/api-structured-output-stream-run-1.json
npm run validate:json -- experiments/week-2/thinking-comparison/direct-run-1-analysis.json
npm run validate:json -- experiments/week-2/thinking-comparison/thinking-run-1-analysis.json
npm run validate:json -- experiments/week-2/prompt-caching/request-1-incident-a-analysis.json
npm run validate:json -- experiments/week-2/prompt-caching/request-2-incident-b-analysis.json
```

After every command finishes, report it as passed or failed and summarize any
validation error.

Do not edit files, start the interactive CLI, make a network request, expose environment variables, or create a Git commit during this verification.
````

Source: [../.gitignore](../../../.gitignore) · lines 1–7.

```text
node_modules/
dist/
.env
.env.*
!.env.example
coverage/
*.log
```

**What it does**

Defines a reusable Claude Code verification workflow: build, then validate seven saved text-analysis files. The outer repository `.gitignore` keeps generated output, dependencies, local credentials, coverage, and logs out of normal Git tracking.

**Why we added it**

Week 2 asks for one reusable project command. Exact commands make the verification repeatable and align it with the narrow shared permission patterns.

**How it works**

The command's Markdown frontmatter supplies its description, `disable-model-invocation: true`, and allowed tools. Its body specifies the exact commands and disallows shell wrappers/chaining that would no longer match the intended permissions. It asks for per-command results and forbids starting the live CLI, network requests, environment disclosure, and commits.

`/verify-sentinel` is a **Claude Code project command**, not one of Sentinel's readline commands. Typing it into Sentinel's `You:` prompt would fall through as incident text; only `/mode`, `/image`, and the exit aliases are implemented there.

The custom command builds and checks recorded text analyses. It does not run `npm test`, test the metric transport, validate the multimodal contract through the file utility, or intentionally exercise the malformed-text fixture. Those are different checks.

The command's phrase “without changing files” needs a practical qualification: `npm run build` writes ignored generated files under `dist/`. It does not edit the authored TypeScript. Also, its “repository root” wording must be read as the application package directory for these commands; the outer `ai-playground` directory has no package script to run.

`.env.*` is ignored, with `!.env.example` keeping the safe template eligible for tracking. `.gitignore` is not access control and does not remove files already tracked in Git.

**Connections, input, and output**

A Claude Code user invokes the Markdown command; Claude Code executes the approved npm commands; the offline utility reads saved JSON. Output is build/validation reports. Sentinel's normal request loop never invokes this command.

**Without this configuration**

The developer would perform those checks manually, and generated/local files would be easier to add accidentally. Runtime response validation would be unaffected.

**Important thing to remember**

A reusable coding command is not an incident-analysis tool. `get_incident_metric` runs inside the SDK query; `/verify-sentinel` helps develop and verify the project.

### 21. The saved-JSON validator

**Code**

Source: [scripts/validate-analysis.ts](../../scripts/validate-analysis.ts) · lines 1–24.

```ts
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { parseIncidentAnalysis } from '../validation/parse-incident-analysis.js';

const defaultResponsePath =
  './experiments/week-2/structured-output/prompt-requested-json-run-1-formatted.json';
const responsePath = resolve(process.argv[2] ?? defaultResponsePath);

try {
  const rawResponse = await readFile(responsePath, 'utf8');
  const analysis = parseIncidentAnalysis(rawResponse);

  console.log('Validation succeeded.');
  console.log(`File: ${responsePath}`);
  console.log(`Facts: ${analysis.facts.length}`);
  console.log(`Assumptions: ${analysis.assumptions.length}`);
  console.log(`Hypotheses: ${analysis.hypotheses.length}`);
  console.log(`Uncertainty: ${analysis.uncertainty.level}`);
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error.';
  console.error(`Validation failed: ${message}`);
  process.exitCode = 1;
}
```

**What it does**

Reads a saved response file, parses its JSON, validates the text-analysis contract, and prints a compact report.

**Why we added it**

It preserves a repeatable way to compare prompt-requested JSON with schema-valid output without making another model request. The debugging report explains that validation began as this separate exercise and was later connected to every live result.

**How it works**

`process.argv[2]` selects the file; otherwise it uses the formatted prompt-requested JSON fixture. `resolve()` makes the path absolute. `readFile(..., 'utf8')` produces a string. `parseIncidentAnalysis()` supplies both JSON parsing and Ajv validation. Success prints counts and uncertainty, not the full model response.

On failure it prints a human-readable message and sets exit code 1. Unlike the main CLI, this utility does not call `formatFailure()` to produce the JSON failure envelope. File-read errors and schema/parse errors all reach this utility's catch.

The `validate:json` npm script runs already compiled JavaScript and has no build step of its own. Build first when `dist/` is absent or stale. It expects a bare text-analysis object, not a full SDK metadata envelope, a tool lifecycle record, or a multimodal object with extra fields.

**Connections, input, and output**

`npm run validate:json -- <file>` or the custom command → this utility → `parseIncidentAnalysis()` → Ajv. Input is a file path and saved text. Output is a short report and exit status; no Claude call occurs.

**Without this code**

The live path would still validate SDK objects, but checking recorded prompt-only responses would require another script or manual work.

**Important thing to remember**

This is the actual application `JSON.parse()` example. It demonstrates Week 2 parsing versus structural validation independently of the live SDK's parsed `structured_output`.

### 22. Tests: what they actually prove

**Code: shared valid fixture**

Source: [tests/analysis.test.ts](../../tests/analysis.test.ts) · lines 24–40.

```ts
const validAnalysis: IncidentAnalysis = {
  facts: ['Checkout error rate was 9% at 10:04 UTC.'],
  assumptions: ['The recorded metric is representative of the incident.'],
  hypotheses: [
    {
      claim: 'A dependency may be degraded.',
      supporting_evidence: [],
      contradicting_evidence: ['No dependency telemetry was supplied.'],
    },
  ],
  missing_information: ['Dependency telemetry is missing.'],
  reversible_next_actions: ['Inspect dependency health dashboards.'],
  uncertainty: {
    level: 'high',
    reason: 'The available evidence does not establish a root cause.',
  },
};
```

**Code: parsing and structural rejection**

Source: [tests/analysis.test.ts](../../tests/analysis.test.ts) · lines 42–99.

```ts
test('parses a valid incident-analysis JSON response', () => {
  assert.deepEqual(
    parseIncidentAnalysis(JSON.stringify(validAnalysis)),
    validAnalysis,
  );
});

test('classifies malformed JSON as a model-output failure', () => {
  assert.throws(
    () => parseIncidentAnalysis('{"facts": ['),
    (error: unknown) =>
      error instanceof SentinelFailure &&
      error.category === 'model-output' &&
      error.code === 'malformed-json',
  );
});

test('rejects JSON that does not satisfy the incident schema', () => {
  const { uncertainty: _omitted, ...missingUncertainty } = validAnalysis;

  assert.throws(
    () => validateIncidentAnalysisValue(missingUncertainty),
    (error: unknown) =>
      error instanceof SentinelFailure &&
      error.category === 'model-output' &&
      error.code === 'schema-invalid-output',
  );
});

test('rejects unexpected properties from structured output', () => {
  assert.throws(
    () =>
      validateIncidentAnalysisValue({
        ...validAnalysis,
        confirmed_root_cause: 'deployment',
      }),
    (error: unknown) =>
      error instanceof SentinelFailure &&
      error.code === 'schema-invalid-output',
  );
});

test('validates the multimodal evidence-classification contract', () => {
  const multimodalAnalysis: MultimodalIncidentAnalysis = {
    ...validAnalysis,
    evidence_classification: {
      text_observations: ['The incident text reports checkout failures.'],
      image_observations: ['The dashboard shows a 9% error rate.'],
      inferences: ['The two observations may describe the same event.'],
      unsupported_claims: [],
    },
  };

  assert.deepEqual(
    validateMultimodalIncidentAnalysisValue(multimodalAnalysis),
    multimodalAnalysis,
  );
});
```

**Code: failure classification and formatting**

Source: [tests/analysis.test.ts](../../tests/analysis.test.ts) · lines 101–130.

```ts
test('maps common thrown SDK messages to typed failures', async (context) => {
  const cases = [
    ['401 unauthorized', 'authentication-error'],
    ['429 rate limit exceeded', 'rate-limit'],
    ['Request timed out', 'timeout'],
    ['Prompt exceeded context length', 'context-limit'],
    ['Unexpected transport failure', 'runtime-error'],
  ] as const;

  for (const [message, expectedCode] of cases) {
    await context.test(expectedCode, () => {
      assert.equal(classifyThrownFailure(new Error(message)).code, expectedCode);
    });
  }
});

test('formats a typed failure as the application rejection contract', () => {
  const formatted = JSON.parse(
    formatFailure(new SentinelFailure('interrupted-stream', 'Stopped.')),
  ) as unknown;

  assert.deepEqual(formatted, {
    accepted: false,
    failure: {
      category: 'runtime',
      code: 'interrupted-stream',
      message: 'Stopped.',
    },
  });
});
```

**Code: the real interruption guard**

Source: [tests/analysis.test.ts](../../tests/analysis.test.ts) · lines 132–169.

```ts
test('rejects streamed partial output when the turn is interrupted', () => {
  const abortController = new AbortController();
  const acceptanceGuard = new TurnAcceptanceGuard('stream');

  acceptanceGuard.recordPartialOutput('{"facts":["partial');
  abortController.abort();

  assert.equal(acceptanceGuard.hasPartialOutput, true);
  assert.throws(
    () =>
      acceptanceGuard.acceptValidatedResult(
        validAnalysis,
        abortController.signal,
      ),
    (error: unknown) =>
      error instanceof SentinelFailure &&
      error.category === 'runtime' &&
      error.code === 'interrupted-stream' &&
      error.message === 'Stream interrupted. The partial response was rejected.',
  );
  assert.equal(acceptanceGuard.hasAcceptedResult, false);
});

test('accepts a validated final result when the turn was not interrupted', () => {
  const abortController = new AbortController();
  const acceptanceGuard = new TurnAcceptanceGuard('stream');

  acceptanceGuard.recordPartialOutput('{"facts":');
  assert.equal(
    acceptanceGuard.acceptValidatedResult(
      validAnalysis,
      abortController.signal,
    ),
    validAnalysis,
  );
  acceptanceGuard.assertCompleted(abortController.signal);
  assert.equal(acceptanceGuard.hasAcceptedResult, true);
});
```

**Code: tool input and local lookup**

Source: [tests/analysis.test.ts](../../tests/analysis.test.ts) · lines 171–207.

```ts
test('accepts only the supported incident metric tool input', () => {
  const input = parseIncidentMetricInput({
    incident_id: 'INC-104',
    metric: 'checkout_error_rate',
  });

  assert.deepEqual(input, {
    incident_id: 'INC-104',
    metric: 'checkout_error_rate',
  });
  assert.throws(() =>
    parseIncidentMetricInput({
      incident_id: 'INC-999',
      metric: 'checkout_error_rate',
    }),
  );
  assert.throws(() =>
    parseIncidentMetricInput({
      incident_id: 'INC-104',
      metric: 'deployment_status',
    }),
  );
});

test('returns the fictional metric only after valid input is supplied', () => {
  const input = parseIncidentMetricInput({
    incident_id: 'INC-104',
    metric: 'checkout_error_rate',
  });

  assert.deepEqual(readIncidentMetric(input), {
    value: 9,
    unit: 'percent',
    observed_at: '10:04 UTC',
    source: 'fictional Sentinel monitoring snapshot',
  });
});
```

**What it does**

Uses Node's test runner and strict assertions to check parsers, schemas, failure wrappers, the acceptance guard, and the fixed tool lookup without calling Claude.

**Why we added it**

Week 2's application boundaries need deterministic tests. A model-generated example alone cannot prove that malformed output or cancellation is rejected consistently.

**How it works**

The `validAnalysis` fixture at the top of this file supplies the current contract. `JSON.stringify()` creates valid input for a parse round trip. The malformed fragment tests the JSON parser; removing `uncertainty` tests missing required structure; adding `confirmed_root_cause` tests `additionalProperties: false`. The multimodal fixture adds its provenance fields and checks acceptance.

The five nested error-message cases verify the regex-based thrown-error classifier. The formatting test parses the failure JSON string and compares the actual contract object.

The interruption test exercises the real `TurnAcceptanceGuard` used by `runTurn()`: record partial content, abort, attempt to accept an otherwise valid fixture, assert `interrupted-stream`, and verify acceptance remains false. The companion test verifies the non-aborted path and completion check. It does not just construct an expected error string.

The tool tests explicitly parse supported arguments before lookup, reject unsupported incident/metric literals, and compare the actual returned record. They do not exercise a Claude query or the SDK dispatch route. The extra offline MCP check performed during this review covered the registered handler separately.

**Connections, input, and output**

`npm test` builds, then executes `dist/tests/sentinel.test.js`. Inputs are deterministic fixtures; output is assertions and a test summary. It imports helpers but not `src/index.ts`, so it does not run `main()` or read the OAuth configuration through the CLI entry point.

**Without this code**

There would be no repeatable regression checks for these boundaries, especially “an aborted turn cannot accept a valid-looking final value.”

**Important thing to remember**

The current suite passed: **16 tests including nested cases, zero failures**. This does not prove end-to-end stream transport behavior, every `classifySdkFailure()` branch, image-byte handling, reasoning parsing, authorization, tool-result validation, call limits, or malicious-result handling. Those are not covered by this test file. No new live Claude request was made during this review.

## 23. How every important file connects

| File/area | Runtime role and caller |
| --- | --- |
| [package.json](../../package.json) | Build/start/test/validation entry points and dependencies. |
| [package-lock.json](../../package-lock.json) | Locked package resolution; not application behavior. |
| [tsconfig.json](../../tsconfig.json) | Compiler contract from `src/` to `dist/`. |
| [.env.example](../../.env.example) | Safe names/default for environment setup; the real `.env` was not opened. |
| [src/index.ts](../../src/index.ts) | Entry point, interactive loop, SDK query, images, event handling, printing, cancellation. |
| [src/config/reasoning.ts](../../src/config/reasoning.ts) | Called at startup; returns SDK thinking/effort configuration. |
| [src/prompts/incident-analysis.ts](../../src/prompts/incident-analysis.ts) | User-evidence builders plus system instructions and logged prompt labels. |
| [src/schemas/incident-analysis.ts](../../src/schemas/incident-analysis.ts) | Shared TypeScript and JSON Schema output contract; consumed by SDK setup and Ajv. |
| `src/tools/incident-metrics.ts` | Zod input contract, fixed data, handler, local MCP server, and trace type. |
| [src/validation/incident-analysis.ts](../../src/validation/incident-analysis.ts) | Ajv validators for live objects and raw-text parser for recorded data/tests. |
| [src/application/turn-acceptance.ts](../../src/application/turn-acceptance.ts) | Shared cancellation/completion acceptance boundary used by CLI and tests. |
| [src/errors/classify-sdk-failure.ts](../../src/errors/classify-sdk-failure.ts) | Converts SDK result failures to typed application errors. |
| [src/errors/sentinel-failure.ts](../../src/errors/sentinel-failure.ts) | Codes/categories, error class, thrown-error heuristics, printed rejection contract. |
| [scripts/validate-analysis.ts](../../scripts/validate-analysis.ts) | Offline saved-file validation entry point; never called by live `runTurn()`. |
| [tests/analysis.test.ts](../../tests/analysis.test.ts) | Deterministic helper/acceptance tests, not a live integration suite. |
| [CLAUDE.md](../../CLAUDE.md), [.claude/settings.json](../../.claude/settings.json) | Coding guidance and shared permissions, loaded by tooling/settings discovery. |
| [.claude/commands/verify-sentinel.md](../../.claude/commands/verify-sentinel.md) | Developer verification command, outside Sentinel's readline command parser. |
| [README.md](../../README.md) | Setup and use documentation; not imported code. |
| [docs/week-2/agent-sdk-guide.md](agent-sdk-guide.md), [docs/week-2/learning-guide.md](learning-guide.md) | Earlier SDK/Week 2 guides. This note uses working source as authority if wording or line references have drifted. |
| `docs/implementation-learning-notes.md` | Another implementation learning note, preserved. This walkthrough is a separate document organized around the requested code/what/why/how structure. |
| [experiments/](../../experiments) | Saved analysis/metadata/fixtures and historical reports; not automatically loaded by the live app. |
| `dist/`, `node_modules/` | Generated build output and installed dependencies. They are not additional authored Sentinel features. Local SDK definitions were inspected to resolve SDK-owned behavior. |
| [../weeks/week1.md](<../../../docs/week1.md>), [week2.md](<../../../docs/week2.md>), [week3.md](<../../../docs/week3.md>) | Learning briefs used to map concepts and identify future scope. They are not runtime instructions or executable implementations. |
| [../week-1-incident-analysis/](../../../week-1-incident-analysis) | Prompt/parameter experiments and reflection from Week 1. This directory has saved learning artifacts, not an additional running Sentinel application. |

The recorded-output folders have different purposes: `structured-output` supplies valid and malformed format examples; `multimodal` includes the dashboard and provenance record; `thinking-comparison` and `prompt-caching` hold comparisons; `tool-use` records the protocol lifecycle; `failures` holds interruption evidence; `claude-code` records settings/session checks. Their model outputs were not copied into this note beyond the small tool ID exchange.

**The Week 1 code connection is specific.** The saved prompts requested `known_facts`, `candidate_hypotheses`, per-hypothesis `evidence_needed`, and an `uncertainty_statement`. Week 2 uses `facts`, `hypotheses`, overall `missing_information`, and an uncertainty object with level/reason. There is no migration/conversion function between those formats. Week 1's LM Studio generation settings are recorded experiments; Sentinel's `query()` does not configure those parameters or load the old few-shot examples.

## 24. Exactly what Week 3 adds on top of this checkout

The Week 3 introduction says Sentinel previously only reasoned from supplied prompt evidence. That is too narrow for the current checkout: it already retrieves one missing observation through `get_incident_metric`. The Week 2 brief explicitly allowed a tool-use preview, and your implementation completed that preview through the Agent SDK.

| Tool concern | Present in current code | What the Week 3 brief adds |
| --- | --- | --- |
| Tool definition | One actual `tool()` with name, description, annotations, and Zod shape. | At least `get_service_metrics` and `get_dependency_health`; optional `search_logs`. |
| Data source | Fixed fictional INC-104 error-rate record. | Richer mocked service/dependency evidence to support a multi-step investigation. |
| Tool availability | Local `sentinel` MCP server passed to `query()`; named tool auto-permitted. | Explicit control over the effective allowed tool set and least privilege. |
| Input validation | SDK validation of two required literal arguments; separately testable local Zod parser. | Service/dependency allowlists, valid time ranges, safe queries, argument bounds. |
| Execution | Real application callback calls `readIncidentMetric()`. | Multiple narrow mocked handlers with explicit error handling. |
| Tool result | Callback returns MCP content/object; SDK sends matching `tool_result`. | Validate output shapes, limit result sizes, represent malformed/error results predictably. |
| Model continuation | Already handled by the Agent SDK, supported by the saved lifecycle. | Investigation across multiple evidence calls with explicit continue/stop/escalate decisions. |
| Loop implementation | SDK-owned conversation loop plus an event-consumer `for await`; no custom transcript/dispatcher. | An explicitly bounded application-controlled workflow/custom loop and comparison with SDK behavior. |
| Termination | `maxTurns: 3`, abort controller, rejection when no final result is accepted. | Separate maximum tool calls and execution-time limits with deterministic failure states. |
| Authorization | No caller identity or permission-policy decision in the handler. Literal schemas restrict lookup values only. | Reject a valid request from an unauthorized identity before executing it. |
| Tool-result trust | Prompt warns that a metric does not prove root cause. No malicious-result regression. | Treat results/logs as untrusted content; test injection cannot change authority. |
| Deterministic hooks | No tool-policy hooks or `canUseTool` callback in query options. | Block simulated destructive actions and record policy/reason/approval requirements. |
| Audit trail | Four optional single-slot trace entries printed after accepted analysis. | Per-call validation/authorization/execution/result records that survive repeated calls and failures. |
| Tests | Parser/schema/guard/lookup checks. | Unknown tools, invalid service/time, unauthorized identity, timeout, malformed/oversized results, injection, call-limit breaches. |
| Architecture | Already an SDK-backed model-directed tool choice inside an interactive CLI. | Explain the appropriate workflow/agent design and compare SDK versus custom control. No multi-agent implementation is justified by current code alone. |

There is a small inconsistency in the Week 3 brief: its custom-loop-versus-SDK section is labelled optional, while the required-exercises/deliverables lists include both an SDK implementation and the comparison. This note does not resolve that curriculum choice by inventing code. Either way, you already use the Agent SDK; Week 3's new work is the stronger investigation/control layer, not installing it for the first time.

**Why tools appear in both weeks:** Week 2 answers “How does a model request a function and receive its result?” Your code already answers that end to end for one fixed lookup. Week 3 asks “How do we let a model investigate with several capabilities while application code checks identity, inputs, outputs, time, call budgets, and policy at every step?” The current source does not yet implement those additional controls.

## Coverage checklist for the requested learning topics

| Topic you asked about | What actually exists | Read |
| --- | --- | --- |
| Claude client creation / Messages API request | Agent SDK `query()`; no direct Anthropic client constructor or `messages.create()`. | 1, 6 |
| System and user messages | Claude Code preset + appended instructions; string prompts or explicit image user-message blocks. | 4, 6, 16 |
| Model configuration / `max_tokens` | Environment model alias; no explicit `max_tokens`. `maxTurns` is a different bound. | 3, 6, 17 |
| Structured output / JSON Schema | SDK `outputFormat` with two authored JSON Schemas; independent Ajv check. | 5, 6, 12–13 |
| Parsing / validation | Raw-string parsing in offline utility; object validation in live path. | 12–13, 21 |
| Streaming / non-streaming | Partial-event display versus waiting for final SDK output; no raw non-streaming Messages call. | 11 |
| Interrupted stream handling | Active abort controller + shared guard + deterministic regression test. | 14, 22 |
| Errors/failures | Typed codes/categories, SDK result mapping, thrown-message heuristics. | 15 |
| Multimodal input | Base64 image plus text; extension/readability checks; provenance output contract. | 16 |
| Thinking configuration | Disabled or adaptive with omitted display/high effort. | 3, 17 |
| Tokens / latency / cost | SDK-provided measurements; no local price formula or preflight count. | 17 |
| Prompt caching | Stable prompt setup and SDK cache counters, no local cache implementation. | 18 |
| `CLAUDE.md` / settings | Project instructions and shared Claude Code permission rules. | 19 |
| Custom command | `/verify-sentinel` in Claude Code, distinct from Sentinel commands. | 20 |
| Tool definition/schema | Real SDK tool with Zod literals and SDK-generated JSON Schema. | 7–8 |
| `tool_use` / function execution | SDK dispatch invokes the local callback; CLI observes/traces the request. | 8–10 |
| `tool_result` / continuation | Handler returns MCP content; SDK sends result and continues Claude. | 8–10 |
| Week 3 tool loop | Basic lifecycle already works through SDK; broader execution policy and custom-loop work remain. | 24 |

## Verification and scope of this review

`npm test` compiled the current source and passed all 16 reported tests. An additional offline inspection used the installed MCP server's registered list/call handlers to check the generated schema, execute the valid fixed lookup, and confirm invalid literal input returned an error before entering the callback. That was an in-process verification, not a live Claude or network test and not a new production implementation.

The note's source excerpts were expanded directly from files and checked against those files. Existing source, configuration, and recorded evidence were checked for content changes against a review baseline and remained unchanged. This review adds only this new learning note to the Sentinel repository; the build regenerated ignored `dist/` output. The pre-existing `implementation-learning-notes.md` changed independently during the review and was left untouched by this task. Existing staged changes were preserved. No real `.env` content was opened, no model request was made, and no commit was created.

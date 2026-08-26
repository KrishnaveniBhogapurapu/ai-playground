# Week 2 Sentinel

Sentinel is a TypeScript command-line application for evidence-aware incident analysis with Claude. It accepts incident text or a fictional dashboard image and returns either a schema-validated analysis or an explicit typed failure.

This project turns the Week 1 prompt exercise into an application boundary:

```text
Incident text or dashboard image
        ↓
Validated application input
        ↓
Claude Agent SDK request
        ↓
Complete or streamed response
        ↓
Structured-output validation
        ↓
Accepted analysis or typed failure
        ↓
Model, token, latency, cost, and cache metadata
```

## Requirements

- Node.js 24 or another current Node.js version compatible with the installed dependencies
- A Claude Code OAuth token generated with `claude setup-token`

## Setup from a clean checkout

From `week-2-sentinel`:

```powershell
npm ci
Copy-Item .env.example .env
```

Add the generated token to `.env` without committing or printing it:

```dotenv
CLAUDE_CODE_OAUTH_TOKEN=token-value
CLAUDE_MODEL=sonnet
```

Then verify and start the application:

```powershell
npm test
npm start
```

`npm start` compiles the TypeScript project before starting the CLI, so it also works after a clean checkout where `dist/` does not exist.

## CLI usage

Enter incident evidence directly at the `You:` prompt.

```text
At 10:04 UTC, checkout failures increased from 0.4% to 9%. The root cause is not confirmed.
```

Commands available inside Sentinel:

- `/mode complete`: wait for the final Agent SDK result.
- `/mode stream`: display partial response events while still validating only the completed result.
- `/image`: provide a supported image path and accompanying incident text.
- `/exit`: close Sentinel.
- `Ctrl+C` during a request: cancel the active request and reject incomplete output.
- `Ctrl+C` when idle or again after cancellation: exit the CLI.

The read-only `get_incident_metric` application tool is registered automatically. There is no separate tool mode. Claude may request it when an `INC-104` analysis asks Sentinel to retrieve the checkout error rate instead of supplying the value directly.

## Output contract

Every accepted text analysis contains:

- Facts
- Assumptions
- Hypotheses
- Supporting and contradicting evidence
- Missing information
- Reversible next actions
- Uncertainty level and reason

Multimodal output also classifies text observations, image observations, inferences, and unsupported claims.

Sentinel uses API-supported structured output and then validates the returned value again with Ajv. Valid JSON is not enough: a value can parse successfully but still fail the schema, and a schema-valid statement can still be unsupported by evidence.

## Failure contract

Failures are returned as:

```json
{
  "accepted": false,
  "failure": {
    "category": "runtime",
    "code": "interrupted-stream",
    "message": "Stream interrupted. The partial response was rejected."
  }
}
```

Sentinel distinguishes input, configuration, integration, runtime, and model-output failures. Examples include invalid input, missing configuration, authentication, rate limiting, timeout, interruption, malformed JSON, and schema-invalid output.

## Commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Install the locked dependency versions |
| `npm run build` | Compile strict TypeScript into `dist/` |
| `npm test` | Build and run the dependency-free Node test suite |
| `npm start` | Build and run the interactive Sentinel CLI |
| `npm run start:direct` | Build and run the direct-response comparison configuration |
| `npm run start:thinking` | Build and run the thinking comparison configuration |
| `npm run validate:json -- <file>` | Validate a recorded text incident analysis |

## Project structure

```text
week-2-sentinel/
├── .claude/                 Claude Code shared settings and command
├── experiments/             Recorded runs, comparisons, and reports
├── src/
│   ├── config/              Reasoning configuration
│   ├── contracts/           TypeScript contracts and JSON Schema
│   ├── errors/              Typed failure classification
│   ├── experiments/         Local validation utilities
│   ├── prompts/             Stable Sentinel instructions
│   ├── tests/               Node test suite
│   ├── tools/               Application-controlled Claude tools
│   ├── validation/          JSON parsing and Ajv validation
│   └── index.ts             Interactive application flow
├── CLAUDE.md                Claude Code project instructions
├── package.json
└── tsconfig.json
```

## Week 2 evidence

- `experiments/structured-output/`: prompt-requested and API-supported structured output
- `experiments/failures/`: interrupted request rejection
- `experiments/multimodal/`: dashboard image and evidence classification
- `experiments/thinking-comparison/`: direct-versus-thinking comparison
- `experiments/prompt-caching/`: automatic stable-prefix cache experiment
- `experiments/claude-code/`: configuration and session comparison
- `experiments/tool-use/`: annotated application tool lifecycle
- `experiments/debugging-report.md`: symptoms, causes, corrections, and lessons

## Claude Code foundation

- `CLAUDE.md` describes Sentinel, its commands, conventions, safety expectations, and definition of done.
- `.claude/settings.json` allows the build and recorded-output validator while denying the Claude Code `Read` tool access to `.env`.
- `/verify-sentinel` is the reusable project command.

`CLAUDE.md` guides model behavior; it is not a security boundary. Claude Code permissions apply to covered tool calls, while stronger guarantees require application checks, sandboxing, operating-system controls, and credential isolation.

## Important limitations

- All incidents, dashboard data, and tool data are fictional.
- The application uses the Claude Agent SDK with `CLAUDE_CODE_OAUTH_TOKEN`. Complete mode waits for the SDK's final result; it is not a raw non-streaming Messages API call.
- The incident metric tool reads a fixed in-memory Week 2 record, not a real monitoring system.
- Tool input validation and schema validation do not prove that the model's conclusions are supported. Human or policy-based content review is still required.
- No incident remediation action is executed by Sentinel.

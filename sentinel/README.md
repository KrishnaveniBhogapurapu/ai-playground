# Sentinel

Sentinel is a TypeScript command-line application for evidence-aware incident analysis with Claude. It accepts incident text or a fictional dashboard image and returns either a schema-validated analysis or an explicit typed failure.

The application follows this request flow:

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

From `sentinel`:

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

The read-only `get_service_metrics` and `get_dependency_health` tools are registered automatically. Both use fictional INC-104 fixtures.

For an investigation, ask:

```text
Investigate fictional INC-104 for checkout-api. Retrieve error_rate between 2026-08-21T10:00:00Z and 2026-08-21T10:10:00Z, then check payment-provider health at 2026-08-21T10:04:00Z. Keep observations separate from hypotheses and explain what remains unknown before recommending rollback.
```

The fixture date is a learning convention. Dependency statuses are synthetic observations, not independently verified incident facts. The [Week 3 learning note](docs/week-3/learning-note.md) contains the architecture comparison, diagrams, reflection, and knowledge-check answers.

Sentinel applies a host-controlled read-only policy before tool execution. It limits each investigation to six operational tool attempts, eight model turns, and 90 seconds, with a two-second timeout per tool. Tool inputs are limited to 8 KiB and result envelopes to 16 KiB; the SDK also has a $1 cost budget. Unknown identities and unapproved actions are denied. Failures are recorded explicitly. SDK tool pre-approval has been replaced by a deterministic `PreToolUse` policy hook and a deny-by-default fallback.

All 42 tests pass. The [verification report](experiments/week-3/verification-report.json) records 13 repeatable scenarios covering tool execution, permissions, failures, and limits. Both paths succeeded using Claude through the Agent SDK: [SDK investigation](experiments/week-3/runs/sdk-2026-09-14T21-07-43.480Z.json), [SDK injected output](experiments/week-3/runs/sdk-injection-2026-09-14T21-07-33.325Z.json), [custom investigation](experiments/week-3/runs/custom-2026-09-14T22-25-41.246Z.json), and [custom injected output](experiments/week-3/runs/custom-injection-2026-09-14T22-26-11.615Z.json).

Run `npm run investigate:custom` for the application-managed comparison. Each `query()` returns one decision: request metrics, request dependency health, or finish. Sentinel validates the decision, checks permissions, executes the requested tool, and includes its result in the next query. These queries have no evidence tools registered; only the structured-output formatter is permitted. The custom investigation allows eight decision queries, each capped at three SDK turns, within the shared 90-second deadline and remaining $1 SDK cost budget. Both approaches use the existing SDK authentication.

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
| `npm run build` | Compile application, scripts, fixtures, and tests into `dist/` |
| `npm test` | Build and run the dependency-free Node test suite |
| `npm start` | Build and run the interactive Sentinel CLI |
| `npm run start:direct` | Build and run the direct-response comparison configuration |
| `npm run start:thinking` | Build and run the thinking comparison configuration |
| `npm run validate:json -- <file>` | Validate a recorded text incident analysis |
| `npm run verify:tools` | Record 13 deterministic tool-safety scenarios; no model call |
| `npm run investigate:sdk` | Run and record the bounded live SDK investigation |
| `npm run investigate:injection` | Run and record the live SDK investigation with injected tool content |
| `npm run investigate:custom` | Run and record the custom loop using SDK decision queries |
| `npm run investigate:custom:injection` | Run and record the custom loop with injected tool content |

## Project structure

```text
sentinel/
├── src/
│   ├── index.ts             Application startup
│   ├── cli/                 Terminal interaction and response display
│   ├── application/         Investigation execution, custom loop, response acceptance
│   ├── integrations/        Claude Agent SDK calls and decision adapter
│   ├── config/              Query options and reasoning configuration
│   ├── policies/            Evidence authorization rules
│   ├── hooks/               SDK interception callbacks
│   ├── tools/               Tool registration and mocked evidence providers
│   ├── inputs/              Request types and image-input preparation
│   ├── outputs/             Analysis, evidence, and failure types
│   ├── schemas/             Runtime input/output schema definitions
│   ├── validation/          Parsing and enforcement of those schemas
│   ├── constants/           Fixed limits, names, and fixture values
│   ├── helpers/             Shared utility functions
│   ├── prompts/             Model instructions and prompt builders
│   └── errors/              Failure classification
├── tests/                   Automated behavior tests
├── fixtures/                Shared fictional investigation scenarios
├── scripts/                 Experiment recording and validation commands
├── docs/
│   ├── week-2/              Foundation learning records
│   └── week-3/              Tools, permissions, and loop comparison
├── experiments/
│   ├── week-2/              Recorded foundation experiments
│   └── week-3/              Recorded investigations and safety report
├── .claude/                 Claude Code settings and verification command
├── CLAUDE.md                Project instructions
├── package.json
└── tsconfig.json
```

The CLI starts in [src/index.ts](src/index.ts), reads terminal commands in [cli/session.ts](src/cli/session.ts), and handles response display in [cli/analysis-turn.ts](src/cli/analysis-turn.ts). SDK calls live in [integrations/agent-sdk.ts](src/integrations/agent-sdk.ts); [config/agent-sdk.ts](src/config/agent-sdk.ts) supplies their options and registers the hooks.

The custom path connects [integrations/custom-decisions.ts](src/integrations/custom-decisions.ts) to [application/custom-investigation.ts](src/application/custom-investigation.ts). Both approaches use [application/investigation.ts](src/application/investigation.ts) for tool execution and shared limits, with authorization in [policies/evidence-access.ts](src/policies/evidence-access.ts).

Input and output types describe the data in TypeScript. Schemas define what is valid at runtime, and validation functions check actual values before accepting them. Hooks intercept SDK requests; the same application controls also apply when the custom loop executes a tool directly.

## Learning records and experiments

- [Week 2 learning guide](docs/week-2/learning-guide.md), [SDK guide](docs/week-2/agent-sdk-guide.md), and [code walkthrough](docs/week-2/code-walkthrough.md) preserve the foundation work.
- [Week 3 learning note](docs/week-3/learning-note.md) contains the tool-loop comparison, architecture decisions, reflection, and knowledge check.
- [Week 2 experiments](experiments/week-2/) contain the recorded structured-output, image, thinking, caching, interruption, and tool-use evidence.
- [Week 3 experiments](experiments/week-3/) contain investigation responses and the deterministic safety report.

The experiment scripts accept `--output-dir` so new runs can be recorded under the relevant week without renaming application code. Current npm investigation commands save to `experiments/week-3/`. For another location, run the compiled script with the desired mode and directory, for example `node dist/scripts/run-investigation.js custom --output-dir experiments/week-4/runs`.

## Claude Code foundation

- `CLAUDE.md` describes Sentinel, its commands, conventions, safety expectations, and definition of done.
- `.claude/settings.json` allows the build and recorded-output validator while denying the Claude Code `Read` tool access to `.env`.
- `/verify-sentinel` is the reusable project command.

`CLAUDE.md` guides model behavior; it is not a security boundary. Claude Code permissions apply to covered tool calls, while stronger guarantees require application checks, sandboxing, operating-system controls, and credential isolation.

## Important limitations

- All incidents, dashboard data, and tool data are fictional.
- The application uses the Claude Agent SDK with `CLAUDE_CODE_OAUTH_TOKEN`. Complete mode waits for the SDK's final result; it is not a raw non-streaming Messages API call.
- Evidence tools read fixed in-memory fictional snapshots. Metrics support checkout-api/error_rate within a maximum one-hour range, up to 100 observations. Dependency health supports database and payment-provider at exactly 2026-08-21T10:04:00Z. Missing snapshots return explicit errors.
- Recorded SDK and custom-loop durations and SDK cost estimates are individual observations, not a benchmark. Deterministic safety tests use scripted responses separately.
- Authorization uses a trusted fictional identity, not production authentication. Tool text cannot change grants or enable remediation. Schema validity and a successful tool call do not prove all narrative claims are correct.
- Tool input validation and schema validation do not prove that the model's conclusions are supported. Human or policy-based content review is still required.
- No incident remediation action is executed by Sentinel.

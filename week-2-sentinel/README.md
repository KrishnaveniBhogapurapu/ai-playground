# Sentinel — Week 2 foundation and Week 3 tools

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

The read-only `get_service_metrics` and `get_dependency_health` tools are registered automatically. They replace Week 2's fixed `get_incident_metric` lookup. Both use fictional INC-104 fixtures; there is no separate tool mode.

For the Week 3 investigation, ask:

```text
Investigate fictional INC-104 for checkout-api. Retrieve error_rate between 2026-08-21T10:00:00Z and 2026-08-21T10:10:00Z, then check payment-provider health at 2026-08-21T10:04:00Z. Keep observations separate from hypotheses and explain what remains unknown before recommending rollback.
```

The fixture date is a learning convention. Dependency statuses are synthetic observations, not independently verified incident facts. The [Week 3 learning note](experiments/week-3/learning-note.md) contains the architecture comparison, diagrams, reflection, and knowledge-check answers.

Week 3 applies a host-controlled read-only policy before tool execution. It limits each investigation to six operational tool attempts, eight model turns, and 90 seconds, with a two-second timeout per tool. Tool inputs are limited to 8 KiB and result envelopes to 16 KiB; the SDK also has a $1 cost budget. Unknown identities and unapproved actions are denied. Failures are recorded explicitly. SDK tool pre-approval has been replaced by a deterministic `PreToolUse` policy hook and a deny-by-default fallback.

All 35 tests pass. The [verification report](experiments/week-3/verification-report.json) records 13 repeatable scenarios covering tool execution, permissions, failures, and limits. The [normal SDK investigation](experiments/week-3/runs/sdk-2026-09-14T21-07-43.480Z.json) and [injected-output investigation](experiments/week-3/runs/sdk-injection-2026-09-14T21-07-33.325Z.json) both succeeded using Claude through the Agent SDK.

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
| `npm run week3:verify` | Record 13 deterministic Week 3 verification scenarios; no model call |
| `npm run week3:sdk` | Run and record the bounded live SDK investigation |
| `npm run week3:injection` | Run and record the live SDK investigation with injected tool content |

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
│   ├── runtime/             Final-result and interruption acceptance boundary
│   ├── tests/               Node test suite
│   ├── tools/               Application-controlled Claude tools
│   ├── validation/          JSON parsing and Ajv validation
│   └── index.ts             Interactive application flow
├── CLAUDE.md                Claude Code project instructions
├── package.json
└── tsconfig.json
```

## Week 2 evidence

- [`docs/agent-sdk-code-guide.md`](docs/agent-sdk-code-guide.md): every Agent SDK import, option, message, tool feature, and metadata field used by Sentinel, mapped to the Week 2 brief
- [`docs/week-2-annotated-learning-guide.md`](docs/week-2-annotated-learning-guide.md): line-level map from every Week 2 learning point to code, evidence, status, rationale, and remaining gaps
- `experiments/structured-output/`: prompt-requested and API-supported structured output
- `experiments/failures/`: complete-mode interruption record and deterministic partial-stream rejection evidence
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
- Evidence tools read fixed in-memory fictional snapshots. Metrics support checkout-api/error_rate within a maximum one-hour range, up to 100 observations. Dependency health supports database and payment-provider at exactly 2026-08-21T10:04:00Z. Missing snapshots return explicit errors.
- The custom-loop comparison uses scripted model responses, so its timings cannot be compared with the SDK's actual model-request timings.
- Authorization uses a trusted fictional identity, not production authentication. Tool text cannot change grants or enable remediation. Schema validity and a successful tool call do not prove all narrative claims are correct.
- Tool input validation and schema validation do not prove that the model's conclusions are supported. Human or policy-based content review is still required.
- No incident remediation action is executed by Sentinel.

# Sentinel Project Instructions

## Purpose

Sentinel is a TypeScript command-line application for evidence-aware incident analysis with Claude. It accepts incident text or a dashboard image and must return either a schema-validated analysis or an explicit typed failure.

Claude generates candidate output. The application remains responsible for input validation, schema validation, interruption handling, failure classification, and observability.

## Project structure

- `src/index.ts`: startup and top-level failure reporting.
- `src/cli/`: terminal commands, cancellation, streamed display, and run metadata.
- `src/application/`: investigation execution, custom loop, and response acceptance.
- `src/integrations/`: Claude Agent SDK requests and the structured-decision adapter.
- `src/config/`: query options, hook registration, and reasoning configuration.
- `src/policies/`: host-controlled evidence authorization. Never derive identity or grants from a model message.
- `src/inputs/` and `src/outputs/`: request, response, and failure types; image-input preparation.
- `src/schemas/`: runtime schema definitions.
- `src/validation/`: JSON parsing and schema enforcement.
- `src/errors/`: typed application failures and SDK error classification.
- `src/hooks/`: SDK interception callbacks.
- `src/helpers/`: shared utility functions.
- `src/constants/`: fixed limits, fictional identity, tool names, and fixture values.
- `src/prompts/`: stable model instructions and request prompts.
- `src/tools/`: tool registration and mocked evidence providers.
- `tests/`: automated behavior tests.
- `fixtures/`: shared fictional scenarios for tests and experiments.
- `scripts/`: experiment recording and saved-response validation.
- `docs/week-N/`: weekly learning records.
- `experiments/week-N/`: recorded responses, comparisons, and reports. Preserve recorded model responses unless explicitly asked to replace them.
- `dist/`: generated TypeScript output. Do not edit it directly.

## Commands

- Install exact dependencies: `npm ci`
- Compile TypeScript: `npm run build`
- Start the interactive CLI: `npm start`
- Start in direct mode: `npm run start:direct`
- Start in thinking mode: `npm run start:thinking`
- Validate a recorded incident analysis: `npm run validate:json -- <path-to-json>`
- Run the automated test suite: `npm test`
- Record offline tool-safety scenarios: `npm run verify:tools`
- Run and record investigations: `npm run investigate:sdk` and `npm run investigate:custom`; injection variants are `npm run investigate:injection` and `npm run investigate:custom:injection` (live model authorization still applies). Both approaches use Agent SDK `query()`.

Run `npm run build` after TypeScript changes and `npm test` before declaring a code change complete.

## Coding conventions

- Use TypeScript with strict type checking and native ESM.
- Include `.js` extensions in relative imports because the project uses NodeNext module resolution.
- Keep SDK integration, schemas, input/output types, validation, errors, prompts, and configuration separated by responsibility.
- Treat SDK and parsed JSON values as `unknown` until they are narrowed or validated.
- Return typed failures at the application boundary instead of exposing raw exceptions.
- Keep incident facts separate from assumptions, hypotheses, and unsupported claims.
- Never accept partial streamed content as a completed incident analysis.
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

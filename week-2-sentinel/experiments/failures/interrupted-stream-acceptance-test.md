# Interrupted Stream Acceptance Test

## Purpose

I used a deterministic test to prove that displayed partial stream content cannot become an accepted incident analysis after interruption. This exercises the same `TurnAcceptanceGuard` used by the CLI rather than constructing an expected error directly.

## Test sequence

The test at [`src/tests/sentinel.test.ts`](../../src/tests/sentinel.test.ts#L132) performs this sequence:

1. Create the real acceptance guard in `stream` mode.
2. Feed an incomplete JSON fragment (`{"facts":["partial`) through the same partial-output method used by the live stream loop.
3. Abort the turn through an `AbortController`.
4. Attempt to submit an otherwise valid incident analysis as the completed result.
5. Confirm that the guard throws `interrupted-stream`.
6. Confirm that `hasAcceptedResult` remains `false`.

The guard is implemented in [`src/runtime/turn-acceptance.ts`](../../src/runtime/turn-acceptance.ts#L20) and is used by the actual query loop in [`src/index.ts`](../../src/index.ts#L124).

## Verification result

I ran `npm test` on 2026-09-05. All 16 tests passed, including:

```text
✔ rejects streamed partial output when the turn is interrupted
✔ accepts a validated final result when the turn was not interrupted
```

## What this proves

Partial output only changes the display-progress state. The guard sets its accepted state only when a validated final value is submitted while the abort signal is clear. Once the stream is interrupted, even an otherwise schema-valid analysis is rejected and cannot be marked accepted.

This is deterministic application-boundary evidence. It does not claim to be a newly recorded live model stream, and the earlier complete-mode interruption record remains unchanged.

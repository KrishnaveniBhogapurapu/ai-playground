# Week 2 Debugging Report

## 1. TypeScript treated source as CommonJS

**What I observed:** TypeScript reported that a top-level `export` could not be used in a CommonJS module while `verbatimModuleSyntax` was enabled.

**Why it happened:** The package/module configuration did not consistently identify the project as native ESM.

**What I changed:** I configured the project with `"type": "module"`, NodeNext module resolution, and `.js` extensions in relative TypeScript imports.

**What I learned:** TypeScript syntax, compiler module settings, and Node's runtime module type must agree.

## 2. Ctrl+C closed the prompt without stopping the active request

**What I observed:** Pressing Ctrl+C made the terminal prompt reappear while model output continued arriving. The incomplete response was rejected only after generation finished.

**Why it happened:** Readline handled the signal, but the active Agent SDK request was not being cancelled through its own abort signal at the correct time.

**What I changed:** I made Sentinel retain the active `AbortController`. The first Ctrl+C aborts the active request and rejects incomplete content. Ctrl+C while no request is active, or again after cancellation, closes the CLI.

**What I learned:** Closing terminal input and cancelling asynchronous API work are separate operations.

## 3. Stream mode initially behaved like complete mode

**What I observed:** Nothing appeared until the final result, even after stream mode was selected.

**Why it happened:** The application consumed only the Agent SDK's final result message instead of enabling and rendering partial stream events.

**What I changed:** I enabled partial messages in stream mode and displayed text or JSON deltas. Acceptance still occurs only after the completed structured output passes validation.

**What I learned:** Streaming controls display timing; it must not weaken the completed-response boundary.

## 4. JSON validation was initially a separate manual experiment

**What I observed:** A model response had to be copied into a file and checked with another command.

**Why it happened:** The first validator demonstrated parsing in isolation but was not connected to the live request lifecycle.

**What I changed:** I connected API-supported structured output and application-side Ajv validation to every live response before acceptance. I retained the file validator only for repeatable checks of recorded evidence.

**What I learned:** A useful experiment should become part of the application boundary when the requirement applies to every response.

## 5. Prompt caching was initially exposed as a separate command

**What I observed:** Caching appeared to require stopping Sentinel and starting a special cache experiment.

**Why it happened:** Prompt caching was modeled as an explicit runtime feature instead of an implementation optimization.

**What I changed:** I made every incident use an independent SDK query with the same stable system contract. Cache creation and read metrics now appear in normal run metadata, and I do not select a cache mode.

**What I learned:** Prompt caching is transparent infrastructure behavior, not conversation memory or an interaction mode.

## 6. Claude Code reusable command triggered unexpected approvals

**What I observed:** `/verify-sentinel` added file-existence loops, redirection, command chaining, and exit-code printing. These commands did not match the narrow project allow rules, so Claude Code requested approval repeatedly.

**Why it happened:** The reusable command described the desired checks but did not require exact shell invocations.

**What I changed:** I listed the exact commands and prohibited wrappers, chaining, redirection, and extra checks.

**What I learned:** Permission rules match actual tool calls. A broadly described workflow can cause the model to construct commands outside an intended allowlist.

## 7. Tool use was initially implemented as another entry point

**What I observed:** The first design required `npm run experiment:tool-use`, even though tool access belongs inside Sentinel.

**Why it happened:** The deliverable was treated as an isolated experiment rather than a capability of the main request flow.

**What I changed:** I removed the separate script and registered the read-only tool automatically during every normal `npm start` request. Claude calls it only when evidence must be retrieved.

**What I learned:** Tool availability belongs to application configuration. I should request an outcome without having to choose the internal mechanism used to produce it.

## 8. Schema-valid output still included weakly supported content

**What I observed:** The tool-use response passed the JSON Schema but included generic deployment and dependency hypotheses with no supporting incident evidence.

**Why it happened:** Structural validation verifies fields and types, not whether every claim is justified by supplied evidence.

**What I changed:** I kept these statements labeled as hypotheses, recorded the empty supporting evidence, and preserved the high uncertainty. I also documented that the claim that 9% is “nontrivial” is general judgment rather than incident-specific evidence.

**What I learned:** Parsing, schema validation, and evidence support are three different checks. Passing the first two does not guarantee the third.

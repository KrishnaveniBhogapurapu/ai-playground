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
npm run validate:json -- experiments/structured-output/prompt-requested-json-run-1-formatted.json
npm run validate:json -- experiments/structured-output/api-structured-output-complete-run-1.json
npm run validate:json -- experiments/structured-output/api-structured-output-stream-run-1.json
npm run validate:json -- experiments/thinking-comparison/direct-run-1-analysis.json
npm run validate:json -- experiments/thinking-comparison/thinking-run-1-analysis.json
npm run validate:json -- experiments/prompt-caching/request-1-incident-a-analysis.json
npm run validate:json -- experiments/prompt-caching/request-2-incident-b-analysis.json
```

After every command finishes, report it as passed or failed and summarize any
validation error.

Do not edit files, start the interactive CLI, make a network request, expose environment variables, or create a Git commit during this verification.

# Week 1 — Incident and hypothesis analysis

## Objective

This repository contains the Week 1 experiments on prompting, generation parameters, structured JSON, evidence, uncertainty, and safe language-model use in incident analysis.

## Model and local setup

- Model: `Qwen2.5-7B-Instruct-1M-GGUF`
- Interface: LM Studio, running locally
- Default Temperature: `0.8`
- Default Top-P: `0.95`
- Default Min-P: `0.05`
- Default Repeat Penalty: `1.1`
- Frequency Penalty: `Not supported in the LM Studio interface used for this experiment.`

## Incident

[INC-104](incident/INC-104.md) describes checkout failures increasing from 0.4% to 9%. The alert fired at 10:04 UTC after deployment `dep-1842` completed at 10:01 UTC. Database latency increased at approximately the same time, the external payment provider reported intermittent errors, and a previous incident with similar symptoms involved an expired service credential. The brief explicitly contains initial reports rather than a confirmed timeline or root cause.

## Analysis before consulting the model

1. **Known facts:** The failure rate increased from 0.4% to 9%; the alert fired at 10:04 UTC; `dep-1842` completed at 10:01 UTC; database latency increased at approximately the same time; the provider reported intermittent errors; and a previous similar incident involved an expired credential.
2. **Possible causes:** A deployment regression, a database problem, provider errors, or an expired credential are possible explanations that require further evidence. More than one factor could also be involved.
3. **Correlation, not causation:** The deployment, database latency, provider report, and alert occurred close together. Their timing makes them useful leads but does not show which event caused another.
4. **Missing information:** A confirmed event timeline, deployment diff, application errors and traces, database metrics and slow queries, provider response codes and status details, credential status.
5. **Reversible next action:** Gather the timeline and logs immediately, check credentials and provider status, and prepare a controlled rollback only if change evidence or a safe rollback test supports the deployment hypothesis.
6. **What would change the conclusion:** Errors shown to start before deployment would weaken the deployment hypothesis. Error reduction after a clean rollback would strengthen it. Matching provider failures, database timeouts, or credential errors in request traces would strengthen the corresponding hypothesis.

## Repository structure

```text
week-1-incident-analysis/
|-- incident/                 # Incident brief
|-- prompt-comparison/        # Zero-, one-, and few-shot prompts and responses
|-- parameter-experiments/    # Original parameter runs and results.md
|-- reflection/               # Short reflection
`-- README.md                 # Setup, pre-model analysis, and findings
```

This was an analysis exercise only.

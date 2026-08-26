# Tool-Use Lifecycle Notes

## Request

I asked Sentinel to retrieve the observed checkout error rate for `INC-104` without including the value in the incident text. Claude requested the application tool `mcp__sentinel__get_incident_metric` with an incident identifier and metric name.

Claude's `tool_use` block was a structured request. It did not execute the lookup.

## Validation

The Agent SDK validated the request against the Zod schema before invoking the handler. The schema accepts only:

- Incident: `INC-104`
- Metric: `checkout_error_rate`

I observed that the recorded request passed validation. An unsupported incident or metric would not enter the application handler.

## Execution

Sentinel application code executed `read_in_memory_incident_metric`. The handler read a fictional local record and returned:

- Value: 9 percent
- Observed at: 10:04 UTC
- Source: fictional Sentinel monitoring snapshot

Claude had no direct access to the record. It could only request the operation exposed by the application.

## Tool result

Sentinel returned a `tool_result` whose `tool_use_id` matched Claude's request ID. The result was marked `is_error: false`. The Agent SDK then continued the model interaction using that result.

## Final response

I observed that Claude included the retrieved observation in `facts`, preserved the source, stated that root cause was not confirmed, and assigned high uncertainty. The application schema validator accepted the final structured analysis.

I learned that a successful tool call does not make every model-generated statement factual. The deployment and dependency claims were generated as unsupported hypotheses with empty supporting-evidence lists. The statement that 9% is a “nontrivial” error rate relies on general judgment rather than an incident-specific baseline. I would keep it as an assumption until an SLO or historical baseline is supplied.

## Control boundary

| Lifecycle stage | Controlled by |
| --- | --- |
| Decide whether to request the available tool | Claude |
| Define which tool and inputs are permitted | Sentinel application |
| Validate tool arguments | Agent SDK using Sentinel's schema |
| Execute the lookup | Sentinel application handler |
| Return the result | Sentinel application through the SDK |
| Generate the final analysis | Claude |
| Accept or reject the final structure | Sentinel application validator |

Tool annotations such as read-only and idempotent describe intended behavior. The handler implementation and application permissions are the actual controls.

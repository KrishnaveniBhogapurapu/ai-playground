# Direct versus thinking comparison

I ran the same incident with the same model alias, application code, JSON Schema, and complete response mode in separate clean sessions.

## Measurements

| Measurement | Direct | Adaptive thinking | Change with thinking |
| --- | ---: | ---: | ---: |
| Duration | 26,022 ms | 36,672 ms | +40.9% |
| API duration | 27,193 ms | 37,788 ms | +39.0% |
| Output tokens | 2,369 | 3,563 | +50.4% |
| Estimated thinking tokens | 0 | 1,200 | +1,200 |
| Estimated cost | $0.029967 | $0.041902 | +39.8% |
| Stop reason | `tool_use` | `tool_use` | No change |

Both runs used `claude-sonnet-5` for the primary analysis and `claude-haiku-4-5` for an SDK helper call. Both Sonnet runs recorded 2 uncached input tokens and 1,294 cache-creation input tokens. `tool_use` is expected because API-supported structured output uses an internal end-turn tool.

## Quality comparison

Both responses:

- kept the root cause unconfirmed;
- identified deployment, database latency, payment-provider errors, and a combined-cause hypothesis;
- assigned high uncertainty;
- requested logs, precise timestamps, deployment details, and database diagnostics;
- recommended reversible investigation or rollback actions;
- passed the same application JSON Schema.

The thinking response recommended a controlled canary or staged rollback and added checks for adjacent services and a possible promotion-driven traffic spike. The direct response identified measurement consistency and unreported concurrent changes as assumptions, and included a conditional payment-provider fallback test.

Neither response showed a decisive evidence-quality advantage. Both treated general domain statements such as deployments commonly causing regressions or checkout depending on payment processing as supporting evidence, even though those statements were not supplied by the incident. These should be classified as general assumptions or inferences rather than incident evidence.

## Conclusion

In this single paired run, I observed that adaptive thinking increased latency, output tokens, and estimated cost without producing a material improvement in the accepted incident analysis. I found direct mode more efficient and comparably useful for this case. I treat this as one observation rather than a general benchmark; repeated runs and harder cases would be required for a broader conclusion.

## How I interpret the estimated cost

The Agent SDK reports a per-model `costUSD` estimate and a cumulative `total_cost_usd`. For the direct run, I verified the total by adding the recorded model estimates:

```text
Haiku helper estimate  $0.001097
Sonnet estimate       +$0.028870
                      ----------
Query estimate         $0.029967
```

The sum matches `total_cost_usd: 0.029967` in [`direct-run-1-metadata.json`](direct-run-1-metadata.json). This demonstrates a basic request-cost estimate without reconstructing historical token prices. The SDK calculates these values from its bundled pricing information, so I treat them as development estimates rather than authoritative billing data, consistent with the [Agent SDK cost-tracking documentation](https://code.claude.com/docs/en/agent-sdk/cost-tracking).

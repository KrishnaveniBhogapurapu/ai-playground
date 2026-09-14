# Prompt Caching Comparison

## Experiment setup

I sent two different, independent incident-analysis requests through the normal Sentinel CLI flow. I kept the system prompt, schema, model configuration, and direct reasoning mode unchanged; only the incident input changed.

The application did not preserve conversation history or resume an earlier SDK session. This matters because the experiment is testing reuse of a stable prompt prefix, not model memory.

## Results

| Metric | Request 1: Incident A | Request 2: Incident B | Change |
| --- | ---: | ---: | ---: |
| Uncached input tokens | 2 | 2 | 0 |
| Cache-creation input tokens | 10,000 | 928 | -9,072 |
| Cache-read input tokens | 0 | 9,103 | +9,103 |
| Output tokens | 1,945 | 2,337 | +20.2% |
| Duration | 22,139 ms | 25,412 ms | +14.8% |
| API duration | 23,136 ms | 26,277 ms | +13.6% |
| Total cost | $0.0604920 | $0.0299516 | -50.5% |
| Stop reason | `tool_use` | `tool_use` | No change |

For Request 2, cached input represented approximately 90.7% of its input-token accounting:

`9,103 / (9,103 + 928 + 2) = 90.7%`

## Interpretation

Prompt caching worked. Request 1 created the cache, while Request 2 reused 9,103 cached tokens and created a smaller additional cache entry of 928 tokens.

The total reported cost was $0.0305404 lower for Request 2, a decrease of approximately 50.5%. However, Request 2 also generated 20.2% more output tokens and analyzed a different incident. Therefore, the total-cost difference is useful evidence but is not a controlled measurement of the cache discount alone.

There was no latency improvement in this pair. Request 2 took 14.8% longer overall and 13.6% longer at the API level. Different incident complexity and output length make this an imperfect latency benchmark. The usage counters, rather than elapsed time, are the direct evidence that the cache was used.

The `tool_use` stop reason is expected because Sentinel requests API-supported structured output.

## What prompt caching is not

- It is not conversation memory. Incident B was processed in a new, independent query.
- It is not application state or stored chat history.
- It does not reuse the answer produced for Incident A.
- It reuses processing for an identical stable prompt prefix while the incident input can change.

## Conclusion

I observed a successful prompt-cache read during the normal CLI flow. Caching remained an implementation detail, so I did not select a cache mode or restart the program with a separate command.

# Generation-parameter experiment results

## Objective and method

These experiments used `Qwen2.5-7B-Instruct-1M-GGUF` locally through LM Studio. The incident and prompt were kept unchanged, and one generation parameter was changed at a time. Every stored run was compared with the two default runs and checked against [INC-104](../incident/INC-104.md), which is the source of truth.

The comparison considers the leading hypothesis, hypothesis count, uncertainty, unsupported claims, missing evidence, actions, repetition, JSON validity, and consistency between repeated runs. Expected parameter behaviour was not treated as an experimental result; only differences visible in the stored responses are reported.

## Defaults and tested values

| Parameter | Default | Tested values | Runs per value |
|---|---:|---|---|
| Temperature | 0.8 | 0.2, 1 | 2 each |
| Top-P | 0.95 | 0.5, 1 | 2 each |
| Min-P | 0.05 | 0.5, 1 | 2 each |
| Frequency Penalty | Not supported | Not tested | No runs |
| Repeat Penalty | 1.1 | 0.7, 1, 2 | 1, 2, and 2 runs respectively |

`Frequency Penalty: Not supported in the LM Studio interface used for this experiment.`

Repeat Penalty is a different parameter and is analysed separately.

## Baseline

Both default runs used Temperature 0.8, Top-P 0.95, Min-P 0.05, and Repeat Penalty 1.1. Both returned valid JSON, left assumptions empty, expressed uncertainty, and led with a deployment hypothesis. They were consistent at that broad level but differed in fact coverage, actions, and treatment of credentials and the provider. Run 1 unsupportedly claimed that issues began before deployment completed. Run 2 called provider errors a contributing factor but not the root cause without evidence that could exclude the provider as root cause.

## Observed parameter results

| Configuration | Comparison of repeated runs and baseline |
|---|---|
| Temperature 0.2 | Both runs returned valid JSON, led with deployment, and produced four hypotheses rather than the baseline's three. Run 1 treated the provider as a contributor; run 2 called provider errors unrelated and labelled an expired credential as the root cause, despite its uncertainty statement. |
| Temperature 1 | Both runs returned valid JSON and led with deployment. Run 1 combined provider and credential issues into two total hypotheses; run 2 separated deployment, database, provider, and credentials into four. This pair varied more in hypothesis grouping than the Temperature 0.2 pair. |
| Top-P 0.5 | Both runs returned valid JSON, but run 1 led with credentials and listed four hypotheses while run 2 led with deployment and listed three. They also differed in fact coverage and actions. |
| Top-P 1 | Both runs returned valid JSON and listed three hypotheses. Run 1 led with deployment; run 2 led with credentials, added a combined-cause hypothesis, and was the only run in the pair to populate assumptions. |
| Min-P 0.5 | Both runs returned valid JSON and preserved all five supplied observations. Run 1 led with deployment and listed four hypotheses; run 2 led with credentials and listed three. |
| Min-P 1 | The two files are byte-for-byte identical. Both led with deployment and omitted the previous credential incident. They also repeated the unsupported inference that checkout errors were likely failed transactions or timeouts. |
| Repeat Penalty 0.7 | Only one run is available. It is syntactically valid JSON but contains only `known_facts`, repeats the 10:04 fact, ends with a long string of zeros, and omits the remainder of the requested structure. |
| Repeat Penalty 1 | Both runs returned valid JSON and led with credentials. They used the same three broad hypotheses but differed in missing evidence, claimed contradicting evidence, and whether rollback was recommended. |
| Repeat Penalty 2 | Both runs are invalid JSON and fail the requested structure. They corrupted the deployment ID or timing; run 2 also invented an increased-traffic hypothesis and contained malformed actions. |

## Effects by parameter

### Temperature

The stored runs do not support a simple claim that lower Temperature was more correct or that higher Temperature always produced more diverse answers. All four runs preserved uncertainty and valid JSON, but they varied in grouping, detail, and unsupported claims. Temperature 1 showed a larger within-pair difference in hypothesis count, while Temperature 0.2 still produced a material disagreement about the provider.

### Top-P

At both tested values, the leading hypothesis changed between repeated runs. Fact coverage ranged from three to five observations, and action representation varied between strings and objects. Neither tested value handled the evidence more reliably than the baseline.

### Min-P

Min-P 0.5 produced valid but variable responses. Min-P 1 produced exact duplicates and therefore the strongest consistency in the experiment. That consistency did not prove correctness because the identical responses used unsupported onset and failure-mode language.

### Repeat Penalty

Repeat Penalty had the clearest observed association with structural failure in these samples. The 1.0 runs remained valid and complete. The single 0.7 run became repetitive and incomplete. Both 2.0 runs were invalid and corrupted facts. The sample is small, so this describes the stored outputs and does not prove that the parameter alone caused every defect.

## Notable unsupported claims

- Several runs said checkout errors started immediately after, several minutes after, or before deployment. The brief supplies an alert time, not a confirmed failure-onset time.
- Temperature 1 run 1 said errors persisting after rollback would strengthen the deployment hypothesis. Persistence after a clean rollback would normally weaken that hypothesis.
- Some runs asserted failed transactions, timeouts, absent regression checks, or harmless deployment logs without any supplied evidence.
- Repeat Penalty 2 invented or corrupted `dep-87`, `dep-1824`, time intervals, and increased traffic.

## Concise findings

- Deployment, database latency, provider errors, and credentials remained hypotheses; none became a confirmed root cause.
- Repeated settings often produced different leading hypotheses or recommendations.
- Greater repeatability did not resolve unsupported reasoning.
- Valid JSON did not guarantee factual correctness or full schema adherence.
- Frequency Penalty was not supported and was not estimated.
- Repeat Penalty 0.7 has only one stored run; all other non-default tested values have two.

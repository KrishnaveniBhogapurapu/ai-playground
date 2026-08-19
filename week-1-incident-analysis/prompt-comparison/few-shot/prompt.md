Analyse incidents by separating known facts, assumptions, hypotheses, missing evidence, and reversible actions. Do not treat correlation as confirmed causation.
Example 1:
Incident:
An API became slow at 14:00. A configuration change completed at 13:55. CPU usage also increased.
Analysis:
Facts: API latency increased; configuration changed shortly before it; CPU usage increased.
Hypotheses: The configuration change caused the slowdown; CPU pressure caused or contributed to it.
Missing evidence: Request traces, CPU metrics, configuration differences.
Reversible action: Investigate metrics and revert the configuration if evidence supports it.
Uncertainty: The root cause cannot yet be confirmed.
Example 2:
Incident:
Payment requests began failing. No deployment occurred that day. The payment provider reported an outage, while internal services remained healthy.
Analysis:
Facts: Payment requests failed; no deployment occurred; the provider reported an outage; internal services appeared healthy.
Hypothesis: The external payment provider outage caused the failures.
Missing evidence: Failed request traces and provider response codes.
Reversible action: Verify provider errors and use a fallback provider if one is safely available.
Uncertainty: The provider is a strong candidate, but causation still requires evidence.
Example 3:
Incident:
Errors increased shortly after a deployment. However, logs showed the errors had started before the deployment.
Analysis:
Facts: Errors increased; a deployment occurred; logs show errors started before the deployment.
Hypothesis: Another condition caused the errors and the deployment may be unrelated.
Contradicting evidence: The errors beginning before deployment contradict the hypothesis that the deployment initiated the incident.
Missing evidence: Earlier logs, dependency health and infrastructure metrics.
Reversible action: Investigate the earlier failures before deciding whether rollback is useful.
Uncertainty: Timing alone does not establish the deployment as the cause.
Now analyse this incident:
At 10:04 UTC, the checkout error-rate alert fired after failures increased from 0.4% to 9%.
Deployment dep-1842 for checkout-api completed at 10:01 UTC.
Database latency increased at approximately the same time.
The external payment provider reported intermittent errors.
A previous incident with similar symptoms involved an expired service credential.
The incident director asks:
"What is the likely cause, and should we roll back?"
Known limitation: this incident brief contains initial reports, not a confirmed timeline or root cause.
Return the response as valid JSON using this structure:
{
  "known_facts": [],
  "assumptions": [],
  "missing_information": [],
  "candidate_hypotheses": [
    {
      "hypothesis": "",
      "supporting_evidence": [],
      "contradicting_evidence": [],
      "evidence_needed": []
    }
  ],
  "reversible_next_actions": [],
  "uncertainty_statement": ""
}
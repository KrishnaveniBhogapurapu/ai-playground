Analyse incidents by separating known facts, assumptions, hypotheses, missing evidence, and reversible actions.
Example:
Incident:
An API became slow at 14:00. A configuration change was completed at 13:55. CPU usage also increased.
Analysis:
Known facts: API latency increased at 14:00; configuration changed at 13:55; CPU usage increased.
Assumption: The configuration change may be related to the slowdown.
Hypotheses: The configuration change caused the slowdown; high CPU usage caused or contributed to the slowdown.
Missing evidence: Request traces, CPU metrics before and after the change, details of the configuration change.
Reversible action: Investigate metrics and consider reverting the configuration if evidence indicates it caused the problem.
Uncertainty: The available evidence is insufficient to confirm the root cause.
Now analyse this incident:
At 10:04 UTC, the checkout error-rate alert fired after failures increased from 0.4% to 9%.
Deployment dep-1842 for checkout-api completed at 10:01 UTC.
Database latency increased at approximately the same time.
The external payment provider reported intermittent errors.
A previous incident with similar symptoms involved an expired service credential.
The incident director asks:
"What is the likely cause, and should we roll back?"
Known limitation: this incident brief contains initial reports, not a confirmed timeline or root cause.
Do not assume that events occurring close together prove causation.
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
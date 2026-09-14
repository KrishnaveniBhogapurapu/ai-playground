export type UncertaintyLevel = 'low' | 'medium' | 'high';

export interface IncidentHypothesis {
  claim: string;
  supporting_evidence: string[];
  contradicting_evidence: string[];
}

export interface IncidentAnalysis {
  facts: string[];
  assumptions: string[];
  hypotheses: IncidentHypothesis[];
  missing_information: string[];
  reversible_next_actions: string[];
  uncertainty: {
    level: UncertaintyLevel;
    reason: string;
  };
}

export interface EvidenceClassification {
  text_observations: string[];
  image_observations: string[];
  inferences: string[];
  unsupported_claims: string[];
}

export interface MultimodalIncidentAnalysis extends IncidentAnalysis {
  evidence_classification: EvidenceClassification;
}

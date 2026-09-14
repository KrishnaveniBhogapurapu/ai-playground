// Trusted host policy. Never populate identity, grants or budgets from model input.
export interface InvestigationLimits {
  maxToolCalls: number; maxModelTurns: number; toolTimeoutMs: number;
  totalTimeoutMs: number; maxInputBytes: number; maxOutputBytes: number;
}
export const investigationLimits: Readonly<InvestigationLimits> = Object.freeze({
  maxToolCalls: 6,
  maxModelTurns: 8,
  toolTimeoutMs: 2_000,
  totalTimeoutMs: 90_000,
  maxInputBytes: 8_192,
  maxOutputBytes: 16_384,
});

export const localIdentity = 'sentinel-learner';
export const policyId = 'sentinel-fictional-read-only-v1';

export function isAuthorized(identity: string, name: string, input: Record<string, unknown>): boolean {
  if (identity !== localIdentity || input.service !== 'checkout-api') return false;
  if (name === 'get_service_metrics') return input.metric === 'error_rate';
  return name === 'get_dependency_health' &&
    (input.dependency === 'database' || input.dependency === 'payment-provider');
}

export const prohibitedActions = new Set([
  'delete_deployment', 'restart_production_service',
  'rotate_production_credentials', 'mark_incident_resolved',
]);

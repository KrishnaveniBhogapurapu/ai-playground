import { localIdentity } from '../constants/investigation.js';

export function isAuthorized(identity: string, name: string, input: Record<string, unknown>): boolean {
  if (identity !== localIdentity || input.service !== 'checkout-api') return false;
  if (name === 'get_service_metrics') return input.metric === 'error_rate';
  return name === 'get_dependency_health' &&
    (input.dependency === 'database' || input.dependency === 'payment-provider');
}

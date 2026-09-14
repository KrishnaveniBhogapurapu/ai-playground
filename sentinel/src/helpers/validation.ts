import type { ErrorObject } from 'ajv';

export function formatValidationErrors(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? [])
    .map((error) => {
      const location = error.instancePath || '/';
      return `${location} ${error.message ?? 'is invalid'}`;
    })
    .join('; ');
}

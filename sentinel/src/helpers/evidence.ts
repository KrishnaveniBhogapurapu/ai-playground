import type { EvidenceResult, ToolErrorCode } from '../outputs/evidence.js';
import { evidenceToolPrefix } from '../constants/evidence.js';

export const toolFailure = (code: ToolErrorCode, message: string): EvidenceResult =>
  ({ ok: false, error: { code, message } });

export function canonicalToolName(name: string): string {
  return name.startsWith(evidenceToolPrefix) ? name.slice(evidenceToolPrefix.length) : name;
}

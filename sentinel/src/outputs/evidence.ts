export type ToolErrorCode = 'unknown-tool' | 'invalid-input' | 'unauthorized' | 'policy-denied' |
  'evidence-unavailable' | 'invalid-output' | 'tool-error' | 'tool-timeout' |
  'call-limit' | 'deadline-exceeded' | 'cancelled' | 'duplicate-call';
export type EvidenceResult = { ok: true; data: Record<string, unknown> } |
  { ok: false; error: { code: ToolErrorCode; message: string } };
export type AuditEntry = {
  id: string; requested_action: string; input: unknown; identity: string;
  validation: 'not-checked' | 'accepted' | 'rejected';
  authorization: 'not-checked' | 'allowed' | 'denied';
  execution: 'not-executed' | 'running' | 'succeeded' | 'failed';
  policy: string; human_approval_required: boolean; reason: string;
  result?: EvidenceResult; elapsed_ms?: number;
};

import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';
import { investigationLimits, isAuthorized, localIdentity, policyId, prohibitedActions } from '../config/investigation-policy.js';
import { SentinelFailure } from '../errors/sentinel-failure.js';
import {
  serviceMetricsInputSchema, dependencyHealthInputSchema,
  validateServiceMetricsOutput, validateDependencyHealthOutput,
  type ServiceMetricsInput, type DependencyHealthInput,
} from '../tools/evidence-contracts.js';
import { EvidenceUnavailable, readServiceMetrics, readDependencyHealth } from '../tools/mock-evidence.js';

export type ToolErrorCode = 'unknown-tool' | 'invalid-input' | 'unauthorized' | 'policy-denied' |
  'evidence-unavailable' | 'invalid-output' | 'tool-error' | 'tool-timeout' |
  'call-limit' | 'deadline-exceeded' | 'cancelled' | 'duplicate-call';
export type EvidenceResult = { ok: true; data: Record<string, unknown> } |
  { ok: false; error: { code: ToolErrorCode; message: string } };
export type ToolRequest = { id: string; name: string; input: unknown };
export type AuditEntry = {
  id: string; requested_action: string; input: unknown; identity: string;
  validation: 'not-checked' | 'accepted' | 'rejected';
  authorization: 'not-checked' | 'allowed' | 'denied';
  execution: 'not-executed' | 'running' | 'succeeded' | 'failed';
  policy: string; human_approval_required: boolean; reason: string;
  result?: EvidenceResult; elapsed_ms?: number;
};
export interface EvidenceProvider {
  metrics(input: ServiceMetricsInput, signal: AbortSignal): unknown | Promise<unknown>;
  health(input: DependencyHealthInput, signal: AbortSignal): unknown | Promise<unknown>;
}
export const fictionalProvider: EvidenceProvider = {
  metrics: readServiceMetrics,
  health: readDependencyHealth,
};
export const toolFailure = (code: ToolErrorCode, message: string): EvidenceResult =>
  ({ ok: false, error: { code, message } });

export function canonicalToolName(name: string): string {
  return name.startsWith('mcp__sentinel__') ? name.slice('mcp__sentinel__'.length) : name;
}

export class Investigation {
  readonly controller: AbortController;
  readonly limits: typeof investigationLimits;
  readonly audit: AuditEntry[] = [];
  readonly identity: string;
  readonly startedAt = performance.now();
  private timer: ReturnType<typeof setTimeout>;
  private reservations = new Map<string, { entry: AuditEntry; input: ServiceMetricsInput | DependencyHealthInput }>();
  private claimed = new Set<string>();
  private attempts = 0;
  private closed = false;
  private terminal: 'deadline-exceeded' | 'call-limit' | undefined;

  constructor(options: {
    identity?: string; controller?: AbortController;
    limits?: Partial<typeof investigationLimits>; provider?: EvidenceProvider;
  } = {}) {
    this.identity = options.identity ?? localIdentity;
    this.controller = options.controller ?? new AbortController();
    this.limits = Object.freeze({ ...investigationLimits, ...options.limits });
    for (const value of Object.values(this.limits)) {
      if (!Number.isSafeInteger(value) || value < 1) throw new Error('Investigation limits must be positive integers.');
    }
    this.provider = options.provider ?? fictionalProvider;
    this.timer = setTimeout(() => this.stop('deadline-exceeded'), this.limits.totalTimeoutMs);
  }
  private readonly provider: EvidenceProvider;

  get terminalReason() { return this.terminal; }
  get elapsedMs() { return performance.now() - this.startedAt; }
  get signal() { return this.controller.signal; }

  private stop(code: 'deadline-exceeded' | 'call-limit') {
    this.terminal ??= code;
    this.controller.abort();
  }

  assertActive(): void {
    if (this.elapsedMs >= this.limits.totalTimeoutMs && !this.closed) this.stop('deadline-exceeded');
    if (this.terminal) throw new SentinelFailure(
      this.terminal === 'call-limit' ? 'tool-call-limit' : 'timeout',
      this.terminal === 'call-limit' ? 'Investigation tool-call limit exceeded.' : 'Investigation deadline exceeded.',
    );
    if (this.closed || this.signal.aborted) throw new SentinelFailure('interrupted-request', 'Investigation cancelled or closed.');
  }

  private deny(entry: AuditEntry, code: ToolErrorCode, message: string): EvidenceResult {
    entry.reason = message;
    entry.result = toolFailure(code, message);
    entry.elapsed_ms = Math.round(this.elapsedMs);
    return entry.result;
  }

  // Synchronous reservation prevents parallel calls from racing past the budget.
  prepare(request: ToolRequest): EvidenceResult | undefined {
    const name = canonicalToolName(request.name);
    const entry: AuditEntry = {
      id: request.id, requested_action: name, input: null, identity: this.identity,
      validation: 'not-checked', authorization: 'not-checked', execution: 'not-executed',
      policy: policyId, human_approval_required: false, reason: '',
    };
    // Retain at most one over-limit attempt; later calls cannot grow audit memory.
    if (this.audit.length >= this.limits.maxToolCalls + 1) {
      return toolFailure('call-limit', 'Investigation tool-call limit exceeded.');
    }
    this.audit.push(entry);
    try { this.assertActive(); } catch {
      return this.deny(entry, this.terminal ?? 'cancelled', 'Investigation is no longer active.');
    }
    if (++this.attempts > this.limits.maxToolCalls) {
      this.stop('call-limit');
      return this.deny(entry, 'call-limit', 'Investigation tool-call limit exceeded.');
    }
    if (!request.id || this.reservations.has(request.id) || this.claimed.has(request.id)) {
      return this.deny(entry, 'duplicate-call', 'Missing or reused tool call identifier.');
    }
    // Reserve all IDs, including rejected requests, so retries require fresh IDs.
    this.claimed.add(request.id);
    if (prohibitedActions.has(name)) {
      entry.authorization = 'denied';
      entry.human_approval_required = true;
      return this.deny(entry, 'policy-denied', 'Read-only policy blocks this action. A separate authorized human workflow is required; no handler exists here.');
    }
    if (name !== 'get_service_metrics' && name !== 'get_dependency_health') {
      entry.authorization = 'denied';
      return this.deny(entry, 'unknown-tool', 'Tool is not on the evidence allow-list.');
    }
    try {
      const serialized = JSON.stringify(request.input);
      if (!serialized || Buffer.byteLength(serialized) > this.limits.maxInputBytes) throw new Error();
      entry.input = JSON.parse(serialized) as unknown;
    } catch {
      entry.validation = 'rejected';
      return this.deny(entry, 'invalid-input', 'Input must be bounded JSON.');
    }
    const parsed = name === 'get_service_metrics'
      ? serviceMetricsInputSchema.safeParse(entry.input)
      : dependencyHealthInputSchema.safeParse(entry.input);
    if (!parsed.success) {
      entry.validation = 'rejected';
      return this.deny(entry, 'invalid-input', 'Input does not satisfy the tool schema or time-range limits.');
    }
    entry.validation = 'accepted';
    if (!isAuthorized(this.identity, name, parsed.data)) {
      entry.authorization = 'denied';
      return this.deny(entry, 'unauthorized', 'Trusted identity has no permission for this evidence.');
    }
    entry.authorization = 'allowed';
    this.reservations.set(request.id, { entry, input: parsed.data });
    return undefined;
  }

  async execute(request: ToolRequest): Promise<EvidenceResult> {
    const rejection = this.prepare(request);
    return rejection ?? this.executeReserved(request.id);
  }

  // SDK handlers receive MCP inputs, not the Claude tool_use_id. Consume the
  // matching pre-hook reservation exactly once; identical concurrent inputs
  // are interchangeable read-only calls. Every execution still has a unique ID.
  async executeFromSdk(name: string, input: unknown): Promise<EvidenceResult> {
    const reserved = [...this.reservations.entries()].find(([, item]) =>
      item.entry.requested_action === name && isDeepStrictEqual(item.input, input));
    return reserved ? this.executeReserved(reserved[0]) : this.execute({ id: randomUUID(), name, input });
  }

  private async executeReserved(id: string): Promise<EvidenceResult> {
    const reservation = this.reservations.get(id)!;
    this.reservations.delete(id);
    const { entry, input } = reservation;
    try { this.assertActive(); } catch {
      return this.deny(entry, this.terminal ?? 'cancelled', 'Investigation is no longer active.');
    }
    entry.execution = 'running';
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    let receivedOutput = false;
    const operationStarted = performance.now();
    try {
      const interruption = new Promise<never>((_, reject) => {
        onAbort = () => { controller.abort(); reject(new SentinelFailure('interrupted-request', 'Investigation stopped.')); };
        this.signal.addEventListener('abort', onAbort, { once: true });
        timeout = setTimeout(() => {
          controller.abort();
          reject(new SentinelFailure('timeout', 'Tool execution timed out.'));
        }, this.limits.toolTimeoutMs);
      });
      const operation = Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return entry.requested_action === 'get_service_metrics'
          ? this.provider.metrics(input as ServiceMetricsInput, controller.signal)
          : this.provider.health(input as DependencyHealthInput, controller.signal);
      });
      const raw = await Promise.race([operation, interruption]);
      this.assertActive();
      if (controller.signal.aborted || performance.now() - operationStarted >= this.limits.toolTimeoutMs) {
        controller.abort();
        throw new SentinelFailure('timeout', 'Tool timed out.');
      }
      receivedOutput = true;
      // Check size before schema traversal, and again on the actual envelope.
      const serialized = JSON.stringify(raw);
      if (!serialized || Buffer.byteLength(serialized) > this.limits.maxOutputBytes) throw new Error('invalid-output');
      const data = entry.requested_action === 'get_service_metrics'
        ? validateServiceMetricsOutput(raw, input as ServiceMetricsInput)
        : validateDependencyHealthOutput(raw, input as DependencyHealthInput);
      const result: EvidenceResult = { ok: true, data };
      if (Buffer.byteLength(JSON.stringify(result)) > this.limits.maxOutputBytes) throw new Error('invalid-output');
      entry.execution = 'succeeded';
      entry.result = result;
      entry.reason = 'Validated read-only evidence returned as untrusted data.';
      return result;
    } catch (error: unknown) {
      entry.execution = 'failed';
      if (this.terminal) return this.deny(entry, this.terminal, 'Investigation stopped before evidence could be accepted.');
      if (this.signal.aborted) return this.deny(entry, 'cancelled', 'Investigation was cancelled.');
      if (error instanceof SentinelFailure && error.code === 'timeout') return this.deny(entry, 'tool-timeout', 'Tool timed out; no successful result accepted.');
      if (error instanceof EvidenceUnavailable) return this.deny(entry, 'evidence-unavailable', error.message);
      return this.deny(entry, receivedOutput ? 'invalid-output' : 'tool-error',
        receivedOutput ? 'Tool returned malformed, oversized, or mismatched evidence.' : 'Tool execution failed; no successful result accepted.');
    } finally {
      clearTimeout(timeout);
      if (onAbort) this.signal.removeEventListener('abort', onAbort);
      entry.elapsed_ms = Math.round(this.elapsedMs);
    }
  }

  // Bound waiting even if a model transport does not respond to cancellation.
  async wait<T>(operation: Promise<T>): Promise<T> {
    try { this.assertActive(); } catch (error) {
      void operation.catch(() => {});
      throw error;
    }
    let listener: (() => void) | undefined;
    try {
      return await Promise.race([operation, new Promise<never>((_, reject) => {
        listener = () => {
          try { this.assertActive(); } catch (error) { reject(error); }
        };
        this.signal.addEventListener('abort', listener, { once: true });
        if (this.signal.aborted) listener();
      })]);
    } finally {
      if (listener) this.signal.removeEventListener('abort', listener);
    }
  }

  close(): void {
    clearTimeout(this.timer);
    this.closed = true;
    this.controller.abort();
    this.reservations.clear();
  }
}

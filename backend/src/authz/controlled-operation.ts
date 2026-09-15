import type { TransactionHandle } from '../db/transaction.js'
import type { AuthorizationDecision } from './resolver.js'

/**
 * Controlled operation execution — ARCHITECTURAL SEAM, NOT IMPLEMENTED.
 *
 * Contract Global Invariant 15: when an operation requires both AuditLog and
 * Durable Outbox, the domain state change, the AuditLogEvent and every required
 * OutboxEvent row commit or fail together in ONE atomic transaction. Section 10
 * prohibition 12: if the audit or outbox write fails, the entire transaction
 * rolls back.
 *
 * The intended shape, for Phase 0B:
 *
 *   executeControlledOperation() opens exactly one transaction via
 *   `withTransaction`, resolves authorization, runs the domain mutation, writes
 *   the AuditLogEvent and any OutboxEvent rows on that same handle, and commits.
 *   No caller is given an API that can commit the domain change alone — that is
 *   why this function, and not the route handler, owns the transaction.
 *
 * The transaction primitive this depends on already exists and is tested
 * (`src/db/transaction.ts`): nested calls join rather than split, and
 * non-transactional access inside a transaction throws.
 *
 * Nothing is implemented here because it cannot be: AuditLogEvent and OutboxEvent
 * are Layer 0 entities that do not exist yet, and the resolver is Phase 0B.
 */

export interface ControlledOperationContext {
  readonly tx: TransactionHandle
  readonly decision: Extract<AuthorizationDecision, { outcome: 'permit' }>
}

export class ControlledOperationNotImplementedError extends Error {
  constructor(operationKey: string) {
    super(
      `Controlled operation "${operationKey}" cannot execute: the controlled-operation ` +
        'layer is not implemented (Phase 0B). AuditLogEvent and OutboxEvent do not ' +
        'exist yet, so Global Invariant 15 cannot be honoured and no domain mutation ' +
        'may be committed.',
    )
    this.name = 'ControlledOperationNotImplementedError'
  }
}

export function executeControlledOperation<T>(
  operationKey: string,
  _run: (context: ControlledOperationContext) => Promise<T>,
): Promise<T> {
  throw new ControlledOperationNotImplementedError(operationKey)
}

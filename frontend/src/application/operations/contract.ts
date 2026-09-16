/**
 * The substrate-neutral application operation contract.
 *
 * Profile Section 10.1: the frontend depends on operation contracts and types,
 * never on Base44 persistence semantics — not entity shapes, not `id`, not
 * `created_date`, not the SDK's return envelopes, not access-rule behaviour.
 * Nothing in this file may import a substrate package, and an architecture
 * test enforces that.
 *
 * Results are **returned, not thrown**. A thrown failure is easy to ignore; a
 * discriminated result forces a caller to decide what a denial means. That
 * matters most for `denied`, which Contract Global Invariant 6 makes the
 * default outcome of anything the resolver cannot positively authorize.
 */

import type { CorrelationId } from './ids'
import type { OperationKey, OperationName } from './registry'

/**
 * How an operation failed, in terms the UI can act on.
 *
 * These are deliberately distinguishable: a denial, a validation error and a
 * stale write call for three different things on screen, and collapsing them
 * would push the UI into guessing from a message string.
 */
export type OperationFailureKind =
  /** Authorization refused it. Includes default-deny (Global Invariant 6). */
  | 'denied'
  /** The input did not satisfy the operation's preconditions. */
  | 'invalid'
  /** A version-guarded write lost: state moved since it was read. */
  | 'conflict'
  /** The target does not exist, or is not visible to this actor. */
  | 'not_found'
  /** Temporary. The same request may succeed later. */
  | 'unavailable'
  /** Non-retryable, and not attributable to the request. */
  | 'internal'

/** Failure kinds a caller may sensibly retry unchanged. */
export const RETRYABLE_FAILURE_KINDS: readonly OperationFailureKind[] = Object.freeze([
  'unavailable',
])

/** The complete set of failure kinds, for exhaustiveness checks and parsing. */
export const OPERATION_FAILURE_KINDS: readonly OperationFailureKind[] = Object.freeze([
  'denied',
  'invalid',
  'conflict',
  'not_found',
  'unavailable',
  'internal',
])

/**
 * A field-level validation code.
 *
 * Codes, never free narrative: Contract Global Invariant 20 forbids any
 * free-text field from carrying sensitive narrative out of a
 * higher-sensitivity domain, and a validation message rendered next to a
 * student's name is exactly such a field.
 */
export interface OperationValidationIssue {
  readonly field: string
  readonly code: string
}

export interface OperationSuccess<TOutput> {
  readonly outcome: 'success'
  readonly operation: OperationName
  readonly operationKey: OperationKey
  readonly correlationId: CorrelationId
  readonly data: TOutput
}

export interface OperationFailure {
  readonly outcome: 'failure'
  readonly operation: OperationName
  readonly operationKey: OperationKey
  readonly correlationId: CorrelationId
  readonly kind: OperationFailureKind
  /**
   * A safe, human-readable summary.
   *
   * Never a substrate error string, a stack, a status code, or anything
   * derived from a record the actor may not be authorized to see. A message
   * that varies with the existence of a hidden record is an oracle.
   */
  readonly message: string
  readonly retryable: boolean
  /** Present only for `invalid`. */
  readonly issues?: readonly OperationValidationIssue[]
}

export type OperationResult<TOutput> = OperationSuccess<TOutput> | OperationFailure

/**
 * Payload shapes are deliberately not modelled yet.
 *
 * Profile Section 10.2 derives each operation's signature from Contract
 * Section 4 at the gate that implements it. Inventing payloads here would be
 * inventing architecture. The generic machinery carries `TInput`/`TOutput`
 * through, so a concrete type slots in without reshaping the contract.
 */
export type OperationPayload = Readonly<Record<string, unknown>>

/**
 * Per-invocation context.
 *
 * There is **no actor field, and there never will be.** Global Invariant 16
 * makes actor identity server-derived from actual execution context; a client
 * that could name an actor would be authoring authorization input. Identity
 * reaches the backend through the authenticated session the substrate adapter
 * holds, not through this object.
 */
export interface OperationContext {
  /**
   * Correlates this invocation with every record the operation writes. One is
   * generated when omitted; supply one to join an operation to work already in
   * flight.
   */
  readonly correlationId?: CorrelationId
  /**
   * Prevents an invocation from starting.
   *
   * Deliberately pre-flight only. Once a mutating operation has reached the
   * backend, no client-side signal can un-commit it, and reporting an aborted
   * in-flight write as a failure would invite a retry that applies it twice.
   * An operation already in flight therefore runs to completion; only its
   * result is discarded by the caller.
   */
  readonly signal?: AbortSignal
}

/**
 * The seam every substrate implements and every caller depends on.
 *
 * One method, because the UI's whole vocabulary is "run this operation". A
 * substrate that needs more than this to work is leaking persistence
 * semantics into the application, which Section 10.1 forbids.
 */
export interface OperationExecutor {
  execute<TOutput = unknown>(
    operation: OperationName,
    input: OperationPayload,
    context?: OperationContext,
  ): Promise<OperationResult<TOutput>>
}

/** Narrows a result to its success branch. */
export function isSuccess<TOutput>(
  result: OperationResult<TOutput>,
): result is OperationSuccess<TOutput> {
  return result.outcome === 'success'
}

/** Narrows a result to its failure branch. */
export function isFailure<TOutput>(result: OperationResult<TOutput>): result is OperationFailure {
  return result.outcome === 'failure'
}

/** Whether a value is one of the known failure kinds. */
export function isOperationFailureKind(value: unknown): value is OperationFailureKind {
  return typeof value === 'string' && (OPERATION_FAILURE_KINDS as readonly string[]).includes(value)
}

/**
 * Builds a failure result.
 *
 * `retryable` is derived from the kind rather than accepted as an argument, so
 * no call site can mark a denial retryable and invite a UI to hammer it.
 */
export function failure(
  operation: OperationName,
  operationKey: OperationKey,
  correlationId: CorrelationId,
  kind: OperationFailureKind,
  message: string,
  issues?: readonly OperationValidationIssue[],
): OperationFailure {
  const base = {
    outcome: 'failure',
    operation,
    operationKey,
    correlationId,
    kind,
    message,
    retryable: RETRYABLE_FAILURE_KINDS.includes(kind),
  } as const
  return issues === undefined ? base : { ...base, issues }
}

/** Builds a success result. */
export function success<TOutput>(
  operation: OperationName,
  operationKey: OperationKey,
  correlationId: CorrelationId,
  data: TOutput,
): OperationSuccess<TOutput> {
  return { outcome: 'success', operation, operationKey, correlationId, data }
}

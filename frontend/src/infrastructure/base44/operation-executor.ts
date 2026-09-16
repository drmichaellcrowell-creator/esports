/**
 * The Base44 operation executor.
 *
 * Translates a substrate-neutral `execute(name, input, context)` into one
 * Base44 backend-function invocation, and translates whatever comes back into
 * the application contract. Nothing about the SDK's shape escapes this file.
 *
 * ## One dispatch function, not one function per operation
 *
 * Every operation goes through a single backend function, which receives the
 * canonical `operation_key` in its body. Two reasons, both structural:
 *
 *  - Contract Global Invariant 4 requires one centralized resolver. A single
 *    entrypoint gives the backend exactly one place to run it, rather than N
 *    functions each responsible for remembering to.
 *  - The browser then never names a function at all. "Arbitrary function names
 *    cannot be invoked" stops being a rule to enforce and becomes a shape the
 *    code cannot express — the name is a module constant.
 *
 * The registry is still checked first, so an unregistered operation name never
 * becomes an `operation_key` on the wire either.
 *
 * ## Fail closed on anything unexpected
 *
 * A response that is not recognisably a success is not a success. Malformed
 * envelopes, unknown failure kinds, a missing or mismatched correlation id and
 * a mismatched operation key all resolve to `internal`. Contract Global
 * Invariant 6 is the reason: nothing defaults to permissive, and a response
 * parser that guesses is a permissive default wearing a different hat.
 */

import {
  failure,
  isOperationFailureKind,
  success,
  type OperationContext,
  type OperationExecutor,
  type OperationFailureKind,
  type OperationPayload,
  type OperationResult,
  type OperationValidationIssue,
} from '../../application/operations/contract'
import { isCorrelationId, newCorrelationId, type CorrelationId } from '../../application/operations/ids'
import {
  clientAuthoredFieldsIn,
  requireOperationKey,
  type OperationKey,
  type OperationName,
} from '../../application/operations/registry'
import type { Base44FunctionInvoker } from './client'

/**
 * The one backend function the browser may invoke.
 *
 * A module constant, never derived from a caller's argument.
 */
export const OPERATION_DISPATCH_FUNCTION = 'execute_operation'

/** Reported alongside a normalized failure, for logging only. Never rendered. */
export interface OperationDiagnostic {
  readonly operationKey: OperationKey
  readonly correlationId: CorrelationId
  readonly kind: OperationFailureKind
  readonly cause: unknown
}

export interface Base44OperationExecutorOptions {
  /**
   * Receives the substrate-level cause of a normalized failure.
   *
   * This is the only route by which substrate detail leaves this file, and it
   * goes to a logger, never into an `OperationResult`. Profile Section 10.1:
   * a UI that branches on a Base44 error shape has violated the boundary.
   */
  readonly onDiagnostic?: (diagnostic: OperationDiagnostic) => void
}

const GENERIC_MESSAGES: Readonly<Record<OperationFailureKind, string>> = Object.freeze({
  denied: 'You are not authorized to perform this operation.',
  invalid: 'The request was not valid for this operation.',
  conflict: 'This changed since it was loaded. Reload and try again.',
  not_found: 'The requested record is not available.',
  unavailable: 'The service is temporarily unavailable. Try again shortly.',
  internal: 'The operation could not be completed.',
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Unwraps the SDK's transport envelope.
 *
 * `functions.invoke` resolves to a response whose `data` carries whatever the
 * function returned. Tolerating both shapes keeps the parser from depending on
 * a transport detail, while the strict checks that follow still decide whether
 * the payload is acceptable.
 */
function unwrap(raw: unknown): unknown {
  if (isRecord(raw) && 'data' in raw) {
    return raw['data']
  }
  return raw
}

function parseIssues(value: unknown): readonly OperationValidationIssue[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const issues: OperationValidationIssue[] = []
  for (const entry of value) {
    if (!isRecord(entry)) {
      return undefined
    }
    const field = entry['field']
    const code = entry['code']
    if (typeof field !== 'string' || typeof code !== 'string') {
      return undefined
    }
    issues.push({ field, code })
  }
  return issues
}

export class Base44OperationExecutor implements OperationExecutor {
  constructor(
    private readonly invoker: Base44FunctionInvoker,
    private readonly options: Base44OperationExecutorOptions = {},
  ) {}

  async execute<TOutput = unknown>(
    operation: OperationName,
    input: OperationPayload,
    context?: OperationContext,
  ): Promise<OperationResult<TOutput>> {
    // Throws before any network call when the name is not registered.
    const operationKey = requireOperationKey(operation)
    const correlationId = context?.correlationId ?? newCorrelationId()

    // Global Invariant 16: actor identity, outcome, policy version and the
    // authority path are server-derived. Refusing them here means a UI defect
    // cannot even attempt to author one, rather than depending on the backend
    // to ignore an unexpected field.
    const forbidden = clientAuthoredFieldsIn(input)
    if (forbidden.length > 0) {
      return failure(
        operation,
        operationKey,
        correlationId,
        'invalid',
        'The request included fields that only the server may determine.',
        forbidden.map((field) => ({ field, code: 'server_derived_field' })),
      )
    }

    // Pre-flight only, per `OperationContext.signal`. An operation that has
    // already reached the backend is not recalled by aborting here.
    if (context?.signal?.aborted === true) {
      return this.normalized(operation, operationKey, correlationId, 'unavailable', {
        reason: 'aborted_before_dispatch',
      })
    }

    let raw: unknown
    try {
      raw = await this.invoker.invoke(OPERATION_DISPATCH_FUNCTION, {
        operationKey,
        correlationId,
        input,
      })
    } catch (cause) {
      // Transport and platform errors become application failures. The SDK's
      // error type, status code and payload stay here; only the kind crosses.
      return this.normalized(
        operation,
        operationKey,
        correlationId,
        this.kindForThrown(cause),
        cause,
      )
    }

    return this.parse<TOutput>(operation, operationKey, correlationId, unwrap(raw))
  }

  /**
   * Maps a thrown substrate error to a failure kind.
   *
   * Only the HTTP status is consulted, and only to distinguish "retry may
   * help" from "it will not". Anything unrecognised is `internal`: an
   * unclassifiable error is not evidence of permission.
   */
  private kindForThrown(cause: unknown): OperationFailureKind {
    const status = isRecord(cause) && typeof cause['status'] === 'number' ? cause['status'] : undefined
    if (status === undefined) {
      return 'unavailable'
    }
    if (status === 401 || status === 403) {
      return 'denied'
    }
    if (status === 404) {
      return 'not_found'
    }
    if (status === 409 || status === 412) {
      return 'conflict'
    }
    if (status === 400 || status === 422) {
      return 'invalid'
    }
    if (status === 408 || status === 429 || status >= 500) {
      return 'unavailable'
    }
    return 'internal'
  }

  private normalized(
    operation: OperationName,
    operationKey: OperationKey,
    correlationId: CorrelationId,
    kind: OperationFailureKind,
    cause: unknown,
  ): OperationResult<never> {
    this.options.onDiagnostic?.({ operationKey, correlationId, kind, cause })
    return failure(operation, operationKey, correlationId, kind, GENERIC_MESSAGES[kind])
  }

  private parse<TOutput>(
    operation: OperationName,
    operationKey: OperationKey,
    correlationId: CorrelationId,
    body: unknown,
  ): OperationResult<TOutput> {
    if (!isRecord(body)) {
      return this.normalized(operation, operationKey, correlationId, 'internal', {
        reason: 'response_not_an_object',
      })
    }

    // A response that does not echo the correlation id we sent cannot be
    // attributed to this invocation. Accepting it would let a stale or
    // mismatched response decide this operation's outcome.
    const echoed = body['correlationId']
    if (!isCorrelationId(echoed) || echoed !== correlationId) {
      return this.normalized(operation, operationKey, correlationId, 'internal', {
        reason: 'correlation_id_mismatch',
      })
    }

    if (body['operationKey'] !== operationKey) {
      return this.normalized(operation, operationKey, correlationId, 'internal', {
        reason: 'operation_key_mismatch',
      })
    }

    const outcome = body['outcome']

    if (outcome === 'failure') {
      const kind = body['kind']
      if (!isOperationFailureKind(kind)) {
        // An unrecognised failure kind stays a failure. Widening it to success
        // would be the one mistake this parser exists to prevent.
        return this.normalized(operation, operationKey, correlationId, 'internal', {
          reason: 'unknown_failure_kind',
        })
      }
      this.options.onDiagnostic?.({ operationKey, correlationId, kind, cause: body })
      return failure(
        operation,
        operationKey,
        correlationId,
        kind,
        GENERIC_MESSAGES[kind],
        kind === 'invalid' ? parseIssues(body['issues']) : undefined,
      )
    }

    if (outcome === 'success') {
      return success(operation, operationKey, correlationId, body['data'] as TOutput)
    }

    return this.normalized(operation, operationKey, correlationId, 'internal', {
      reason: 'unknown_outcome',
    })
  }
}

/**
 * Test and development infrastructure. NOT a production executor.
 *
 * This is a substrate-neutral fake so that UI tests can pin an operation to a
 * success or to each failure kind without a backend. It is confined to this
 * directory, and two independent mechanisms keep it out of a shipped bundle:
 *
 *  1. The constructor refuses to run in a production build (below).
 *  2. An architecture test asserts that nothing under `src/` outside this
 *     directory imports it, and the CI frontend boundary check enforces the
 *     same thing.
 *
 * Both exist because the profile's own posture applies here: a permissive
 * default that quietly stands in for authorization is the failure mode worth
 * spending two mechanisms on. A fake that returns success is indistinguishable
 * from a granted operation at the call site.
 */

import {
  failure,
  success,
  type OperationContext,
  type OperationExecutor,
  type OperationFailureKind,
  type OperationPayload,
  type OperationResult,
  type OperationValidationIssue,
} from '../application/operations/contract'
import { newCorrelationId, type CorrelationId } from '../application/operations/ids'
import { requireOperationKey, type OperationName } from '../application/operations/registry'

/** What the fake should do for one operation. */
export type ProgrammedOutcome =
  | { readonly outcome: 'success'; readonly data?: unknown }
  | {
      readonly outcome: 'failure'
      readonly kind: OperationFailureKind
      readonly message?: string
      readonly issues?: readonly OperationValidationIssue[]
    }

/** One recorded invocation, for assertions about what the UI actually asked for. */
export interface RecordedInvocation {
  readonly operation: OperationName
  readonly input: OperationPayload
  readonly correlationId: CorrelationId
}

export class InMemoryOperationExecutorInProductionError extends Error {
  constructor() {
    super(
      'InMemoryOperationExecutor is test infrastructure and must never execute ' +
        'in a production build. A fake executor cannot stand in for authorization.',
    )
    this.name = 'InMemoryOperationExecutorInProductionError'
  }
}

export interface InMemoryOperationExecutorOptions {
  /**
   * What an operation with no programmed outcome does.
   *
   * Defaults to a `denied` failure, matching Contract Global Invariant 6:
   * absence of a matching decision denies. A default of success would make
   * every unprogrammed operation in a test look authorized.
   */
  readonly defaultOutcome?: ProgrammedOutcome
}

export class InMemoryOperationExecutor implements OperationExecutor {
  private readonly programmed = new Map<OperationName, ProgrammedOutcome>()
  private readonly recorded: RecordedInvocation[] = []
  private readonly defaultOutcome: ProgrammedOutcome

  constructor(options: InMemoryOperationExecutorOptions = {}) {
    if (import.meta.env?.PROD === true) {
      throw new InMemoryOperationExecutorInProductionError()
    }
    this.defaultOutcome = options.defaultOutcome ?? {
      outcome: 'failure',
      kind: 'denied',
      message: 'No outcome was programmed for this operation.',
    }
  }

  /** Pins what the next invocations of an operation return. */
  program(operation: OperationName, outcome: ProgrammedOutcome): this {
    this.programmed.set(operation, outcome)
    return this
  }

  /** Every invocation so far, oldest first. */
  get invocations(): readonly RecordedInvocation[] {
    return [...this.recorded]
  }

  // `async` for the same reason the production adapter is: every executor
  // reports a defect as a rejected promise, never a synchronous throw.
  async execute<TOutput = unknown>(
    operation: OperationName,
    input: OperationPayload,
    context?: OperationContext,
  ): Promise<OperationResult<TOutput>> {
    // The registry applies to the fake too. A test that can invoke an
    // unregistered operation is testing something the production adapter
    // cannot do.
    const operationKey = requireOperationKey(operation)
    const correlationId = context?.correlationId ?? newCorrelationId()
    this.recorded.push({ operation, input, correlationId })

    const outcome = this.programmed.get(operation) ?? this.defaultOutcome
    if (outcome.outcome === 'success') {
      return success(operation, operationKey, correlationId, outcome.data as TOutput)
    }
    return failure(
      operation,
      operationKey,
      correlationId,
      outcome.kind,
      outcome.message ?? `Programmed ${outcome.kind} outcome.`,
      outcome.issues,
    )
  }
}

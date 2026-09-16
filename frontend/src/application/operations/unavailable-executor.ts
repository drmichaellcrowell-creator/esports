/**
 * An executor that fails every operation as `unavailable`.
 *
 * Used when the production substrate is not configured — for instance when the
 * application shell is rendered in a preview with no backend behind it. It
 * exists so that "not configured" is a *visible, uniform failure* rather than
 * a crash on first use or, far worse, a silent success.
 *
 * It can never be mistaken for authorization: there is no code path through it
 * that produces `outcome: 'success'`. Contract Global Invariant 6 and
 * `AGENTS.md` rule 4 both say the same thing — if authorization is not
 * implemented for an operation, the operation does not exist.
 */

import { failure, type OperationContext, type OperationExecutor, type OperationPayload, type OperationResult } from './contract'
import { newCorrelationId } from './ids'
import { requireOperationKey, type OperationName } from './registry'

export class UnavailableOperationExecutor implements OperationExecutor {
  constructor(private readonly reason: string) {}

  // `async` so that a rejected promise — never a synchronous throw — is how
  // every executor reports a defect. A caller that only writes `.catch()`
  // must not behave differently against one implementation than another.
  async execute<TOutput = unknown>(
    operation: OperationName,
    _input: OperationPayload,
    context?: OperationContext,
  ): Promise<OperationResult<TOutput>> {
    // Resolving the key first keeps an unregistered name unreachable here too,
    // so the fallback executor is not a way around the registry.
    const operationKey = requireOperationKey(operation)
    return failure(
      operation,
      operationKey,
      context?.correlationId ?? newCorrelationId(),
      'unavailable',
      this.reason,
    )
  }
}

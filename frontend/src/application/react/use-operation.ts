/**
 * The hook components use to run an application operation.
 *
 * Deliberately small. It owns request state and nothing else — no caching, no
 * retries, no optimistic update. Optimism in particular is a poor fit here:
 * the profile's concurrency rule (Section 2.1) means a version-guarded write
 * can legitimately lose, and a UI that has already drawn the success has
 * nothing honest to do when it does.
 *
 * A component sees `OperationResult` and nothing from the substrate.
 */

import { useCallback, useRef, useState } from 'react'
import type {
  OperationContext,
  OperationPayload,
  OperationResult,
} from '../operations/contract'
import type { OperationName } from '../operations/registry'
import { useOperationExecutor } from './operation-executor-context'

export type OperationStatus = 'idle' | 'running' | 'settled'

export interface UseOperationState<TOutput> {
  readonly status: OperationStatus
  /** The most recent result, or `null` before the first settles. */
  readonly result: OperationResult<TOutput> | null
}

export interface UseOperation<TOutput> extends UseOperationState<TOutput> {
  readonly execute: (
    input: OperationPayload,
    context?: OperationContext,
  ) => Promise<OperationResult<TOutput>>
  readonly reset: () => void
}

export function useOperation<TOutput = unknown>(
  operation: OperationName,
): UseOperation<TOutput> {
  const executor = useOperationExecutor()
  const [state, setState] = useState<UseOperationState<TOutput>>({
    status: 'idle',
    result: null,
  })

  // Only the newest invocation may write state. Without this a slow denial
  // that resolves after a fast success would overwrite it, and the screen
  // would show the wrong outcome for the wrong request.
  const latest = useRef(0)

  const execute = useCallback(
    async (input: OperationPayload, context?: OperationContext) => {
      const ticket = ++latest.current
      setState({ status: 'running', result: null })
      const result = await executor.execute<TOutput>(operation, input, context)
      if (latest.current === ticket) {
        setState({ status: 'settled', result })
      }
      return result
    },
    [executor, operation],
  )

  const reset = useCallback(() => {
    latest.current += 1
    setState({ status: 'idle', result: null })
  }, [])

  return { ...state, execute, reset }
}

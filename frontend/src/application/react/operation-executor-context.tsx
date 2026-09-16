/**
 * React access to the application operation layer.
 *
 * Substrate-neutral: this module knows about `OperationExecutor` and nothing
 * else. The production executor is constructed at the application entry point
 * and passed in; tests pass the in-memory one. There is deliberately no module
 * singleton and no default value — a default executor would be a global
 * mutable seam that tests fight and that a future substrate swap would have to
 * hunt down.
 */

import { createContext, useContext, type ReactNode } from 'react'
import type { OperationExecutor } from '../operations/contract'

const OperationExecutorContext = createContext<OperationExecutor | null>(null)

export class OperationExecutorMissingError extends Error {
  constructor() {
    super(
      'No OperationExecutor is available. Wrap this tree in <OperationExecutorProvider>.',
    )
    this.name = 'OperationExecutorMissingError'
  }
}

export interface OperationExecutorProviderProps {
  readonly executor: OperationExecutor
  readonly children: ReactNode
}

export function OperationExecutorProvider({
  executor,
  children,
}: OperationExecutorProviderProps): JSX.Element {
  return (
    <OperationExecutorContext.Provider value={executor}>
      {children}
    </OperationExecutorContext.Provider>
  )
}

/**
 * The executor for the current tree.
 *
 * Throws when there is none rather than returning a permissive stand-in. A
 * component that renders as though its operations succeeded because no
 * provider was mounted is the exact failure `AGENTS.md` rule 4 is about.
 */
export function useOperationExecutor(): OperationExecutor {
  const executor = useContext(OperationExecutorContext)
  if (executor === null) {
    throw new OperationExecutorMissingError()
  }
  return executor
}

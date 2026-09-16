import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import {
  OperationExecutorMissingError,
  OperationExecutorProvider,
  useOperationExecutor,
} from './operation-executor-context'
import { useOperation } from './use-operation'
import { InMemoryOperationExecutor } from '../../testing/in-memory-operation-executor'
import { isFailure, isSuccess, type OperationResult } from '../operations/contract'

/**
 * A component written the way product components must be: it knows the
 * operation name and the result shape, and nothing about any substrate.
 */
function LockLineupButton() {
  const { status, result, execute } = useOperation<{ lockId: string }>('lockLineup')
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="outcome">{result?.outcome ?? 'none'}</span>
      <span data-testid="kind">{result !== null && isFailure(result) ? result.kind : ''}</span>
      <button onClick={() => void execute({ matchId: 'm-1' })}>Lock</button>
    </div>
  )
}

describe('React operation integration', () => {
  it('refuses to run without a provider instead of assuming a permissive one', () => {
    function Consumer() {
      useOperationExecutor()
      return null
    }
    // React logs the thrown error; the assertion is that it throws at all.
    expect(() => render(<Consumer />)).toThrow(OperationExecutorMissingError)
  })

  it('injects the in-memory executor and a component sees only results', async () => {
    const executor = new InMemoryOperationExecutor().program('lockLineup', {
      outcome: 'success',
      data: { lockId: 'l-1' },
    })

    render(
      <OperationExecutorProvider executor={executor}>
        <LockLineupButton />
      </OperationExecutorProvider>,
    )

    expect(screen.getByTestId('status').textContent).toBe('idle')
    await act(async () => {
      screen.getByText('Lock').click()
    })

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('settled'))
    expect(screen.getByTestId('outcome').textContent).toBe('success')
    expect(executor.invocations).toEqual([
      expect.objectContaining({ operation: 'lockLineup', input: { matchId: 'm-1' } }),
    ])
  })

  it('surfaces a denial as a denial rather than an error boundary crash', async () => {
    const executor = new InMemoryOperationExecutor().program('lockLineup', {
      outcome: 'failure',
      kind: 'denied',
    })

    render(
      <OperationExecutorProvider executor={executor}>
        <LockLineupButton />
      </OperationExecutorProvider>,
    )
    await act(async () => {
      screen.getByText('Lock').click()
    })

    await waitFor(() => expect(screen.getByTestId('kind').textContent).toBe('denied'))
    expect(screen.getByTestId('outcome').textContent).toBe('failure')
  })

  it('swapping the injected executor changes behaviour with no component change', async () => {
    const outcomes: Array<OperationResult<unknown>> = []
    function Runner({ executor }: { executor: InMemoryOperationExecutor }) {
      return (
        <OperationExecutorProvider executor={executor}>
          <Capture />
        </OperationExecutorProvider>
      )
    }
    function Capture() {
      const { execute } = useOperation('assignRole')
      return <button onClick={() => void execute({}).then((r) => outcomes.push(r))}>Go</button>
    }

    const denying = new InMemoryOperationExecutor()
    const allowing = new InMemoryOperationExecutor().program('assignRole', { outcome: 'success' })

    const { rerender } = render(<Runner executor={denying} />)
    await act(async () => {
      screen.getByText('Go').click()
    })
    rerender(<Runner executor={allowing} />)
    await act(async () => {
      screen.getByText('Go').click()
    })

    await waitFor(() => expect(outcomes).toHaveLength(2))
    expect(isFailure(outcomes[0]!)).toBe(true)
    expect(isSuccess(outcomes[1]!)).toBe(true)
  })

  it('ignores a superseded invocation so a slow result cannot overwrite a newer one', async () => {
    let releaseFirst: (() => void) | undefined
    let call = 0
    const executor = {
      execute: async (operation: never, _input: never, _context?: never) => {
        call += 1
        if (call === 1) {
          await new Promise<void>((resolve) => {
            releaseFirst = resolve
          })
          return {
            outcome: 'failure' as const,
            operation,
            operationKey: 'role.assign' as const,
            correlationId: 'c1' as never,
            kind: 'denied' as const,
            message: 'stale',
            retryable: false,
          }
        }
        return {
          outcome: 'success' as const,
          operation,
          operationKey: 'role.assign' as const,
          correlationId: 'c2' as never,
          data: null,
        }
      },
    }

    function Runner() {
      const { result, execute } = useOperation('assignRole')
      return (
        <div>
          <span data-testid="outcome">{result?.outcome ?? 'none'}</span>
          <button onClick={() => void execute({})}>Go</button>
        </div>
      )
    }

    render(
      <OperationExecutorProvider executor={executor as never}>
        <Runner />
      </OperationExecutorProvider>,
    )

    await act(async () => {
      screen.getByText('Go').click()
    })
    await act(async () => {
      screen.getByText('Go').click()
    })
    await waitFor(() => expect(screen.getByTestId('outcome').textContent).toBe('success'))

    // The first, slower invocation now settles. It must not repaint the screen.
    await act(async () => {
      releaseFirst?.()
      await Promise.resolve()
    })
    expect(screen.getByTestId('outcome').textContent).toBe('success')
  })
})

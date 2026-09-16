import { describe, expect, it } from 'vitest'
import { InMemoryOperationExecutor } from './in-memory-operation-executor'
import { isFailure, isSuccess, type OperationFailureKind } from '../application/operations/contract'
import { UnknownOperationError, type OperationName } from '../application/operations/registry'
import { newCorrelationId } from '../application/operations/ids'

describe('InMemoryOperationExecutor', () => {
  it('denies by default, so an unprogrammed operation never looks authorized', async () => {
    const result = await new InMemoryOperationExecutor().execute('assignRole', {})
    expect(isFailure(result)).toBe(true)
    if (!isFailure(result)) return
    expect(result.kind).toBe('denied')
  })

  it('returns each programmed outcome deterministically', async () => {
    const kinds: OperationFailureKind[] = [
      'denied',
      'invalid',
      'conflict',
      'not_found',
      'unavailable',
      'internal',
    ]
    for (const kind of kinds) {
      const executor = new InMemoryOperationExecutor().program('lockLineup', {
        outcome: 'failure',
        kind,
      })
      for (let i = 0; i < 3; i += 1) {
        const result = await executor.execute('lockLineup', {})
        expect(isFailure(result)).toBe(true)
        if (!isFailure(result)) return
        expect(result.kind).toBe(kind)
        expect(result.operationKey).toBe('lineup.lock')
      }
    }
  })

  it('returns a programmed success with its data', async () => {
    const executor = new InMemoryOperationExecutor().program('moveRoster', {
      outcome: 'success',
      data: { moved: true },
    })
    const result = await executor.execute<{ moved: boolean }>('moveRoster', {})
    expect(isSuccess(result)).toBe(true)
    if (!isSuccess(result)) return
    expect(result.data).toEqual({ moved: true })
    expect(result.operationKey).toBe('roster.move')
  })

  it('records what the caller asked for, including the correlation id', async () => {
    const correlationId = newCorrelationId()
    const executor = new InMemoryOperationExecutor()
    await executor.execute('revokeRole', { membershipId: 'm-1' }, { correlationId })

    expect(executor.invocations).toEqual([
      { operation: 'revokeRole', input: { membershipId: 'm-1' }, correlationId },
    ])
  })

  it('enforces the registry exactly as the production adapter does', async () => {
    await expect(
      new InMemoryOperationExecutor().execute('anythingAtAll' as OperationName, {}),
    ).rejects.toThrow(UnknownOperationError)
  })

  it('allows a test to opt into a permissive default explicitly', async () => {
    const executor = new InMemoryOperationExecutor({
      defaultOutcome: { outcome: 'success', data: null },
    })
    expect(isSuccess(await executor.execute('assignCaptain', {}))).toBe(true)
  })
})

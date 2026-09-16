import { describe, expect, it } from 'vitest'
import { UnavailableOperationExecutor } from './unavailable-executor'
import { OPERATION_REGISTRY, UnknownOperationError, type OperationName } from './registry'
import { isFailure } from './contract'

describe('UnavailableOperationExecutor', () => {
  it('has no code path that produces a success', async () => {
    const executor = new UnavailableOperationExecutor('not configured')
    for (const operation of Object.keys(OPERATION_REGISTRY) as OperationName[]) {
      const result = await executor.execute(operation, {})
      expect(result.outcome).toBe('failure')
      if (!isFailure(result)) return
      expect(result.kind).toBe('unavailable')
      expect(result.retryable).toBe(true)
    }
  })

  it('still refuses an unregistered operation', async () => {
    await expect(
      new UnavailableOperationExecutor('x').execute('whatever' as OperationName, {}),
    ).rejects.toThrow(UnknownOperationError)
  })
})

import { describe, expect, it, vi } from 'vitest'
import { Base44OperationExecutor, OPERATION_DISPATCH_FUNCTION } from './operation-executor'
import type { Base44FunctionInvoker } from './client'
import { UnknownOperationError, type OperationName } from '../../application/operations/registry'
import { isFailure, isSuccess } from '../../application/operations/contract'
import { newCorrelationId, type CorrelationId } from '../../application/operations/ids'

/** Replies with whatever the test supplies, echoing the request's correlation id. */
function invokerReplying(
  build: (body: { operationKey: string; correlationId: CorrelationId }) => unknown,
): { invoker: Base44FunctionInvoker; invoke: ReturnType<typeof vi.fn> } {
  const invoke = vi.fn(async (_name: string, data?: Record<string, unknown>) =>
    build(data as unknown as { operationKey: string; correlationId: CorrelationId }),
  )
  return { invoker: { invoke }, invoke }
}

function ok(body: { operationKey: string; correlationId: CorrelationId }, data: unknown = {}) {
  return { data: { outcome: 'success', ...body, data } }
}

describe('Base44OperationExecutor', () => {
  it('invokes exactly one, constant backend function and sends the canonical key', async () => {
    const { invoker, invoke } = invokerReplying((body) => ok(body, { ok: true }))
    const result = await new Base44OperationExecutor(invoker).execute('lockLineup', { matchId: 'm1' })

    expect(invoke).toHaveBeenCalledTimes(1)
    const [functionName, payload] = invoke.mock.calls[0]!
    expect(functionName).toBe(OPERATION_DISPATCH_FUNCTION)
    expect(payload).toMatchObject({ operationKey: 'lineup.lock', input: { matchId: 'm1' } })
    expect(isSuccess(result)).toBe(true)
  })

  it('cannot be made to invoke an arbitrary function name', async () => {
    const { invoker, invoke } = invokerReplying((body) => ok(body))
    const executor = new Base44OperationExecutor(invoker)

    for (const attempt of ['execute_anything', '../../admin', 'entities.Membership', '']) {
      await expect(executor.execute(attempt as OperationName, {})).rejects.toThrow(
        UnknownOperationError,
      )
    }
    // Nothing reached the substrate.
    expect(invoke).not.toHaveBeenCalled()
  })

  it('refuses input that authors server-derived authority fields', async () => {
    const { invoker, invoke } = invokerReplying((body) => ok(body))
    const result = await new Base44OperationExecutor(invoker).execute('assignRole', {
      actor_user_id: 'u-1',
      outcome: 'success',
    })

    expect(invoke).not.toHaveBeenCalled()
    expect(isFailure(result)).toBe(true)
    if (!isFailure(result)) return
    expect(result.kind).toBe('invalid')
    expect(result.issues).toEqual([
      { field: 'actor_user_id', code: 'server_derived_field' },
      { field: 'outcome', code: 'server_derived_field' },
    ])
  })

  it('carries the caller correlation id across the boundary and back', async () => {
    const correlationId = newCorrelationId()
    const { invoker, invoke } = invokerReplying((body) => ok(body))
    const result = await new Base44OperationExecutor(invoker).execute(
      'moveRoster',
      {},
      { correlationId },
    )

    expect(invoke.mock.calls[0]![1]).toMatchObject({ correlationId })
    expect(result.correlationId).toBe(correlationId)
  })

  it('generates a correlation id when the caller supplies none', async () => {
    const { invoker, invoke } = invokerReplying((body) => ok(body))
    const result = await new Base44OperationExecutor(invoker).execute('revokeRole', {})
    expect(result.correlationId).toBe((invoke.mock.calls[0]![1] as Record<string, unknown>)['correlationId'])
    expect(result.correlationId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('normalizes each backend failure kind without leaking substrate detail', async () => {
    for (const kind of ['denied', 'invalid', 'conflict', 'not_found', 'unavailable', 'internal']) {
      const { invoker } = invokerReplying((body) => ({
        data: { outcome: 'failure', ...body, kind, message: 'raw backend detail' },
      }))
      const result = await new Base44OperationExecutor(invoker).execute('finalizeResult', {})
      expect(isFailure(result)).toBe(true)
      if (!isFailure(result)) return
      expect(result.kind).toBe(kind)
      expect(result.message).not.toContain('raw backend detail')
      expect(result.retryable).toBe(kind === 'unavailable')
    }
  })

  describe('fails closed on a malformed response', () => {
    const cases: Array<[string, (body: { operationKey: string; correlationId: CorrelationId }) => unknown]> = [
      ['a non-object body', () => ({ data: 'yes' })],
      ['a null body', () => ({ data: null })],
      ['an array body', () => ({ data: [] })],
      ['a missing outcome', (body) => ({ data: { ...body } })],
      ['an unknown outcome', (body) => ({ data: { outcome: 'maybe', ...body } })],
      ['an unknown failure kind', (body) => ({ data: { outcome: 'failure', ...body, kind: 'teapot' } })],
      [
        'a missing correlation id',
        (body) => ({ data: { outcome: 'success', operationKey: body.operationKey, data: {} } }),
      ],
      [
        'a mismatched correlation id',
        (body) => ({
          data: { outcome: 'success', operationKey: body.operationKey, correlationId: newCorrelationId(), data: {} },
        }),
      ],
      [
        'a mismatched operation key',
        (body) => ({
          data: { outcome: 'success', operationKey: 'role.assign', correlationId: body.correlationId, data: {} },
        }),
      ],
    ]

    for (const [name, build] of cases) {
      it(`treats ${name} as internal failure, never success`, async () => {
        const { invoker } = invokerReplying(build)
        const result = await new Base44OperationExecutor(invoker).execute('submitMatchResult', {})
        expect(result.outcome).toBe('failure')
        if (!isFailure(result)) return
        expect(result.kind).toBe('internal')
        expect(result.retryable).toBe(false)
      })
    }
  })

  it('maps thrown substrate errors to application failures by status', async () => {
    const expected: Array<[number | undefined, string]> = [
      [401, 'denied'],
      [403, 'denied'],
      [404, 'not_found'],
      [409, 'conflict'],
      [412, 'conflict'],
      [400, 'invalid'],
      [422, 'invalid'],
      [429, 'unavailable'],
      [500, 'unavailable'],
      [503, 'unavailable'],
      [undefined, 'unavailable'],
      [302, 'internal'],
    ]
    for (const [status, kind] of expected) {
      const thrown = Object.assign(new Error('Base44Error: secret internals'), { status, code: 'x' })
      const invoker: Base44FunctionInvoker = {
        invoke: () => Promise.reject(thrown),
      }
      const result = await new Base44OperationExecutor(invoker).execute('evaluateEligibility', {})
      expect(isFailure(result)).toBe(true)
      if (!isFailure(result)) return
      expect(result.kind).toBe(kind)
      expect(result.message).not.toContain('secret internals')
      expect(JSON.stringify(result)).not.toContain('Base44')
    }
  })

  it('reports substrate detail only through the diagnostic channel', async () => {
    const onDiagnostic = vi.fn()
    const thrown = Object.assign(new Error('transport exploded'), { status: 500 })
    const executor = new Base44OperationExecutor({ invoke: () => Promise.reject(thrown) }, { onDiagnostic })

    const result = await executor.execute('unlockLineup', {})

    expect(onDiagnostic).toHaveBeenCalledTimes(1)
    expect(onDiagnostic.mock.calls[0]![0]).toMatchObject({
      operationKey: 'lineup.unlock',
      kind: 'unavailable',
      cause: thrown,
    })
    expect(JSON.stringify(result)).not.toContain('transport exploded')
  })

  it('treats an already-aborted request as unavailable, never success', async () => {
    const { invoker, invoke } = invokerReplying((body) => ok(body))
    const controller = new AbortController()
    controller.abort()
    const result = await new Base44OperationExecutor(invoker).execute(
      'assignCaptain',
      {},
      { signal: controller.signal },
    )
    expect(invoke).not.toHaveBeenCalled()
    expect(result.outcome).toBe('failure')
  })

  it('passes validation issue codes through but not free narrative', async () => {
    const { invoker } = invokerReplying((body) => ({
      data: {
        outcome: 'failure',
        ...body,
        kind: 'invalid',
        message: 'student narrative that must not surface',
        issues: [{ field: 'startsAt', code: 'in_the_past' }],
      },
    }))
    const result = await new Base44OperationExecutor(invoker).execute('moveRoster', {})
    expect(isFailure(result)).toBe(true)
    if (!isFailure(result)) return
    expect(result.issues).toEqual([{ field: 'startsAt', code: 'in_the_past' }])
    expect(JSON.stringify(result)).not.toContain('student narrative')
  })
})

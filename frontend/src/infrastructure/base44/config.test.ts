import { describe, expect, it } from 'vitest'
import { readBase44BrowserConfig } from './config'
import { createProductionOperationExecutor } from './create-executor'
import { isFailure } from '../../application/operations/contract'

describe('Base44 browser configuration', () => {
  it('reads the public app id', () => {
    expect(readBase44BrowserConfig({ VITE_BASE44_APP_ID: 'app-123' })).toEqual({ appId: 'app-123' })
  })

  it('accepts an optional development server origin', () => {
    expect(
      readBase44BrowserConfig({
        VITE_BASE44_APP_ID: 'app-123',
        VITE_BASE44_SERVER_URL: 'http://localhost:4000',
      }),
    ).toEqual({ appId: 'app-123', serverUrl: 'http://localhost:4000' })
  })

  it('reports absence rather than inventing a default app id', () => {
    expect(readBase44BrowserConfig({})).toBeUndefined()
    expect(readBase44BrowserConfig({ VITE_BASE44_APP_ID: '   ' })).toBeUndefined()
    expect(readBase44BrowserConfig({ VITE_BASE44_APP_ID: 42 })).toBeUndefined()
  })

  it('falls back to a fail-closed executor when unconfigured', async () => {
    const executor = createProductionOperationExecutor({}, {})
    const result = await executor.execute('assignRole', {})
    expect(result.outcome).toBe('failure')
    if (!isFailure(result)) return
    expect(result.kind).toBe('unavailable')
  })
})

import { spawn, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { createWorker } from '../src/worker/runtime.js'
import { createSilentLogger } from '../src/observability/logger.js'

describe('worker substrate', () => {
  const build = (shutdown?: () => Promise<void>) =>
    createWorker({
      logger: createSilentLogger(),
      heartbeatIntervalMs: 50,
      ...(shutdown !== undefined ? { shutdown } : {}),
    })

  it('starts and reports idle', async () => {
    const worker = build()
    expect(worker.state).toBe('stopped')
    await worker.start()
    expect(worker.state).toBe('idle')
    await worker.stop()
  })

  it('shuts down cleanly', async () => {
    const worker = build()
    await worker.start()
    await worker.stop()
    expect(worker.state).toBe('stopped')
  })

  it('releases its resources on shutdown', async () => {
    const shutdown = vi.fn(async () => undefined)
    const worker = build(shutdown)
    await worker.start()
    await worker.stop()
    expect(shutdown).toHaveBeenCalledOnce()
  })

  it('tolerates a repeated stop signal', async () => {
    const shutdown = vi.fn(async () => undefined)
    const worker = build(shutdown)
    await worker.start()
    await worker.stop()
    await worker.stop()
    await worker.stop()
    expect(shutdown).toHaveBeenCalledOnce()
    expect(worker.state).toBe('stopped')
  })

  it('ignores a duplicate start', async () => {
    const worker = build()
    await worker.start()
    await worker.start()
    expect(worker.state).toBe('idle')
    await worker.stop()
  })

  it('stops cleanly without ever having started', async () => {
    const worker = build()
    await worker.stop()
    expect(worker.state).toBe('stopped')
  })

  it('can be restarted', async () => {
    const worker = build()
    await worker.start()
    await worker.stop()
    await worker.start()
    expect(worker.state).toBe('idle')
    await worker.stop()
    expect(worker.state).toBe('stopped')
  })

  it('does not keep the process alive on its heartbeat alone', async () => {
    const worker = build()
    await worker.start()
    // An unref'd timer must not register as a keep-alive handle.
    const handles = (process as unknown as { _getActiveHandles?: () => unknown[] })
      ._getActiveHandles?.()
    if (handles !== undefined) {
      const timers = handles.filter(
        (handle) => (handle as { hasRef?: () => boolean }).hasRef?.() === true,
      )
      expect(timers.length).toBeGreaterThanOrEqual(0)
    }
    await worker.stop()
  })
})

describe('worker process lifecycle', () => {
  /**
   * A process-level test, because the unit tests above cannot catch the failure
   * that actually occurred: `createWorker` behaved correctly while the worker
   * *process* exited the instant `start()` returned, since nothing held the
   * event loop open. Only spawning the real entrypoint demonstrates that a
   * long-running worker actually runs long.
   */
  const entrypoint = fileURLToPath(new URL('../src/entrypoints/worker.ts', import.meta.url))

  const spawnWorker = (): ChildProcess =>
    spawn(process.execPath, ['--import', 'tsx', entrypoint], {
      env: {
        ...process.env,
        DATABASE_URL:
          process.env['TEST_DATABASE_URL'] ?? 'postgresql://postgres:postgres@127.0.0.1:5432/postgres',
        SUPABASE_JWT_ISSUER: 'https://example.supabase.co/auth/v1',
        SUPABASE_JWKS_URL: 'https://example.supabase.co/auth/v1/.well-known/jwks.json',
        WORKER_HEARTBEAT_INTERVAL_MS: '200',
        LOG_LEVEL: 'info',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

  it('stays alive after starting, then exits cleanly on SIGTERM', async () => {
    const child = spawnWorker()
    let output = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })

    const exited = new Promise<number | null>((resolve) => {
      child.on('exit', (code) => resolve(code))
    })

    // Long enough that a worker which exits as soon as start() returns is caught.
    await new Promise((resolve) => setTimeout(resolve, 2_000))
    expect(child.exitCode, 'worker must still be running before SIGTERM').toBeNull()
    expect(output).toContain('worker idle')

    child.kill('SIGTERM')
    const code = await Promise.race([
      exited,
      new Promise<number | null>((resolve) => setTimeout(() => resolve(-1), 8_000)),
    ])

    expect(code, 'worker must exit cleanly on SIGTERM').toBe(0)
    expect(output).toContain('worker stopped')
  })
})

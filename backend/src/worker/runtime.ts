import type { Logger } from '../observability/logger.js'

/**
 * Worker runtime — lifecycle scaffolding only.
 *
 * This process will host the Durable Outbox pump (Contract Global Invariant 14,
 * Section 5): claim via `SELECT ... FOR UPDATE SKIP LOCKED`, lease with
 * `locked_by` and `lease_expires_at`, process, mark completed; a sweeper resets
 * expired leases to `failed_retryable`, and an attempt counter promotes to
 * `dead_letter`.
 *
 * None of that exists yet, and no fake queue semantics stand in for it:
 * `OutboxEvent` is a Layer 0 entity belonging to Phase 0B. What exists here is
 * the process lifecycle — start, report healthy and idle, shut down cleanly —
 * so the deployment shape (one image, two entrypoints) is real from the outset.
 *
 * The database access it will use is already correct for the job: a long-running
 * pool with no global statement timeout, and a transaction helper that cannot
 * silently split a claim from its follow-up writes (`src/db/transaction.ts`).
 */

export type WorkerState = 'stopped' | 'starting' | 'idle' | 'stopping'

export interface WorkerRuntime {
  start(): Promise<void>
  stop(): Promise<void>
  readonly state: WorkerState
}

export interface WorkerDependencies {
  readonly logger: Logger
  readonly heartbeatIntervalMs: number
  /**
   * Whether the heartbeat should hold the Node event loop open.
   *
   * A real worker process must stay alive between units of work, so the
   * entrypoint passes `true`. Tests leave it `false` so an un-stopped worker can
   * never hang the test runner. Getting this wrong is not subtle in production —
   * the process simply exits as soon as `start()` returns.
   */
  readonly keepProcessAlive?: boolean
  /** Released on shutdown. Optional so lifecycle is testable without a database. */
  readonly shutdown?: () => Promise<void>
}

export function createWorker(deps: WorkerDependencies): WorkerRuntime {
  let state: WorkerState = 'stopped'
  let heartbeat: NodeJS.Timeout | undefined

  return {
    get state(): WorkerState {
      return state
    },

    async start(): Promise<void> {
      if (state !== 'stopped') {
        deps.logger.warn({ state }, 'worker start ignored: already running')
        return
      }
      state = 'starting'
      deps.logger.info('worker starting')

      heartbeat = setInterval(() => {
        deps.logger.debug({ state }, 'worker heartbeat')
      }, deps.heartbeatIntervalMs)
      if (deps.keepProcessAlive !== true) {
        heartbeat.unref()
      }

      state = 'idle'
      deps.logger.info(
        'worker idle — no Outbox processing is configured yet (OutboxEvent is Phase 0B)',
      )
    },

    async stop(): Promise<void> {
      // Idempotent: shutdown signals can arrive more than once.
      if (state === 'stopped' || state === 'stopping') {
        return
      }
      state = 'stopping'
      deps.logger.info('worker stopping')

      if (heartbeat !== undefined) {
        clearInterval(heartbeat)
        heartbeat = undefined
      }
      if (deps.shutdown !== undefined) {
        await deps.shutdown()
      }

      state = 'stopped'
      deps.logger.info('worker stopped')
    },
  }
}

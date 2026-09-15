import type { ApiInstance } from '../types.js'

/**
 * Liveness and readiness.
 *
 * These are the only routes in Phase 0A. No product or domain endpoint exists,
 * because every such endpoint would be a protected operation and the centralized
 * resolver is not implemented.
 *
 * `checkDatabase` is injected rather than reaching for a pool directly, so route
 * modules never import database infrastructure — see `tests/architecture.test.ts`.
 */
export interface HealthDependencies {
  readonly checkDatabase: () => Promise<boolean>
}

export function registerHealthRoutes(app: ApiInstance, deps: HealthDependencies): void {
  // Liveness: the process is up and the event loop is turning. Never touches the
  // database — a database outage must not cause an orchestrator to kill the API.
  app.get('/health/live', async () => ({ status: 'live' }))

  // Readiness: the process can actually serve traffic.
  app.get('/health/ready', async (_request, reply) => {
    const databaseReachable = await deps.checkDatabase().catch(() => false)
    if (!databaseReachable) {
      return reply.status(503).send({ status: 'not_ready', checks: { database: 'unreachable' } })
    }
    return reply.status(200).send({ status: 'ready', checks: { database: 'ok' } })
  })
}

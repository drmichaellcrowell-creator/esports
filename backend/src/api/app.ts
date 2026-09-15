import Fastify from 'fastify'
import type { Logger } from '../observability/logger.js'
import { registerErrorHandling } from './errors.js'
import { registerHealthRoutes } from './routes/health.js'
import type { ApiInstance } from './types.js'

export interface ApiDependencies {
  readonly logger: Logger
  /** Readiness probe. Injected so route modules never import the pool. */
  readonly checkDatabase: () => Promise<boolean>
}

/**
 * Build the Fastify application.
 *
 * Phase 0A registers health routes and centralized error handling only. Adding a
 * product route here would require the authorization resolver, which does not
 * exist — so none is registered.
 */
export async function buildApi(deps: ApiDependencies): Promise<ApiInstance> {
  const app = Fastify({
    loggerInstance: deps.logger,
    // Trusting forwarded headers is a deployment decision, not a default.
    trustProxy: false,
    bodyLimit: 1_048_576,
  })

  registerErrorHandling(app)
  registerHealthRoutes(app, { checkDatabase: deps.checkDatabase })

  await app.ready()
  return app
}

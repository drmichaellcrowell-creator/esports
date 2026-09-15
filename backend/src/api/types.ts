import type { FastifyInstance, RawServerDefault } from 'fastify'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Logger } from '../observability/logger.js'

/**
 * The Fastify instance type for this application.
 *
 * Fastify parameterizes its instance by logger type, and we supply a concrete
 * pino `Logger` rather than Fastify's structural `FastifyBaseLogger`. Naming that
 * instantiation once keeps every registration function agreeing with `buildApi`.
 */
export type ApiInstance = FastifyInstance<
  RawServerDefault,
  IncomingMessage,
  ServerResponse<IncomingMessage>,
  Logger
>

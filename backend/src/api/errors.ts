import { AuthenticationError } from '../auth/errors.js'
import { AuthorizationResolverNotImplementedError } from '../authz/resolver.js'
import { ControlledOperationNotImplementedError } from '../authz/controlled-operation.js'
import { NonTransactionalAccessError, TransactionRequiredError } from '../db/transaction.js'
import type { ApiInstance } from './types.js'

export interface ErrorBody {
  readonly error: { readonly code: string; readonly message: string }
}

function body(code: string, message: string): ErrorBody {
  return { error: { code, message } }
}

/**
 * Centralized error handling.
 *
 * Two rules, both deliberate:
 *
 *  1. Client-facing responses carry a stable code and a generic message. Internal
 *     detail — stack traces, SQL, driver messages — is logged, never returned.
 *  2. Anything unrecognized becomes 500. There is no path where an unexpected
 *     error degrades into a success or a permissive default (Global Invariant 6).
 *
 * The not-implemented authorization errors map to 500 rather than 403 on purpose:
 * 403 would assert that a functioning resolver reached a decision. It did not —
 * the resolver does not exist. The request fails closed either way.
 */
export function registerErrorHandling(app: ApiInstance): void {
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send(body('not_found', `No route for ${request.method} ${request.url}`))
  })

  app.setErrorHandler((error: Error, request, reply) => {
    if (error instanceof AuthenticationError) {
      request.log.info({ code: error.code }, 'authentication rejected')
      reply.status(401).send(body(error.code, error.message))
      return
    }

    if (
      error instanceof AuthorizationResolverNotImplementedError ||
      error instanceof ControlledOperationNotImplementedError
    ) {
      request.log.error({ err: error }, 'protected operation attempted before Phase 0B')
      reply.status(500).send(body('not_implemented', 'This operation is not available.'))
      return
    }

    if (error instanceof NonTransactionalAccessError || error instanceof TransactionRequiredError) {
      request.log.error({ err: error }, 'transaction boundary violation')
      reply.status(500).send(body('internal_error', 'An internal error occurred.'))
      return
    }

    const statusCode = (error as { statusCode?: number }).statusCode
    if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
      request.log.info({ err: error }, 'client error')
      reply.status(statusCode).send(body('bad_request', error.message))
      return
    }

    request.log.error({ err: error }, 'unhandled error')
    reply.status(500).send(body('internal_error', 'An internal error occurred.'))
  })
}

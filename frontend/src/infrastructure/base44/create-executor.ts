/**
 * Builds the executor the production application runs with.
 *
 * When Base44 browser configuration is absent the application does not crash
 * and does not quietly work: every operation fails `unavailable`. That keeps
 * the existing preview behaviour — the shell renders with no backend behind
 * it — without a code path where an unconfigured app appears to authorize
 * anything.
 */

import type { OperationExecutor } from '../../application/operations/contract'
import { UnavailableOperationExecutor } from '../../application/operations/unavailable-executor'
import { createBase44FunctionInvoker } from './client'
import { readBase44BrowserConfig } from './config'
import { Base44OperationExecutor, type Base44OperationExecutorOptions } from './operation-executor'

export function createProductionOperationExecutor(
  options: Base44OperationExecutorOptions = {},
  env?: Record<string, unknown>,
): OperationExecutor {
  const config = env === undefined ? readBase44BrowserConfig() : readBase44BrowserConfig(env)
  if (config === undefined) {
    return new UnavailableOperationExecutor(
      'The application is not configured to reach its backend operations.',
    )
  }
  return new Base44OperationExecutor(createBase44FunctionInvoker(config), options)
}

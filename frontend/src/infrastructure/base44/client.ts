/**
 * The single Base44 SDK import site in the frontend.
 *
 * Profile Section 10.1 allows the browser exactly one dependency on the
 * substrate, and this directory is it. The CI frontend boundary check fails
 * the build if `@base44/sdk` is imported anywhere else under `src/`.
 *
 * Only the function-invocation surface is used. Entity CRUD is not imported,
 * not re-exported, and not reachable from here — profile Section 2.4 and
 * Contract Global Invariant 17 put governed entities behind backend functions,
 * and the empirical evidence behind that rule is that ordinary browser access
 * to a locked entity already returns 403/empty/404. Relying on the platform to
 * refuse is not the same as never asking.
 *
 * Elevated backend access is structurally unavailable here: the SDK exposes it
 * only through a client built from an inbound backend request, which a browser
 * cannot construct.
 */

import { createClient } from '@base44/sdk'
import type { Base44BrowserConfig } from './config'

/**
 * The narrow slice of the SDK this application may use.
 *
 * Typing the dependency down to one method is deliberate. Passing the full
 * client around would put entity handlers one property access away from any
 * code that holds it, and would let a future edit reach them without touching
 * an import statement — which is the only thing the CI check can see.
 */
export interface Base44FunctionInvoker {
  invoke(functionName: string, data?: Record<string, unknown>): Promise<unknown>
}

/** Creates the function-invocation surface for the configured app. */
export function createBase44FunctionInvoker(config: Base44BrowserConfig): Base44FunctionInvoker {
  const client = createClient(
    config.serverUrl === undefined
      ? { appId: config.appId }
      : { appId: config.appId, serverUrl: config.serverUrl },
  )
  return {
    invoke: (functionName, data) => client.functions.invoke(functionName, data),
  }
}

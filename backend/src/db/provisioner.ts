import { createPool, type Pool } from './pool.js'
import type { Environment } from '../config/env.js'

/**
 * Separate provisioner database authority.
 *
 * Amendment 001, database invariant I12: the API's database role holds no INSERT
 * on the organization or authorization-policy-version tables; only the
 * provisioner role does. That separation is only meaningful if the API process
 * never obtains this pool.
 *
 * Nothing under `src/api/` may import this module. `tests/architecture.test.ts`
 * enforces that as a test, not as a convention.
 *
 * The operations this pool will serve — `policy.bootstrap` and
 * `organization.provision` — are operator-entrypoint-only (Contract Section 10,
 * prohibition 18) and do not exist yet. Phase 0B.
 */
export class ProvisionerNotConfiguredError extends Error {
  constructor() {
    super(
      'PROVISIONER_DATABASE_URL is not configured. Provisioning authority is an ' +
        'infrastructure trust root and is never shared with the API credential.',
    )
    this.name = 'ProvisionerNotConfiguredError'
  }
}

export function createProvisionerPool(env: Environment): Pool {
  const connectionString = env.PROVISIONER_DATABASE_URL
  if (connectionString === undefined) {
    throw new ProvisionerNotConfiguredError()
  }
  return createPool({ connectionString, max: 2, applicationName: 'esports-provisioner' })
}

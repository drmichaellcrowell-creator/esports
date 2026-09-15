import { z } from 'zod'
import {
  databaseRoleFromUrl,
  FORBIDDEN_PRODUCTION_RUNTIME_ROLES,
  FORBIDDEN_RUNTIME_ROLES,
} from './database-identity.js'

/**
 * Environment validation.
 *
 * Contract Global Invariant 6 (default deny): malformed or missing configuration
 * must fail closed. `loadEnv` throws rather than substituting a permissive
 * default, and no caller is given a partially-valid configuration object.
 *
 * Secrets are never echoed: validation errors report the offending variable
 * NAME and the reason, never the value.
 */

const nonEmpty = z.string().trim().min(1)

const postgresUrl = nonEmpty.refine(
  (value) => value.startsWith('postgres://') || value.startsWith('postgresql://'),
  { message: 'must be a postgres:// or postgresql:// connection string' },
)

const httpsUrl = nonEmpty.refine(
  (value) => {
    try {
      return new URL(value).protocol === 'https:'
    } catch {
      return false
    }
  },
  { message: 'must be an absolute https:// URL' },
)

export const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    /**
     * Connection used by the API process. This identity is deliberately NOT the
     * provisioner: Amendment 001 database invariant I12 requires the API role to
     * hold no INSERT on the organization or policy-version tables.
     */
    DATABASE_URL: postgresUrl,

    /**
     * Connection used by the worker process. Optional: when unset the worker
     * uses DATABASE_URL, since it shares the `app_api` runtime identity. A
     * separate value exists so the worker can be pointed at its own pooled
     * connection without changing the API's.
     */
    WORKER_DATABASE_URL: postgresUrl.optional(),

    /**
     * Connection used only by operator-invoked provisioning entrypoints
     * (`policy.bootstrap`, `organization.provision` — Phase 0C). It is optional
     * here because those entrypoints do not exist yet, and the API must never
     * hold it. See `src/db/provisioner.ts`.
     */
    PROVISIONER_DATABASE_URL: postgresUrl.optional(),

    /**
     * Connection used only to apply migrations. Optional: when unset the
     * migrate entrypoint falls back to DATABASE_URL and says so. Migration
     * 0001 creates roles and therefore needs the project bootstrap credential,
     * not `app_api`.
     */
    MIGRATION_DATABASE_URL: postgresUrl.optional(),

    /** Supabase Auth JWT issuer, e.g. https://<project-ref>.supabase.co/auth/v1 */
    SUPABASE_JWT_ISSUER: httpsUrl,
    /** JWKS endpoint used to verify asymmetric Supabase Auth signatures. */
    SUPABASE_JWKS_URL: httpsUrl,
    /** Expected `aud` claim. Supabase issues `authenticated` for signed-in users. */
    SUPABASE_JWT_AUDIENCE: nonEmpty.default('authenticated'),

    API_HOST: nonEmpty.default('0.0.0.0'),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(8080),

    WORKER_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(100).max(600_000).default(30_000),
  })
  .superRefine((value, ctx) => {
    // Privilege separation is only real if the credentials actually differ.
    for (const name of ['PROVISIONER_DATABASE_URL', 'MIGRATION_DATABASE_URL'] as const) {
      const other = value[name]
      if (other !== undefined && other === value.DATABASE_URL) {
        ctx.addIssue({
          code: 'custom',
          path: [name],
          message: `must not equal DATABASE_URL — the API and ${
            name === 'PROVISIONER_DATABASE_URL' ? 'provisioner' : 'migration'
          } authority must be distinct database identities`,
        })
      }
    }

    if (
      value.PROVISIONER_DATABASE_URL !== undefined &&
      value.MIGRATION_DATABASE_URL === value.PROVISIONER_DATABASE_URL
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['MIGRATION_DATABASE_URL'],
        message:
          'must not equal PROVISIONER_DATABASE_URL — migration and genesis authority are distinct',
      })
    }

    // The API and worker must not be started with an authority that is not
    // theirs. Amendment 001 invariant I12 is a database grant, but handing the
    // API the provisioner's credential would route around it entirely.
    for (const name of ['DATABASE_URL', 'WORKER_DATABASE_URL'] as const) {
      const url = value[name]
      if (url === undefined) {
        continue
      }
      const role = databaseRoleFromUrl(url)
      if (role === undefined) {
        continue
      }
      if (FORBIDDEN_RUNTIME_ROLES.includes(role)) {
        ctx.addIssue({
          code: 'custom',
          path: [name],
          message:
            `must not connect as "${role}" — that is a provisioning, migration or ownership ` +
            'authority, never a runtime identity. Use the app_api role.',
        })
      } else if (
        value.NODE_ENV === 'production' &&
        FORBIDDEN_PRODUCTION_RUNTIME_ROLES.includes(role)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: [name],
          message: `must not connect as "${role}" in production — use the least-privileged app_api role`,
        })
      }
    }
  })

export type Environment = z.infer<typeof environmentSchema>

export class EnvironmentValidationError extends Error {
  public readonly variables: readonly string[]

  constructor(issues: readonly z.core.$ZodIssue[]) {
    const details = issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .sort()
    super(`Invalid environment configuration:\n  - ${details.join('\n  - ')}`)
    this.name = 'EnvironmentValidationError'
    this.variables = issues.map((issue) => String(issue.path[0] ?? '(root)'))
  }
}

/**
 * Validate configuration. Throws `EnvironmentValidationError` on any problem —
 * there is no partial or best-effort result.
 */
export function loadEnv(source: Record<string, string | undefined> = process.env): Environment {
  const result = environmentSchema.safeParse(source)
  if (!result.success) {
    throw new EnvironmentValidationError(result.error.issues)
  }
  return result.data
}

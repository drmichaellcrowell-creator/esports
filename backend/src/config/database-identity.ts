/**
 * Database identity inspection.
 *
 * The contract separates four database authorities (migration 0001): app_owner,
 * app_migrator, app_api and app_provisioner. That separation is only real if a
 * process cannot be started with the wrong one, so these helpers let startup
 * refuse a credential that does not belong to it.
 *
 * Nothing here logs, returns or throws a connection string — only role names,
 * which are not secrets.
 */

/** Named authorities created by migration 0001. */
export const DATABASE_ROLES = {
  owner: 'app_owner',
  migrator: 'app_migrator',
  api: 'app_api',
  provisioner: 'app_provisioner',
} as const

/**
 * Roles the API and worker must never run as.
 *
 * `app_provisioner` is genesis authority; `app_migrator` and `app_owner` can
 * create and own objects. None of them is a runtime identity.
 */
export const FORBIDDEN_RUNTIME_ROLES: readonly string[] = [
  DATABASE_ROLES.provisioner,
  DATABASE_ROLES.migrator,
  DATABASE_ROLES.owner,
]

/** Additionally forbidden in production, where a platform-admin role is never right. */
export const FORBIDDEN_PRODUCTION_RUNTIME_ROLES: readonly string[] = ['postgres', 'supabase_admin']

/**
 * Extract the PostgreSQL role from a connection string.
 *
 * Handles the pooled form, where the username carries a project reference after
 * a dot (`app_api.abcdefghijklmnop`); the role is the part before it. Returns
 * `undefined` when the URL has no username or cannot be parsed — callers treat
 * that as "unknown", never as "safe".
 */
export function databaseRoleFromUrl(url: string): string | undefined {
  let username: string
  try {
    username = decodeURIComponent(new URL(url).username)
  } catch {
    return undefined
  }
  if (username.length === 0) {
    return undefined
  }
  const [role] = username.split('.')
  return role !== undefined && role.length > 0 ? role : undefined
}

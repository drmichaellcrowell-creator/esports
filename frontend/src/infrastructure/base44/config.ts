/**
 * Non-secret Base44 browser configuration.
 *
 * Every `VITE_*` value is inlined into the browser bundle, so only public
 * configuration may appear here. The Base44 app id is public — it is visible
 * in the app editor's own URL — which is why it is the only value this module
 * reads.
 *
 * What must never appear: a workspace API key, a service-role token, a
 * Supabase secret, a database URL, or any user credential. Profile Section 2.4
 * states the rule the CI frontend boundary check enforces: elevated access
 * exists only inside backend functions, and no such credential reaches the
 * browser bundle or `.base44/environment.json`.
 */

/** Public configuration needed to reach the app's backend functions. */
export interface Base44BrowserConfig {
  readonly appId: string
  /** Optional origin override for a local development server. */
  readonly serverUrl?: string
}

export class Base44ConfigurationMissingError extends Error {
  constructor(variable: string) {
    super(
      `Base44 browser configuration is incomplete: ${variable} is not set. ` +
        'Operations are unavailable until it is.',
    )
    this.name = 'Base44ConfigurationMissingError'
  }
}

function readOptional(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/**
 * Reads the browser configuration, or `undefined` when it is absent.
 *
 * Absence is a legitimate state — the application shell renders in a preview
 * with no backend behind it — so this reports rather than throws, and the
 * caller substitutes a fail-closed executor.
 */
export function readBase44BrowserConfig(
  env: Record<string, unknown> = import.meta.env as unknown as Record<string, unknown>,
): Base44BrowserConfig | undefined {
  const appId = readOptional(env['VITE_BASE44_APP_ID'])
  if (appId === undefined) {
    return undefined
  }
  const serverUrl = readOptional(env['VITE_BASE44_SERVER_URL'])
  return serverUrl === undefined ? { appId } : { appId, serverUrl }
}

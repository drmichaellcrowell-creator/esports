import type { CheckResult } from '../db/verify.js'

/**
 * Supabase Auth configuration verification.
 *
 * Checks the project's published signing keys against what this backend will
 * actually accept. It reads only public material — a JWKS endpoint serves public
 * keys by definition — and needs no credential, no API key and no database.
 *
 * The check exists because the failure it catches is silent: a project still
 * signing with the legacy shared secret publishes no keys here, and every token
 * would be rejected at runtime with nothing obviously misconfigured.
 */

/** Algorithms the verifier accepts. Excludes `none` and every HMAC variant. */
const ACCEPTED_ALGORITHMS = ['RS256', 'ES256'] as const

interface JsonWebKey {
  readonly alg?: string
  readonly use?: string
  readonly kty?: string
  readonly kid?: string
  readonly [field: string]: unknown
}

/** Fields that would indicate private key material had been exposed. */
const PRIVATE_KEY_FIELDS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'k'] as const

export async function verifyAuthConfiguration(config: {
  readonly issuer: string
  readonly jwksUrl: string
  readonly audience: string
  readonly fetchImpl?: typeof fetch
}): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  const doFetch = config.fetchImpl ?? fetch

  let issuerHost: string
  let jwksHost: string
  try {
    issuerHost = new URL(config.issuer).host
    jwksHost = new URL(config.jwksUrl).host
  } catch {
    return [{ name: 'auth URLs are well formed', passed: false, detail: 'issuer or JWKS URL is not a URL' }]
  }

  results.push(
    issuerHost === jwksHost
      ? { name: 'issuer and JWKS share a host', passed: true, detail: issuerHost }
      : {
          name: 'issuer and JWKS share a host',
          passed: false,
          detail: `issuer ${issuerHost} but JWKS ${jwksHost} — tokens would be verified against another project`,
        },
  )

  results.push(
    new URL(config.jwksUrl).protocol === 'https:' && new URL(config.issuer).protocol === 'https:'
      ? { name: 'auth endpoints are https', passed: true, detail: 'both https' }
      : { name: 'auth endpoints are https', passed: false, detail: 'an auth endpoint is not https' },
  )

  let keys: JsonWebKey[]
  try {
    const response = await doFetch(config.jwksUrl)
    if (!response.ok) {
      return [
        ...results,
        { name: 'JWKS endpoint is reachable', passed: false, detail: `HTTP ${response.status}` },
      ]
    }
    const body = (await response.json()) as { keys?: JsonWebKey[] }
    keys = body.keys ?? []
    results.push({ name: 'JWKS endpoint is reachable', passed: true, detail: `HTTP ${response.status}` })
  } catch (error) {
    return [
      ...results,
      {
        name: 'JWKS endpoint is reachable',
        passed: false,
        detail: error instanceof Error ? error.message : 'request failed',
      },
    ]
  }

  const usable = keys.filter(
    (key) =>
      typeof key.alg === 'string' &&
      (ACCEPTED_ALGORITHMS as readonly string[]).includes(key.alg) &&
      key.use === 'sig',
  )
  results.push(
    usable.length > 0
      ? {
          name: 'project publishes a usable asymmetric signing key',
          passed: true,
          detail: `${usable.length} of ${keys.length}: ${usable.map((k) => `${k.alg} (${k.kty})`).join(', ')}`,
        }
      : {
          name: 'project publishes a usable asymmetric signing key',
          passed: false,
          detail:
            keys.length === 0
              ? 'JWKS is empty — the project is still signing with the legacy shared secret, so every token would be rejected'
              : `${keys.length} key(s), none RS256/ES256 with use=sig`,
        },
  )

  const leaked = keys.filter((key) => PRIVATE_KEY_FIELDS.some((field) => field in key))
  results.push(
    leaked.length === 0
      ? { name: 'JWKS exposes public keys only', passed: true, detail: 'no private key material' }
      : {
          name: 'JWKS exposes public keys only',
          passed: false,
          detail: `${leaked.length} key(s) carry private material — rotate immediately`,
        },
  )

  results.push(
    config.audience.trim().length > 0
      ? { name: 'audience is configured', passed: true, detail: config.audience }
      : { name: 'audience is configured', passed: false, detail: 'empty' },
  )

  return results
}

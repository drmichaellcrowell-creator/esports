import { describe, expect, it } from 'vitest'
import { verifyAuthConfiguration } from '../src/auth/verify-config.js'

/**
 * Offline tests for the auth-configuration check. The fetch implementation is
 * injected, so these run in CI with no network and no project.
 */
const ISSUER = 'https://project.supabase.co/auth/v1'
const JWKS = 'https://project.supabase.co/auth/v1/.well-known/jwks.json'

const ES256_PUBLIC = {
  alg: 'ES256',
  crv: 'P-256',
  ext: true,
  key_ops: ['verify'],
  kid: 'key-1',
  kty: 'EC',
  use: 'sig',
  x: 'ssotufflK0o6YlWU3YoIsFtTumij95yjaukQHYKH78U',
  y: 'E4hS2VY2mEYCq2vWsiJKmOXUZnPEh4LSPTLD1z2JHD0',
}

const stubFetch = (body: unknown, status = 200): typeof fetch =>
  (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) as Response) as unknown as typeof fetch

const failures = async (
  body: unknown,
  overrides: Partial<Parameters<typeof verifyAuthConfiguration>[0]> = {},
  status = 200,
): Promise<string[]> => {
  const results = await verifyAuthConfiguration({
    issuer: ISSUER,
    jwksUrl: JWKS,
    audience: 'authenticated',
    fetchImpl: stubFetch(body, status),
    ...overrides,
  })
  return results.filter((r) => !r.passed).map((r) => r.name)
}

describe('Supabase Auth configuration verification', () => {
  it('passes for a project publishing an ES256 signing key', async () => {
    expect(await failures({ keys: [ES256_PUBLIC] })).toEqual([])
  })

  it('passes for RS256', async () => {
    expect(
      await failures({ keys: [{ ...ES256_PUBLIC, alg: 'RS256', kty: 'RSA' }] }),
    ).toEqual([])
  })

  it('FAILS when the JWKS is empty — the legacy shared secret is still in force', async () => {
    const results = await verifyAuthConfiguration({
      issuer: ISSUER,
      jwksUrl: JWKS,
      audience: 'authenticated',
      fetchImpl: stubFetch({ keys: [] }),
    })
    const key = results.find((r) => r.name.includes('usable asymmetric signing key'))
    expect(key?.passed).toBe(false)
    expect(key?.detail).toContain('legacy shared secret')
  })

  it.each(['HS256', 'none'])('FAILS when the only key is %s', async (alg) => {
    expect(await failures({ keys: [{ ...ES256_PUBLIC, alg }] })).toContain(
      'project publishes a usable asymmetric signing key',
    )
  })

  it('FAILS when a key is not marked for signature use', async () => {
    expect(await failures({ keys: [{ ...ES256_PUBLIC, use: 'enc' }] })).toContain(
      'project publishes a usable asymmetric signing key',
    )
  })

  it.each(['d', 'p', 'q', 'k'])('FAILS when a key leaks private material (%s)', async (field) => {
    expect(await failures({ keys: [{ ...ES256_PUBLIC, [field]: 'SECRET' }] })).toContain(
      'JWKS exposes public keys only',
    )
  })

  it('FAILS when the JWKS endpoint is unreachable', async () => {
    expect(await failures({}, {}, 404)).toContain('JWKS endpoint is reachable')
  })

  it('FAILS when issuer and JWKS belong to different projects', async () => {
    expect(
      await failures(
        { keys: [ES256_PUBLIC] },
        { jwksUrl: 'https://other-project.supabase.co/auth/v1/.well-known/jwks.json' },
      ),
    ).toContain('issuer and JWKS share a host')
  })

  it('FAILS when an auth endpoint is not https', async () => {
    expect(
      await failures({ keys: [ES256_PUBLIC] }, { issuer: 'http://project.supabase.co/auth/v1' }),
    ).toContain('auth endpoints are https')
  })

  it('FAILS when the audience is empty', async () => {
    expect(await failures({ keys: [ES256_PUBLIC] }, { audience: '  ' })).toContain(
      'audience is configured',
    )
  })
})

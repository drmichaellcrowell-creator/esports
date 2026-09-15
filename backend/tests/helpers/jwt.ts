import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet, type JWTVerifyGetKey } from 'jose'

/**
 * Test key material for JWT verification.
 *
 * This produces a *real* key pair and a *real* local JWKS, so tests exercise the
 * same `jwtVerify` path production uses — genuine signatures, issuer, audience,
 * expiry and algorithm checks. Nothing about production verification is relaxed:
 * only the source of the public keys differs.
 */
export const TEST_ISSUER = 'https://project.supabase.co/auth/v1'
export const TEST_AUDIENCE = 'authenticated'

export interface TestKeys {
  readonly keySource: JWTVerifyGetKey
  sign(claims: Record<string, unknown>, options?: SignOptions): Promise<string>
  /** Signs with a different key that the verifier does not trust. */
  signWithForeignKey(claims: Record<string, unknown>): Promise<string>
}

export interface SignOptions {
  readonly issuer?: string
  readonly audience?: string
  readonly expiresInSeconds?: number
  readonly issuedAtSeconds?: number
  readonly subject?: string | null
  readonly algorithm?: string
}

export async function createTestKeys(): Promise<TestKeys> {
  const trusted = await generateKeyPair('RS256', { extractable: true })
  const foreign = await generateKeyPair('RS256', { extractable: true })

  const trustedJwk = { ...(await exportJWK(trusted.publicKey)), kid: 'test-key-1', alg: 'RS256' }
  const keySource = createLocalJWKSet({ keys: [trustedJwk] })

  const build = (claims: Record<string, unknown>, options: SignOptions = {}): SignJWT => {
    const nowSeconds = Math.floor(Date.now() / 1000)
    const issuedAt = options.issuedAtSeconds ?? nowSeconds
    const jwt = new SignJWT(claims)
      .setProtectedHeader({ alg: options.algorithm ?? 'RS256', kid: 'test-key-1' })
      .setIssuedAt(issuedAt)
      .setIssuer(options.issuer ?? TEST_ISSUER)
      .setAudience(options.audience ?? TEST_AUDIENCE)
      .setExpirationTime(issuedAt + (options.expiresInSeconds ?? 3600))
    if (options.subject !== null) {
      jwt.setSubject(options.subject ?? 'auth-user-0001')
    }
    return jwt
  }

  return {
    keySource,
    sign: (claims, options) => build(claims, options).sign(trusted.privateKey),
    signWithForeignKey: (claims) => build(claims).sign(foreign.privateKey),
  }
}

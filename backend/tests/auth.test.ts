import { describe, expect, it, beforeAll } from 'vitest'
import {
  createJwtVerifier,
  extractBearerToken,
  type JwtVerifier,
} from '../src/auth/verifier.js'
import {
  InvalidTokenError,
  MalformedCredentialsError,
  MissingCredentialsError,
} from '../src/auth/errors.js'
import { createTestKeys, TEST_AUDIENCE, TEST_ISSUER, type TestKeys } from './helpers/jwt.js'

describe('authentication boundary', () => {
  let keys: TestKeys
  let verifier: JwtVerifier

  beforeAll(async () => {
    keys = await createTestKeys()
    verifier = createJwtVerifier({
      keySource: keys.keySource,
      issuer: TEST_ISSUER,
      audience: TEST_AUDIENCE,
    })
  })

  describe('rejects missing, malformed and invalid credentials', () => {
    it.each([undefined, null, '', '   '])('missing Authorization header: %s', (header) => {
      expect(() => extractBearerToken(header as string | undefined)).toThrow(MissingCredentialsError)
    })

    it.each([
      'Basic abc123',
      'Bearer',
      'Bearer ',
      'bearer lowercase.scheme.token',
      'Bearer two tokens',
      'Bearer has spaces in it',
      'Token abc.def.ghi',
    ])('malformed Authorization header: %s', (header) => {
      expect(() => extractBearerToken(header)).toThrow(MalformedCredentialsError)
    })

    it('accepts a well-formed bearer header', () => {
      expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi')
    })

    it('rejects a token that is not a JWT at all', async () => {
      await expect(verifier.verify('not-a-jwt')).rejects.toThrow(InvalidTokenError)
    })

    it('rejects an empty token', async () => {
      await expect(verifier.verify('')).rejects.toThrow(MissingCredentialsError)
    })

    it('rejects a token signed by an untrusted key', async () => {
      const token = await keys.signWithForeignKey({})
      await expect(verifier.verify(token)).rejects.toThrow(InvalidTokenError)
    })

    it('rejects a tampered payload', async () => {
      const token = await keys.sign({})
      const [header, , signature] = token.split('.')
      const forged = Buffer.from(JSON.stringify({ sub: 'attacker' })).toString('base64url')
      await expect(verifier.verify(`${header}.${forged}.${signature}`)).rejects.toThrow(
        InvalidTokenError,
      )
    })

    it('rejects an expired token', async () => {
      const token = await keys.sign({}, { issuedAtSeconds: 1_000, expiresInSeconds: 60 })
      await expect(verifier.verify(token)).rejects.toThrow(InvalidTokenError)
    })

    it('rejects a token from the wrong issuer', async () => {
      const token = await keys.sign({}, { issuer: 'https://attacker.example/auth/v1' })
      await expect(verifier.verify(token)).rejects.toThrow(InvalidTokenError)
    })

    it('rejects a token for the wrong audience', async () => {
      const token = await keys.sign({}, { audience: 'some-other-service' })
      await expect(verifier.verify(token)).rejects.toThrow(InvalidTokenError)
    })

    it('rejects an unsigned (alg: none) token', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
      const payload = Buffer.from(
        JSON.stringify({
          sub: 'auth-user-0001',
          iss: TEST_ISSUER,
          aud: TEST_AUDIENCE,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).toString('base64url')
      await expect(verifier.verify(`${header}.${payload}.`)).rejects.toThrow(InvalidTokenError)
    })

    it('rejects a token with no subject claim', async () => {
      const token = await keys.sign({}, { subject: null })
      await expect(verifier.verify(token)).rejects.toThrow(InvalidTokenError)
    })

    it('does not reveal why verification failed', async () => {
      const expired = await keys.sign({}, { issuedAtSeconds: 1_000, expiresInSeconds: 60 })
      const foreign = await keys.signWithForeignKey({})
      const expiredError = await verifier.verify(expired).catch((e: Error) => e)
      const foreignError = await verifier.verify(foreign).catch((e: Error) => e)
      for (const error of [expiredError, foreignError]) {
        expect((error as Error).message).not.toMatch(/expired|signature|issuer/i)
      }
    })
  })

  describe('identity is derived only from verified claims', () => {
    it('takes authUserId from the verified sub claim', async () => {
      const token = await keys.sign({}, { subject: 'auth-user-9999' })
      const identity = await verifier.verify(token)
      expect(identity.authUserId).toBe('auth-user-9999')
      expect(identity.issuedAt).toBeInstanceOf(Date)
      expect(identity.expiresAt.getTime()).toBeGreaterThan(identity.issuedAt.getTime())
    })

    it('ignores a client-authored user id travelling alongside the real claim', async () => {
      const token = await keys.sign(
        { user_id: 'attacker-supplied', sub_alias: 'attacker-supplied', id: 'attacker-supplied' },
        { subject: 'auth-user-real' },
      )
      const identity = await verifier.verify(token)
      expect(identity.authUserId).toBe('auth-user-real')
      expect(JSON.stringify(identity)).not.toContain('attacker-supplied')
    })

    it('returns a frozen identity that cannot be mutated after verification', async () => {
      const identity = await verifier.verify(await keys.sign({}))
      expect(Object.isFrozen(identity)).toBe(true)
    })
  })

  describe('provider-native role data never becomes application authority', () => {
    it('drops role, app_metadata and user_metadata from the identity', async () => {
      const token = await keys.sign(
        {
          role: 'service_role',
          app_metadata: { role: 'admin', provider: 'email', claims_admin: true },
          user_metadata: { role: 'owner' },
          is_super_admin: true,
        },
        { subject: 'auth-user-0001' },
      )
      const identity = await verifier.verify(token)

      expect(Object.keys(identity).sort()).toEqual(['authUserId', 'expiresAt', 'issuedAt'])
      for (const forbidden of ['role', 'app_metadata', 'user_metadata', 'is_super_admin']) {
        expect(identity).not.toHaveProperty(forbidden)
      }
      const serialized = JSON.stringify(identity)
      expect(serialized).not.toContain('service_role')
      expect(serialized).not.toContain('admin')
      expect(serialized).not.toContain('owner')
    })

    it('verifies identically whether or not provider role claims are present', async () => {
      const withRole = await verifier.verify(
        await keys.sign({ role: 'service_role' }, { subject: 'auth-user-0001' }),
      )
      const withoutRole = await verifier.verify(await keys.sign({}, { subject: 'auth-user-0001' }))
      expect(withRole.authUserId).toBe(withoutRole.authUserId)
    })
  })
})

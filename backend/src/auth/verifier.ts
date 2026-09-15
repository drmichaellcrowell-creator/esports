import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import type { Environment } from '../config/env.js'
import { createAuthenticatedIdentity, type AuthenticatedIdentity } from './identity.js'
import { InvalidTokenError, MalformedCredentialsError, MissingCredentialsError } from './errors.js'

/**
 * Supabase Auth JWT verification.
 *
 * Testability without weakening production: the key source is injected as a
 * `JWTVerifyGetKey`. Production supplies a remote JWKS; tests supply a local JWKS
 * built from a generated key pair. Both paths run the *same* verification —
 * real signature checking, issuer, audience, expiry and algorithm allowlist. No
 * bypass flag, no "trust this token in test mode" branch exists.
 */

/**
 * Asymmetric algorithms only. Pinning this list rejects `alg: none` outright and
 * closes the HS/RS confusion attack, where a token is signed with a public key
 * that the verifier would otherwise accept as an HMAC secret.
 */
const PERMITTED_ALGORITHMS = ['RS256', 'ES256'] as const

export interface JwtVerifier {
  verify(token: string): Promise<AuthenticatedIdentity>
}

export interface JwtVerifierOptions {
  readonly keySource: JWTVerifyGetKey
  readonly issuer: string
  readonly audience: string
  readonly algorithms?: readonly string[]
  readonly clockToleranceSeconds?: number
}

export function createJwtVerifier(options: JwtVerifierOptions): JwtVerifier {
  const algorithms = [...(options.algorithms ?? PERMITTED_ALGORITHMS)]

  return {
    async verify(token: string): Promise<AuthenticatedIdentity> {
      if (typeof token !== 'string' || token.trim().length === 0) {
        throw new MissingCredentialsError()
      }

      let payload
      try {
        const verified = await jwtVerify(token, options.keySource, {
          issuer: options.issuer,
          audience: options.audience,
          algorithms,
          clockTolerance: options.clockToleranceSeconds ?? 0,
          requiredClaims: ['sub', 'iat', 'exp'],
        })
        payload = verified.payload
      } catch (error) {
        // Never surface the underlying reason to the caller: distinguishing
        // "expired" from "bad signature" from "wrong issuer" is an oracle an
        // attacker can probe. The detail is preserved as `cause` so the error
        // handler can log it server-side, and is absent from `message`.
        throw new InvalidTokenError(undefined, { cause: error })
      }

      const subject = payload.sub
      if (typeof subject !== 'string' || subject.trim().length === 0) {
        throw new InvalidTokenError('Token has no usable subject claim.')
      }
      if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') {
        throw new InvalidTokenError('Token is missing required temporal claims.')
      }

      // Only verified claims are read, and only these. `role`, `app_metadata` and
      // `user_metadata` are deliberately not consulted and have no field to
      // occupy on AuthenticatedIdentity (Global Invariant 5).
      return createAuthenticatedIdentity({
        authUserId: subject,
        issuedAt: new Date(payload.iat * 1000),
        expiresAt: new Date(payload.exp * 1000),
      })
    },
  }
}

/** Production verifier: remote JWKS from the configured Supabase project. */
export function createSupabaseJwtVerifier(env: Environment): JwtVerifier {
  return createJwtVerifier({
    keySource: createRemoteJWKSet(new URL(env.SUPABASE_JWKS_URL)),
    issuer: env.SUPABASE_JWT_ISSUER,
    audience: env.SUPABASE_JWT_AUDIENCE,
  })
}

const BEARER_PATTERN = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/

/**
 * Extract a bearer token from an Authorization header.
 * Missing and malformed are distinct failures, and neither is ever "allow".
 */
export function extractBearerToken(header: string | undefined | null): string {
  if (header === undefined || header === null || header.trim().length === 0) {
    throw new MissingCredentialsError()
  }
  const match = BEARER_PATTERN.exec(header.trim())
  if (match === null || match[1] === undefined) {
    throw new MalformedCredentialsError()
  }
  return match[1]
}

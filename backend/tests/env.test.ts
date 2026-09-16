import { describe, expect, it } from 'vitest'
import { EnvironmentValidationError, loadEnv } from '../src/config/env.js'

const VALID = {
  DATABASE_URL: 'postgresql://api_user:secret@localhost:5432/esports',
  SUPABASE_JWT_ISSUER: 'https://project.supabase.co/auth/v1',
  SUPABASE_JWKS_URL: 'https://project.supabase.co/auth/v1/.well-known/jwks.json',
} as const

describe('environment validation fails closed', () => {
  it('accepts a complete configuration and applies documented defaults', () => {
    const env = loadEnv({ ...VALID })
    expect(env.DATABASE_URL).toBe(VALID.DATABASE_URL)
    expect(env.NODE_ENV).toBe('development')
    expect(env.API_PORT).toBe(8080)
    expect(env.SUPABASE_JWT_AUDIENCE).toBe('authenticated')
    expect(env.PROVISIONER_DATABASE_URL).toBeUndefined()
  })

  it.each([
    ['DATABASE_URL empty', { DATABASE_URL: '' }],
    ['DATABASE_URL not a postgres URL', { DATABASE_URL: 'mysql://localhost/db' }],
    ['SUPABASE_JWT_ISSUER not https', { SUPABASE_JWT_ISSUER: 'http://insecure.example' }],
    ['SUPABASE_JWKS_URL not a URL', { SUPABASE_JWKS_URL: 'not-a-url' }],
    ['API_PORT not numeric', { API_PORT: 'eighty-eighty' }],
    ['API_PORT out of range', { API_PORT: '70000' }],
    ['NODE_ENV not a known value', { NODE_ENV: 'staging' }],
    ['LOG_LEVEL not a known value', { LOG_LEVEL: 'chatty' }],
  ])('rejects: %s', (_label, override) => {
    expect(() => loadEnv({ ...VALID, ...(override as Record<string, string | undefined>) })).toThrow(
      EnvironmentValidationError,
    )
  })

  it.each(['DATABASE_URL', 'SUPABASE_JWT_ISSUER', 'SUPABASE_JWKS_URL'])(
    'rejects when required variable %s is absent entirely',
    (variable) => {
      const source: Record<string, string | undefined> = { ...VALID }
      delete source[variable]
      expect(() => loadEnv(source)).toThrow(EnvironmentValidationError)
    },
  )

  it('never substitutes a permissive default for a missing required value', () => {
    // The failure is a thrown error, not a usable object with a fallback.
    let result: unknown
    try {
      result = loadEnv({})
    } catch (error) {
      result = error
    }
    expect(result).toBeInstanceOf(EnvironmentValidationError)
  })

  it('refuses a provisioner credential identical to the API credential', () => {
    expect(() =>
      loadEnv({ ...VALID, PROVISIONER_DATABASE_URL: VALID.DATABASE_URL }),
    ).toThrow(/must not equal DATABASE_URL/)
  })

  it('accepts a provisioner credential that is genuinely distinct', () => {
    const env = loadEnv({
      ...VALID,
      PROVISIONER_DATABASE_URL: 'postgresql://provisioner:other@localhost:5432/esports',
    })
    expect(env.PROVISIONER_DATABASE_URL).not.toBe(env.DATABASE_URL)
  })

  it('does not echo secret values in validation errors', () => {
    const secret = 'postgresql://user:SUPER_SECRET_PASSWORD@host/db'
    try {
      loadEnv({ ...VALID, DATABASE_URL: secret, API_PORT: 'nope' })
      expect.unreachable('expected validation to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentValidationError)
      expect((error as Error).message).not.toContain('SUPER_SECRET_PASSWORD')
      expect((error as EnvironmentValidationError).variables).toContain('API_PORT')
    }
  })
})

describe('database identity separation', () => {
  const BASE = {
    SUPABASE_JWT_ISSUER: 'https://project.supabase.co/auth/v1',
    SUPABASE_JWKS_URL: 'https://project.supabase.co/auth/v1/.well-known/jwks.json',
  } as const
  const api = 'postgresql://app_api:PLACEHOLDER@db.example.com:5432/postgres'
  const provisioner = 'postgresql://app_provisioner:PLACEHOLDER@db.example.com:5432/postgres'
  const migrator = 'postgresql://app_migrator:PLACEHOLDER@db.example.com:5432/postgres'

  it('accepts the intended three distinct identities', () => {
    const env = loadEnv({
      ...BASE,
      DATABASE_URL: api,
      PROVISIONER_DATABASE_URL: provisioner,
      MIGRATION_DATABASE_URL: migrator,
    })
    expect(env.DATABASE_URL).not.toBe(env.PROVISIONER_DATABASE_URL)
    expect(env.DATABASE_URL).not.toBe(env.MIGRATION_DATABASE_URL)
    expect(env.MIGRATION_DATABASE_URL).not.toBe(env.PROVISIONER_DATABASE_URL)
  })

  it.each([
    ['DATABASE_URL', 'PROVISIONER_DATABASE_URL'],
    ['DATABASE_URL', 'MIGRATION_DATABASE_URL'],
  ])('rejects %s equal to %s', (first, second) => {
    expect(() =>
      loadEnv({ ...BASE, [first]: api, [second]: api } as Record<string, string>),
    ).toThrow(EnvironmentValidationError)
  })

  it('rejects migration and provisioner sharing one credential', () => {
    expect(() =>
      loadEnv({
        ...BASE,
        DATABASE_URL: api,
        MIGRATION_DATABASE_URL: provisioner,
        PROVISIONER_DATABASE_URL: provisioner,
      }),
    ).toThrow(EnvironmentValidationError)
  })

  describe('the API refuses a credential that is not its own', () => {
    it.each([
      ['app_provisioner', provisioner],
      ['app_migrator', migrator],
      ['app_owner', 'postgresql://app_owner:PLACEHOLDER@db.example.com:5432/postgres'],
    ])('refuses to start the API as %s', (role, url) => {
      expect(() => loadEnv({ ...BASE, DATABASE_URL: url })).toThrow(
        new RegExp(`must not connect as "${role}"`),
      )
    })

    it.each([
      ['app_provisioner', provisioner],
      ['app_migrator', migrator],
    ])('refuses to start the worker as %s', (_role, url) => {
      expect(() =>
        loadEnv({ ...BASE, DATABASE_URL: api, WORKER_DATABASE_URL: url }),
      ).toThrow(EnvironmentValidationError)
    })

    it('recognises the pooled username form role.project-ref', () => {
      // Through the connection pooler the username carries a project reference.
      expect(() =>
        loadEnv({
          ...BASE,
          DATABASE_URL:
            'postgresql://app_provisioner.YOUR_PROJECT_REF:PLACEHOLDER@aws-0-us-east-1.pooler.supabase.com:5432/postgres',
        }),
      ).toThrow(/must not connect as "app_provisioner"/)
    })

    it('accepts the pooled username form for app_api', () => {
      const env = loadEnv({
        ...BASE,
        DATABASE_URL:
          'postgresql://app_api.YOUR_PROJECT_REF:PLACEHOLDER@aws-0-us-east-1.pooler.supabase.com:5432/postgres',
      })
      expect(env.DATABASE_URL).toContain('app_api')
    })

    it('refuses a platform administrative role in production', () => {
      expect(() =>
        loadEnv({
          ...BASE,
          NODE_ENV: 'production',
          DATABASE_URL: 'postgresql://postgres:PLACEHOLDER@db.example.com:5432/postgres',
        }),
      ).toThrow(/must not connect as "postgres" in production/)
    })

    it('allows a platform role outside production, for local development', () => {
      const env = loadEnv({
        ...BASE,
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://postgres:PLACEHOLDER@127.0.0.1:5432/postgres',
      })
      expect(env.NODE_ENV).toBe('development')
    })
  })
})

import { afterEach, describe, expect, it } from 'vitest'
import type { ApiInstance } from '../src/api/types.js'
import { buildApi } from '../src/api/app.js'
import { createSilentLogger } from '../src/observability/logger.js'

describe('API substrate', () => {
  let app: ApiInstance | undefined

  afterEach(async () => {
    await app?.close()
    app = undefined
  })

  const boot = async (checkDatabase: () => Promise<boolean>): Promise<ApiInstance> => {
    const instance = await buildApi({ logger: createSilentLogger(), checkDatabase })
    app = instance
    return instance
  }

  it('boots', async () => {
    const instance = await boot(async () => true)
    expect(instance.server.listening).toBe(false)
    expect(typeof instance.inject).toBe('function')
  })

  it('serves liveness', async () => {
    const instance = await boot(async () => true)
    const response = await instance.inject({ method: 'GET', url: '/health/live' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'live' })
  })

  it('serves liveness even when the database is unreachable', async () => {
    const instance = await boot(async () => false)
    const response = await instance.inject({ method: 'GET', url: '/health/live' })
    expect(response.statusCode).toBe(200)
  })

  it('reports ready when the database check passes', async () => {
    const instance = await boot(async () => true)
    const response = await instance.inject({ method: 'GET', url: '/health/ready' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ status: 'ready', checks: { database: 'ok' } })
  })

  it('reports 503 when the database check fails', async () => {
    const instance = await boot(async () => false)
    const response = await instance.inject({ method: 'GET', url: '/health/ready' })
    expect(response.statusCode).toBe(503)
    expect(response.json()).toMatchObject({ status: 'not_ready' })
  })

  it('reports 503 rather than 500 when the database check throws', async () => {
    const instance = await boot(async () => {
      throw new Error('connection refused to 10.0.0.1:5432')
    })
    const response = await instance.inject({ method: 'GET', url: '/health/ready' })
    expect(response.statusCode).toBe(503)
    expect(response.body).not.toContain('10.0.0.1')
  })

  it('returns a structured 404 for unknown routes', async () => {
    const instance = await boot(async () => true)
    const response = await instance.inject({ method: 'GET', url: '/nope' })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ error: { code: 'not_found' } })
  })

  it('exposes no product or domain routes', async () => {
    const instance = await boot(async () => true)
    const routes = instance
      .printRoutes({ commonPrefix: false })
      .split('\n')
      .filter((line) => line.includes('('))
    // Every registered route is a health probe. A product route would require
    // the authorization resolver, which does not exist yet.
    const nonHealth = routes.filter((line) => !line.includes('health'))
    expect(nonHealth).toEqual([])
  })

  it.each([
    '/organizations',
    '/memberships',
    '/audit-log',
    '/outbox',
    '/policy',
    '/api/v1/organizations',
  ])('has no endpoint at %s', async (url) => {
    const instance = await boot(async () => true)
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const response = await instance.inject({ method, url })
      expect(response.statusCode).toBe(404)
    }
  })
})

import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  UuidUnavailableError,
  isCorrelationId,
  isUuid,
  newCorrelationId,
  newUuid,
  now,
} from './ids'

describe('application identity', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('generates syntactically valid, unique UUIDs', () => {
    const generated = new Set(Array.from({ length: 500 }, () => newUuid()))
    expect(generated.size).toBe(500)
    for (const value of generated) {
      expect(isUuid(value)).toBe(true)
    }
  })

  it('generates correlation ids that are UUIDs', () => {
    const correlationId = newCorrelationId()
    expect(isCorrelationId(correlationId)).toBe(true)
    expect(isUuid(correlationId)).toBe(true)
  })

  it('fails closed rather than weakening identity when no CSPRNG exists', () => {
    vi.stubGlobal('crypto', {})
    expect(() => newUuid()).toThrow(UuidUnavailableError)
  })

  it('never falls back to a non-crypto source', () => {
    vi.stubGlobal('crypto', { randomUUID: undefined })
    expect(() => newCorrelationId()).toThrow(UuidUnavailableError)
  })

  it('rejects values that merely look like identifiers', () => {
    expect(isUuid('not-a-uuid')).toBe(false)
    expect(isUuid('')).toBe(false)
    expect(isUuid(undefined)).toBe(false)
    expect(isUuid(12345)).toBe(false)
    // A nil UUID carries no entropy and is never a legitimate application id.
    expect(isUuid('00000000-0000-0000-0000-000000000000')).toBe(false)
  })

  it('produces an application-owned ISO timestamp', () => {
    expect(now()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })
})

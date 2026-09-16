/**
 * Application-generated identity and time.
 *
 * Substrate-neutral by construction: nothing here knows what persists the
 * values it produces.
 *
 * The Base44 v1 profile (Section 9, "Identity and provenance portability")
 * requires every portable object to carry an application-generated UUID,
 * application-owned timestamps, and a correlation id shared by every record a
 * single operation writes. Section 2.2 is why: platform metadata was
 * empirically shown to be incomplete — `created_by` email is not reliably
 * returned — so provenance that matters lives in application-owned fields and
 * a platform id is never the sole portable identity.
 */

/** An application-generated UUID. Never a Base44 platform id. */
export type Uuid = string & { readonly __brand: 'Uuid' }

/**
 * Identifies one logical operation. Every record that operation writes carries
 * it, which is what makes the profile's reconciliation sweeps able to join a
 * domain mutation to its audit record (Section 6.3, sweep R9).
 */
export type CorrelationId = string & { readonly __brand: 'CorrelationId' }

/** An application-owned ISO-8601 timestamp. */
export type IsoTimestamp = string & { readonly __brand: 'IsoTimestamp' }

/**
 * Thrown when the runtime cannot generate a cryptographically random UUID.
 *
 * This fails closed rather than falling back to `Math.random`. A weak
 * identifier would satisfy the type but silently break the uniqueness the
 * profile depends on for correlation and for portable identity — a collision
 * would join two unrelated operations' records together.
 */
export class UuidUnavailableError extends Error {
  constructor() {
    super(
      'A cryptographically random UUID is unavailable in this runtime. ' +
        'Application identity must not fall back to a weak source.',
    )
    this.name = 'UuidUnavailableError'
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-9a-f][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Generates an application UUID using the platform's own CSPRNG-backed
 * `crypto.randomUUID`, which every target runtime provides in a secure
 * context. Deliberately not a dependency: adding one to produce a value the
 * runtime already produces is cost without benefit.
 */
export function newUuid(): Uuid {
  const webCrypto: Crypto | undefined = globalThis.crypto
  if (typeof webCrypto?.randomUUID !== 'function') {
    throw new UuidUnavailableError()
  }
  return webCrypto.randomUUID() as Uuid
}

/** Generates a correlation id for one operation invocation. */
export function newCorrelationId(): CorrelationId {
  return newUuid() as string as CorrelationId
}

/** The current application-owned timestamp. */
export function now(): IsoTimestamp {
  return new Date().toISOString() as IsoTimestamp
}

/** Whether a value is a syntactically valid UUID. Does not assert provenance. */
export function isUuid(value: unknown): value is Uuid {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

/** Whether a value is a syntactically valid correlation id. */
export function isCorrelationId(value: unknown): value is CorrelationId {
  return isUuid(value)
}

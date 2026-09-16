/**
 * The operation registry.
 *
 * Two rules from the Base44 v1 profile meet here.
 *
 * Section 10.2 — **exact operation names are derived from Contract Section 4,
 * not invented.** The canonical `operation_key` is the operation's identity;
 * the adapter name is a presentation of it. The canonical key is what a
 * backend function records in its audit record (profile Section 6.1),
 * whatever the adapter calls it.
 *
 * Section 10.3 — `policy.bootstrap`, `policy.activate` and
 * `organization.provision` are operator entrypoints and get **no** adapter
 * entry, no route and no UI affordance. Contract Prohibition 18 makes that
 * surface *absent, not guarded*. `tests` assert their absence.
 *
 * This registry is also the reason a caller cannot name an arbitrary backend
 * function: an operation name that is not a key here never reaches the
 * substrate at all.
 */

/**
 * Canonical `operation_key` values from Contract Section 4.
 *
 * Only operations inside the Base44 v1 scope (profile Section 3.1) appear.
 * The rest arrive with their own implementation gates.
 */
export const OPERATION_REGISTRY = {
  assignRole: 'role.assign',
  revokeRole: 'role.revoke',
  assignCoachScope: 'scope.assign',
  revokeCoachScope: 'scope.revoke',
  assignCaptain: 'captain.assign',
  deactivateMembership: 'membership.deactivate',
  moveRoster: 'roster.move',
  lockLineup: 'lineup.lock',
  unlockLineup: 'lineup.unlock',
  submitMatchResult: 'result.submit',
  finalizeResult: 'result.finalize',
  evaluateEligibility: 'eligibility.evaluate',
} as const satisfies Readonly<Record<string, string>>

/** The set of operation names the UI may ask for. */
export type OperationName = keyof typeof OPERATION_REGISTRY

/** The canonical `operation_key` an operation name resolves to. */
export type OperationKey = (typeof OPERATION_REGISTRY)[OperationName]

/**
 * Operator entrypoints that must never gain an adapter entry.
 *
 * Listed so the prohibition is checkable by a test rather than remembered.
 */
export const OPERATOR_ENTRYPOINT_KEYS = [
  'policy.bootstrap',
  'policy.activate',
  'organization.provision',
] as const

/** Whether an arbitrary value names a registered operation. */
export function isOperationName(value: unknown): value is OperationName {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(OPERATION_REGISTRY, value) &&
    // Guard against inherited keys such as `constructor` or `toString`
    // resolving through the prototype chain.
    Object.keys(OPERATION_REGISTRY).includes(value)
  )
}

/** Resolves an operation name to its canonical key, or `undefined`. */
export function operationKeyFor(value: unknown): OperationKey | undefined {
  return isOperationName(value) ? OPERATION_REGISTRY[value] : undefined
}

/**
 * Input field names a client may never author.
 *
 * Contract Global Invariant 16 and Prohibition 2: actor identity, outcome,
 * policy version and the resolved authority path are **always** server-derived
 * from actual execution context. Rejecting them at the boundary means a UI bug
 * cannot even attempt to supply one, and makes the intent explicit rather than
 * relying on a backend function to ignore an unexpected field.
 *
 * Organization context is deliberately absent from this list. Global Invariant
 * 2 makes it a *selector* the server re-derives, not forbidden input — it
 * simply is never trusted. It is not modelled yet because no operation payload
 * exists to carry it.
 */
export const CLIENT_AUTHORED_FIELD_DENYLIST: readonly string[] = Object.freeze([
  'actorType',
  'actor_type',
  'actorUserId',
  'actor_user_id',
  'actorMembershipId',
  'actor_membership_id',
  'authorityPath',
  'authority_path',
  'authoritySource',
  'authority_source',
  'outcome',
  'policyHash',
  'policy_hash',
  'policyVersion',
  'policy_version',
  'policyVersionId',
  'policy_version_id',
])

/**
 * Returns every denylisted field name present in an input payload.
 *
 * Shallow by design: these names are top-level request metadata, and a deep
 * walk would reject legitimate nested domain fields that merely share a name.
 */
export function clientAuthoredFieldsIn(input: unknown): readonly string[] {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return []
  }
  const present = Object.keys(input as Record<string, unknown>)
  return CLIENT_AUTHORED_FIELD_DENYLIST.filter((denied) => present.includes(denied))
}

/**
 * Thrown when an unregistered operation name reaches an executor.
 *
 * Deliberately thrown rather than returned as a failure result. The type
 * system already makes an unregistered name impossible to write, so reaching
 * this means untyped data crossed the boundary — a defect, not an operation
 * outcome. A failure result would let a caller handle it the way it handles a
 * denial and carry on; an exception cannot be mistaken for either. No
 * substrate call is made before this is raised.
 */
export class UnknownOperationError extends Error {
  constructor(readonly attempted: string) {
    super('Unknown application operation. Operations must be registered to be invocable.')
    this.name = 'UnknownOperationError'
  }
}

/**
 * Resolves an operation name to its canonical key, or throws.
 *
 * Every executor calls this before touching a substrate, which is what makes
 * an arbitrary, caller-supplied backend function name unreachable.
 */
export function requireOperationKey(value: unknown): OperationKey {
  const key = operationKeyFor(value)
  if (key === undefined) {
    throw new UnknownOperationError(typeof value === 'string' ? value : String(value))
  }
  return key
}

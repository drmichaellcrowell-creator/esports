import type { AuthenticatedIdentity } from '../auth/identity.js'

/**
 * Centralized authorization resolver — ARCHITECTURAL SEAM, NOT IMPLEMENTED.
 *
 * Contract Global Invariant 4: a single resolver evaluates
 *
 *   actor -> organization context -> membership -> role/scope -> resource
 *         -> resource's true organization/boundary -> action -> sensitivity
 *         -> policy -> decision
 *
 * for every protected operation, and no domain re-implements its own
 * authorization logic.
 *
 * This file defines the shape of that decision and nothing else. There is
 * deliberately NO permissive placeholder: `resolveAuthorization` throws. A stub
 * returning "permit" would be indistinguishable from a working resolver at every
 * call site and is exactly the failure mode Global Invariant 6 exists to prevent.
 *
 * A thrown error is also deliberate in preference to returning `deny`: `deny` is
 * a decision a functioning resolver reached, and this resolver does not exist
 * yet. Callers must not be able to mistake absence for judgement.
 *
 * Until this is implemented (Phase 0B), protected product routes simply do not
 * exist. See `src/api/routes/` — it contains health endpoints only.
 */

export type SensitivityTier = 'StandardOperational' | 'RestrictedStudent' | 'HighlyRestricted'

/**
 * How an actor's authority arises. Discriminated because Amendment 001 requires
 * AuditLogEvent to record the authority path, and a platform operator holds no
 * Membership or RoleAssignment to point at.
 */
export type AuthoritySource =
  | { readonly kind: 'organization_grant' }
  | { readonly kind: 'platform_authority' }
  | { readonly kind: 'service' }

export interface AuthorizationRequest {
  readonly identity: AuthenticatedIdentity
  /**
   * Client-supplied Organization context. Global Invariant 2: this is a SELECTOR,
   * never proof of authorization. The resolver re-derives the actor's actual
   * Memberships and independently verifies the target resource's true
   * Organization.
   */
  readonly organizationSelector: string | null
  readonly action: string
  readonly resourceType: string
  readonly resourceId: string | null
}

export type AuthorizationDecision =
  | {
      readonly outcome: 'permit'
      readonly organizationId: string | null
      readonly authoritySource: AuthoritySource
      readonly sensitivity: SensitivityTier
      readonly policyKey: string
      readonly policyVersionLabel: string
      readonly policyHash: string
    }
  | { readonly outcome: 'deny'; readonly reasonCode: string }

export class AuthorizationResolverNotImplementedError extends Error {
  constructor() {
    super(
      'The centralized authorization resolver is not implemented (Phase 0B). ' +
        'No permissive placeholder exists and none may be added: absence of a ' +
        'matching policy row must deny (Global Invariant 6), and protected ' +
        'operations cannot execute until the resolver, AuthorizationPolicyVersion ' +
        'and the Layer 0 grant entities exist.',
    )
    this.name = 'AuthorizationResolverNotImplementedError'
  }
}

export function resolveAuthorization(_request: AuthorizationRequest): Promise<AuthorizationDecision> {
  throw new AuthorizationResolverNotImplementedError()
}

/**
 * Server-derived authenticated identity.
 *
 * This type is intentionally minimal, and its shape is a contract guarantee
 * rather than an oversight:
 *
 *  - It carries the verified `sub` claim and nothing else that could be mistaken
 *    for authority. There is no `role`, no `app_metadata`, no `user_metadata`
 *    field, so provider-native role data has nowhere to land (Contract Global
 *    Invariant 5: native platform role fields are never the authorization root).
 *  - Authentication answers "which verified identity is this?". Authorization —
 *    Membership, RoleAssignment, CoachScopeAssignment, CaptainAssignment and the
 *    centralized resolver — answers "may it do this?". The two never merge.
 *  - `authUserId` always comes from a cryptographically verified token, never
 *    from a request body, query string or header the client controls (Global
 *    Invariant 16).
 */
export interface AuthenticatedIdentity {
  /** Verified `sub` claim: the Supabase Auth user id. A reference, not a grant. */
  readonly authUserId: string
  readonly issuedAt: Date
  readonly expiresAt: Date
}

export function createAuthenticatedIdentity(params: {
  authUserId: string
  issuedAt: Date
  expiresAt: Date
}): AuthenticatedIdentity {
  return Object.freeze({
    authUserId: params.authUserId,
    issuedAt: params.issuedAt,
    expiresAt: params.expiresAt,
  })
}

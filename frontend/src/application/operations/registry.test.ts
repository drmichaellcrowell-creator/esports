import { describe, expect, it } from 'vitest'
import {
  CLIENT_AUTHORED_FIELD_DENYLIST,
  OPERATION_REGISTRY,
  OPERATOR_ENTRYPOINT_KEYS,
  UnknownOperationError,
  clientAuthoredFieldsIn,
  isOperationName,
  operationKeyFor,
  requireOperationKey,
} from './registry'

describe('operation registry', () => {
  it('maps every adapter name to a canonical operation_key', () => {
    // Profile Section 10.2: names come from Contract Section 4, not invention.
    expect(OPERATION_REGISTRY.assignRole).toBe('role.assign')
    expect(OPERATION_REGISTRY.revokeRole).toBe('role.revoke')
    expect(OPERATION_REGISTRY.assignCoachScope).toBe('scope.assign')
    expect(OPERATION_REGISTRY.assignCaptain).toBe('captain.assign')
    expect(OPERATION_REGISTRY.inviteMembership).toBe('membership.invite')
    expect(OPERATION_REGISTRY.activateMembership).toBe('membership.activate')
    expect(OPERATION_REGISTRY.deactivateMembership).toBe('membership.deactivate')
    expect(OPERATION_REGISTRY.moveRoster).toBe('roster.move')
    expect(OPERATION_REGISTRY.lockLineup).toBe('lineup.lock')
    expect(OPERATION_REGISTRY.unlockLineup).toBe('lineup.unlock')
    expect(OPERATION_REGISTRY.submitMatchResult).toBe('result.submit')
    expect(OPERATION_REGISTRY.finalizeResult).toBe('result.finalize')
    expect(OPERATION_REGISTRY.evaluateEligibility).toBe('eligibility.evaluate')
  })

  it('exposes no operator entrypoint', () => {
    // Profile Section 10.3 / Contract Prohibition 18: policy.bootstrap,
    // policy.activate and organization.provision have no client-reachable
    // surface at all. Absent, not guarded.
    const registered = Object.values(OPERATION_REGISTRY) as string[]
    for (const forbidden of OPERATOR_ENTRYPOINT_KEYS) {
      expect(registered).not.toContain(forbidden)
    }
  })

  it('registers no operation from a domain excluded from v1', () => {
    // Profile Section 3.2: Conduct, Communication and SharedCompetition are
    // security boundaries, not backlog. None may acquire an adapter entry
    // without its own architecture gate.
    const registered = Object.values(OPERATION_REGISTRY) as string[]
    for (const excluded of [
      'conduct.report',
      'conduct.respond',
      'concern.report',
      'announcement.publish',
      'announcement.correct',
      'outbox.replay',
    ]) {
      expect(registered).not.toContain(excluded)
    }
  })

  it('rejects unregistered names, including prototype members', () => {
    expect(isOperationName('assignRole')).toBe(true)
    expect(isOperationName('constructor')).toBe(false)
    expect(isOperationName('toString')).toBe(false)
    expect(isOperationName('__proto__')).toBe(false)
    expect(isOperationName('../../evil')).toBe(false)
    expect(isOperationName('')).toBe(false)
    expect(isOperationName(null)).toBe(false)
    expect(operationKeyFor('nope')).toBeUndefined()
  })

  it('throws rather than resolving an unregistered name', () => {
    expect(() => requireOperationKey('execute_anything')).toThrow(UnknownOperationError)
    expect(requireOperationKey('lockLineup')).toBe('lineup.lock')
  })

  it('detects server-derived fields a client tried to author', () => {
    // Contract Global Invariant 16 / Prohibition 2.
    expect(clientAuthoredFieldsIn({ teamId: 'x' })).toEqual([])
    expect(clientAuthoredFieldsIn({ actor_user_id: 'x' })).toEqual(['actor_user_id'])
    expect(clientAuthoredFieldsIn({ outcome: 'success', policyHash: 'h' })).toEqual([
      'outcome',
      'policyHash',
    ])
    expect(clientAuthoredFieldsIn(null)).toEqual([])
    expect(clientAuthoredFieldsIn(['outcome'])).toEqual([])
  })

  it('treats organization context as a selector, not forbidden input', () => {
    // Global Invariant 2: the client may select, the server never trusts.
    expect(CLIENT_AUTHORED_FIELD_DENYLIST).not.toContain('organizationId')
    expect(CLIENT_AUTHORED_FIELD_DENYLIST).not.toContain('organization_id')
  })
})

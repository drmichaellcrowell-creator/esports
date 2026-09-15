/**
 * Drizzle schema for application tables.
 *
 * Application tables live in the dedicated `app` schema, never `public`
 * (Option B: the browser has no direct access to application tables, and nothing
 * is exposed through PostgREST).
 *
 * Phase 0A establishes the schema and its security posture only. No Layer 0
 * domain entity — Organization, Membership, RoleAssignment, CoachScopeAssignment,
 * CaptainAssignment, AuthorizationPolicyVersion, AuditLogEvent, OutboxEvent —
 * is defined here yet. Those belong to Phase 0B.
 */
import { pgSchema } from 'drizzle-orm/pg-core'

export const appSchema = pgSchema('app')

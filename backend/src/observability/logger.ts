import { pino, type Logger } from 'pino'
import type { Environment } from '../config/env.js'

export type { Logger }

/**
 * Structured JSON logging.
 *
 * Redaction is not cosmetic here: connection strings carry database credentials
 * and Authorization headers carry bearer tokens, and AuditLogEvent — not the
 * application log — is the contract's record of who did what.
 */
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'DATABASE_URL',
  'PROVISIONER_DATABASE_URL',
  '*.DATABASE_URL',
  '*.PROVISIONER_DATABASE_URL',
  '*.password',
  '*.token',
  '*.secret',
]

export function createLogger(env: Pick<Environment, 'LOG_LEVEL' | 'NODE_ENV'>): Logger {
  return pino({
    level: env.LOG_LEVEL,
    redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
    base: { service: 'esports-backend', env: env.NODE_ENV },
    timestamp: pino.stdTimeFunctions.isoTime,
  })
}

/** A logger that discards output, for tests that assert on behaviour not logs. */
export function createSilentLogger(): Logger {
  return pino({ level: 'silent' })
}

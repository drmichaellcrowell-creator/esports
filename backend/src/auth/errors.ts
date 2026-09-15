/** Base class for every authentication failure. All map to HTTP 401. */
export abstract class AuthenticationError extends Error {
  abstract readonly code: string
}

export class MissingCredentialsError extends AuthenticationError {
  readonly code = 'missing_credentials'
  constructor(detail = 'No bearer token was presented.') {
    super(detail)
    this.name = 'MissingCredentialsError'
  }
}

export class MalformedCredentialsError extends AuthenticationError {
  readonly code = 'malformed_credentials'
  constructor(detail = 'The Authorization header is not a well-formed bearer token.') {
    super(detail)
    this.name = 'MalformedCredentialsError'
  }
}

export class InvalidTokenError extends AuthenticationError {
  readonly code = 'invalid_token'
  /**
   * `detail` is client-visible and must stay generic. The underlying cause —
   * expired, bad signature, wrong issuer — goes in `options.cause` for
   * server-side logging only; revealing which check failed is an oracle.
   */
  constructor(detail = 'The bearer token failed verification.', options?: { cause?: unknown }) {
    super(detail, options)
    this.name = 'InvalidTokenError'
  }
}

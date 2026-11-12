export type DomainErrorCode =
  | 'INSUFFICIENT_BALANCE'
  | 'BETTING_CLOSED'
  | 'STAKE_LIMIT'
  | 'SUSPENDED'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'USERNAME_TAKEN'
  | 'INVALID_REFERRAL'
  | 'CONFLICT'

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
    /** For bet-slip errors: index of the failing pick in the submitted slip. */
    public readonly pickIndex?: number,
  ) {
    super(message)
    this.name = 'DomainError'
  }
}

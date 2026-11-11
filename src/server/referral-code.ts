import { randomInt } from 'node:crypto'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateReferralCode(): string {
  let code = ''
  for (let i = 0; i < 8; i++) code += ALPHABET[randomInt(ALPHABET.length)]
  return code
}

/**
 * Behind Cloudflare, the Worker (deploy/cloudflare) adds this header with ORIGIN_SECRET. The app
 * rejects requests without it, so nobody can reach the Cloud Run URL directly and fake the
 * client IP header that the Worker sets.
 */
export const ORIGIN_SECRET_HEADER = 'x-origin-secret'

/** True when no secret is configured, or the request carries exactly that secret. */
export function originAllowed(secret: string | undefined, provided: string | null): boolean {
  if (!secret) return true
  if (provided === null || provided.length !== secret.length) return false
  // Compare every character, so the time taken does not reveal how much of the secret matched.
  let diff = 0
  for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ provided.charCodeAt(i)
  return diff === 0
}

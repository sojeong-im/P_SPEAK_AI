// Per-instance health cache for SpeechSuper.
//
// Why: when SpeechSuper rejects auth (errId:41030 "appKey not found"), every
// subsequent request would still pay the 1-2s round trip just to fail. We
// cache that fact for a short window so the route can skip directly to the
// Azure fallback on the second+ request, until the cache expires and we
// retry. Once SpeechSuper auth recovers, the next attempt at expiry succeeds
// and the cache stays cleared.

const TTL_MS = 30 * 60 * 1000 // 30 minutes

type FailureReason =
  | 'auth'        // appKey/sig rejected (41030)
  | 'network'     // total outage / repeated 5xx
  | 'unknown'

interface FailureEntry {
  reason: FailureReason
  message: string
  expiresAt: number
}

let failure: FailureEntry | null = null

export function markSpeechSuperUnavailable(reason: FailureReason, message: string): void {
  failure = {
    reason,
    message,
    expiresAt: Date.now() + TTL_MS,
  }
  console.warn(`[speechsuper.health] marked unavailable (${reason}): ${message}`)
}

export function clearSpeechSuperHealth(): void {
  if (failure) {
    console.log('[speechsuper.health] cleared cache')
  }
  failure = null
}

export function getSpeechSuperHealth(): {
  available: boolean
  reason?: FailureReason
  message?: string
  staleAfterMs?: number
} {
  if (!failure) return { available: true }
  if (Date.now() >= failure.expiresAt) {
    failure = null
    return { available: true }
  }
  return {
    available: false,
    reason: failure.reason,
    message: failure.message,
    staleAfterMs: failure.expiresAt - Date.now(),
  }
}

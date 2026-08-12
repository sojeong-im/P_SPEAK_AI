// In-memory FIFO semaphore. SpeechSuper free trial allows max 5 concurrent
// requests; we keep one slot of headroom by defaulting MAX to env or 5.
//
// This is a single-process queue. On Vercel each warm function instance has
// its own queue; with ~10 concurrent users on a small site you usually land
// on 1-2 instances and the queue effectively prevents 6th+ concurrent hits
// to SpeechSuper from any one instance. If multiple instances each push 5
// at once you can still trip the API limit, but at 10 users that is unlikely.

const MAX = Math.max(1, Number(process.env.SPEECHSUPER_MAX_CONCURRENCY ?? 5))
const ACQUIRE_TIMEOUT_MS = 45_000 // wait at most 45s for a slot

type Waiter = {
  resolve: () => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

let active = 0
const waiters: Waiter[] = []

function release(): void {
  const next = waiters.shift()
  if (next) {
    clearTimeout(next.timer)
    next.resolve()
    return
  }
  active = Math.max(0, active - 1)
}

function acquire(): Promise<void> {
  if (active < MAX) {
    active += 1
    return Promise.resolve()
  }
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = waiters.findIndex(w => w.resolve === resolve)
      if (idx >= 0) waiters.splice(idx, 1)
      reject(new Error('queue_timeout'))
    }, ACQUIRE_TIMEOUT_MS)
    waiters.push({ resolve, reject, timer })
  })
}

export interface QueueStats {
  active: number
  waiting: number
  max: number
}

export function getQueueStats(): QueueStats {
  return { active, waiting: waiters.length, max: MAX }
}

export async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  await acquire()
  const startedAt = Date.now()
  try {
    return await fn()
  } finally {
    const took = Date.now() - startedAt
    // Lightweight telemetry; helps diagnose contention live
    console.log(
      `[speechsuper.queue] released slot after ${took}ms (active=${active}, waiting=${waiters.length})`
    )
    release()
  }
}

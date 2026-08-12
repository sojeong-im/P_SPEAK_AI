import { createHash, randomUUID } from 'crypto'

// SpeechSuper HTTP API client.
// Endpoint: POST https://api.speechsuper.com/{coreType}
// Auth: SHA1(appKey + timestamp + secretKey) for connect, SHA1(appKey + timestamp + userId + secretKey) for start.
// Body: multipart/form-data with `text` (JSON params) and `audio` (binary).

const APP_KEY = process.env.SPEECHSUPER_APP_KEY ?? ''
const SECRET_KEY = process.env.SPEECHSUPER_SECRET_KEY ?? ''
const BASE_URL = process.env.SPEECHSUPER_BASE_URL ?? 'https://api.speechsuper.com'

export type SpeechSuperCoreType =
  | 'word.eval.promax'
  | 'sent.eval.promax'
  | 'para.eval'

export interface SpeechSuperEvalInput {
  coreType: SpeechSuperCoreType
  refText: string
  audio: Buffer | Uint8Array
  audioType: 'wav' | 'mp3' | 'opus' | 'ogg' | 'amr'
  sampleRate?: number   // default 16000
  userId?: string
  needWordScore?: boolean // for para.eval
}

export interface PerWordScore {
  word: string
  overall: number
  pron: number
  isMispronounced: boolean
  phonemes?: PhonemeScore[]
}

export interface PhonemeScore {
  phoneme: string
  pron: number
}

// Mapped result that matches the existing PronunciationResult shape used
// across the app, plus extras for the result page.
export interface SpeechSuperMappedResult {
  accuracyScore: number       // pron / pronunciation
  fluencyScore: number        // fluency
  completenessScore: number   // integrity
  prosodyScore: number        // rhythm (best-effort)
  omittedWords: number
  repeatedWords: number
  mispronouncedWords: string[]
  recognizedText: string      // joined recognized words if available
  perWord: PerWordScore[]
  weakPhonemes: PhonemeScore[]  // up to 5 lowest-scoring phonemes
  raw: unknown                // keep for debugging in dev
}

function sha1Hex(input: string): string {
  return createHash('sha1').update(input, 'utf8').digest('hex')
}

function buildParams(input: SpeechSuperEvalInput) {
  if (!APP_KEY || !SECRET_KEY) {
    throw new Error('SPEECHSUPER credentials are not configured')
  }
  const userId = input.userId || 'guest'
  const timestamp = Date.now().toString()
  const connectSig = sha1Hex(APP_KEY + timestamp + SECRET_KEY)
  const startSig = sha1Hex(APP_KEY + timestamp + userId + SECRET_KEY)
  const tokenId = randomUUID()

  const request: Record<string, unknown> = {
    coreType: input.coreType,
    refText: input.refText,
    tokenId,
  }
  if (input.coreType === 'para.eval' && input.needWordScore) {
    request.paragraph_need_word_score = 1
  }

  return {
    connect: {
      cmd: 'connect',
      param: {
        sdk: { version: 16777472, source: 9, protocol: 2 },
        app: { applicationId: APP_KEY, sig: connectSig, timestamp },
      },
    },
    start: {
      cmd: 'start',
      param: {
        app: { userId, applicationId: APP_KEY, timestamp, sig: startSig },
        audio: {
          audioType: input.audioType,
          channel: 1,
          sampleBytes: 2,
          sampleRate: input.sampleRate ?? 16000,
        },
        request,
      },
    },
  }
}

// Best-effort score reader: SpeechSuper response shapes vary by coreType,
// so we read several known field names and fall back to 0.
function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.round(n) : 0
}

function pickResultBlock(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as Record<string, unknown>
  const direct = root.result
  if (direct && typeof direct === 'object') return direct as Record<string, unknown>
  return null
}

function extractPhonemes(wordObj: Record<string, unknown>): PhonemeScore[] {
  const list =
    (wordObj.phonemes as unknown[] | undefined) ??
    (wordObj.phone as unknown[] | undefined) ??
    []
  const out: PhonemeScore[] = []
  for (const p of list) {
    if (!p || typeof p !== 'object') continue
    const po = p as Record<string, unknown>
    const phoneme =
      (typeof po.phoneme === 'string' && po.phoneme) ||
      (typeof po.phone === 'string' && po.phone) ||
      (typeof po.symbol === 'string' && po.symbol) ||
      ''
    if (!phoneme) continue
    const scores = (po.scores as Record<string, unknown> | undefined) ?? po
    const pron = num(scores.pron ?? scores.pronunciation ?? scores.score ?? scores.overall)
    out.push({ phoneme, pron })
  }
  return out
}

function extractWords(result: Record<string, unknown>): PerWordScore[] {
  const out: PerWordScore[] = []
  const list =
    (result.words as unknown[] | undefined) ??
    (result.details as unknown[] | undefined) ??
    []
  for (const w of list) {
    if (!w || typeof w !== 'object') continue
    const wo = w as Record<string, unknown>
    const word =
      (typeof wo.word === 'string' && wo.word) ||
      (typeof wo.text === 'string' && wo.text) ||
      ''
    if (!word) continue
    const scores = (wo.scores as Record<string, unknown> | undefined) ?? wo
    const overall = num(scores.overall ?? scores.score ?? wo.score)
    const pron = num(scores.pron ?? scores.pronunciation ?? overall)
    const phonemes = extractPhonemes(wo)
    out.push({
      word,
      overall,
      pron,
      isMispronounced: pron < 60,
      phonemes: phonemes.length > 0 ? phonemes : undefined,
    })
  }
  return out
}

function aggregateWeakPhonemes(perWord: PerWordScore[]): PhonemeScore[] {
  const all: PhonemeScore[] = []
  for (const w of perWord) {
    if (w.phonemes) all.push(...w.phonemes)
  }
  // Group by phoneme symbol and average score
  const grouped = new Map<string, { sum: number; n: number }>()
  for (const p of all) {
    const cur = grouped.get(p.phoneme) ?? { sum: 0, n: 0 }
    cur.sum += p.pron
    cur.n += 1
    grouped.set(p.phoneme, cur)
  }
  const averaged: PhonemeScore[] = Array.from(grouped.entries()).map(
    ([phoneme, { sum, n }]) => ({ phoneme, pron: Math.round(sum / n) })
  )
  return averaged
    .filter(p => p.pron > 0 && p.pron < 70)
    .sort((a, b) => a.pron - b.pron)
    .slice(0, 5)
}

export function mapSpeechSuperResponse(payload: unknown): SpeechSuperMappedResult {
  const result = pickResultBlock(payload) ?? {}

  const accuracyScore = num(
    result.pronunciation ?? result.pron ?? result.accuracy ?? result.overall
  )
  const fluencyScore = num(result.fluency)
  const completenessScore = num(result.integrity ?? result.completeness)
  const prosodyScore = num(result.rhythm ?? result.prosody)

  const perWord = extractWords(result)
  const mispronouncedWords = Array.from(
    new Set(perWord.filter(w => w.isMispronounced).map(w => w.word))
  )
  const weakPhonemes = aggregateWeakPhonemes(perWord)

  return {
    accuracyScore,
    fluencyScore,
    completenessScore,
    prosodyScore,
    omittedWords: 0,
    repeatedWords: 0,
    mispronouncedWords,
    recognizedText: perWord.map(w => w.word).join(' '),
    perWord,
    weakPhonemes,
    raw: payload,
  }
}

// SpeechSuper concurrency-limit / overload errIds we should retry on.
// 41030 ("appKey not found") is NOT retryable — that's a permanent auth issue.
// Empirically these IDs (41040+ range) are transient throttling.
const RETRYABLE_ERR_IDS = new Set([41040, 41050, 50000, 50001, 50002])

async function callOnce(
  url: string,
  params: ReturnType<typeof buildParams>,
  audioBlob: Blob,
  audioType: string,
  signal?: AbortSignal
): Promise<{ parsed: unknown; status: number }> {
  const fd = new FormData()
  fd.append('text', JSON.stringify(params))
  fd.append('audio', audioBlob, `audio.${audioType}`)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Request-Index': '0' },
    body: fd,
    signal,
  })
  const text = await res.text()
  try {
    return { parsed: JSON.parse(text), status: res.status }
  } catch {
    throw new Error(
      `SpeechSuper returned non-JSON (status=${res.status}): ${text.slice(0, 200)}`
    )
  }
}

export async function evaluatePronunciation(
  input: SpeechSuperEvalInput,
  signal?: AbortSignal
): Promise<SpeechSuperMappedResult> {
  const url = `${BASE_URL.replace(/\/$/, '')}/${input.coreType}`

  // Copy bytes into a fresh ArrayBuffer to satisfy strict BlobPart typing.
  const src = input.audio
  const ab = new ArrayBuffer(src.byteLength)
  new Uint8Array(ab).set(src as Uint8Array)
  const audioBlob = new Blob([ab], { type: 'application/octet-stream' })

  const maxAttempts = 3
  let lastErr: Error | null = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // sig depends on timestamp; rebuild every attempt
    const params = buildParams(input)
    let parsed: unknown
    let status: number
    try {
      ({ parsed, status } = await callOnce(url, params, audioBlob, input.audioType, signal))
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
      // Network / non-JSON failure — retry once with backoff
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, 500 * attempt))
        continue
      }
      throw lastErr
    }

    if (status >= 500 && attempt < maxAttempts) {
      await new Promise(r => setTimeout(r, 800 * attempt))
      continue
    }
    if (status < 200 || status > 299) {
      throw new Error(
        `SpeechSuper HTTP ${status}: ${JSON.stringify(parsed).slice(0, 400)}`
      )
    }

    const root = parsed as Record<string, unknown>
    const errIdRaw = root.errId
    const errId = typeof errIdRaw === 'number' ? errIdRaw : Number(errIdRaw)
    if (Number.isFinite(errId) && errId !== 0 && root.result == null) {
      if (RETRYABLE_ERR_IDS.has(errId) && attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, 800 * attempt))
        continue
      }
      throw new Error(`SpeechSuper error: ${JSON.stringify(parsed).slice(0, 400)}`)
    }

    return mapSpeechSuperResponse(parsed)
  }

  // Should not reach here, but TypeScript wants a return
  throw lastErr ?? new Error('SpeechSuper: exhausted retries')
}

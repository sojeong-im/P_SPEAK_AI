// Server-side Azure Speech pronunciation assessment via REST API.
// Used as fallback when SpeechSuper rejects auth or is unreachable.
//
// Azure short-audio REST endpoint accepts a single WAV (≤60s, 16kHz mono PCM)
// and returns NBest[].PronunciationAssessment + per-word details.

import type { PerWordScore } from '@/types'

export interface AzureMappedResult {
  accuracyScore: number
  fluencyScore: number
  completenessScore: number
  prosodyScore: number
  omittedWords: number
  repeatedWords: number
  mispronouncedWords: string[]
  recognizedText: string
  perWord: PerWordScore[]
  weakPhonemes: { phoneme: string; pron: number }[]
  raw: unknown
}

const REGION =
  process.env.AZURE_SPEECH_REGION ||
  process.env.NEXT_PUBLIC_AZURE_SPEECH_REGION ||
  'eastus'

function azureKey(): string {
  return (
    process.env.AZURE_SPEECH_KEY ||
    process.env.NEXT_PUBLIC_AZURE_SPEECH_KEY ||
    ''
  ).trim()
}

export function isAzureConfigured(): boolean {
  return azureKey().length > 0
}

// Azure REST returns score fields BOTH on the NBest entry directly AND inside
// a nested PronunciationAssessment object depending on the SDK/version. We
// read both forms and prefer non-zero values.
interface AzureWord {
  Word?: string
  AccuracyScore?: number
  ErrorType?: string
  PronunciationAssessment?: {
    AccuracyScore?: number
    ErrorType?: string
  }
  Phonemes?: Array<{
    Phoneme?: string
    AccuracyScore?: number
    PronunciationAssessment?: { AccuracyScore?: number }
  }>
}

interface AzureNBest {
  Display?: string
  Lexical?: string
  AccuracyScore?: number
  FluencyScore?: number
  CompletenessScore?: number
  ProsodyScore?: number
  PronScore?: number
  PronunciationAssessment?: {
    AccuracyScore?: number
    FluencyScore?: number
    CompletenessScore?: number
    ProsodyScore?: number
    PronScore?: number
  }
  Words?: AzureWord[]
}

interface AzureResponse {
  RecognitionStatus?: string
  DisplayText?: string
  NBest?: AzureNBest[]
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.round(n) : 0
}

function mapAzure(payload: AzureResponse): AzureMappedResult {
  const nbest = payload.NBest?.[0] ?? {}
  const pa = nbest.PronunciationAssessment ?? {}
  const wordsRaw = nbest.Words ?? []

  let omitted = 0
  let repeated = 0
  const mispronounced: string[] = []
  const perWord: PerWordScore[] = []
  const phonemeBag: { phoneme: string; pron: number }[] = []

  for (const w of wordsRaw) {
    const word = (w.Word ?? '').trim()
    const errType = w.PronunciationAssessment?.ErrorType ?? w.ErrorType
    const acc = num(w.AccuracyScore ?? w.PronunciationAssessment?.AccuracyScore)
    if (errType === 'Omission') {
      omitted++
      continue
    }
    if (errType === 'Insertion') {
      repeated++
    }
    if (!word) continue
    const isMis = errType === 'Mispronunciation' || (acc > 0 && acc < 60)
    if (isMis) mispronounced.push(word)

    const phonemes: { phoneme: string; pron: number }[] = []
    for (const p of w.Phonemes ?? []) {
      const sym = (p.Phoneme ?? '').trim()
      if (!sym) continue
      const score = num(p.AccuracyScore ?? p.PronunciationAssessment?.AccuracyScore)
      phonemes.push({ phoneme: sym, pron: score })
      phonemeBag.push({ phoneme: sym, pron: score })
    }

    perWord.push({
      word,
      overall: acc,
      pron: acc,
      isMispronounced: isMis,
      phonemes: phonemes.length > 0 ? phonemes : undefined,
    })
  }

  // Aggregate weakest 5 phonemes
  const grouped = new Map<string, { sum: number; n: number }>()
  for (const p of phonemeBag) {
    const cur = grouped.get(p.phoneme) ?? { sum: 0, n: 0 }
    cur.sum += p.pron
    cur.n += 1
    grouped.set(p.phoneme, cur)
  }
  const weakPhonemes = Array.from(grouped.entries())
    .map(([phoneme, { sum, n }]) => ({ phoneme, pron: Math.round(sum / n) }))
    .filter(p => p.pron > 0 && p.pron < 70)
    .sort((a, b) => a.pron - b.pron)
    .slice(0, 5)

  return {
    accuracyScore: num(nbest.AccuracyScore ?? pa.AccuracyScore ?? nbest.PronScore ?? pa.PronScore),
    fluencyScore: num(nbest.FluencyScore ?? pa.FluencyScore),
    completenessScore: num(nbest.CompletenessScore ?? pa.CompletenessScore),
    prosodyScore: num(nbest.ProsodyScore ?? pa.ProsodyScore),
    omittedWords: omitted,
    repeatedWords: repeated,
    mispronouncedWords: Array.from(new Set(mispronounced)),
    recognizedText: nbest.Display ?? payload.DisplayText ?? '',
    perWord,
    weakPhonemes,
    raw: payload,
  }
}

export async function evaluateWithAzure(
  audio: Buffer | Uint8Array,
  refText: string,
  signal?: AbortSignal
): Promise<AzureMappedResult> {
  const key = azureKey()
  if (!key) throw new Error('Azure speech key not configured')

  const paConfig = {
    ReferenceText: refText,
    GradingSystem: 'HundredMark',
    Granularity: 'Phoneme',
    EnableMiscue: 'True',
    EnableProsodyAssessment: 'True',
    Dimension: 'Comprehensive',
  }
  const paB64 = Buffer.from(JSON.stringify(paConfig), 'utf-8').toString('base64')

  const url = `https://${REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=ko-KR&format=detailed`

  // Copy bytes into a fresh ArrayBuffer for strict BlobPart typing
  const ab = new ArrayBuffer(audio.byteLength)
  new Uint8Array(ab).set(audio as Uint8Array)

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
      'Pronunciation-Assessment': paB64,
      'Accept': 'application/json',
    },
    body: ab,
    signal,
  })

  const text = await res.text()
  let parsed: AzureResponse
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(
      `Azure returned non-JSON (status=${res.status}): ${text.slice(0, 200)}`
    )
  }

  if (!res.ok) {
    throw new Error(`Azure HTTP ${res.status}: ${JSON.stringify(parsed).slice(0, 400)}`)
  }
  if (parsed.RecognitionStatus && parsed.RecognitionStatus !== 'Success') {
    throw new Error(`Azure RecognitionStatus=${parsed.RecognitionStatus}`)
  }

  return mapAzure(parsed)
}

import { NextResponse, type NextRequest } from 'next/server'
import {
  evaluatePronunciation,
  type SpeechSuperCoreType,
  type SpeechSuperEvalInput,
} from '@/lib/speechsuper/client'
import { withSlot, getQueueStats } from '@/lib/speechsuper/queue'
import {
  evaluateWithAzure,
  isAzureConfigured,
} from '@/lib/azure/server-pronunciation'
import {
  getSpeechSuperHealth,
  markSpeechSuperUnavailable,
} from '@/lib/speechsuper/health-cache'

export const runtime = 'nodejs'
export const maxDuration = 60

// Treat these SpeechSuper errIds as PERMANENT for the next 30 min — fall back
// to Azure immediately on subsequent requests instead of retrying.
const SS_PERMANENT_ERR_PATTERNS = [
  'appKey not found',
  'sig not match',
  'permission denied',
  'invalid app',
]

function isPermanentSSError(message: string): boolean {
  return SS_PERMANENT_ERR_PATTERNS.some(p => message.toLowerCase().includes(p.toLowerCase()))
}

const ALLOWED_CORE_TYPES: SpeechSuperCoreType[] = [
  'word.eval.promax',
  'sent.eval.promax',
  'para.eval',
]
const ALLOWED_AUDIO_TYPES: SpeechSuperEvalInput['audioType'][] = [
  'wav',
  'mp3',
  'opus',
  'ogg',
  'amr',
]

export async function POST(req: NextRequest): Promise<NextResponse> {
  let stage = 'parse'
  try {
    if (!process.env.SPEECHSUPER_APP_KEY || !process.env.SPEECHSUPER_SECRET_KEY) {
      return NextResponse.json(
        { error: 'SpeechSuper credentials not configured' },
        { status: 500 }
      )
    }

    const form = await req.formData()
    const audio = form.get('audio')
    const refText = String(form.get('refText') ?? '').trim()
    const coreTypeRaw = String(form.get('coreType') ?? 'sent.eval.promax')
    const audioTypeRaw = String(form.get('audioType') ?? 'wav')
    const sampleRate = Number(form.get('sampleRate') ?? 16000)
    const userId = String(form.get('userId') ?? 'guest').slice(0, 64)

    if (!(audio instanceof Blob)) {
      return NextResponse.json({ error: 'audio file is required' }, { status: 400 })
    }
    if (audio.size === 0 || audio.size > 12 * 1024 * 1024) {
      return NextResponse.json(
        { error: `audio size out of range (${audio.size} bytes)` },
        { status: 400 }
      )
    }
    if (!refText) {
      return NextResponse.json({ error: 'refText is required' }, { status: 400 })
    }
    const coreType = ALLOWED_CORE_TYPES.includes(coreTypeRaw as SpeechSuperCoreType)
      ? (coreTypeRaw as SpeechSuperCoreType)
      : 'sent.eval.promax'
    const audioType = ALLOWED_AUDIO_TYPES.includes(
      audioTypeRaw as SpeechSuperEvalInput['audioType']
    )
      ? (audioTypeRaw as SpeechSuperEvalInput['audioType'])
      : 'wav'

    stage = 'read_buffer'
    const buf = Buffer.from(await audio.arrayBuffer())

    stage = 'route'
    const queueDepthBefore = getQueueStats()
    const t0 = Date.now()

    let engine: 'speechsuper' | 'azure' = 'speechsuper'
    let result: Awaited<ReturnType<typeof evaluatePronunciation>>
    let fallbackReason: string | undefined
    const ssHealth = getSpeechSuperHealth()

    // 1) Try SpeechSuper, unless health cache says it is currently down
    if (ssHealth.available) {
      try {
        stage = 'speechsuper'
        result = await withSlot(() =>
          evaluatePronunciation({
            coreType,
            refText,
            audio: buf,
            audioType,
            sampleRate: Number.isFinite(sampleRate) ? sampleRate : 16000,
            userId,
          })
        )
      } catch (ssErr) {
        const msg = ssErr instanceof Error ? ssErr.message : String(ssErr)
        if (isPermanentSSError(msg)) {
          markSpeechSuperUnavailable('auth', msg)
        }
        // 2) Fallback to Azure if configured
        if (!isAzureConfigured()) {
          throw ssErr
        }
        fallbackReason = msg
        engine = 'azure'
        stage = 'azure_fallback'
        result = await evaluateWithAzure(buf, refText)
      }
    } else {
      // Skip SpeechSuper entirely while flagged unavailable
      if (!isAzureConfigured()) {
        throw new Error(
          `SpeechSuper unavailable (${ssHealth.reason}: ${ssHealth.message}) and Azure key missing`
        )
      }
      fallbackReason = `cached:${ssHealth.reason}:${ssHealth.message}`
      engine = 'azure'
      stage = 'azure_fallback'
      result = await evaluateWithAzure(buf, refText)
    }

    const elapsedMs = Date.now() - t0
    return NextResponse.json({
      ok: true,
      result,
      meta: {
        engine,
        elapsedMs,
        queueDepthBefore,
        queueDepthAfter: getQueueStats(),
        speechSuperHealth: getSpeechSuperHealth(),
        fallbackReason,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const isQueueTimeout = msg === 'queue_timeout'
    console.error(`[pronunciation.evaluate] FAILED stage=${stage}: ${msg}`)
    return NextResponse.json(
      {
        ok: false,
        stage,
        error: isQueueTimeout
          ? '동시 분석 요청이 많아 대기 시간이 초과됐습니다. 잠시 후 다시 시도해주세요.'
          : '발음 분석에 실패했습니다.',
        detail: msg,
      },
      { status: isQueueTimeout ? 503 : 500 }
    )
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    ok: true,
    queue: getQueueStats(),
    configured: Boolean(
      process.env.SPEECHSUPER_APP_KEY && process.env.SPEECHSUPER_SECRET_KEY
    ),
    speechSuperHealth: getSpeechSuperHealth(),
    azureConfigured: isAzureConfigured(),
  })
}

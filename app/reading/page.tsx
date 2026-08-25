'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { sessionStore } from '@/lib/session-store'
import { audioStore, type AudioSlot } from '@/lib/audio-store'
import { blobToPcmWav } from '@/lib/audio/wav-encoder'
import type { PronunciationResult, EvaluationEngine } from '@/types'

// ─── Fixed passages ────────────────────────────────────────────────────────
const FIXED_PASSAGES = [
  {
    index: 0,
    label: '지문 1',
    title: '간장공장 지문',
    text: '간장공장 공장장은 강 공장장이고\n된장공장 공장장은 공 공장장이다',
    slot: 'passage1' as AudioSlot,
  },
  {
    index: 1,
    label: '지문 2',
    title: '경찰청 지문',
    text: '경찰청 철창살은 외철창살이고\n검찰청 철창살은 쌍철창살이다',
    slot: 'passage2' as AudioSlot,
  },
] as const

const STEPS = ['시작', 'STEP 1', 'STEP 2', 'STEP 3', '결과']
const EASE = [0.25, 0.46, 0.45, 0.94] as unknown as import('framer-motion').Easing

const fadeInUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: EASE },
  }),
}

type Phase = 'idle' | 'recording' | 'analyzing' | 'done' | 'error'

interface ServerEvalResponse {
  ok: boolean
  result?: {
    accuracyScore: number
    fluencyScore: number
    completenessScore: number
    prosodyScore: number
    omittedWords: number
    repeatedWords: number
    mispronouncedWords: string[]
    recognizedText: string
    perWord: Array<{
      word: string
      overall: number
      pron: number
      isMispronounced: boolean
      phonemes?: { phoneme: string; pron: number }[]
    }>
    weakPhonemes?: { phoneme: string; pron: number }[]
  }
  meta?: {
    engine?: EvaluationEngine
    elapsedMs?: number
    fallbackReason?: string
  }
  error?: string
  detail?: string
}

async function evalLine(audioBlob: Blob, audioType: 'wav', sampleRate: number, refText: string) {
  let res: Response | null = null;
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const fd = new FormData()
      fd.append('audio', audioBlob, 'recording.wav')
      fd.append('refText', refText)
      fd.append('coreType', 'sent.eval.promax')
      fd.append('audioType', audioType)
      fd.append('sampleRate', String(sampleRate))
      fd.append('userId', 'reading-passage')

      res = await fetch('/api/pronunciation/evaluate', { method: 'POST', body: fd })
      break;
    } catch (e) {
      const error = e as Error;
      lastError = error;
      if (attempt < 2 && (error.message === 'Load failed' || error.message === 'Failed to fetch')) {
        await new Promise(r => setTimeout(r, 1000)) // wait 1s before retry
        continue;
      }
      throw e;
    }
  }

  if (!res) {
    throw lastError || new Error('Fetch failed');
  }

  const json = (await res.json()) as ServerEvalResponse
  if (!res.ok || !json.ok || !json.result) {
    const errorMsg = json.error || `HTTP ${res.status}`
    const detail = json.detail ? ` (${json.detail})` : ''
    throw new Error(errorMsg + detail)
  }
  // Engine name kept in console only — users do not need to see "speechsuper" / "azure"
  if (json.meta?.engine) {
    console.log(
      `[pronunciation] engine=${json.meta.engine}` +
        (json.meta.fallbackReason ? ` fallback=${String(json.meta.fallbackReason).slice(0, 80)}` : '') +
        (json.meta.elapsedMs ? ` (${json.meta.elapsedMs}ms)` : '')
    )
  }
  return { ...json.result, engine: json.meta?.engine }
}

export default function ReadingPage() {
  const router = useRouter()

  const [passageIndex, setPassageIndex] = useState(0)
  const [passage1Done, setPassage1Done] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [lastResult, setLastResult] = useState<PronunciationResult | null>(null)

  const [phase, setPhase] = useState<Phase>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [analysisHint, setAnalysisHint] = useState('')

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const recStartedAtRef = useRef<number>(0)
  const sttStopRef = useRef<(() => void) | null>(null)
  // Accumulator for finalized utterances so the box shows the WHOLE recording
  // so far, not just the latest utterance. recognizing events display the
  // accumulated text + current partial.
  const sttFinalRef = useRef<string>('')

  // Real-time recognized text shown in a feedback box. Per-word highlight on
  // the passage was removed — Korean STT partial-match was inconsistent
  // across conjugation/spacing and felt buggy. The text box stays because
  // it accurately reflects what the mic is picking up.
  const [recognizedText, setRecognizedText] = useState('')

  const currentPassage = FIXED_PASSAGES[passageIndex]
  const words = currentPassage.text.replace(/\n/g, ' ').split(/\s+/).filter(Boolean)
  const progressPct = passageIndex === 0 ? 20 : 50

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [])

  const stopSTT = useCallback(() => {
    if (sttStopRef.current) {
      try { sttStopRef.current() } catch { /* ignore */ }
      sttStopRef.current = null
    }
  }, [])

  useEffect(() => () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop() } catch { /* ignore */ }
    }
    stopSTT()
    cleanupStream()
  }, [cleanupStream, stopSTT])

  const resetPassageState = useCallback(() => {
    setPhase('idle')
    setErrorMessage(null)
    setLastResult(null)
    setRetryCount(0)
    setAnalysisHint('')
    setRecognizedText('')
    sttFinalRef.current = ''
  }, [])

  const handleProceed = useCallback(() => {
    if (passageIndex === 0) {
      setIsTransitioning(true)
      setTimeout(() => {
        resetPassageState()
        setIsTransitioning(false)
        setPassageIndex(1)
      }, 400)
    } else {
      router.push('/free-speech')
    }
  }, [passageIndex, resetPassageState, router])

  const handleStartRecording = async () => {
    setPhase('recording')
    setErrorMessage(null)
    setRecognizedText('')
    sttFinalRef.current = ''
    chunksRef.current = []
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      })
      streamRef.current = stream

      const mimeType =
        typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : 'audio/webm'

      const mr = new MediaRecorder(stream, { mimeType })
      mr.ondataavailable = e => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      mr.onerror = () => {
        setPhase('error')
        setErrorMessage('녹음 중 오류가 발생했습니다. 다시 시도해주세요.')
        stopSTT()
        cleanupStream()
      }
      mr.start()
      recStartedAtRef.current = Date.now()
      mediaRecorderRef.current = mr

      // Run Azure STT in parallel only to populate the "recognized text" box.
      // Accumulate finalized utterances so the user sees their whole spoken
      // text grow, instead of the box flashing each time a new utterance ends.
      try {
        const { startSTT } = await import('@/lib/azure/speech-service')
        const stop = await startSTT({
          onRecognizing: (text: string) => {
            const combined = sttFinalRef.current
              ? `${sttFinalRef.current} ${text}`
              : text
            setRecognizedText(combined.trim())
          },
          onRecognized: (text: string) => {
            const t = (text ?? '').trim()
            if (!t) return
            sttFinalRef.current = sttFinalRef.current
              ? `${sttFinalRef.current} ${t}`
              : t
            setRecognizedText(sttFinalRef.current)
          },
          onError: (err: string) => {
            console.warn('[reading] STT error:', err)
          },
        })
        sttStopRef.current = stop
      } catch (e) {
        console.warn('[reading] STT init failed:', e)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setPhase('error')
      setErrorMessage(`마이크 접근 권한이 없거나 사용 중입니다: ${msg}`)
      cleanupStream()
    }
  }

  const evaluate = useCallback(async (recordedBlob: Blob) => {
    setPhase('analyzing')
    setAnalysisHint('녹음 변환 중…')

    try {
      // Convert webm/opus → 16 kHz mono PCM WAV
      const encoded = await blobToPcmWav(recordedBlob)
      setAnalysisHint('발음 분석 중…')

      // (a) Per-line evaluation gives accurate accuracy/fluency on each line.
      // But completeness is measured against the refText, so when a line's
      // refText is only one of the two lines while audio contains BOTH lines,
      // completeness gets confused (the engine sees "extra" speech). We fix
      // that by evaluating the whole text in parallel — its completeness is
      // the right one to surface.
      const lines = currentPassage.text.split(/\n+/).map(s => s.trim()).filter(Boolean)
      const wholeText = currentPassage.text.replace(/\n/g, ' ')
      const refsToEvaluate = lines.length >= 2 ? lines : [wholeText]

      const partials: Array<Awaited<ReturnType<typeof evalLine>>> = []
      for (const line of refsToEvaluate) {
        partials.push(await evalLine(encoded.blob, encoded.audioType, encoded.sampleRate, line))
      }

      let whole: Awaited<ReturnType<typeof evalLine>> | null = null
      if (lines.length >= 2) {
        whole = await evalLine(encoded.blob, encoded.audioType, encoded.sampleRate, wholeText)
      }

      const avg = (key: 'accuracyScore' | 'fluencyScore' | 'completenessScore' | 'prosodyScore') => {
        const xs = partials.map(p => p[key]).filter(v => v > 0)
        return xs.length === 0 ? 0 : Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)
      }
      // Whole-text fields take precedence for completeness/prosody since they
      // measure the user's full performance against the entire passage.
      const wholeOrAvg = (key: 'completenessScore' | 'prosodyScore') => {
        const w = whole?.[key] ?? 0
        return w > 0 ? w : avg(key)
      }

      const perWord = partials.flatMap(p => p.perWord ?? [])
      const mispronouncedWords = Array.from(
        new Set([
          ...partials.flatMap(p => p.mispronouncedWords ?? []),
          ...(whole?.mispronouncedWords ?? []),
        ])
      )
      const weakPhonemes = [
        ...partials.flatMap(p => p.weakPhonemes ?? []),
        ...(whole?.weakPhonemes ?? []),
      ]

      const real: PronunciationResult = {
        accuracyScore: avg('accuracyScore'),
        fluencyScore: avg('fluencyScore'),
        completenessScore: wholeOrAvg('completenessScore'),
        prosodyScore: wholeOrAvg('prosodyScore'),
        omittedWords:
          (whole?.omittedWords ?? 0) ||
          partials.reduce((s, p) => s + (p.omittedWords ?? 0), 0),
        repeatedWords:
          (whole?.repeatedWords ?? 0) ||
          partials.reduce((s, p) => s + (p.repeatedWords ?? 0), 0),
        mispronouncedWords,
        perWord,
        weakPhonemes,
        engine: whole?.engine ?? partials.find(p => p.engine)?.engine,
      }

      const allZero =
        real.accuracyScore === 0 && real.fluencyScore === 0 && real.completenessScore === 0
      if (allZero) {
        throw new Error('음성이 인식되지 않았습니다. 더 가까이서 또렷이 말씀해주세요.')
      }

      setLastResult(real)
      setPhase('done')
      if (passageIndex === 0) {
        sessionStore.setPronunciation1(real)
        setPassage1Done(true)
      } else {
        sessionStore.setPronunciation2(real)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setPhase('error')
      setErrorMessage(msg)
    }
  }, [currentPassage.text, passageIndex])

  const handleStopRecording = async () => {
    const mr = mediaRecorderRef.current
    if (!mr || mr.state === 'inactive') return

    const stopped = new Promise<Blob>((resolve) => {
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
        resolve(blob)
      }
      mr.stop()
    })

    // Stop STT immediately when user hits stop
    stopSTT()

    const elapsed = Date.now() - recStartedAtRef.current
    if (elapsed < 700) {
      setAnalysisHint('짧은 녹음이 감지됐습니다. 분석은 진행합니다.')
    }

    const blob = await stopped
    cleanupStream()

    // Persist to multi-slot store so result page can replay this passage
    audioStore.set(currentPassage.slot, blob)

    await evaluate(blob)
  }

  const handleRetry = useCallback(async () => {
    setRetryCount(c => c + 1)
    setLastResult(null)
    setErrorMessage(null)
    setPhase('idle')
    chunksRef.current = []
  }, [])

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <main
      className="min-h-screen flex flex-col items-center px-4 py-10"
      style={{ backgroundColor: '#F7FAF9', fontFamily: 'Pretendard, sans-serif' }}
    >
      <style jsx global>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');

        @keyframes pulse-ring-red {
          0%   { box-shadow: 0 0 0 0   rgba(239, 68, 68, 0.5); }
          70%  { box-shadow: 0 0 0 16px rgba(239, 68, 68, 0);   }
          100% { box-shadow: 0 0 0 0   rgba(239, 68, 68, 0);   }
        }
        @keyframes pulse-ring-mint {
          0%   { box-shadow: 0 0 0 0   rgba(0, 201, 167, 0.5); }
          70%  { box-shadow: 0 0 0 16px rgba(0, 201, 167, 0);  }
          100% { box-shadow: 0 0 0 0   rgba(0, 201, 167, 0);  }
        }
      `}</style>

      <div className="w-full max-w-xl flex flex-col gap-8">
        {/* Back */}
        <motion.button
          custom={0}
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          onClick={() => router.push('/goal')}
          className="flex items-center gap-1.5 w-fit transition-opacity duration-150 hover:opacity-70"
          style={{ color: '#6B7280', fontSize: '14px' }}
        >
          <span>←</span>
          <span>이전으로</span>
        </motion.button>

        {/* Steps */}
        <motion.div
          custom={1}
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          className="flex items-center gap-2 flex-wrap"
          style={{ fontSize: '13px' }}
        >
          {STEPS.map((step, idx) => (
            <span key={step} className="flex items-center gap-2">
              <span
                style={{
                  color: idx === 1 ? '#00C9A7' : '#374151',
                  fontWeight: idx === 1 ? 700 : 400,
                  padding: idx === 1 ? '2px 10px' : undefined,
                  borderRadius: idx === 1 ? '999px' : undefined,
                  border: idx === 1 ? '1px solid #00C9A7' : undefined,
                  backgroundColor: idx === 1 ? 'rgba(0, 201, 167, 0.08)' : undefined,
                }}
              >
                {step}
              </span>
              {idx < STEPS.length - 1 && <span style={{ color: '#D8DDE8' }}>→</span>}
            </span>
          ))}
        </motion.div>

        {/* Progress */}
        <motion.div
          custom={2}
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          className="flex flex-col gap-2"
        >
          <div
            className="flex items-center justify-between"
            style={{ fontSize: '12px', color: '#6B7280' }}
          >
            <span>STEP 1: 발음 평가</span>
            <span>{progressPct}%</span>
          </div>
          <div
            className="w-full rounded-full overflow-hidden"
            style={{ height: '4px', backgroundColor: '#E8E8EF' }}
          >
            <motion.div
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.8, ease: EASE }}
              style={{ height: '100%', backgroundColor: '#00C9A7', borderRadius: '999px' }}
            />
          </div>
        </motion.div>

        {/* Passage content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`passage-${passageIndex}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="flex flex-col gap-6"
          >
            {/* Header */}
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span
                  className="rounded-full px-3 py-0.5 text-xs font-bold"
                  style={{
                    backgroundColor: 'rgba(0, 201, 167, 0.12)',
                    color: '#00C9A7',
                    border: '1px solid rgba(0, 201, 167, 0.3)',
                  }}
                >
                  {passageIndex === 0 ? '지문 1 / 2' : '지문 2 / 2'}
                </span>
                {passage1Done && passageIndex === 1 && (
                  <span
                    className="rounded-full px-2.5 py-0.5 text-xs"
                    style={{ backgroundColor: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0' }}
                  >
                    지문 1 완료
                  </span>
                )}
                {retryCount > 0 && (
                  <span
                    className="rounded-full px-2.5 py-0.5 text-xs"
                    style={{ backgroundColor: '#FFF7ED', color: '#C2410C', border: '1px solid #FED7AA' }}
                  >
                    재시도 {retryCount}회
                  </span>
                )}
              </div>
              <h1
                className="font-bold leading-snug"
                style={{ fontSize: 'clamp(18px, 4vw, 24px)', color: '#111827' }}
              >
                소리 내어 읽어주세요
              </h1>
              <p style={{ fontSize: '13px', color: '#6B7280', marginTop: '4px' }}>
                {currentPassage.title}
              </p>
            </div>

            {/* Passage card */}
            <div
              className="rounded-2xl p-6"
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #E0E8E5',
                lineHeight: 1.9,
                fontSize: '18px',
              }}
            >
              <p className="flex flex-wrap gap-x-2 gap-y-1">
                {words.map((word, i) => (
                  <span
                    key={i}
                    style={{ color: '#374151', fontWeight: 400 }}
                  >
                    {word}
                  </span>
                ))}
              </p>
            </div>

            {/* Realtime recognized text */}
            <AnimatePresence>
              {phase === 'recording' && recognizedText && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.2 }}
                  className="rounded-xl p-4"
                  style={{
                    backgroundColor: 'rgba(0, 201, 167, 0.05)',
                    border: '1px solid rgba(0, 201, 167, 0.2)',
                  }}
                >
                  <p style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>
                    인식된 텍스트
                  </p>
                  <p style={{ fontSize: '14px', color: '#374151', lineHeight: 1.6 }}>
                    {recognizedText}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error banner */}
            {phase === 'error' && errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl p-4 flex flex-col gap-3"
                style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}
              >
                <p style={{ fontSize: '13px', color: '#B91C1C', lineHeight: 1.6 }}>
                  {errorMessage}
                </p>
                <button
                  onClick={handleRetry}
                  className="self-start rounded-lg px-4 py-2 font-bold transition-all duration-200 active:scale-95"
                  style={{ backgroundColor: '#EF4444', color: '#FFFFFF', fontSize: '13px' }}
                >
                  다시 시도
                </button>
              </motion.div>
            )}

            {/* Analyzing banner */}
            {phase === 'analyzing' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl p-4 flex items-center gap-3"
                style={{
                  backgroundColor: 'rgba(0, 201, 167, 0.06)',
                  border: '1px solid rgba(0, 201, 167, 0.25)',
                }}
              >
                <div
                  className="w-5 h-5 rounded-full border-2 animate-spin"
                  style={{ borderColor: '#00C9A7', borderTopColor: 'transparent' }}
                />
                <div className="flex flex-col">
                  <span style={{ fontSize: '13px', color: '#00A88C', fontWeight: 700 }}>
                    {analysisHint || '분석 중…'}
                  </span>
                  <span style={{ fontSize: '11px', color: '#6B7280' }}>
                    한국어 발음 평가가 실행 중입니다 (평균 5–15초)
                  </span>
                </div>
              </motion.div>
            )}

            {/* Score card */}
            <AnimatePresence>
              {phase === 'done' && lastResult && !isTransitioning && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.4, ease: EASE }}
                  className="rounded-2xl flex flex-col gap-4"
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1.5px solid rgba(0,201,167,0.35)',
                    padding: '20px',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="8" r="7" stroke="#00C9A7" strokeWidth="1.5" />
                        <path d="M5 8L7 10L11 6" stroke="#00C9A7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#111827' }}>
                        {passageIndex === 0 ? '지문 1 분석 결과' : '지문 2 분석 결과'}
                      </span>
                    </div>
                    <span
                      className="rounded-full px-2 py-0.5"
                      style={{
                        fontSize: '11px',
                        color: '#00A88C',
                        backgroundColor: 'rgba(0,201,167,0.08)',
                        border: '1px solid rgba(0,201,167,0.25)',
                        fontWeight: 600,
                      }}
                    >
                      즉시 분석
                    </span>
                  </div>

                  <div className="flex flex-col gap-2.5">
                    {[
                      { label: '정확도', value: lastResult.accuracyScore },
                      { label: '유창성', value: lastResult.fluencyScore },
                      { label: '완전성', value: lastResult.completenessScore },
                      ...(lastResult.prosodyScore > 0
                        ? [{ label: '운율', value: lastResult.prosodyScore }]
                        : []),
                    ].map(({ label, value }) => {
                      const color =
                        value >= 80 ? '#00C9A7' : value >= 60 ? '#3B82F6' : value >= 40 ? '#F59E0B' : '#EF4444'
                      return (
                        <div key={label} className="flex items-center gap-3">
                          <span style={{ fontSize: '12px', color: '#6B7280', minWidth: '36px' }}>
                            {label}
                          </span>
                          <div
                            className="flex-1 rounded-full overflow-hidden"
                            style={{ height: '6px', backgroundColor: '#E8E8EF' }}
                          >
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${value}%` }}
                              transition={{ duration: 0.7, ease: EASE, delay: 0.1 }}
                              style={{ height: '100%', backgroundColor: color, borderRadius: '999px' }}
                            />
                          </div>
                          <span
                            style={{
                              fontSize: '13px',
                              fontWeight: 700,
                              color,
                              minWidth: '32px',
                              textAlign: 'right',
                            }}
                          >
                            {value}점
                          </span>
                        </div>
                      )
                    })}
                    {lastResult.mispronouncedWords.length > 0 && (
                      <p style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '2px' }}>
                        보강 권장 단어:{' '}
                        <span style={{ color: '#F59E0B', fontWeight: 600 }}>
                          {lastResult.mispronouncedWords.join(', ')}
                        </span>
                      </p>
                    )}

                    {/* Per-word score chips — visible inline so users see word-level detail right away */}
                    {lastResult.perWord && lastResult.perWord.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {lastResult.perWord.map((w, i) => {
                          const c = w.pron >= 80 ? '#00C9A7' : w.pron >= 60 ? '#3B82F6' : w.pron >= 40 ? '#F59E0B' : '#EF4444'
                          return (
                            <span
                              key={`${w.word}-${i}`}
                              className="rounded-md px-2 py-0.5"
                              style={{
                                fontSize: '11px',
                                color: c,
                                border: `1px solid ${c}55`,
                                fontWeight: 600,
                              }}
                            >
                              {w.word}{' '}
                              <span style={{ fontSize: '10px', fontVariantNumeric: 'tabular-nums' }}>
                                {w.pron}
                              </span>
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <motion.button
                      onClick={handleProceed}
                      whileTap={{ scale: 0.97 }}
                      className="w-full rounded-xl font-bold"
                      style={{
                        backgroundColor: '#00C9A7',
                        color: '#FFFFFF',
                        fontSize: '15px',
                        padding: '13px',
                      }}
                    >
                      {passageIndex === 0 ? '지문 2 시작하기 →' : '다음 단계로 →'}
                    </motion.button>
                    <button
                      onClick={handleRetry}
                      className="self-center transition-opacity duration-150 hover:opacity-70"
                      style={{ fontSize: '12px', color: '#9CA3AF' }}
                    >
                      이 지문 다시 녹음하기
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Recording control */}
            <div className="flex flex-col items-center gap-4 py-4">
              <AnimatePresence mode="wait">
                {isTransitioning ? (
                  <motion.div
                    key="transitioning"
                    initial={{ scale: 0.85, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.85, opacity: 0 }}
                    transition={{ duration: 0.3, ease: EASE }}
                    className="flex flex-col items-center gap-3"
                  >
                    <div
                      className="w-20 h-20 rounded-full flex items-center justify-center"
                      style={{
                        backgroundColor: 'rgba(0, 201, 167, 0.15)',
                        border: '2px solid #00C9A7',
                      }}
                    >
                      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                        <path
                          d="M6 16L13 23L26 9"
                          stroke="#00C9A7"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                    <p style={{ fontSize: '15px', color: '#00C9A7', fontWeight: 600 }}>
                      이동 중...
                    </p>
                  </motion.div>
                ) : phase === 'recording' ? (
                  <motion.div
                    key="recording"
                    initial={{ scale: 0.85, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.85, opacity: 0 }}
                    transition={{ duration: 0.3, ease: EASE }}
                    className="flex flex-col items-center gap-3"
                  >
                    <button
                      onClick={handleStopRecording}
                      className="w-20 h-20 rounded-full flex items-center justify-center transition-transform duration-150 active:scale-95"
                      style={{
                        backgroundColor: '#EF4444',
                        animation: 'pulse-ring-red 1.2s ease-out infinite',
                      }}
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <rect x="6" y="6" width="12" height="12" rx="2" fill="white" />
                      </svg>
                    </button>
                    <p style={{ fontSize: '14px', color: '#EF4444', fontWeight: 600 }}>
                      읽는 중... (버튼을 눌러 완료)
                    </p>
                  </motion.div>
                ) : phase === 'analyzing' || phase === 'done' || phase === 'error' ? (
                  <motion.div
                    key="post-record"
                    initial={{ scale: 0.85, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.85, opacity: 0 }}
                    transition={{ duration: 0.3, ease: EASE }}
                  />
                ) : (
                  <motion.div
                    key="idle"
                    initial={{ scale: 0.85, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.85, opacity: 0 }}
                    transition={{ duration: 0.3, ease: EASE }}
                    className="flex flex-col items-center gap-3"
                  >
                    <button
                      onClick={handleStartRecording}
                      className="w-20 h-20 rounded-full flex items-center justify-center transition-transform duration-150 active:scale-95"
                      style={{
                        backgroundColor: '#00C9A7',
                        animation: 'pulse-ring-mint 2s ease-out infinite',
                      }}
                    >
                      <svg
                        width="28"
                        height="28"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#0A0A0F"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="9" y="2" width="6" height="11" rx="3" />
                        <path d="M5 10a7 7 0 0 0 14 0" />
                        <line x1="12" y1="19" x2="12" y2="22" />
                        <line x1="9" y1="22" x2="15" y2="22" />
                      </svg>
                    </button>
                    <p style={{ fontSize: '14px', color: '#6B7280' }}>녹음 시작</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  )
}

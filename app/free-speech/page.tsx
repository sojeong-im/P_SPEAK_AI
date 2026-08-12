'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { sessionStore } from '@/lib/session-store'
import { audioStore } from '@/lib/audio-store'
import { blobToPcmWav } from '@/lib/audio/wav-encoder'

const STEPS = ['시작', 'STEP 1', 'STEP 2', 'STEP 3', '결과']
const EASING = [0.25, 0.46, 0.45, 0.94] as unknown as import('framer-motion').Easing

const fadeInUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.5, ease: EASING },
  }),
}

type SpeechConcernType = '취업 및 커리어' | '대중 발표' | '인간관계' | '기타'
type RecordingState = 'idle' | 'precount' | 'recording' | 'done'

const CONCERN_OPTIONS: { value: SpeechConcernType; label: string; sub: string }[] = [
  { value: '취업 및 커리어', label: '취업 및 커리어', sub: '압박 면접, 연봉 협상 등' },
  { value: '대중 발표', label: '대중 발표', sub: '사내 프레젠테이션, 다수 앞 스피치 등' },
  { value: '인간관계', label: '인간관계', sub: '오해를 푸는 대화, 거절·부탁 상황 등' },
  { value: '기타', label: '기타', sub: '직접 입력' },
]

// Self-reflection prompt: ask the user to recall their own past struggle
// in this kind of setting and what they want to do differently going forward.
// Examples mirror that arc: 그때 어땠는지 → 무엇이 어려웠는지 → 앞으로의 다짐.
const UNIFIED_QUESTION =
  '선택하신 자리에서 말하기가 어려웠던 경험이 있다면 떠올려 주세요. 그때 어떤 점이 힘들었고, 앞으로는 어떻게 말해보고 싶으신가요?'

const UNIFIED_GUIDE: { steps: string[]; samples: string[] } = {
  steps: [
    '말하기가 어려웠던 한 장면을 떠올리기 (언제·어디서)',
    '그때 무엇이 어려웠는지 (감정·생각·몸의 반응)',
    '앞으로는 어떻게 말해보고 싶은지',
  ],
  samples: [
    '회의에서 의견을 내야 할 때가 가장 어려웠어요. 머리로는 정리됐는데 막상 입을 떼면 목소리가 작아졌고, 끝나고 후회만 했어요. 앞으로는 잘하지 않아도 되니까, 한 회의에 한 번은 꼭 입을 떼는 사람이 되고 싶어요.',
    '친구한테 서운했던 걸 말하는 게 늘 어려웠어요. 분위기 깰까 봐 참다가 더 멀어진 적도 있었고요. 앞으로는 감정이 식기 전에 짧게라도 그날 안에 말로 풀어내고 싶어요.',
  ],
}

const PREP_SEC = 60
const PRE_COUNT_SEC = 5
const REC_SEC = 60

function formatTime(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export default function FreeSpeechPage() {
  const router = useRouter()

  // Phase 1
  const [phase, setPhase] = useState<'category' | 'recording'>('category')
  const [selectedConcern, setSelectedConcern] = useState<SpeechConcernType | null>(null)
  const [customConcern, setCustomConcern] = useState('')
  const [guideOpen, setGuideOpen] = useState(false)

  // Phase 2 — prep timer
  const [prepTimeLeft, setPrepTimeLeft] = useState(PREP_SEC)

  // Phase 2 — recording
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [preCount, setPreCount] = useState(PRE_COUNT_SEC)
  const [recTimeLeft, setRecTimeLeft] = useState(REC_SEC)
  const [waveHeights, setWaveHeights] = useState<number[]>(Array(12).fill(4))
  const [audioUrl, setAudioUrl] = useState<string | null>(null)

  const prepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const preCountTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const waveRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recStateRef = useRef<RecordingState>('idle')
  const sttStopRef = useRef<(() => void) | null>(null)
  // Confirmed final utterances joined with spaces. Updated only on Recognized.
  const sttFinalRef = useRef<string>('')
  // Snapshot of what the user currently sees (final + in-progress partial).
  // We persist this on stop because Recognized may not fire for the very last
  // utterance if the user hits Stop mid-sentence.
  const sttDisplayRef = useRef<string>('')

  const [recognizedText, setRecognizedText] = useState('')

  function setRecState(s: RecordingState) {
    recStateRef.current = s
    setRecordingState(s)
  }

  // Auto-start prep timer when entering recording phase
  useEffect(() => {
    if (phase !== 'recording') return
    setPrepTimeLeft(PREP_SEC)
    prepTimerRef.current = setInterval(() => {
      setPrepTimeLeft((prev) => {
        if (prev <= 1) {
          if (prepTimerRef.current) clearInterval(prepTimerRef.current)
          prepTimerRef.current = null
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => {
      if (prepTimerRef.current) clearInterval(prepTimerRef.current)
    }
  }, [phase])

  function stopWave() {
    if (waveRef.current) {
      clearInterval(waveRef.current)
      waveRef.current = null
    }
    setWaveHeights(Array(12).fill(4))
  }

  function finishRecording() {
    if (recStateRef.current === 'done') return
    if (recTimerRef.current) {
      clearInterval(recTimerRef.current)
      recTimerRef.current = null
    }
    stopWave()
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (sttStopRef.current) {
      sttStopRef.current()
      sttStopRef.current = null
    }
    // Prefer finalized utterances; fall back to whatever the user could see
    // on screen (final + last partial) if Recognized didn't fire for the
    // tail end of the recording.
    // Azure Korean STT often misreads declarative endings as questions
    // ("머리로는?"). The free-speech prompt is reflective so real questions
    // are rare; replace ? with . for cleaner display.
    const rawText = (sttFinalRef.current || sttDisplayRef.current).trim()
    const finalText = rawText.replace(/\?/g, '.')
    sessionStore.setFreeSpeech(finalText)
    if (!finalText) {
      console.warn('[free-speech] STT produced no text — Azure key/permission/mic likely failed')
    } else {
      console.log(`[free-speech] STT captured ${finalText.length} chars`)
    }
    setRecState('done')
  }

  // Best-effort: also score the free-speech audio with SpeechSuper para.eval,
  // using the STT transcript as refText. Score reflects how cleanly the
  // speaker pronounced their own words. Failures are silently ignored.
  async function scoreFreeSpeechIfPossible(blob: Blob, transcript: string) {
    if (!transcript || transcript.length < 8) return
    try {
      const encoded = await blobToPcmWav(blob)
      const fd = new FormData()
      fd.append('audio', encoded.blob, 'free-speech.wav')
      fd.append('refText', transcript)
      fd.append('coreType', 'para.eval')
      fd.append('audioType', 'wav')
      fd.append('sampleRate', String(encoded.sampleRate))
      fd.append('userId', 'free-speech')
      const res = await fetch('/api/pronunciation/evaluate', { method: 'POST', body: fd })
      const json = await res.json()
      if (res.ok && json?.ok && json.result) {
        sessionStore.save({
          freeSpeechScore: {
            accuracyScore: json.result.accuracyScore,
            fluencyScore: json.result.fluencyScore,
            completenessScore: json.result.completenessScore,
            prosodyScore: json.result.prosodyScore,
            recognizedText: json.result.recognizedText,
            perWord: json.result.perWord,
          },
        })
      }
    } catch (e) {
      console.warn('[free-speech] SpeechSuper scoring failed:', e)
    }
  }

  async function startMediaRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      setRecState('recording')

      const mimeType = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : 'audio/webm'

      chunksRef.current = []
      sttFinalRef.current = ''
      sttDisplayRef.current = ''
      setRecognizedText('')
      const mr = new MediaRecorder(stream, { mimeType })
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        const url = audioStore.set('freeSpeech', blob)
        setAudioUrl(url)
        stream.getTracks().forEach((t) => t.stop())
        // Background score (does not block navigation)
        const transcript = (sttFinalRef.current || sttDisplayRef.current).trim()
        if (transcript) {
          void scoreFreeSpeechIfPossible(blob, transcript)
        }
      }
      mr.start()
      mediaRecorderRef.current = mr

      // Start Azure STT in parallel. Both events feed the display ref so the
      // box keeps growing while the user speaks; finalized utterances also
      // accumulate into sttFinalRef as the authoritative transcript.
      try {
        const { startSTT } = await import('@/lib/azure/speech-service')
        const stop = await startSTT({
          onRecognizing: (text: string) => {
            const partial = (text ?? '').trim()
            const combined = sttFinalRef.current
              ? (partial ? `${sttFinalRef.current} ${partial}` : sttFinalRef.current)
              : partial
            sttDisplayRef.current = combined
            setRecognizedText(combined)
          },
          onRecognized: (text: string) => {
            const t = (text ?? '').trim()
            if (!t) return
            sttFinalRef.current = sttFinalRef.current
              ? `${sttFinalRef.current} ${t}`
              : t
            sttDisplayRef.current = sttFinalRef.current
            setRecognizedText(sttFinalRef.current)
          },
          onError: (err: string) => {
            console.warn('[free-speech] STT error:', err)
          },
        })
        sttStopRef.current = stop
      } catch (e) {
        console.warn('[free-speech] STT init failed:', e)
      }

      setRecTimeLeft(REC_SEC)
      waveRef.current = setInterval(() => {
        setWaveHeights(Array(12).fill(0).map(() => Math.floor(Math.random() * 24) + 4))
      }, 120)

      let t = REC_SEC
      recTimerRef.current = setInterval(() => {
        t -= 1
        setRecTimeLeft(t)
        if (t <= 0) finishRecording()
      }, 1000)
    } catch {
      setRecState('idle')
    }
  }

  function handleStartPress() {
    if (prepTimerRef.current) {
      clearInterval(prepTimerRef.current)
      prepTimerRef.current = null
    }
    setRecState('precount')
    let count = PRE_COUNT_SEC
    setPreCount(count)
    preCountTimerRef.current = setInterval(() => {
      count -= 1
      setPreCount(count)
      if (count <= 0) {
        if (preCountTimerRef.current) clearInterval(preCountTimerRef.current)
        preCountTimerRef.current = null
        startMediaRecording()
      }
    }, 1000)
  }

  function handleGoToRecording() {
    if (!selectedConcern) return
    const label =
      selectedConcern === '기타' && customConcern.trim()
        ? `기타: ${customConcern.trim()}`
        : selectedConcern
    sessionStore.setSpeechConcern(label)
    // Also persist as the "selected stage" so the result page and admin
    // table show a non-empty value. The new concern labels almost match
    // StageType already; just normalise '취업 및 커리어' → '취업/커리어'.
    const stageLabel: '취업/커리어' | '대중 발표' | '인간관계' | '기타' =
      selectedConcern === '취업 및 커리어'
        ? '취업/커리어'
        : (selectedConcern as '대중 발표' | '인간관계' | '기타')
    const stageDetail =
      selectedConcern === '기타' && customConcern.trim()
        ? customConcern.trim()
        : ''
    sessionStore.setStage(stageLabel, stageDetail)
    setPhase('recording')
  }

  function handleSkip() {
    sessionStore.setFreeSpeech('')
    router.push('/personality')
  }

  useEffect(() => {
    return () => {
      if (prepTimerRef.current) clearInterval(prepTimerRef.current)
      if (preCountTimerRef.current) clearInterval(preCountTimerRef.current)
      if (recTimerRef.current) clearInterval(recTimerRef.current)
      if (waveRef.current) clearInterval(waveRef.current)
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      if (sttStopRef.current) {
        sttStopRef.current()
        sttStopRef.current = null
      }
    }
  }, [])

  const canCategoryProceed =
    selectedConcern !== null &&
    (selectedConcern !== '기타' || customConcern.trim().length > 0)

  const question = UNIFIED_QUESTION

  return (
    <main
      className="min-h-screen flex flex-col items-center px-4 py-10"
      style={{ backgroundColor: '#F7FAF9', fontFamily: 'Pretendard, sans-serif' }}
    >
      <style jsx global>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
        @keyframes pulse-ring-red {
          0%   { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.5); }
          70%  { box-shadow: 0 0 0 20px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        @keyframes pulse-ring-mint {
          0%   { box-shadow: 0 0 0 0 rgba(0, 201, 167, 0.5); }
          70%  { box-shadow: 0 0 0 20px rgba(0, 201, 167, 0); }
          100% { box-shadow: 0 0 0 0 rgba(0, 201, 167, 0); }
        }
        audio::-webkit-media-controls-panel { background-color: #F0FAF7; }
      `}</style>

      <div className="w-full max-w-xl flex flex-col gap-8">

        {/* 뒤로가기 */}
        <motion.button
          custom={0}
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          onClick={() => phase === 'category' ? router.push('/reading') : setPhase('category')}
          className="flex items-center gap-1.5 w-fit transition-opacity duration-150 hover:opacity-70"
          style={{ color: '#6B7280', fontSize: '14px' }}
        >
          <span>←</span>
          <span>이전으로</span>
        </motion.button>

        {/* 진행 단계 */}
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
                  color: idx === 2 ? '#00C9A7' : '#9CA3AF',
                  fontWeight: idx === 2 ? 700 : 400,
                  padding: idx === 2 ? '2px 10px' : undefined,
                  borderRadius: idx === 2 ? '999px' : undefined,
                  border: idx === 2 ? '1px solid #00C9A7' : undefined,
                  backgroundColor: idx === 2 ? 'rgba(0, 201, 167, 0.08)' : undefined,
                }}
              >
                {step}
              </span>
              {idx < STEPS.length - 1 && (
                <span style={{ color: '#D8DDE8' }}>→</span>
              )}
            </span>
          ))}
        </motion.div>

        {/* 진행바 */}
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
            <span>STEP 2: 자리 선택</span>
            <span>{phase === 'category' ? '60%' : '65%'}</span>
          </div>
          <div
            className="w-full rounded-full overflow-hidden"
            style={{ height: '4px', backgroundColor: '#E8E8EF' }}
          >
            <motion.div
              initial={{ width: '60%' }}
              animate={{ width: phase === 'category' ? '62%' : '68%' }}
              transition={{ duration: 0.8, ease: EASING as unknown as import('framer-motion').Easing, delay: 0.3 }}
              style={{ height: '100%', backgroundColor: '#00C9A7', borderRadius: '999px' }}
            />
          </div>
        </motion.div>

        {/* ─── 페이즈 전환 ─── */}
        <AnimatePresence mode="wait">
          {phase === 'category' ? (

            /* ════════════════════════════════════════
               Phase 1 — 고민 유형 선택
            ════════════════════════════════════════ */
            <motion.div
              key="category"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.3, ease: EASING }}
              className="flex flex-col gap-6"
            >
              {/* 헤더 */}
              <motion.div
                custom={3}
                variants={fadeInUp}
                initial="hidden"
                animate="visible"
                className="flex flex-col gap-2"
              >
                <h1
                  className="font-extrabold leading-tight"
                  style={{ fontSize: 'clamp(22px, 5vw, 30px)', color: '#111827', letterSpacing: '-0.5px' }}
                >
                  말하기 두려움이 사라진다면, 어떤 자리에 서고 싶나요?
                </h1>
                <p style={{ fontSize: '14px', color: '#6B7280', lineHeight: 1.6 }}>
                  지금 가장 마음 가는 자리 하나만 골라주세요. 다음 단계에서 그 장면을 함께 그려봅니다.
                </p>
              </motion.div>

              {/* 옵션 그리드 */}
              <motion.div
                custom={4}
                variants={fadeInUp}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-2 gap-3"
              >
                {CONCERN_OPTIONS.map((option) => {
                  const isSelected = selectedConcern === option.value
                  return (
                    <motion.button
                      key={option.value}
                      onClick={() => {
                        setSelectedConcern(option.value)
                        if (option.value !== '기타') setCustomConcern('')
                      }}
                      whileTap={{ scale: 0.97 }}
                      transition={{ duration: 0.15, ease: EASING }}
                      className="flex flex-col gap-2 rounded-xl p-4 text-left transition-all duration-200"
                      style={{
                        backgroundColor: isSelected ? 'rgba(0,201,167,0.08)' : '#F8FAF9',
                        border: isSelected ? '2px solid #00C9A7' : '1.5px solid #E5EDE9',
                        cursor: 'pointer',
                      }}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span
                          style={{
                            fontSize: '15px',
                            fontWeight: 700,
                            color: isSelected ? '#00A88C' : '#0F172A',
                            letterSpacing: '-0.01em',
                          }}
                        >
                          {option.label}
                        </span>
                        {/* 체크박스 인디케이터 */}
                        <div
                          style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            border: isSelected ? '2px solid #00C9A7' : '2px solid #D1D5DB',
                            backgroundColor: isSelected ? '#00C9A7' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            transition: 'all 0.2s',
                          }}
                        >
                          {isSelected && (
                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                              <path
                                d="M1 4L4 7L9 1"
                                stroke="white"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </div>
                      </div>
                      <span style={{ fontSize: '12px', color: '#9CA3AF', lineHeight: '1.4' }}>
                        {option.sub}
                      </span>
                    </motion.button>
                  )
                })}
              </motion.div>

              {/* 기타 직접 입력 */}
              <AnimatePresence>
                {selectedConcern === '기타' && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2, ease: EASING }}
                    className="flex flex-col gap-1.5"
                  >
                    <label style={{ fontSize: '13px', color: '#6B7280', fontWeight: 500 }}>
                      어떤 자리인지 알려주세요
                    </label>
                    <input
                      type="text"
                      value={customConcern}
                      onChange={(e) => setCustomConcern(e.target.value)}
                      placeholder="예: 결혼식 축사, 가족에게 사과하는 자리..."
                      autoFocus
                      className="w-full rounded-xl px-4 py-3 transition-all duration-200"
                      style={{
                        backgroundColor: '#F8FAF9',
                        border: '1.5px solid #E0E8E5',
                        color: '#0F172A',
                        fontSize: '15px',
                        fontFamily: 'Pretendard, sans-serif',
                        outline: 'none',
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = '#00C9A7'
                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,201,167,0.12)'
                        e.currentTarget.style.backgroundColor = '#FFFFFF'
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#E0E8E5'
                        e.currentTarget.style.boxShadow = 'none'
                        e.currentTarget.style.backgroundColor = '#F8FAF9'
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 버튼 */}
              <motion.div
                custom={5}
                variants={fadeInUp}
                initial="hidden"
                animate="visible"
                className="flex flex-col items-center gap-3"
              >
                <button
                  onClick={handleGoToRecording}
                  disabled={!canCategoryProceed}
                  className="w-full rounded-2xl font-bold transition-all duration-200 active:scale-95"
                  style={{
                    backgroundColor: canCategoryProceed ? '#00C9A7' : '#E8E8EF',
                    color: canCategoryProceed ? '#F7FAF9' : '#9CA3AF',
                    fontSize: '17px',
                    padding: '16px',
                    cursor: canCategoryProceed ? 'pointer' : 'not-allowed',
                    boxShadow: canCategoryProceed ? '0 4px 18px 0 rgba(0,201,167,0.3)' : 'none',
                  }}
                >
                  다음으로 →
                </button>
                <button
                  onClick={handleSkip}
                  className="transition-opacity duration-150 hover:opacity-70"
                  style={{ fontSize: '13px', color: '#9CA3AF' }}
                >
                  건너뛰기
                </button>
              </motion.div>
            </motion.div>

          ) : (

            /* ════════════════════════════════════════
               Phase 2 — 스피치 질문 + 녹음
            ════════════════════════════════════════ */
            <motion.div
              key="recording"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.3, ease: EASING }}
              className="flex flex-col gap-6"
            >
              {/* 질문 카드 */}
              <motion.div
                custom={3}
                variants={fadeInUp}
                initial="hidden"
                animate="visible"
                className="rounded-2xl p-6 flex flex-col gap-4"
                style={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E0E8E5',
                  boxShadow: '0 2px 12px 0 rgba(0,0,0,0.04)',
                }}
              >
                {/* 배지 + 준비 타이머 */}
                <div className="flex items-center justify-between">
                  <span
                    className="inline-block rounded-full px-3 py-0.5"
                    style={{
                      backgroundColor: 'rgba(0, 201, 167, 0.1)',
                      color: '#00A88C',
                      fontSize: '12px',
                      fontWeight: 600,
                      border: '1px solid rgba(0, 201, 167, 0.25)',
                    }}
                  >
                    {selectedConcern}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <div
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: prepTimeLeft > 0 ? '#00C9A7' : '#D1D5DB',
                        transition: 'background-color 0.5s',
                      }}
                    />
                    <span
                      style={{
                        fontSize: '12px',
                        color: '#9CA3AF',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      준비 시간 {formatTime(prepTimeLeft)}
                    </span>
                  </div>
                </div>

                <p
                  style={{
                    fontSize: '16px',
                    color: '#0F172A',
                    lineHeight: 1.8,
                    fontWeight: 600,
                    letterSpacing: '-0.01em',
                  }}
                >
                  {question}
                </p>

                <p style={{ fontSize: '13px', color: '#6B7280', lineHeight: 1.6 }}>
                  준비가 되면 아래 버튼을 눌러주세요. 5초 후 녹음이 시작됩니다.
                </p>
              </motion.div>

              {/* 말할거리 가이드 — 막막할 때 펼쳐서 보는 collapsible */}
              {selectedConcern && (
                <motion.div
                  custom={3.5}
                  variants={fadeInUp}
                  initial="hidden"
                  animate="visible"
                  className="rounded-2xl"
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E0E8E5',
                    overflow: 'hidden',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setGuideOpen(v => !v)}
                    className="w-full flex items-center justify-between px-5 py-3 transition-colors duration-150"
                    style={{
                      backgroundColor: guideOpen ? 'rgba(0,201,167,0.04)' : '#FFFFFF',
                      borderBottom: guideOpen ? '1px solid #E0E8E5' : '1px solid transparent',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '13px',
                        color: '#00A88C',
                        fontWeight: 700,
                        letterSpacing: '-0.01em',
                      }}
                    >
                      막상 말하려니 막막하다면 — 말할거리 가이드
                    </span>
                    <span
                      style={{
                        fontSize: '12px',
                        color: '#9CA3AF',
                        transform: guideOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                      }}
                    >
                      ▾
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {guideOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: EASING }}
                        style={{ overflow: 'hidden' }}
                      >
                        <div className="px-5 py-4 flex flex-col gap-4">
                          <div>
                            <p
                              className="font-bold mb-2"
                              style={{ fontSize: '12px', color: '#00C9A7', letterSpacing: '0.02em' }}
                            >
                              3단계로 떠올려 보세요
                            </p>
                            <ol className="flex flex-col gap-1.5">
                              {UNIFIED_GUIDE.steps.map((s, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <span
                                    className="flex items-center justify-center rounded-full flex-shrink-0"
                                    style={{
                                      width: '18px',
                                      height: '18px',
                                      backgroundColor: '#00C9A7',
                                      color: '#FFFFFF',
                                      fontSize: '11px',
                                      fontWeight: 700,
                                      marginTop: '1px',
                                    }}
                                  >
                                    {i + 1}
                                  </span>
                                  <span style={{ fontSize: '13px', color: '#374151', lineHeight: 1.6 }}>
                                    {s}
                                  </span>
                                </li>
                              ))}
                            </ol>
                          </div>
                          <div className="flex flex-col gap-2.5">
                            <p
                              className="font-bold"
                              style={{ fontSize: '12px', color: '#00C9A7', letterSpacing: '0.02em' }}
                            >
                              참고용 예시 (그대로 따라 읽지 마시고, 본인 상황으로 바꿔 보세요)
                            </p>
                            {UNIFIED_GUIDE.samples.map((sample, i) => (
                              <div
                                key={i}
                                className="rounded-xl p-3"
                                style={{ backgroundColor: '#F9FAFB', border: '1px solid #E8E8EF' }}
                              >
                                <p
                                  className="mb-1"
                                  style={{
                                    fontSize: '11px',
                                    color: '#9CA3AF',
                                    fontWeight: 600,
                                    letterSpacing: '0.04em',
                                  }}
                                >
                                  예시 {i + 1}
                                </p>
                                <p style={{ fontSize: '13px', color: '#374151', lineHeight: 1.7 }}>
                                  {sample}
                                </p>
                              </div>
                            ))}
                          </div>
                          <p
                            className="rounded-lg px-3 py-2"
                            style={{
                              fontSize: '11px',
                              color: '#9CA3AF',
                              backgroundColor: '#F9FAFB',
                              lineHeight: 1.6,
                            }}
                          >
                            완벽한 문장 안 만들어도 됩니다. 떠오르는 키워드 두세 개만 잡고 그 사이를 자연스럽게 연결한다고 생각하세요.
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}

              {/* 녹음 영역 */}
              <motion.div
                custom={4}
                variants={fadeInUp}
                initial="hidden"
                animate="visible"
                className="flex flex-col items-center gap-6 py-2"
              >
                <AnimatePresence mode="wait">

                  {/* 완료 */}
                  {recordingState === 'done' && (
                    <motion.div
                      key="done"
                      initial={{ scale: 0.85, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="flex flex-col items-center gap-5 w-full"
                    >
                      <div
                        className="w-24 h-24 rounded-full flex items-center justify-center"
                        style={{
                          backgroundColor: 'rgba(0, 201, 167, 0.12)',
                          border: '2px solid #00C9A7',
                        }}
                      >
                        <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                          <path
                            d="M7 18L15 26L29 10"
                            stroke="#00C9A7"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                      <p style={{ fontSize: '15px', color: '#00C9A7', fontWeight: 600 }}>
                        녹음 완료!
                      </p>

                      {/* 오디오 플레이어 */}
                      {audioUrl && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="w-full rounded-2xl p-4 flex flex-col gap-2"
                          style={{
                            backgroundColor: 'rgba(0, 201, 167, 0.04)',
                            border: '1px solid rgba(0, 201, 167, 0.15)',
                          }}
                        >
                          <p style={{ fontSize: '12px', color: '#6B7280', fontWeight: 500 }}>
                            내 목소리 들어보기
                          </p>
                          <audio
                            controls
                            src={audioUrl}
                            className="w-full"
                            style={{ height: '40px' }}
                          />
                        </motion.div>
                      )}
                    </motion.div>
                  )}

                  {/* 녹음 중 */}
                  {recordingState === 'recording' && (
                    <motion.div
                      key="recording-active"
                      initial={{ scale: 0.85, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="flex flex-col items-center gap-4"
                    >
                      {/* 파형 */}
                      <div className="flex items-center gap-1" style={{ height: '40px' }}>
                        {waveHeights.map((h, i) => (
                          <motion.div
                            key={i}
                            animate={{ height: h }}
                            transition={{ duration: 0.1, ease: EASING as unknown as import('framer-motion').Easing }}
                            style={{
                              width: '4px',
                              borderRadius: '2px',
                              backgroundColor: '#EF4444',
                              minHeight: '4px',
                            }}
                          />
                        ))}
                      </div>

                      {/* 정지 버튼 + 남은 시간 */}
                      <button
                        onClick={finishRecording}
                        className="w-24 h-24 rounded-full flex flex-col items-center justify-center gap-1 transition-all duration-200"
                        style={{
                          backgroundColor: '#EF4444',
                          animation: 'pulse-ring-red 1.2s ease-out infinite',
                        }}
                      >
                        <span
                          className="font-extrabold"
                          style={{
                            fontSize: '22px',
                            color: '#FFFFFF',
                            lineHeight: 1,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {formatTime(recTimeLeft)}
                        </span>
                        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.8)' }}>
                          남음
                        </span>
                      </button>

                      <p style={{ fontSize: '13px', color: '#EF4444' }}>
                        녹음 중 — 완료되면 버튼을 눌러주세요
                      </p>

                      {/* Real-time recognized text — gives the user immediate
                          confirmation that their voice is being captured. If
                          this stays empty, mic/key/permission has a problem. */}
                      {recognizedText && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="rounded-xl p-3 mt-2 w-full"
                          style={{
                            backgroundColor: 'rgba(0, 201, 167, 0.05)',
                            border: '1px solid rgba(0, 201, 167, 0.2)',
                          }}
                        >
                          <p style={{ fontSize: '11px', color: '#6B7280', marginBottom: '4px' }}>
                            인식된 텍스트
                          </p>
                          <p
                            style={{
                              fontSize: '13px',
                              color: '#374151',
                              lineHeight: 1.6,
                              whiteSpace: 'pre-wrap',
                            }}
                          >
                            {recognizedText}
                          </p>
                        </motion.div>
                      )}
                    </motion.div>
                  )}

                  {/* 카운트다운 (5초) */}
                  {recordingState === 'precount' && (
                    <motion.div
                      key="precount"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="flex flex-col items-center gap-3"
                    >
                      <motion.span
                        key={preCount}
                        initial={{ scale: 1.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.3, ease: EASING }}
                        style={{
                          fontSize: '88px',
                          fontWeight: 900,
                          color: '#00C9A7',
                          lineHeight: 1,
                          fontVariantNumeric: 'tabular-nums',
                          letterSpacing: '-0.04em',
                        }}
                      >
                        {preCount}
                      </motion.span>
                      <p style={{ fontSize: '14px', color: '#6B7280' }}>
                        준비하세요...
                      </p>
                    </motion.div>
                  )}

                  {/* 대기 (시작 전) */}
                  {recordingState === 'idle' && (
                    <motion.div
                      key="idle"
                      initial={{ scale: 0.85, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="flex flex-col items-center gap-3"
                    >
                      <button
                        onClick={handleStartPress}
                        className="w-24 h-24 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95"
                        style={{
                          backgroundColor: '#00C9A7',
                          animation: 'pulse-ring-mint 2s ease-out infinite',
                        }}
                      >
                        <svg
                          width="32"
                          height="32"
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
                      <p style={{ fontSize: '14px', color: '#6B7280' }}>
                        탭하여 녹음 시작 (최대 1분)
                      </p>
                    </motion.div>
                  )}

                </AnimatePresence>
              </motion.div>

              {/* 다음으로 / 건너뛰기 */}
              <motion.div
                custom={5}
                variants={fadeInUp}
                initial="hidden"
                animate="visible"
                className="flex flex-col items-center gap-3"
              >
                <button
                  onClick={() => router.push('/personality')}
                  disabled={recordingState !== 'done'}
                  className="w-full rounded-2xl font-bold transition-all duration-200 active:scale-95"
                  style={{
                    backgroundColor: recordingState === 'done' ? '#00C9A7' : '#E8E8EF',
                    color: recordingState === 'done' ? '#F7FAF9' : '#9CA3AF',
                    fontSize: '17px',
                    padding: '16px',
                    cursor: recordingState === 'done' ? 'pointer' : 'not-allowed',
                    boxShadow: recordingState === 'done' ? '0 4px 18px 0 rgba(0,201,167,0.3)' : 'none',
                  }}
                >
                  다음으로 →
                </button>
                <button
                  onClick={handleSkip}
                  className="transition-opacity duration-150 hover:opacity-70"
                  style={{ fontSize: '13px', color: '#9CA3AF' }}
                >
                  건너뛰기
                </button>
              </motion.div>
            </motion.div>

          )}
        </AnimatePresence>

      </div>
    </main>
  )
}

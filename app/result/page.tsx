'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { sessionStore } from '@/lib/session-store'
import { audioStore } from '@/lib/audio-store'
import { SPEAK_TYPES } from '@/lib/constants'
import type { VoicePrintSession, TypeScores } from '@/types'

// ─────────────────────────────────────────────
// Animation variants
// ─────────────────────────────────────────────
const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.18,
    },
  },
}

const sectionVariants = {
  hidden: { opacity: 0, y: 32 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.55,
      ease: [0.25, 0.46, 0.45, 0.94] as unknown as import('framer-motion').Easing,
    },
  },
}

// ─────────────────────────────────────────────
// Grade system for pronunciation scores
// ─────────────────────────────────────────────
type GradeInfo = {
  label: string
  color: string
  bg: string
  border: string
}

function getGrade(score: number): GradeInfo {
  if (score >= 90) return { label: '우수', color: '#00C9A7', bg: '#F0FDF9', border: '#A7F3D0' }
  if (score >= 70) return { label: '양호', color: '#3B82F6', bg: '#EFF6FF', border: '#BFDBFE' }
  if (score >= 50) return { label: '보통', color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A' }
  return { label: '미흡', color: '#EF4444', bg: '#FEF2F2', border: '#FECACA' }
}

// ─────────────────────────────────────────────
// Progress bar (used for pronunciation scores)
// ─────────────────────────────────────────────
function ProgressBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  const grade = getGrade(pct)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-center">
        <span style={{ fontSize: '13px', color: '#6B7280' }}>{label}</span>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: '13px', color: grade.color, fontWeight: 700 }}>{pct}점</span>
          <span
            className="rounded-full"
            style={{
              fontSize: '10px',
              fontWeight: 700,
              color: grade.color,
              backgroundColor: grade.bg,
              border: `1px solid ${grade.border}`,
              padding: '1px 7px',
              lineHeight: 1.4,
            }}
          >
            {grade.label}
          </span>
        </div>
      </div>
      <div
        style={{
          height: '6px',
          backgroundColor: '#E8E8EF',
          borderRadius: '999px',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <motion.div
          style={{
            height: '100%',
            backgroundColor: grade.color,
            borderRadius: '999px',
            position: 'relative',
            overflow: 'hidden',
          }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{
            duration: 0.8,
            ease: [0.25, 0.46, 0.45, 0.94] as unknown as import('framer-motion').Easing,
          }}
        >
          <motion.div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: '40%',
              background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.45) 50%, rgba(255,255,255,0) 100%)',
            }}
            initial={{ x: '-100%' }}
            animate={{ x: '300%' }}
            transition={{
              duration: 1.6,
              ease: 'easeInOut',
              delay: 0.4,
              repeat: 0,
            }}
          />
        </motion.div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Pronunciation panel
// ─────────────────────────────────────────────
function PronunciationPanel({
  title,
  subtitle,
  accuracyScore,
  fluencyScore,
  completenessScore,
  prosodyScore,
  omittedWords,
  repeatedWords,
  mispronouncedWords,
  audioUrl,
  perWord,
  weakPhonemes,
  engine,
}: {
  title: string
  subtitle: string
  accuracyScore: number
  fluencyScore: number
  completenessScore: number
  prosodyScore: number
  omittedWords: number
  repeatedWords: number
  mispronouncedWords: string[]
  audioUrl: string | null
  perWord?: { word: string; pron: number; isMispronounced: boolean }[]
  weakPhonemes?: { phoneme: string; pron: number }[]
  engine?: 'speechsuper' | 'azure'
}) {
  const analyzed = accuracyScore > 0 || fluencyScore > 0 || completenessScore > 0
  const avg = analyzed
    ? Math.round((accuracyScore + fluencyScore + completenessScore) / 3)
    : 0
  const avgGrade = getGrade(avg)

  // Auto-generated diagnostic
  const getDiagnostic = (): string => {
    if (fluencyScore > 80 && accuracyScore < 60) {
      return '유창성에 비해 음소 정확도가 낮습니다. 빠른 발화 속도가 조음 정밀도를 저하시키고 있을 가능성이 있습니다.'
    }
    if (completenessScore < 30) {
      return '발화 완결도가 현저히 낮습니다. 문장 마지막 음절 탈락 또는 조기 종결 패턴이 감지됩니다.'
    }
    if (accuracyScore >= 80 && fluencyScore >= 80 && completenessScore >= 80) {
      return '3개 지표 모두 양호 수준 이상입니다. 세부 음소 교정을 통해 우수 등급으로 향상 가능합니다.'
    }
    if (accuracyScore >= 70 && fluencyScore >= 70 && completenessScore >= 70) {
      return '전반적으로 균형 잡힌 발화 패턴을 보입니다. 지속적인 발화 훈련으로 안정성 강화를 권장합니다.'
    }
    if (accuracyScore < 50 && fluencyScore < 50) {
      return '음소 정확도와 유창성 지수가 모두 낮습니다. 기초 조음 훈련 및 발화 리듬 교정이 선행되어야 합니다.'
    }
    if (accuracyScore < completenessScore && accuracyScore < fluencyScore) {
      return '음소 정확도가 가장 취약한 영역입니다. 자음·모음 조음 위치 교정 훈련이 필요합니다.'
    }
    return '발음 지표가 혼재되어 있습니다. 균형 잡힌 발화 훈련 프로그램이 권장됩니다.'
  }

  const getWeakPoints = (): string[] => {
    const points: string[] = []
    if (accuracyScore > 0 && accuracyScore < 60) points.push('음소 정확도 부족 — 자음 조음 교정 필요')
    if (fluencyScore > 0 && fluencyScore < 60) points.push('유창성 저하 — 발화 리듬 및 속도 훈련 필요')
    if (completenessScore > 0 && completenessScore < 60) points.push('발화 완결도 낮음 — 문장 끝맺음 집중 훈련 필요')
    if (omittedWords >= 3) points.push(`누락 ${omittedWords}개 — 음절 탈락 교정 필요`)
    if (repeatedWords >= 2) points.push(`반복 ${repeatedWords}개 — 더듬거림 개선 필요`)
    return points
  }

  const weakPoints = analyzed ? getWeakPoints() : []

  const omittedHighlight = omittedWords > 0
  const repeatedHighlight = repeatedWords > 0

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-4"
      style={{ backgroundColor: '#F9FAFB', border: '1px solid #E8E8EF' }}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="font-bold" style={{ fontSize: '14px', color: '#111827' }}>
            {title}
          </p>
          <p style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '2px' }}>{subtitle}</p>
        </div>
        <div className="flex flex-col items-end" style={{ lineHeight: 1.2 }}>
          <span style={{ fontSize: '11px', color: '#9CA3AF' }}>평균</span>
          <span
            style={{
              fontSize: '22px',
              fontWeight: 800,
              color: analyzed ? avgGrade.color : '#9CA3AF',
            }}
          >
            {analyzed ? `${avg}점` : '분석 불가'}
          </span>
          {analyzed && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: avgGrade.color,
                marginTop: '2px',
                letterSpacing: '0.02em',
              }}
            >
              {avgGrade.label}
            </span>
          )}
        </div>
      </div>

      {analyzed ? (
        <>
          {audioUrl && (
            <div
              className="rounded-lg p-3 flex flex-col gap-2"
              style={{
                backgroundColor: 'rgba(0, 201, 167, 0.04)',
                border: '1px solid rgba(0, 201, 167, 0.2)',
              }}
            >
              <p style={{ fontSize: '11px', color: '#00A88C', fontWeight: 700 }}>
                내 녹음 다시 듣기
              </p>
              <audio
                controls
                src={audioUrl}
                className="w-full"
                style={{ height: '36px' }}
              />
            </div>
          )}
          <div className="flex flex-col gap-3">
            <ProgressBar label="음소 정확도" value={accuracyScore} />
            <ProgressBar label="유창성 지수" value={fluencyScore} />
            <ProgressBar label="발화 완결도" value={completenessScore} />
            {prosodyScore > 0 && <ProgressBar label="운율 / 리듬" value={prosodyScore} />}
          </div>
          {mispronouncedWords.length > 0 && (
            <div
              className="rounded-lg px-3 py-2 flex flex-col gap-1"
              style={{ backgroundColor: '#FFF7ED', border: '1px solid #FED7AA' }}
            >
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#C2410C', letterSpacing: '0.06em' }}>
                보강 권장 단어
              </span>
              <span style={{ fontSize: '12px', color: '#7C3012', lineHeight: 1.6 }}>
                {mispronouncedWords.join(', ')}
              </span>
            </div>
          )}
          {/* (b) Per-word score visualization */}
          {perWord && perWord.length > 0 && (
            <div
              className="rounded-lg px-3 py-2.5 flex flex-col gap-2"
              style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E8EF' }}
            >
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#6B7280', letterSpacing: '0.06em' }}>
                단어별 발음 점수
              </span>
              <div className="flex flex-wrap gap-1.5">
                {perWord.map((w, i) => {
                  const c = w.pron >= 80 ? '#00C9A7' : w.pron >= 60 ? '#3B82F6' : w.pron >= 40 ? '#F59E0B' : '#EF4444'
                  const bg = w.pron >= 80 ? '#F0FDF9' : w.pron >= 60 ? '#EFF6FF' : w.pron >= 40 ? '#FFFBEB' : '#FEF2F2'
                  return (
                    <span
                      key={`${w.word}-${i}`}
                      className="rounded-md px-2 py-0.5"
                      style={{
                        fontSize: '12px',
                        color: c,
                        backgroundColor: bg,
                        border: `1px solid ${c}33`,
                        fontWeight: 600,
                      }}
                      title={`${w.word}: ${w.pron}점`}
                    >
                      {w.word} <span style={{ fontSize: '10px', fontVariantNumeric: 'tabular-nums' }}>{w.pron}</span>
                    </span>
                  )
                })}
              </div>
            </div>
          )}
          {/* (d) Weak phoneme panel */}
          {weakPhonemes && weakPhonemes.length > 0 && (
            <div
              className="rounded-lg px-3 py-2.5 flex flex-col gap-2"
              style={{ backgroundColor: '#FFF7ED', border: '1px solid #FED7AA' }}
            >
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#C2410C', letterSpacing: '0.06em' }}>
                보강 권장 음소
              </span>
              <div className="flex flex-wrap gap-1.5">
                {weakPhonemes.map((p, i) => (
                  <span
                    key={`${p.phoneme}-${i}`}
                    className="rounded-md px-2 py-0.5"
                    style={{
                      fontSize: '12px',
                      color: '#9A3412',
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #FED7AA',
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    /{p.phoneme}/ {p.pron}점
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <div
              className="flex items-center gap-1.5 rounded-full px-3 py-1"
              style={{
                backgroundColor: omittedHighlight ? '#FFF7ED' : '#E8E8EF',
                border: omittedHighlight ? '1px solid #FED7AA' : '1px solid transparent',
                fontSize: '12px',
                color: omittedHighlight ? '#C2410C' : '#6B7280',
              }}
            >
              <span>누락</span>
              <span style={{ fontWeight: 700, color: omittedHighlight ? '#9A3412' : '#374151' }}>
                {omittedWords}개
              </span>
            </div>
            <div
              className="flex items-center gap-1.5 rounded-full px-3 py-1"
              style={{
                backgroundColor: repeatedHighlight ? '#FFF7ED' : '#E8E8EF',
                border: repeatedHighlight ? '1px solid #FED7AA' : '1px solid transparent',
                fontSize: '12px',
                color: repeatedHighlight ? '#C2410C' : '#6B7280',
              }}
            >
              <span>반복</span>
              <span style={{ fontWeight: 700, color: repeatedHighlight ? '#9A3412' : '#374151' }}>
                {repeatedWords}개
              </span>
            </div>
            {completenessScore === 0 && fluencyScore > 60 && (
              <div
                className="flex items-center gap-1.5 rounded-full px-3 py-1"
                style={{
                  backgroundColor: '#FFF7ED',
                  border: '1px solid #FED7AA',
                  fontSize: '12px',
                  color: '#C2410C',
                }}
              >
                <span style={{ fontWeight: 700 }}>발화 조기 종결</span>
              </div>
            )}
          </div>

          {completenessScore === 0 && fluencyScore > 60 && (
            <div
              className="rounded-lg px-3 py-2 flex flex-col gap-0.5"
              style={{ backgroundColor: '#FFF7ED', border: '1px solid #FED7AA' }}
            >
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#C2410C', letterSpacing: '0.06em' }}>
                조기 종결 감지
              </span>
              <span style={{ fontSize: '12px', color: '#7C3012', lineHeight: 1.6 }}>
                발화 도중 중단되어 발화 완결도가 0으로 측정됐습니다. 유창성 지수는 실제 발화 구간 기준으로 측정됩니다.
              </span>
            </div>
          )}

          {/* Weak points */}
          {weakPoints.length > 0 && (
            <div
              className="rounded-lg px-3 py-2.5 flex flex-col gap-2"
              style={{ backgroundColor: '#FFF7ED', border: '1px solid #FED7AA' }}
            >
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#C2410C', letterSpacing: '0.08em' }}>
                취약 패턴 감지
              </span>
              <ul className="flex flex-col gap-1">
                {weakPoints.map((pt, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span style={{ color: '#F97316', fontSize: '10px', marginTop: '2px', flexShrink: 0 }}>▸</span>
                    <span style={{ fontSize: '12px', color: '#7C3012', lineHeight: 1.5 }}>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Diagnostic callout */}
          <div
            className="rounded-lg px-3 py-2.5 flex flex-col gap-1"
            style={{
              backgroundColor: avgGrade.bg,
              border: `1px solid ${avgGrade.border}`,
            }}
          >
            <span
              style={{
                fontSize: '10px',
                fontWeight: 800,
                color: avgGrade.color,
                letterSpacing: '0.08em',
              }}
            >
              AI 진단
            </span>
            <span
              style={{
                fontSize: '12px',
                color: '#374151',
                lineHeight: 1.6,
              }}
            >
              {getDiagnostic()}
            </span>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <div
            className="rounded-lg px-3 py-2.5 flex flex-col gap-1"
            style={{ backgroundColor: '#FFF7ED', border: '1px solid #FED7AA' }}
          >
            <span style={{ fontSize: '10px', fontWeight: 800, color: '#C2410C', letterSpacing: '0.08em' }}>
              음성 미인식
            </span>
            <span style={{ fontSize: '12px', color: '#7C3012', lineHeight: 1.6 }}>
              이 지문의 발음 점수가 측정되지 않았습니다. 녹음 중 음성이 인식되지 않았거나 분석 서비스 응답이 지연됐을 수 있습니다.
            </span>
          </div>
          <p style={{ fontSize: '11px', color: '#9CA3AF', lineHeight: 1.5 }}>
            다시 테스트하면 정상적으로 측정됩니다.
          </p>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────
export default function ResultPage() {
  const router = useRouter()
  const [session, setSession] = useState<Partial<VoicePrintSession> | null>(null)
  const [passage1AudioUrl, setPassage1AudioUrl] = useState<string | null>(null)
  const [passage2AudioUrl, setPassage2AudioUrl] = useState<string | null>(null)
  const [freeSpeechAudioUrl, setFreeSpeechAudioUrl] = useState<string | null>(null)
  const [completedAt] = useState(() =>
    new Date().toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  )

  useEffect(() => {
    // Shareable result mode: /result?id=<uuid> fetches from DB and renders
    // the same UI without depending on browser sessionStorage. Audio is not
    // available in this mode (it lives in the original user's IndexedDB).
    const idFromUrl =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('id')
        : null

    if (idFromUrl) {
      let cancelled = false
      ;(async () => {
        try {
          const res = await fetch(`/api/responses/${idFromUrl}`)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const json = await res.json()
          if (cancelled) return
          if (!json?.ok || !json.response) {
            router.replace('/')
            return
          }
          const r = json.response
          setSession({
            name: r.name,
            pronunciation1: {
              accuracyScore: r.pronunciation1Accuracy ?? 0,
              fluencyScore: r.pronunciation1Fluency ?? 0,
              completenessScore: r.pronunciation1Completeness ?? 0,
              prosodyScore: r.pronunciation1Prosody ?? 0,
              omittedWords: r.pronunciation1OmittedWords ?? 0,
              repeatedWords: r.pronunciation1RepeatedWords ?? 0,
              mispronouncedWords: r.pronunciation1MispronouncedWords ?? [],
            },
            pronunciation2: {
              accuracyScore: r.pronunciation2Accuracy ?? 0,
              fluencyScore: r.pronunciation2Fluency ?? 0,
              completenessScore: r.pronunciation2Completeness ?? 0,
              prosodyScore: r.pronunciation2Prosody ?? 0,
              omittedWords: r.pronunciation2OmittedWords ?? 0,
              repeatedWords: r.pronunciation2RepeatedWords ?? 0,
              mispronouncedWords: r.pronunciation2MispronouncedWords ?? [],
            },
            selectedStage: r.selectedStage ?? '',
            stageDetail: r.stageDetail ?? '',
            freeSpeechText: r.freeSpeechText ?? '',
            freeSpeechScore: (r.freeSpeechAccuracy ?? 0) > 0
              ? {
                  accuracyScore: r.freeSpeechAccuracy ?? 0,
                  fluencyScore: r.freeSpeechFluency ?? 0,
                  completenessScore: r.freeSpeechCompleteness ?? 0,
                  prosodyScore: r.freeSpeechProsody ?? 0,
                  recognizedText: r.freeSpeechText ?? '',
                }
              : undefined,
            typeScores: r.typeScores,
            topType: r.topType,
            geminiReport: r.geminiReport ?? '',
          })
        } catch {
          if (!cancelled) router.replace('/')
        }
      })()
      return () => {
        cancelled = true
      }
    }

    const data = sessionStore.get()

    if (!data.name || !data.typeScores || data.topType === undefined) {
      router.replace('/')
      return
    }

    setSession(data)

    // Hydrate audio slots from IndexedDB so playback survives reloads
    void audioStore.restore('passage1').then(setPassage1AudioUrl)
    void audioStore.restore('passage2').then(setPassage2AudioUrl)
    void audioStore.restore('freeSpeech').then(setFreeSpeechAudioUrl)
  }, [router])

  const handleRestart = () => {
    sessionStore.clear()
    void audioStore.clearAll()
    router.push('/')
  }

  if (session === null) {
    return (
      <main
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: '#F7FAF9' }}
      >
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-10 h-10 rounded-full border-2 animate-spin"
            style={{ borderColor: '#00C9A7', borderTopColor: 'transparent' }}
          />
          <p style={{ color: '#6B7280', fontSize: '14px' }}>결과를 불러오는 중...</p>
        </div>
      </main>
    )
  }

  const {
    name,
    typeScores,
    topType,
    pronunciation1,
    pronunciation2,
    selectedStage,
    stageDetail,
    freeSpeechText,
    freeSpeechScore,
    geminiReport,
  } = session

  const topTypeData = SPEAK_TYPES.find(t => t.id === topType)!

  // Raw scores can now be negative (centered Likert + reverse-coded items),
  // so we normalise to a 0-100 display range that is intuitive to the user
  // and renders correctly in the bar chart.
  const sortedTypesRaw = [...SPEAK_TYPES]
    .map(t => ({
      ...t,
      raw: (typeScores as TypeScores)[`type${t.id}` as keyof TypeScores] ?? 0,
    }))
    .sort((a, b) => b.raw - a.raw)

  const rawValues = sortedTypesRaw.map(t => t.raw)
  const minRaw = Math.min(...rawValues, 0)
  const maxRaw = Math.max(...rawValues, 0)
  const span = maxRaw - minRaw || 1
  const sortedTypes = sortedTypesRaw.map(t => ({
    ...t,
    // 0..100 for display; preserves the same ranking as raw
    score: Math.round(((t.raw - minRaw) / span) * 100),
  }))
  const maxScore = sortedTypes[0]?.score ?? 1

  const p1 = pronunciation1 ?? {
    accuracyScore: 0,
    fluencyScore: 0,
    completenessScore: 0,
    prosodyScore: 0,
    omittedWords: 0,
    repeatedWords: 0,
    mispronouncedWords: [],
    perWord: undefined,
    weakPhonemes: undefined,
    engine: undefined,
  }
  const p2 = pronunciation2 ?? {
    accuracyScore: 0,
    fluencyScore: 0,
    completenessScore: 0,
    prosodyScore: 0,
    omittedWords: 0,
    repeatedWords: 0,
    mispronouncedWords: [],
    perWord: undefined,
    weakPhonemes: undefined,
    engine: undefined,
  }

  return (
    <main
      className="min-h-screen flex flex-col items-center px-4 py-10 pb-24"
      style={{ backgroundColor: '#F7FAF9', fontFamily: 'Pretendard, sans-serif' }}
    >
      <style jsx global>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
      `}</style>

      <motion.div
        className="w-full max-w-xl flex flex-col gap-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >

        {/* Header */}
        <motion.div variants={sectionVariants} className="flex flex-col gap-2 text-center pt-4">
          <span
            className="font-black tracking-widest"
            style={{ fontSize: '13px', color: '#00C9A7', letterSpacing: '0.18em' }}
          >
            VOICE PRINT
          </span>
          <h1
            className="font-extrabold leading-snug"
            style={{ fontSize: 'clamp(22px, 5vw, 30px)', color: '#111827' }}
          >
            {name}님의 스피치 DNA 분석 결과
          </h1>
          <p style={{ fontSize: '13px', color: '#9CA3AF' }}>
            분석 완료: {completedAt}
          </p>
        </motion.div>

        {/* SPEAK TYPE 분석 — moved to top per user request */}
        <motion.div
          variants={sectionVariants}
          className="rounded-2xl p-6 flex flex-col gap-6"
          style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E8E5' }}
        >
          <div className="flex items-center justify-between">
            <h2 className="font-bold" style={{ fontSize: '17px', color: '#111827' }}>
              SPEAK TYPE 분석
            </h2>
            <span style={{ fontSize: '11px', color: '#9CA3AF' }}>에니어그램 기반 9유형</span>
          </div>

          {/* Top type hero card */}
          {topTypeData && (
            <div
              className="rounded-2xl p-5 flex flex-col gap-3"
              style={{
                backgroundColor: 'rgba(0,201,167,0.06)',
                border: '1.5px solid rgba(0,201,167,0.4)',
              }}
            >
              <div className="flex items-center gap-3 flex-wrap">
                <span
                  className="rounded-full px-2.5 py-0.5"
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#00A88C',
                    backgroundColor: '#FFFFFF',
                    border: '1px solid rgba(0,201,167,0.4)',
                    letterSpacing: '0.05em',
                  }}
                >
                  TYPE {topTypeData.id}
                </span>
                <p
                  style={{
                    fontSize: '11px',
                    color: '#00C9A7',
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                  }}
                >
                  나의 SPEAK TYPE
                </p>
              </div>
              <div>
                <h3 className="font-extrabold" style={{ fontSize: '22px', color: '#0F172A', letterSpacing: '-0.02em' }}>
                  {topTypeData.title}
                </h3>
                <p style={{ fontSize: '13px', color: '#00A88C', fontWeight: 600, marginTop: '4px' }}>
                  {topTypeData.shortTitle}
                </p>
              </div>
              <p style={{ fontSize: '14px', color: '#374151', lineHeight: '1.75' }}>
                {topTypeData.description}
              </p>
            </div>
          )}

          {/* Sorted bar chart */}
          <div className="flex flex-col gap-3">
            <p style={{ fontSize: '12px', color: '#6B7280', fontWeight: 600 }}>
              9개 유형 점수 (내림차순)
            </p>
            {sortedTypes.map((type, idx) => {
              const barWidth = maxScore > 0 ? (type.score / maxScore) * 100 : 0
              const isTop = type.id === topType
              return (
                <div key={type.id} className="flex items-center gap-3">
                  {/* Rank + Type number */}
                  <div
                    className="flex items-center justify-center rounded-md"
                    style={{
                      minWidth: '24px',
                      height: '24px',
                      backgroundColor: isTop ? '#00C9A7' : '#E8E8EF',
                      color: isTop ? '#FFFFFF' : '#6B7280',
                      fontSize: '11px',
                      fontWeight: 700,
                    }}
                  >
                    {idx + 1}
                  </div>
                  <div style={{ minWidth: '112px' }}>
                    <div
                      style={{
                        fontSize: '12px',
                        color: isTop ? '#00A88C' : '#6B7280',
                        fontWeight: 700,
                        lineHeight: 1.2,
                      }}
                    >
                      Type {type.id}
                    </div>
                    <div
                      style={{
                        fontSize: '12px',
                        color: isTop ? '#0F172A' : '#9CA3AF',
                        fontWeight: isTop ? 600 : 400,
                        lineHeight: 1.3,
                      }}
                    >
                      {type.shortTitle}
                    </div>
                  </div>
                  <div
                    className="flex-1 rounded-full overflow-hidden"
                    style={{ height: '10px', backgroundColor: '#F1F3F5' }}
                  >
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        backgroundColor: isTop ? '#00C9A7' : '#CBD5E1',
                      }}
                      initial={{ width: 0 }}
                      animate={{ width: `${barWidth}%` }}
                      transition={{
                        duration: 0.8,
                        ease: [0.25, 0.46, 0.45, 0.94] as unknown as import('framer-motion').Easing,
                        delay: 0.05 * idx,
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: '13px',
                      color: isTop ? '#00A88C' : '#9CA3AF',
                      fontWeight: isTop ? 700 : 500,
                      minWidth: '24px',
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {type.score}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Top type details */}
          {topTypeData && (
            <div className="flex flex-col gap-3">
              <div
                className="rounded-xl p-4 flex flex-col gap-3"
                style={{ backgroundColor: '#F9FAFB', border: '1px solid #E8E8EF' }}
              >
                <p className="font-bold" style={{ fontSize: '13px', color: '#00C9A7' }}>
                  말하기 패턴
                </p>
                <ul className="flex flex-col gap-2">
                  {topTypeData.patterns.map((pattern, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span style={{ color: '#00C9A7', marginTop: '2px', flexShrink: 0 }}>·</span>
                      <span style={{ fontSize: '13px', color: '#374151', lineHeight: '1.6' }}>
                        {pattern}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div
                className="rounded-xl p-4 flex flex-col gap-2"
                style={{ backgroundColor: '#F9FAFB', border: '1px solid #E8E8EF' }}
              >
                <p className="font-bold" style={{ fontSize: '13px', color: '#00C9A7' }}>
                  스피치에서 이렇게 나타납니다
                </p>
                <p style={{ fontSize: '13px', color: '#374151', lineHeight: '1.7' }}>
                  {topTypeData.speechPattern}
                </p>
              </div>

              <div
                className="rounded-xl p-4 flex flex-col gap-2"
                style={{ backgroundColor: '#F9FAFB', border: '1px solid #E8E8EF' }}
              >
                <p className="font-bold" style={{ fontSize: '13px', color: '#00C9A7' }}>
                  인지 개선 포인트
                </p>
                <p style={{ fontSize: '13px', color: '#374151', lineHeight: '1.7' }}>
                  {topTypeData.cognitiveTip}
                </p>
              </div>

              <div
                className="rounded-xl p-4 flex flex-col gap-2"
                style={{
                  backgroundColor: 'rgba(0,201,167,0.05)',
                  border: '1px solid rgba(0,201,167,0.2)',
                }}
              >
                <p className="font-bold" style={{ fontSize: '13px', color: '#00C9A7' }}>
                  훈련 방향
                </p>
                <p style={{ fontSize: '13px', color: '#007A64', lineHeight: '1.7' }}>
                  {topTypeData.trainingDirection}
                </p>
              </div>
            </div>
          )}
        </motion.div>

        {/* Gemini 종합 리포트 */}
        <motion.div
          variants={sectionVariants}
          className="rounded-2xl p-6 flex flex-col gap-4"
          style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E8E5' }}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-bold" style={{ fontSize: '17px', color: '#111827' }}>
              VOICE PRINT 종합 리포트
            </h2>
            <span
              className="rounded-full"
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#00A88C',
                backgroundColor: 'rgba(0,201,167,0.08)',
                border: '1px solid rgba(0,201,167,0.25)',
                padding: '2px 9px',
                letterSpacing: '0.02em',
              }}
            >
              AI 종합 분석
            </span>
          </div>

          {geminiReport && !geminiReport.includes('리포트 생성 중 오류') ? (
            <div
              className="leading-relaxed whitespace-pre-wrap"
              style={{
                fontSize: '14px',
                color: '#374151',
                lineHeight: '1.85',
                borderLeft: '3px solid #00C9A7',
                paddingLeft: '16px',
              }}
            >
              {geminiReport}
            </div>
          ) : (
            <div
              className="rounded-xl p-4"
              style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}
            >
              <p style={{ fontSize: '13px', color: '#B91C1C', lineHeight: 1.7 }}>
                종합 리포트 생성에 실패했습니다. 아래 섹션(발음 분석, SPEAK TYPE, 선택한 자리, 자유 발화)의 결과는 그대로 확인하실 수 있습니다.
                <br />
                <span style={{ fontSize: '12px', color: '#991B1B', marginTop: '4px', display: 'inline-block' }}>
                  원인: Gemini API 키 문제 또는 모델 접근 불가. 잠시 후 다시 시도하거나 관리자에게 문의해주세요.
                </span>
              </p>
            </div>
          )}
        </motion.div>

        {/* 발음 분석 */}
        <motion.div
          variants={sectionVariants}
          className="rounded-2xl p-6 flex flex-col gap-5"
          style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E8E5' }}
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-bold" style={{ fontSize: '17px', color: '#111827' }}>
                발음 음향 분석
              </h2>
              <span
                className="rounded-full px-3 py-1 font-medium"
                style={{
                  fontSize: '11px',
                  color: '#9CA3AF',
                  backgroundColor: '#F4F4F6',
                  border: '1px solid #E8E8EF',
                }}
              >
                참고용 점수
              </span>
            </div>
            <p style={{ fontSize: '11px', color: '#9CA3AF' }}>
              Azure Cognitive Services 기반 음향·음성학 분석 — 음소 정확도 · 유창성 지수 · 발화 완결도 3개 지표
            </p>

            {/* Combined grade strip */}
            {(p1.accuracyScore > 0 || p2.accuracyScore > 0) && (() => {
              const allScores = [
                p1.accuracyScore, p1.fluencyScore, p1.completenessScore,
                p2.accuracyScore, p2.fluencyScore, p2.completenessScore,
              ].filter(s => s > 0)
              const overall = allScores.length > 0
                ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
                : 0
              const og = getGrade(overall)
              return (
                <div
                  className="rounded-xl px-4 py-3 flex items-center justify-between"
                  style={{ backgroundColor: og.bg, border: `1px solid ${og.border}` }}
                >
                  <div>
                    <p style={{ fontSize: '11px', color: og.color, fontWeight: 700, letterSpacing: '0.06em' }}>종합 발음 등급</p>
                    <p style={{ fontSize: '12px', color: '#374151', marginTop: '2px' }}>2개 지문 평균 측정값</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: '28px', fontWeight: 800, color: og.color }}>{overall}점</span>
                    <span
                      className="rounded-full px-2 py-0.5"
                      style={{ fontSize: '12px', fontWeight: 700, color: og.color, backgroundColor: '#FFFFFF', border: `1px solid ${og.border}` }}
                    >
                      {og.label}
                    </span>
                  </div>
                </div>
              )
            })()}
          </div>

          <div className="flex flex-col gap-4">
            <PronunciationPanel
              title="지문 1 — 간장공장"
              subtitle="간장공장 공장장은 강 공장장이고…"
              accuracyScore={p1.accuracyScore}
              fluencyScore={p1.fluencyScore}
              completenessScore={p1.completenessScore}
              prosodyScore={p1.prosodyScore ?? 0}
              omittedWords={p1.omittedWords}
              repeatedWords={p1.repeatedWords}
              mispronouncedWords={p1.mispronouncedWords ?? []}
              audioUrl={passage1AudioUrl}
              perWord={p1.perWord}
              weakPhonemes={p1.weakPhonemes}
              engine={p1.engine}
            />
            <PronunciationPanel
              title="지문 2 — 경찰청"
              subtitle="경찰청 철창살은 외철창살이고…"
              accuracyScore={p2.accuracyScore}
              fluencyScore={p2.fluencyScore}
              completenessScore={p2.completenessScore}
              prosodyScore={p2.prosodyScore ?? 0}
              omittedWords={p2.omittedWords}
              repeatedWords={p2.repeatedWords}
              mispronouncedWords={p2.mispronouncedWords ?? []}
              audioUrl={passage2AudioUrl}
              perWord={p2.perWord}
              weakPhonemes={p2.weakPhonemes}
              engine={p2.engine}
            />
          </div>

          <p
            className="rounded-xl p-3 leading-relaxed"
            style={{
              fontSize: '12px',
              color: '#9CA3AF',
              backgroundColor: '#F9FAFB',
              border: '1px solid #E8E8EF',
            }}
          >
            발음 점수는 참고용입니다. 더 정밀한 분석은 전문가 피드백을 통해 확인하세요.
          </p>
        </motion.div>

        {/* 선택하신 자리 */}
        <motion.div
          variants={sectionVariants}
          className="rounded-2xl p-6 flex flex-col gap-4"
          style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E8E5' }}
        >
          <h2 className="font-bold" style={{ fontSize: '17px', color: '#111827' }}>
            선택하신 자리
          </h2>

          <div
            className="flex items-center gap-3 rounded-xl px-4 py-3"
            style={{
              backgroundColor: 'rgba(0,201,167,0.06)',
              border: '1.5px solid rgba(0,201,167,0.3)',
            }}
          >
            <span className="font-bold" style={{ fontSize: '16px', color: '#111827' }}>
              {selectedStage ?? '—'}
            </span>
          </div>

          {stageDetail ? (
            <div
              className="rounded-xl p-4"
              style={{ backgroundColor: '#F9FAFB', border: '1px solid #E8E8EF' }}
            >
              <p style={{ fontSize: '13px', color: '#6B7280', marginBottom: '6px' }}>
                그 자리에서 하고 싶은 말
              </p>
              <p
                className="leading-relaxed whitespace-pre-wrap"
                style={{ fontSize: '14px', color: '#374151' }}
              >
                {stageDetail}
              </p>
            </div>
          ) : null}
        </motion.div>

        {/* 즉흥 발화 */}
        <motion.div
          variants={sectionVariants}
          className="rounded-2xl p-6 flex flex-col gap-4"
          style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E8E5' }}
        >
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold" style={{ fontSize: '17px', color: '#111827' }}>
                자유 발화
              </h2>
              <span
                className="rounded-full"
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#00A88C',
                  backgroundColor: 'rgba(0,201,167,0.08)',
                  border: '1px solid rgba(0,201,167,0.25)',
                  padding: '2px 9px',
                  letterSpacing: '0.02em',
                }}
              >
                AI 분석 반영
              </span>
            </div>
            <p style={{ fontSize: '12px', color: '#9CA3AF' }}>
              선택하신 자리를 주제로 실시간 발화하신 내용 — STT 변환 원문
            </p>
          </div>

          {/* 내 목소리 듣기 */}
          {freeSpeechAudioUrl && (
            <div
              className="rounded-xl p-4 flex flex-col gap-2.5"
              style={{
                backgroundColor: 'rgba(0, 201, 167, 0.04)',
                border: '1.5px solid rgba(0, 201, 167, 0.25)',
              }}
            >
              <div className="flex items-center gap-2">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#00C9A7"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="9" y="2" width="6" height="11" rx="3" />
                  <path d="M5 10a7 7 0 0 0 14 0" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                  <line x1="9" y1="22" x2="15" y2="22" />
                </svg>
                <p style={{ fontSize: '12px', color: '#00A88C', fontWeight: 700 }}>
                  내 목소리 다시 듣기
                </p>
              </div>
              <audio
                controls
                src={freeSpeechAudioUrl}
                className="w-full"
                style={{ height: '40px', accentColor: '#00C9A7' }}
              />
              <p style={{ fontSize: '11px', color: '#9CA3AF' }}>
                이 탭을 닫거나 새로고침하면 재생이 불가능합니다.
              </p>
            </div>
          )}

          <div
            className="rounded-xl p-4"
            style={{ backgroundColor: '#F9FAFB', border: '1px solid #E8E8EF' }}
          >
            {freeSpeechText ? (
              <p
                className="leading-relaxed whitespace-pre-wrap"
                style={{ fontSize: '14px', color: '#374151' }}
              >
                {freeSpeechText}
              </p>
            ) : (
              <p style={{ fontSize: '14px', color: '#9CA3AF', fontStyle: 'italic' }}>
                발화 없음
              </p>
            )}
          </div>

          {/* (c) Free-speech SpeechSuper para.eval scores */}
          {freeSpeechScore && freeSpeechScore.accuracyScore > 0 && (
            <div
              className="rounded-xl p-4 flex flex-col gap-3"
              style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E8E5' }}
            >
              <div className="flex items-center justify-between">
                <span style={{ fontSize: '12px', color: '#6B7280', fontWeight: 700 }}>
                  자유 발화 발음 점수
                </span>
                <span
                  className="rounded-full px-2 py-0.5"
                  style={{
                    fontSize: '10px',
                    color: '#00A88C',
                    backgroundColor: 'rgba(0,201,167,0.08)',
                    border: '1px solid rgba(0,201,167,0.25)',
                    fontWeight: 600,
                  }}
                >
                  para.eval (자기 발화 일관성)
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {[
                  { label: '정확도', value: freeSpeechScore.accuracyScore },
                  { label: '유창성', value: freeSpeechScore.fluencyScore },
                  { label: '완전성', value: freeSpeechScore.completenessScore },
                  ...(freeSpeechScore.prosodyScore > 0
                    ? [{ label: '운율', value: freeSpeechScore.prosodyScore }]
                    : []),
                ].map(({ label, value }) => {
                  const c = value >= 80 ? '#00C9A7' : value >= 60 ? '#3B82F6' : value >= 40 ? '#F59E0B' : '#EF4444'
                  return (
                    <div key={label} className="flex items-center gap-3">
                      <span style={{ fontSize: '12px', color: '#6B7280', minWidth: '36px' }}>{label}</span>
                      <div className="flex-1 rounded-full overflow-hidden" style={{ height: '6px', backgroundColor: '#E8E8EF' }}>
                        <div style={{ height: '100%', backgroundColor: c, width: `${value}%`, borderRadius: '999px' }} />
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: c, minWidth: '32px', textAlign: 'right' }}>
                        {value}점
                      </span>
                    </div>
                  )
                })}
              </div>
              <p style={{ fontSize: '11px', color: '#9CA3AF', lineHeight: 1.5 }}>
                자유 발화는 미리 정해진 텍스트가 없어, 음성 인식 결과를 기준으로 발음의 일관성을 평가합니다.
              </p>
            </div>
          )}
        </motion.div>

        {/* Bottom CTA */}
        <motion.div
          variants={sectionVariants}
          className="flex flex-col items-center gap-4 pt-4 pb-4"
        >
          <button
            onClick={handleRestart}
            className="transition-opacity duration-150 hover:opacity-70"
            style={{ fontSize: '14px', color: '#9CA3AF' }}
          >
            다시 시작하기
          </button>
        </motion.div>

      </motion.div>
    </main>
  )
}

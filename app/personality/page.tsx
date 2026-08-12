'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { PERSONALITY_QUESTIONS } from '@/lib/constants'
import { sessionStore } from '@/lib/session-store'
import type { TypeScores } from '@/types'

const TOTAL = PERSONALITY_QUESTIONS.length // 36

const SCALE_OPTIONS = [
  { value: 1, label: '전혀\n그렇지 않다' },
  { value: 2, label: '그렇지\n않다' },
  { value: 3, label: '보통\n이다' },
  { value: 4, label: '그렇다' },
  { value: 5, label: '매우\n그렇다' },
]

const EASE = [0.25, 0.46, 0.45, 0.94] as unknown as import('framer-motion').Easing

// Likert 1..5 → −2..+2 (3='보통' contributes 0, so "all medium" gives all 0).
// Reverse-coded items flip the sign so "agree" subtracts from that type.
// Tie-break: when two types tie, the one with higher answer variance wins
// (the user gave more decisive answers about that type). Final tie-break
// falls back to the lower typeId for stability.
function calculateTypeScores(
  answers: Record<number, number>
): { typeScores: TypeScores; topType: number } {
  const perTypeWeighted: Record<number, number[]> = {
    1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [],
  }

  PERSONALITY_QUESTIONS.forEach(q => {
    const raw = answers[q.id] ?? 3
    const centered = raw - 3                              // 1..5 → -2..+2
    const weighted = q.reverse ? -centered : centered     // flip reverse items
    perTypeWeighted[q.typeId].push(weighted)
  })

  const sumOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
  const scores: TypeScores = {
    type1: sumOf(perTypeWeighted[1]),
    type2: sumOf(perTypeWeighted[2]),
    type3: sumOf(perTypeWeighted[3]),
    type4: sumOf(perTypeWeighted[4]),
    type5: sumOf(perTypeWeighted[5]),
    type6: sumOf(perTypeWeighted[6]),
    type7: sumOf(perTypeWeighted[7]),
    type8: sumOf(perTypeWeighted[8]),
    type9: sumOf(perTypeWeighted[9]),
  }

  // Decisiveness = mean of |weighted|. Higher = more confident answers.
  const decisiveness: Record<number, number> = {}
  for (const tid of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    const xs = perTypeWeighted[tid]
    decisiveness[tid] = xs.length === 0
      ? 0
      : xs.reduce((a, b) => a + Math.abs(b), 0) / xs.length
  }

  const ranked = (Object.entries(scores) as [keyof TypeScores, number][]).sort(
    ([keyA, a], [keyB, b]) => {
      if (b !== a) return b - a
      const tA = parseInt(keyA.replace('type', ''))
      const tB = parseInt(keyB.replace('type', ''))
      if (decisiveness[tB] !== decisiveness[tA]) {
        return decisiveness[tB] - decisiveness[tA]
      }
      return tA - tB
    }
  )

  const topType = parseInt(ranked[0][0].replace('type', ''))
  return { typeScores: scores, topType }
}

export default function PersonalityPage() {
  const router = useRouter()
  const [currentIdx, setCurrentIdx] = useState(0) // 0-based index
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [direction, setDirection] = useState(1)

  const question = PERSONALITY_QUESTIONS[currentIdx]
  const progress = ((currentIdx + 1) / TOTAL) * 100
  const isAnswered = answers[question.id] !== undefined

  const handleAnswer = (value: number) => {
    const newAnswers = { ...answers, [question.id]: value }
    setAnswers(newAnswers)

    // Auto-advance after short delay
    setTimeout(() => {
      if (currentIdx < TOTAL - 1) {
        setDirection(1)
        setCurrentIdx(prev => prev + 1)
      } else {
        const { typeScores, topType } = calculateTypeScores(newAnswers)
        sessionStore.setTypeScores(typeScores, topType)
        router.push('/loading')
      }
    }, 280)
  }

  const handleBack = () => {
    if (currentIdx > 0) {
      setDirection(-1)
      setCurrentIdx(prev => prev - 1)
    } else {
      router.push('/free-speech')
    }
  }

  const variants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 48 : -48,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
      transition: { duration: 0.28, ease: EASE },
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -48 : 48,
      opacity: 0,
      transition: { duration: 0.2, ease: [0.55, 0, 1, 0.45] as unknown as import('framer-motion').Easing },
    }),
  }

  return (
    <main
      className="min-h-screen flex flex-col items-center px-4 py-10"
      style={{ backgroundColor: '#F7FAF9', fontFamily: 'Pretendard, sans-serif' }}
    >
      <style jsx global>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
      `}</style>

      <div className="w-full max-w-xl flex flex-col gap-6">

        {/* 뒤로가기 */}
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 w-fit transition-opacity duration-150 hover:opacity-70"
          style={{ color: '#6B7280', fontSize: '14px' }}
        >
          <span>←</span>
          <span>{currentIdx > 0 ? '이전 문항' : '자유 발화로'}</span>
        </button>

        {/* 진행바 헤더 */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span
              className="font-bold px-3 py-1 rounded-full"
              style={{
                fontSize: '13px',
                color: '#00C9A7',
                border: '1px solid rgba(0,201,167,0.4)',
                backgroundColor: 'rgba(0,201,167,0.08)',
              }}
            >
              STEP 3
            </span>
            <span style={{ fontSize: '13px', color: '#6B7280' }}>
              {currentIdx + 1} / {TOTAL}
            </span>
          </div>

          {/* 진행 막대 */}
          <div
            className="w-full rounded-full overflow-hidden"
            style={{ height: '4px', backgroundColor: '#E8E8EF' }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: '#00C9A7' }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.35, ease: EASE }}
            />
          </div>
        </div>

        {/* 제목 */}
        <div>
          <h1
            className="font-extrabold"
            style={{ fontSize: 'clamp(20px, 5vw, 28px)', color: '#111827' }}
          >
            나의 스피치 성향 파악하기
          </h1>
          <p style={{ fontSize: '14px', color: '#6B7280', marginTop: '6px' }}>
            해당하는 정도를 선택하면 자동으로 다음 문항으로 이동합니다
          </p>
        </div>

        {/* 문항 카드 */}
        <div style={{ position: 'relative', minHeight: '280px' }}>
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentIdx}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              style={{ position: 'absolute', width: '100%' }}
            >
              <div
                className="rounded-2xl p-6 flex flex-col gap-6"
                style={{
                  backgroundColor: '#FFFFFF',
                  border: isAnswered
                    ? '1.5px solid rgba(0,201,167,0.4)'
                    : '1px solid #E0E8E5',
                  transition: 'border-color 0.2s',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                }}
              >
                {/* 문항 번호 + 텍스트 */}
                <div className="flex items-start gap-3">
                  <span
                    className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-bold"
                    style={{
                      fontSize: '12px',
                      backgroundColor: isAnswered ? '#00C9A7' : '#E8E8EF',
                      color: isAnswered ? '#FFFFFF' : '#9CA3AF',
                      transition: 'all 0.2s',
                    }}
                  >
                    {currentIdx + 1}
                  </span>
                  <p
                    className="font-semibold leading-relaxed"
                    style={{ fontSize: '17px', color: '#111827', lineHeight: 1.65 }}
                  >
                    {question.text}
                  </p>
                </div>

                {/* 5점 척도 */}
                <div className="flex gap-2">
                  {SCALE_OPTIONS.map(({ value, label }) => {
                    const isSelected = answers[question.id] === value
                    return (
                      <button
                        key={value}
                        onClick={() => handleAnswer(value)}
                        className="flex-1 flex flex-col items-center gap-1.5 rounded-xl py-3 transition-all duration-150 active:scale-95"
                        style={{
                          backgroundColor: isSelected ? '#00C9A7' : '#F7FAF9',
                          border: isSelected
                            ? '1.5px solid #00C9A7'
                            : '1px solid #E0E8E5',
                          boxShadow: isSelected ? '0 2px 8px rgba(0,201,167,0.25)' : 'none',
                        }}
                        title={label.replace('\n', ' ')}
                      >
                        <span
                          className="font-bold"
                          style={{
                            fontSize: '18px',
                            color: isSelected ? '#FFFFFF' : '#374151',
                          }}
                        >
                          {value}
                        </span>
                        <span
                          className="text-center leading-tight"
                          style={{
                            fontSize: '9px',
                            color: isSelected ? 'rgba(255,255,255,0.85)' : '#9CA3AF',
                            whiteSpace: 'pre-line',
                            maxWidth: '44px',
                          }}
                        >
                          {label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* 안내 */}
        <div style={{ marginTop: '280px' }}>
          <p style={{ fontSize: '12px', color: '#B0B0C0', textAlign: 'center' }}>
            선택하면 자동으로 다음 문항으로 넘어갑니다
          </p>
        </div>
      </div>
    </main>
  )
}

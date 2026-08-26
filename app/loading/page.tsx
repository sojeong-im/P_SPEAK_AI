'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { sessionStore } from '@/lib/session-store'

const STATUS_MESSAGES = [
  '발음 패턴을 분석하고 있습니다...',
  '말하기 성향을 파악하고 있습니다...',
  '맞춤 리포트를 작성하고 있습니다...',
]

export default function LoadingPage() {
  const router = useRouter()
  const [statusIndex, setStatusIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)

  const runAnalysis = async () => {
    setError(null)
    setRetrying(false)
    try {
      const data = sessionStore.get()
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          pronunciation1: data.pronunciation1,
          pronunciation2: data.pronunciation2,
          selectedStage: data.selectedStage,
          stageDetail: data.stageDetail,
          freeSpeechText: data.freeSpeechText,
          freeSpeechScore: data.freeSpeechScore,
          typeScores: data.typeScores,
          topType: data.topType,
        }),
      })

      if (!res.ok) {
        let errDetail = `서버 오류 (${res.status})`
        try {
          const errJson = await res.json()
          if (errJson.detail) errDetail = `서버 오류: ${errJson.detail}`
        } catch (_) {}
        throw new Error(errDetail)
      }

      const json = await res.json()
      sessionStore.setGeminiReport(json.geminiReport)
      sessionStore.save({ responseId: json.id })
      router.push('/result')
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.')
    }
  }

  useEffect(() => {
    runAnalysis()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (error) return
    const interval = setInterval(() => {
      setStatusIndex(prev => (prev + 1) % STATUS_MESSAGES.length)
    }, 2000)
    return () => clearInterval(interval)
  }, [error])

  const handleRetry = () => {
    setRetrying(true)
    runAnalysis()
  }

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ backgroundColor: '#F7FAF9', fontFamily: 'Pretendard, sans-serif' }}
    >
      <style jsx global>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');

        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes pulse-scale {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.08); opacity: 0.85; }
        }
      `}</style>

      <div className="flex flex-col items-center gap-8 text-center max-w-sm w-full">

        {/* 로고 / 아이콘 */}
        <div className="relative flex items-center justify-center" style={{ width: '96px', height: '96px' }}>
          {/* 외부 회전 링 */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '3px solid transparent',
              borderTopColor: '#00C9A7',
              borderRightColor: 'rgba(0, 201, 167, 0.3)',
              animation: 'spin-slow 1.4s linear infinite',
            }}
          />
          {/* 내부 아이콘 */}
          <motion.div
            animate={{ scale: [1, 1.06, 1], opacity: [1, 0.85, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: [0.45, 0, 0.55, 1] }}
            className="flex items-center justify-center rounded-full"
            style={{
              width: '72px',
              height: '72px',
              backgroundColor: 'rgba(0, 201, 167, 0.12)',
              border: '1.5px solid rgba(0, 201, 167, 0.35)',
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <rect x="9" y="2" width="6" height="11" rx="3" fill="#00C9A7" fillOpacity="0.2" stroke="#00C9A7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5 10a7 7 0 0 0 14 0" stroke="#00C9A7" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="12" y1="19" x2="12" y2="22" stroke="#00C9A7" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="9" y1="22" x2="15" y2="22" stroke="#00C9A7" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </motion.div>
        </div>

        {/* 타이틀 */}
        <div className="flex flex-col gap-2">
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="font-extrabold tracking-tight"
            style={{ fontSize: 'clamp(22px, 5vw, 30px)', color: '#111827', letterSpacing: '-0.5px' }}
          >
            VOICE PRINT 분석 중
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{ fontSize: '14px', color: '#6B7280', lineHeight: 1.6 }}
          >
            AI가 당신의 스피치 DNA를 분석하고 있습니다...
          </motion.p>
        </div>

        {/* 상태 메시지 */}
        <AnimatePresence mode="wait">
          {!error ? (
            <motion.div
              key={statusIndex}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="rounded-2xl px-5 py-3"
              style={{
                backgroundColor: 'rgba(0, 201, 167, 0.07)',
                border: '1px solid rgba(0, 201, 167, 0.2)',
              }}
            >
              <p style={{ fontSize: '14px', color: '#00C9A7', fontWeight: 500 }}>
                {STATUS_MESSAGES[statusIndex]}
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="rounded-2xl px-5 py-4 flex flex-col gap-3"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.06)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
              }}
            >
              <p style={{ fontSize: '14px', color: '#EF4444', fontWeight: 500 }}>
                분석 중 오류가 발생했습니다
              </p>
              <p style={{ fontSize: '12px', color: '#9CA3AF' }}>{error}</p>
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="rounded-xl py-2.5 font-bold transition-all duration-200 active:scale-95"
                style={{
                  backgroundColor: retrying ? '#E8E8EF' : '#00C9A7',
                  color: retrying ? '#9CA3AF' : '#F7FAF9',
                  fontSize: '14px',
                  cursor: retrying ? 'not-allowed' : 'pointer',
                }}
              >
                {retrying ? '재시도 중...' : '다시 시도'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 진행 도트 */}
        {!error && (
          <div className="flex items-center gap-2">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                animate={{
                  scale: [1, 1.4, 1],
                  opacity: [0.4, 1, 0.4],
                }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  delay: i * 0.25,
                  ease: [0.45, 0, 0.55, 1],
                }}
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#00C9A7',
                }}
              />
            ))}
          </div>
        )}

      </div>
    </main>
  )
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import { SPEAK_TYPES } from '@/lib/constants'

const ADMIN_PASSWORD = 'ydp12000'

interface ResponseRow {
  id: string
  name: string
  createdAt: string
  topType: number
  pronunciation1Accuracy: number
  pronunciation1Fluency: number
  pronunciation2Accuracy: number
  pronunciation2Fluency: number
  selectedStage: string
  consultationInterest: boolean
}

interface ResponseDetail {
  id: string
  name: string
  pronunciation1Accuracy: number
  pronunciation1Fluency: number
  pronunciation1Completeness: number
  pronunciation1OmittedWords: number
  pronunciation1RepeatedWords: number
  pronunciation2Accuracy: number
  pronunciation2Fluency: number
  pronunciation2Completeness: number
  pronunciation2OmittedWords: number
  pronunciation2RepeatedWords: number
  selectedStage: string
  stageDetail: string
  freeSpeechText: string
  typeScores: Record<string, number>
  topType: number
  geminiReport: string
  consultationInterest: boolean
  createdAt: string
}

function scoreColor(value: number): string {
  if (value >= 80) return '#4DF0C0'
  if (value >= 60) return '#F0C04D'
  return '#F0604D'
}

function scoreBg(value: number): string {
  if (value >= 80) return 'rgba(77,240,192,0.1)'
  if (value >= 60) return 'rgba(240,192,77,0.1)'
  return 'rgba(240,96,77,0.1)'
}

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [authError, setAuthError] = useState(false)

  const [rows, setRows] = useState<ResponseRow[]>([])
  const [loading, setLoading] = useState(false)

  const [selectedDetail, setSelectedDetail] = useState<ResponseDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/responses', {
        headers: { 'x-admin-password': ADMIN_PASSWORD },
      })
      const data = await res.json()
      setRows(data)
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authenticated) {
      fetchList()
    }
  }, [authenticated, fetchList])

  function handleLogin() {
    if (passwordInput === ADMIN_PASSWORD) {
      setAuthenticated(true)
      setAuthError(false)
    } else {
      setAuthError(true)
    }
  }

  async function openDetail(id: string) {
    setModalOpen(true)
    setDetailLoading(true)
    setSelectedDetail(null)
    try {
      const res = await fetch(`/api/admin/responses?id=${id}`, {
        headers: { 'x-admin-password': ADMIN_PASSWORD },
      })
      const data = await res.json()
      setSelectedDetail(data)
    } catch {
      setSelectedDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  function closeModal() {
    setModalOpen(false)
    setSelectedDetail(null)
  }

  function formatDate(iso: string) {
    const d = new Date(iso)
    return d.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // ---------- 인증 화면 ----------
  if (!authenticated) {
    return (
      <div
        style={{ background: '#F7FAF9' }}
        className="min-h-screen flex items-center justify-center px-4"
      >
        <div
          style={{ background: '#1e1e2e', border: '1px solid #2a2a3a' }}
          className="w-full max-w-sm rounded-2xl p-8 flex flex-col items-center gap-6"
        >
          <h1 className="text-2xl font-bold tracking-widest text-white">
            SPEAKUP{' '}
            <span style={{ color: '#4DF0C0' }}>ADMIN</span>
          </h1>
          <div className="w-full flex flex-col gap-3">
            <input
              type="password"
              placeholder="비밀번호를 입력하세요"
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              className="w-full rounded-lg px-4 py-3 text-white outline-none focus:ring-2"
              style={{
                background: '#13131f',
                border: '1px solid #2a2a3a',
                color: '#fff',
              }}
            />
            {authError && (
              <p className="text-sm text-red-400 text-center">
                비밀번호가 올바르지 않습니다
              </p>
            )}
            <button
              onClick={handleLogin}
              className="w-full py-3 rounded-lg font-semibold text-black transition-opacity hover:opacity-90"
              style={{ background: '#4DF0C0' }}
            >
              입장하기
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ---------- 목록 화면 ----------
  return (
    <div style={{ background: '#13131f', minHeight: '100vh' }} className="text-white">
      {/* 헤더 */}
      <header
        style={{ background: '#1e1e2e', borderBottom: '1px solid #2a2a3a' }}
        className="px-6 py-4 flex items-center justify-between"
      >
        <h1 className="text-xl font-bold tracking-widest text-white">
          VOICE PRINT{' '}
          <span style={{ color: '#4DF0C0' }}>관리자</span>
        </h1>
        <button
          onClick={() => {
            setAuthenticated(false)
            setPasswordInput('')
          }}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
          style={{ background: '#13131f', color: '#aaa', border: '1px solid #2a2a3a' }}
        >
          로그아웃
        </button>
      </header>

      <main className="px-4 md:px-8 py-6 max-w-7xl mx-auto">
        {loading ? (
          <div className="flex justify-center items-center py-24">
            <div
              className="w-10 h-10 rounded-full border-4 animate-spin"
              style={{ borderColor: '#2a2a3a', borderTopColor: '#4DF0C0' }}
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-24 text-gray-500">아직 응답이 없습니다</div>
        ) : (
          <>
            {/* 요약 통계 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <StatCard label="총 응답자" value={`${rows.length}명`} />
              <StatCard
                label="평균 지문1 정확도"
                value={`${Math.round(rows.reduce((s, r) => s + (r.pronunciation1Accuracy ?? 0), 0) / rows.length)}점`}
                color={scoreColor(Math.round(rows.reduce((s, r) => s + (r.pronunciation1Accuracy ?? 0), 0) / rows.length))}
              />
              <StatCard
                label="평균 지문2 정확도"
                value={`${Math.round(rows.reduce((s, r) => s + (r.pronunciation2Accuracy ?? 0), 0) / rows.length)}점`}
                color={scoreColor(Math.round(rows.reduce((s, r) => s + (r.pronunciation2Accuracy ?? 0), 0) / rows.length))}
              />
              <StatCard
                label="상담 신청"
                value={`${rows.filter(r => r.consultationInterest).length}명`}
                color="#4DF0C0"
              />
            </div>

            {/* 데스크톱 테이블 */}
            <div
              className="hidden md:block rounded-xl overflow-hidden"
              style={{ background: '#1e1e2e', border: '1px solid #2a2a3a' }}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid #2a2a3a' }}>
                    {['#', '이름', '제출시각', '선택 자리', '1위 유형', '지문1 정확도', '지문1 유창성', '지문2 정확도', '지문2 유창성', '상담', '결과지'].map(h => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left font-semibold tracking-wide text-xs uppercase"
                        style={{ color: '#4DF0C0' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const topType = SPEAK_TYPES.find(t => t.id === row.topType)
                    return (
                      <tr
                        key={row.id}
                        onClick={() => openDetail(row.id)}
                        className="cursor-pointer transition-colors"
                        style={{ borderBottom: '1px solid #2a2a3a' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#252535')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td className="px-4 py-3 text-gray-500 text-xs">{i + 1}</td>
                        <td className="px-4 py-3 font-semibold text-white">{row.name}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{formatDate(row.createdAt)}</td>
                        <td className="px-4 py-3 text-gray-300 text-xs">{row.selectedStage ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span
                            className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
                            style={{ background: '#0d2e27', color: '#4DF0C0' }}
                          >
                            {topType?.shortTitle ?? `Type ${row.topType}`}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <ScorePill value={row.pronunciation1Accuracy} />
                        </td>
                        <td className="px-4 py-3">
                          <ScorePill value={row.pronunciation1Fluency} />
                        </td>
                        <td className="px-4 py-3">
                          <ScorePill value={row.pronunciation2Accuracy} />
                        </td>
                        <td className="px-4 py-3">
                          <ScorePill value={row.pronunciation2Fluency} />
                        </td>
                        <td className="px-4 py-3">
                          {row.consultationInterest ? (
                            <span
                              className="px-2 py-0.5 rounded-full text-xs font-medium"
                              style={{ background: 'rgba(77,240,192,0.15)', color: '#4DF0C0' }}
                            >
                              신청
                            </span>
                          ) : (
                            <span className="text-xs text-gray-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <a
                            href={`/result?id=${row.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 rounded-md text-xs font-semibold inline-block whitespace-nowrap transition-colors"
                            style={{
                              background: 'rgba(77,240,192,0.12)',
                              color: '#4DF0C0',
                              border: '1px solid rgba(77,240,192,0.3)',
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = 'rgba(77,240,192,0.22)'
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = 'rgba(77,240,192,0.12)'
                            }}
                          >
                            결과지 열기 ↗
                          </a>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* 모바일 카드 */}
            <div className="md:hidden flex flex-col gap-3">
              {rows.map((row, i) => {
                const topType = SPEAK_TYPES.find(t => t.id === row.topType)
                return (
                  <div
                    key={row.id}
                    onClick={() => openDetail(row.id)}
                    className="rounded-xl p-4 cursor-pointer"
                    style={{ background: '#1e1e2e', border: '1px solid #2a2a3a' }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-white">
                        {i + 1}. {row.name}
                      </span>
                      <div className="flex items-center gap-2">
                        {row.consultationInterest && (
                          <span
                            className="px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ background: 'rgba(77,240,192,0.15)', color: '#4DF0C0' }}
                          >
                            상담
                          </span>
                        )}
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ background: '#0d2e27', color: '#4DF0C0' }}
                        >
                          {topType?.shortTitle ?? `Type ${row.topType}`}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mb-3">{formatDate(row.createdAt)} · {row.selectedStage ?? '—'}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <MiniScoreBar label="지문1 정확도" value={row.pronunciation1Accuracy} />
                      <MiniScoreBar label="지문1 유창성" value={row.pronunciation1Fluency} />
                      <MiniScoreBar label="지문2 정확도" value={row.pronunciation2Accuracy} />
                      <MiniScoreBar label="지문2 유창성" value={row.pronunciation2Fluency} />
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </main>

      {/* 상세 모달 */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.8)' }}
          onClick={e => e.target === e.currentTarget && closeModal()}
        >
          <div
            className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl"
            style={{ background: '#1e1e2e', border: '1px solid #2a2a3a' }}
          >
            {/* 모달 헤더 */}
            <div
              className="flex items-center justify-between px-6 py-4 sticky top-0 z-10"
              style={{ background: '#1e1e2e', borderBottom: '1px solid #2a2a3a' }}
            >
              <h2 className="text-lg font-bold text-white">응답 상세</h2>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-white transition-colors text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="px-6 py-5">
              {detailLoading ? (
                <div className="flex justify-center items-center py-16">
                  <div
                    className="w-8 h-8 rounded-full border-4 animate-spin"
                    style={{ borderColor: '#2a2a3a', borderTopColor: '#4DF0C0' }}
                  />
                </div>
              ) : selectedDetail ? (
                <DetailContent detail={selectedDetail} formatDate={formatDate} />
              ) : (
                <p className="text-center text-gray-500 py-12">데이터를 불러올 수 없습니다</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---- 상세 내용 컴포넌트 ----

function DetailContent({
  detail,
  formatDate,
}: {
  detail: ResponseDetail
  formatDate: (iso: string) => string
}) {
  const topType = SPEAK_TYPES.find(t => t.id === detail.topType)
  // Normalise raw scores to 0-100 the same way the public result page does,
  // so admin and result views agree. Raw range is roughly -8..+8 (centered
  // Likert + reverse coding).
  const rawEntries = Object.entries(detail.typeScores).map(
    ([key, raw]) => ({ typeIdNum: Number(key.replace('type', '')), raw })
  )
  const rawValues = rawEntries.map(e => e.raw)
  const minRaw = Math.min(...rawValues, 0)
  const maxRaw = Math.max(...rawValues, 0)
  const span = maxRaw - minRaw || 1
  const sortedTypes = rawEntries
    .map(e => ({ ...e, score: Math.round(((e.raw - minRaw) / span) * 100) }))
    .sort((a, b) => b.raw - a.raw)
  const maxTypeScore = sortedTypes[0]?.score ?? 1

  const avgAccuracy = Math.round((detail.pronunciation1Accuracy + detail.pronunciation2Accuracy) / 2)
  const avgFluency = Math.round((detail.pronunciation1Fluency + detail.pronunciation2Fluency) / 2)

  return (
    <div className="flex flex-col gap-6">
      {/* 프로필 헤더 */}
      <div
        className="rounded-xl p-5"
        style={{ background: '#13131f', border: '1px solid #2a2a3a' }}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-2xl font-bold text-white">{detail.name}</p>
            <p className="text-sm text-gray-500 mt-0.5">{formatDate(detail.createdAt)}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {detail.consultationInterest && (
              <span
                className="px-3 py-1 rounded-full text-xs font-semibold"
                style={{ background: 'rgba(77,240,192,0.15)', color: '#4DF0C0', border: '1px solid rgba(77,240,192,0.3)' }}
              >
                상담 신청
              </span>
            )}
            <span
              className="px-3 py-1 rounded-full text-xs font-semibold"
              style={{ background: '#0d2e27', color: '#4DF0C0' }}
            >
              {topType?.shortTitle ?? `Type ${detail.topType}`}
            </span>
          </div>
        </div>
        {/* 핵심 지표 요약 */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <QuickStat label="평균 정확도" value={avgAccuracy} />
          <QuickStat label="평균 유창성" value={avgFluency} />
          <div
            className="rounded-lg px-3 py-2 flex flex-col gap-0.5"
            style={{ background: '#1e1e2e' }}
          >
            <span className="text-xs text-gray-500">선택한 자리</span>
            <span className="text-sm font-semibold text-white truncate">{detail.selectedStage ?? '—'}</span>
            {detail.stageDetail && (
              <span className="text-xs text-gray-500 truncate">{detail.stageDetail}</span>
            )}
          </div>
        </div>
      </div>

      <Divider />

      {/* 발음 점수 — 지문1 vs 지문2 나란히 */}
      <Section title="발음 점수">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PassageScoreBlock
            label="지문 1 · 간장공장"
            accuracy={detail.pronunciation1Accuracy}
            fluency={detail.pronunciation1Fluency}
            completeness={detail.pronunciation1Completeness}
            omitted={detail.pronunciation1OmittedWords}
            repeated={detail.pronunciation1RepeatedWords}
          />
          <PassageScoreBlock
            label="지문 2 · 경찰청"
            accuracy={detail.pronunciation2Accuracy}
            fluency={detail.pronunciation2Fluency}
            completeness={detail.pronunciation2Completeness}
            omitted={detail.pronunciation2OmittedWords}
            repeated={detail.pronunciation2RepeatedWords}
          />
        </div>
      </Section>

      <Divider />

      {/* 자유 발화 */}
      <Section title="자유발화 텍스트">
        <div
          className="rounded-xl px-4 py-3 text-sm text-gray-300 leading-relaxed"
          style={{
            background: '#13131f',
            border: '1px solid #2a2a3a',
            whiteSpace: 'pre-wrap',
            minHeight: '64px',
          }}
        >
          {detail.freeSpeechText || <span className="text-gray-600">내용 없음</span>}
        </div>
      </Section>

      <Divider />

      {/* SPEAK TYPE 점수 */}
      <Section title="SPEAK TYPE 점수 분포">
        <div className="flex flex-col gap-2">
          {sortedTypes.map((entry, index) => {
            const { typeIdNum, score } = entry
            const type = SPEAK_TYPES.find(t => t.id === typeIdNum)
            const isTop = index === 0
            const pct = maxTypeScore > 0 ? (score / maxTypeScore) * 100 : 0
            return (
              <div
                key={typeIdNum}
                className="rounded-xl px-4 py-3"
                style={{
                  background: isTop ? 'rgba(77,240,192,0.07)' : '#13131f',
                  border: isTop ? '1px solid rgba(77,240,192,0.3)' : '1px solid #2a2a3a',
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {isTop && (
                      <span
                        className="text-xs font-bold px-1.5 py-0.5 rounded"
                        style={{ background: '#4DF0C0', color: '#13131f' }}
                      >
                        1위
                      </span>
                    )}
                    <span className="text-sm font-medium" style={{ color: isTop ? '#fff' : '#aaa' }}>
                      Type {typeIdNum} · {type?.shortTitle ?? '—'}
                    </span>
                  </div>
                  <span
                    className="text-sm font-bold tabular-nums"
                    style={{ color: isTop ? '#4DF0C0' : '#888' }}
                  >
                    {score}점
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full" style={{ background: '#2a2a3a' }}>
                  <div
                    className="h-1.5 rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      background: isTop ? '#4DF0C0' : '#3a3a4a',
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </Section>

      <Divider />

      {/* Gemini 리포트 */}
      <Section title="Gemini AI 분석 리포트">
        <div
          className="rounded-xl px-5 py-4 text-sm text-gray-300 leading-7"
          style={{
            background: '#13131f',
            border: '1px solid #2a2a3a',
            whiteSpace: 'pre-wrap',
            fontFamily: 'inherit',
          }}
        >
          {detail.geminiReport || <span className="text-gray-600">리포트 없음</span>}
        </div>
      </Section>
    </div>
  )
}

// ---- 하위 컴포넌트 ----

function Divider() {
  return <hr style={{ borderColor: '#2a2a3a' }} />
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-bold tracking-widest uppercase" style={{ color: '#4DF0C0' }}>
        {title}
      </p>
      {children}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      className="rounded-xl px-4 py-3 flex flex-col gap-1"
      style={{ background: '#1e1e2e', border: '1px solid #2a2a3a' }}
    >
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xl font-bold" style={{ color: color ?? '#fff' }}>
        {value}
      </span>
    </div>
  )
}

function QuickStat({ label, value }: { label: string; value: number }) {
  const color = scoreColor(value)
  const bg = scoreBg(value)
  return (
    <div
      className="rounded-lg px-3 py-2 flex flex-col gap-0.5"
      style={{ background: bg }}
    >
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xl font-bold tabular-nums" style={{ color }}>
        {value}점
      </span>
    </div>
  )
}

function ScorePill({ value }: { value: number }) {
  if (value == null) return <span className="text-gray-600 text-xs">—</span>
  const color = scoreColor(value)
  const bg = scoreBg(value)
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold tabular-nums"
      style={{ color, background: bg }}
    >
      {value}
    </span>
  )
}

function MiniScoreBar({ label, value }: { label: string; value: number }) {
  const color = scoreColor(value ?? 0)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="text-xs font-bold tabular-nums" style={{ color }}>{value ?? '—'}</span>
      </div>
      <div className="w-full h-1 rounded-full" style={{ background: '#2a2a3a' }}>
        <div
          className="h-1 rounded-full"
          style={{ width: `${Math.min(value ?? 0, 100)}%`, background: color }}
        />
      </div>
    </div>
  )
}

function PassageScoreBlock({
  label,
  accuracy,
  fluency,
  completeness,
  omitted,
  repeated,
}: {
  label: string
  accuracy: number
  fluency: number
  completeness: number
  omitted: number
  repeated: number
}) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{ background: '#13131f', border: '1px solid #2a2a3a' }}
    >
      <p className="text-xs font-semibold text-gray-400">{label}</p>
      <div className="grid grid-cols-3 gap-2">
        <ScoreCard label="정확도" value={accuracy} />
        <ScoreCard label="유창성" value={fluency} />
        <ScoreCard label="완전성" value={completeness} />
      </div>
      <div className="flex gap-4 pt-1" style={{ borderTop: '1px solid #2a2a3a' }}>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-600">누락</span>
          <span className="text-xs font-semibold text-gray-400">{omitted ?? 0}단어</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-600">반복</span>
          <span className="text-xs font-semibold text-gray-400">{repeated ?? 0}단어</span>
        </div>
      </div>
    </div>
  )
}

function ScoreCard({ label, value }: { label: string; value: number }) {
  const color = value != null ? scoreColor(value) : '#555'
  return (
    <div
      className="flex flex-col items-center gap-2 py-3 px-2 rounded-xl"
      style={{ background: '#1e1e2e', border: '1px solid #2a2a3a' }}
    >
      <span className="text-xs text-gray-500 tracking-wide">{label}</span>
      <span className="text-2xl font-bold tabular-nums" style={{ color }}>
        {value ?? '—'}
      </span>
      {typeof value === 'number' && (
        <div className="w-full h-1 rounded-full" style={{ background: '#2a2a3a' }}>
          <div
            className="h-1 rounded-full"
            style={{ width: `${Math.min(value, 100)}%`, background: color }}
          />
        </div>
      )}
    </div>
  )
}

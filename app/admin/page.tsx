'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type ResponseRow = {
  id: string
  name: string
  createdAt: string
  topType: number
  selectedStage: string
  stageDetail: string
  freeSpeechText: string
  geminiReport: string
  typeScores: Record<string, number>
  pronunciation1Accuracy: number
  pronunciation1Fluency: number
  pronunciation1Completeness: number
  pronunciation1Prosody: number
  pronunciation2Accuracy: number
  pronunciation2Fluency: number
  pronunciation2Completeness: number
  pronunciation2Prosody: number
  freeSpeechAccuracy: number
  freeSpeechFluency: number
  freeSpeechCompleteness: number
  freeSpeechProsody: number
}

const maskName = (name: string) => {
  if (!name) return '익명'
  if (name.length === 1) return 'O'
  if (name.length === 2) return 'O' + name[1]
  return name[0] + 'O'.repeat(name.length - 2) + name[name.length - 1]
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ResponseRow[]>([])
  const [error, setError] = useState('')
  const [authorized, setAuthorized] = useState(false)
  const [selectedRow, setSelectedRow] = useState<ResponseRow | null>(null)

  useEffect(() => {
    const passcode = localStorage.getItem('admin_passcode')
    if (passcode !== '00347') {
      router.replace('/admin/login')
    } else {
      setAuthorized(true)
      fetchData(passcode)
    }
  }, [router])

  const fetchData = async (passcode: string) => {
    try {
      const res = await fetch('/api/admin/responses', {
        headers: {
          Authorization: `Bearer ${passcode}`
        }
      })
      if (!res.ok) throw new Error('데이터를 불러오지 못했습니다.')
      const json = await res.json()
      setData(json.data)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('admin_passcode')
    router.replace('/admin/login')
  }

  if (!authorized) return null

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">데이터를 불러오는 중입니다...</div>
  }

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: '#F7FAF9', fontFamily: 'Pretendard, sans-serif' }}>
      <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h1 className="text-2xl font-bold" style={{ color: '#111827' }}>관리자 대시보드</h1>
          <button onClick={handleLogout} className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 transition">
            로그아웃
          </button>
        </div>

        {error ? (
          <div className="p-6 text-red-500">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-6 py-4 font-medium">이름(익명)</th>
                  <th className="px-6 py-4 font-medium">검사 일시</th>
                  <th className="px-6 py-4 font-medium">성향 타입</th>
                  <th className="px-6 py-4 font-medium">선택한 상황</th>
                  <th className="px-6 py-4 font-medium">Gemini 리포트 (요약)</th>
                  <th className="px-6 py-4 font-medium text-center">상세보기</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50/50 transition cursor-pointer" onClick={() => setSelectedRow(row)}>
                    <td className="px-6 py-4 font-medium">{maskName(row.name)}</td>
                    <td className="px-6 py-4 text-gray-500">{new Date(row.createdAt).toLocaleString('ko-KR')}</td>
                    <td className="px-6 py-4 text-gray-500">{row.topType}형</td>
                    <td className="px-6 py-4 text-gray-500">{row.selectedStage}</td>
                    <td className="px-6 py-4 text-gray-500 truncate max-w-[300px]">{row.geminiReport}</td>
                    <td className="px-6 py-4 text-center">
                      <button className="text-[#00C9A7] font-medium hover:underline">열기</button>
                    </td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">데이터가 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setSelectedRow(null)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-8 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">{maskName(selectedRow.name)}님의 검사 상세</h2>
              <button onClick={() => setSelectedRow(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
            </div>
            
            <div className="space-y-8">
              {/* 성향 분석 결과 */}
              <section>
                <h3 className="text-lg font-semibold mb-3 border-b pb-2">에니어그램 성향 분석</h3>
                <div className="flex items-center gap-4 mb-4">
                  <div className="px-4 py-2 bg-[#00C9A7]/10 text-[#00C9A7] rounded-lg font-bold">최종 {selectedRow.topType}형</div>
                  <div className="text-sm text-gray-500">{new Date(selectedRow.createdAt).toLocaleString('ko-KR')}</div>
                </div>
                
                <div className="grid grid-cols-3 gap-3">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(type => {
                    const score = selectedRow.typeScores?.[`type${type}`] || 0
                    return (
                      <div key={type} className="p-3 bg-gray-50 rounded-lg text-center flex flex-col">
                        <span className="text-gray-500 text-sm">{type}형</span>
                        <span className="font-bold text-lg">{score}점</span>
                      </div>
                    )
                  })}
                </div>
              </section>

              {/* 상황 정보 */}
              <section>
                <h3 className="text-lg font-semibold mb-3 border-b pb-2">선택한 말하기 상황</h3>
                <div className="bg-gray-50 p-4 rounded-xl">
                  <p className="font-medium mb-1">상황: {selectedRow.selectedStage}</p>
                  <p className="text-gray-600 text-sm">상세: {selectedRow.stageDetail}</p>
                </div>
              </section>

              {/* 발음 평가 */}
              <section>
                <h3 className="text-lg font-semibold mb-3 border-b pb-2">발음 평가 결과</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="border border-gray-100 p-4 rounded-xl">
                    <p className="font-bold mb-2">지문 1 (간장공장)</p>
                    <ul className="text-sm space-y-1 text-gray-600">
                      <li>정확도: {selectedRow.pronunciation1Accuracy}</li>
                      <li>유창성: {selectedRow.pronunciation1Fluency}</li>
                      <li>완성도: {selectedRow.pronunciation1Completeness}</li>
                      <li>운율: {selectedRow.pronunciation1Prosody}</li>
                    </ul>
                  </div>
                  <div className="border border-gray-100 p-4 rounded-xl">
                    <p className="font-bold mb-2">지문 2 (경찰청)</p>
                    <ul className="text-sm space-y-1 text-gray-600">
                      <li>정확도: {selectedRow.pronunciation2Accuracy}</li>
                      <li>유창성: {selectedRow.pronunciation2Fluency}</li>
                      <li>완성도: {selectedRow.pronunciation2Completeness}</li>
                      <li>운율: {selectedRow.pronunciation2Prosody}</li>
                    </ul>
                  </div>
                </div>
              </section>

              {/* 자유 발화 평가 */}
              {selectedRow.freeSpeechText && (
                <section>
                  <h3 className="text-lg font-semibold mb-3 border-b pb-2">자유 발화 분석</h3>
                  <div className="bg-gray-50 p-4 rounded-xl mb-3">
                    <p className="text-sm font-medium mb-2 text-gray-500">인식된 텍스트:</p>
                    <p className="text-gray-800">&quot;{selectedRow.freeSpeechText}&quot;</p>
                  </div>
                  <ul className="flex gap-4 text-sm text-gray-600">
                    <li>정확도: {selectedRow.freeSpeechAccuracy}</li>
                    <li>유창성: {selectedRow.freeSpeechFluency}</li>
                    <li>완성도: {selectedRow.freeSpeechCompleteness}</li>
                    <li>운율: {selectedRow.freeSpeechProsody}</li>
                  </ul>
                </section>
              )}

              {/* AI 리포트 */}
              <section>
                <h3 className="text-lg font-semibold mb-3 border-b pb-2">Gemini AI 상세 리포트</h3>
                <div className="bg-[#F7FAF9] p-5 rounded-xl whitespace-pre-wrap text-sm leading-relaxed border border-[#00C9A7]/20">
                  {selectedRow.geminiReport}
                </div>
              </section>
              
            </div>
            
            <button onClick={() => setSelectedRow(null)} className="mt-8 w-full py-3 rounded-xl bg-gray-800 text-white font-bold">
              닫기
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

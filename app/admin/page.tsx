'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged, signOut, User } from 'firebase/auth'
import { auth } from '@/lib/firebase/config'

type ResponseRow = {
  id: string
  name: string
  createdAt: string
  topType: number
  selectedStage: string
  stageDetail: string
  geminiReport: string
  // you can add more fields if needed
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ResponseRow[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.replace('/admin/login')
      } else {
        setUser(currentUser)
        await fetchData(currentUser)
      }
    })
    return () => unsubscribe()
  }, [router])

  const fetchData = async (currentUser: User) => {
    try {
      const token = await currentUser.getIdToken()
      const res = await fetch('/api/admin/responses', {
        headers: {
          Authorization: `Bearer ${token}`
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

  const handleLogout = async () => {
    await signOut(auth)
    router.replace('/admin/login')
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  if (!user) return null

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
                  <th className="px-6 py-4 font-medium">이름</th>
                  <th className="px-6 py-4 font-medium">검사 일시</th>
                  <th className="px-6 py-4 font-medium">성향 타입</th>
                  <th className="px-6 py-4 font-medium">선택한 상황</th>
                  <th className="px-6 py-4 font-medium">상황 상세</th>
                  <th className="px-6 py-4 font-medium">Gemini 리포트</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50/50 transition">
                    <td className="px-6 py-4 font-medium">{row.name}</td>
                    <td className="px-6 py-4 text-gray-500">{new Date(row.createdAt).toLocaleString('ko-KR')}</td>
                    <td className="px-6 py-4 text-gray-500">{row.topType}형</td>
                    <td className="px-6 py-4 text-gray-500">{row.selectedStage}</td>
                    <td className="px-6 py-4 text-gray-500 truncate max-w-[200px]">{row.stageDetail}</td>
                    <td className="px-6 py-4 text-gray-500 truncate max-w-[300px]">{row.geminiReport}</td>
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
    </main>
  )
}

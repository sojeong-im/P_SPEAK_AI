'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (password === '00347') {
      localStorage.setItem('admin_passcode', password)
      router.push('/admin')
    } else {
      setError('비밀번호가 일치하지 않습니다.')
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F7FAF9', fontFamily: 'Pretendard, sans-serif' }}>
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 max-w-sm w-full mx-4">
        <h1 className="text-2xl font-bold text-center mb-6" style={{ color: '#111827' }}>관리자 접속</h1>
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: '#4B5563' }}>비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-[#00C9A7]/50"
              style={{ borderColor: '#E5E7EB' }}
              placeholder="비밀번호를 입력하세요"
              required
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            className="w-full py-3 rounded-xl font-bold mt-2 transition-all"
            style={{
              backgroundColor: '#00C9A7',
              color: 'white',
            }}
          >
            접속하기
          </button>
        </form>
      </div>
    </main>
  )
}

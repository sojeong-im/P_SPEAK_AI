'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-50 font-sans">
      <div className="bg-white rounded-xl shadow p-6 max-w-lg w-full flex flex-col gap-4">
        <h2 className="text-xl font-bold text-red-600">화면을 표시하는 중 오류가 발생했습니다 😢</h2>
        <p className="text-sm text-gray-700">이 화면을 캡처해서 전달해주시면 바로 원인을 파악해서 해결해드릴게요!</p>
        <pre className="bg-red-50 p-4 rounded-lg text-xs text-red-900 overflow-auto border border-red-200">
          {error.message}
          {'\n\n'}
          {error.stack}
        </pre>
        <button
          onClick={() => reset()}
          className="mt-4 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition"
        >
          다시 시도
        </button>
      </div>
    </div>
  )
}

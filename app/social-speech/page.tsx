'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, Square, ArrowLeft } from 'lucide-react'

type Message = {
  role: 'user' | 'model'
  content: string
}

export default function SocialSpeechPage() {
  const router = useRouter()
  
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', content: '안녕하세요! 가벼운 스몰토크나 일상 대화로 사회성 스피치 연습을 시작해볼까요? 오늘 하루는 어떠셨나요?' }
  ])
  const [isRecording, setIsRecording] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const [partialText, setPartialText] = useState('')
  const [volume, setVolume] = useState(0)
  
  const sttStopRef = useRef<(() => void) | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const volumeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, partialText, isThinking])

  // 마이크 볼륨 시각화를 위한 훅
  const startVolumeMeter = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext
      audioContextRef.current = new AudioContext()
      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 256
      const source = audioContextRef.current.createMediaStreamSource(stream)
      source.connect(analyserRef.current)

      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)

      volumeIntervalRef.current = setInterval(() => {
        if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray)
          const sum = dataArray.reduce((a, b) => a + b, 0)
          const avg = sum / dataArray.length
          setVolume(avg)
        }
      }, 50)
    } catch (e) {
      console.warn('Volume meter failed:', e)
    }
  }

  const stopVolumeMeter = () => {
    if (volumeIntervalRef.current) clearInterval(volumeIntervalRef.current)
    if (audioContextRef.current) audioContextRef.current.close()
    setVolume(0)
  }

  const handleStartRecording = async () => {
    try {
      setPartialText('')
      setIsRecording(true)
      await startVolumeMeter()
      
      const { startSTT } = await import('@/lib/azure/speech-service')
      const stop = await startSTT({
        onRecognizing: (text) => {
          setPartialText(text)
        },
        onRecognized: (text) => {
          if (!text.trim()) return
          // 중간 중간 Recognized되는 텍스트를 누적 (긴 발화의 경우)
          setPartialText(prev => prev ? prev + ' ' + text : text)
        },
        onError: (err) => {
          console.warn('STT Error:', err)
          handleStopRecording()
        }
      })
      sttStopRef.current = stop
    } catch (e) {
      console.error('Failed to start recording', e)
      setIsRecording(false)
    }
  }

  const handleStopRecording = async () => {
    setIsRecording(false)
    stopVolumeMeter()
    
    if (sttStopRef.current) {
      sttStopRef.current()
      sttStopRef.current = null
    }

    const finalUserText = partialText.trim()
    setPartialText('')

    if (!finalUserText) return

    const newMessages: Message[] = [...messages, { role: 'user', content: finalUserText }]
    setMessages(newMessages)
    setIsThinking(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages })
      })
      const data = await res.json()
      
      if (res.ok && data.reply) {
        setMessages([...newMessages, { role: 'model', content: data.reply }])
      }
    } catch (e) {
      console.error('Chat error:', e)
    } finally {
      setIsThinking(false)
    }
  }

  // 펄스 애니메이션 크기 계산
  const pulseSize = 100 + (volume / 255) * 80

  return (
    <main
      className="min-h-screen flex flex-col items-center pt-8 pb-32 px-4"
      style={{ backgroundColor: '#F7FAF9', fontFamily: 'Pretendard, sans-serif' }}
    >
      <div className="w-full max-w-xl flex flex-col h-full gap-6">
        {/* 헤더 */}
        <div className="flex items-center gap-3 w-full">
          <button
            onClick={() => router.push('/')}
            className="p-2 rounded-full hover:bg-gray-200 transition"
            aria-label="이전으로"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">사회성 스피치 연습</h1>
            <p className="text-xs text-gray-500">가벼운 대화를 통해 사회성을 길러보세요</p>
          </div>
        </div>

        {/* 대화 내역 */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-4">
          {messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex w-full ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`px-4 py-3 rounded-2xl max-w-[85%] ${
                  m.role === 'user'
                    ? 'bg-[#00C9A7] text-white rounded-tr-none'
                    : 'bg-white border border-[#E0E8E5] text-gray-800 rounded-tl-none shadow-sm'
                }`}
                style={{ fontSize: '15px', lineHeight: '1.5' }}
              >
                {m.content}
              </div>
            </motion.div>
          ))}
          
          {partialText && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex w-full justify-end"
            >
              <div className="px-4 py-3 rounded-2xl max-w-[85%] bg-[#00C9A7] text-white/70 rounded-tr-none text-sm border border-[#00C9A7]">
                {partialText} <span className="animate-pulse">...</span>
              </div>
            </motion.div>
          )}

          {isThinking && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex w-full justify-start"
            >
              <div className="px-5 py-3 rounded-2xl bg-white border border-[#E0E8E5] rounded-tl-none flex gap-1.5 items-center">
                <div className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </motion.div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 하단 고정: 녹음 펄스 UI */}
      <div className="fixed bottom-0 left-0 w-full p-6 flex justify-center items-center bg-gradient-to-t from-[#F7FAF9] via-[#F7FAF9] to-transparent">
        <div className="relative flex justify-center items-center h-32 w-32">
          <AnimatePresence>
            {isRecording && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="absolute w-full h-full rounded-full flex justify-center items-center pointer-events-none"
              >
                {/* 볼륨 반응형 펄스 */}
                <div
                  className="rounded-full bg-[#00C9A7] opacity-20 absolute"
                  style={{
                    width: `${pulseSize}px`,
                    height: `${pulseSize}px`,
                    transition: 'width 0.1s, height 0.1s'
                  }}
                />
                {/* 고정 애니메이션 펄스 */}
                <div className="w-24 h-24 rounded-full border border-[#00C9A7] absolute animate-ping opacity-30" />
              </motion.div>
            )}
          </AnimatePresence>
          
          <button
            onClick={isRecording ? handleStopRecording : handleStartRecording}
            disabled={isThinking}
            className={`relative z-10 w-16 h-16 rounded-full flex items-center justify-center text-white shadow-lg transition-all ${
              isThinking ? 'bg-gray-400 cursor-not-allowed' : (isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-[#00C9A7] hover:bg-[#00B396]')
            }`}
            style={{
              boxShadow: isRecording ? '0 4px 20px rgba(239, 68, 68, 0.4)' : '0 4px 20px rgba(0,201,167,0.35)'
            }}
          >
            {isRecording ? <Square fill="currentColor" className="w-6 h-6" /> : <Mic className="w-7 h-7" />}
          </button>
        </div>
      </div>
    </main>
  )
}

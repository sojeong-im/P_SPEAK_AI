'use client'

import type { VoicePrintSession, PronunciationResult, TypeScores, StageType } from '@/types'

const KEY = 'voiceprint_session'

function getSession(): Partial<VoicePrintSession> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '{}')
  } catch {
    return {}
  }
}

function saveSession(data: Partial<VoicePrintSession>) {
  if (typeof window === 'undefined') return
  const prev = getSession()
  sessionStorage.setItem(KEY, JSON.stringify({ ...prev, ...data }))
}

function clearSession() {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(KEY)
}

export const sessionStore = {
  get: getSession,
  save: saveSession,
  clear: clearSession,
  setName: (name: string) => saveSession({ name }),
  setPronunciation1: (p: PronunciationResult) => saveSession({ pronunciation1: p }),
  setPronunciation2: (p: PronunciationResult) => saveSession({ pronunciation2: p }),
  setStage: (selectedStage: StageType, stageDetail: string) => saveSession({ selectedStage, stageDetail }),
  setFreeSpeech: (freeSpeechText: string) => saveSession({ freeSpeechText }),
  setSpeechConcern: (speechConcernType: string) => saveSession({ speechConcernType }),
  setTypeScores: (typeScores: TypeScores, topType: number) => saveSession({ typeScores, topType }),
  setGeminiReport: (geminiReport: string) => saveSession({ geminiReport }),
  setConsultation: (consultationInterest: boolean) => saveSession({ consultationInterest }),
}

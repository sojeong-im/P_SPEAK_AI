export type PassageIndex = 0 | 1

export interface PerWordScore {
  word: string
  overall: number
  pron: number
  isMispronounced: boolean
  phonemes?: { phoneme: string; pron: number }[]
}

export type EvaluationEngine = 'speechsuper' | 'azure'

export interface PronunciationResult {
  accuracyScore: number
  fluencyScore: number
  completenessScore: number
  prosodyScore: number
  omittedWords: number
  repeatedWords: number
  mispronouncedWords: string[]
  perWord?: PerWordScore[]
  weakPhonemes?: { phoneme: string; pron: number }[]
  engine?: EvaluationEngine
}

export interface FreeSpeechScore {
  accuracyScore: number
  fluencyScore: number
  completenessScore: number
  prosodyScore: number
  recognizedText: string
  perWord?: PerWordScore[]
}

export type StageType = '취업/커리어' | '대중 발표' | '인간관계' | '기타'

export interface TypeScores {
  type1: number
  type2: number
  type3: number
  type4: number
  type5: number
  type6: number
  type7: number
  type8: number
  type9: number
}

export interface SpeakType {
  id: number
  title: string
  shortTitle: string
  description: string
  patterns: string[]
  speechPattern: string
  cognitiveTip: string
  trainingDirection: string
}

export interface VoicePrintSession {
  name: string
  pronunciation1: PronunciationResult   // 간장공장
  pronunciation2: PronunciationResult   // 경찰청
  selectedStage: StageType
  stageDetail: string                   // 무대에서 하고싶은 말
  freeSpeechText: string
  freeSpeechScore?: FreeSpeechScore
  speechConcernType?: string
  typeScores: TypeScores
  topType: number
  geminiReport?: string
  consultationInterest?: boolean
  responseId?: string
}

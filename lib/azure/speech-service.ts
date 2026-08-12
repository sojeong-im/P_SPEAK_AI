'use client'

// Azure Speech SDK wrapper — 키는 나중에 환경변수로 주입
// SpeechSuper로 교체 시 이 파일만 수정하면 됨

export interface PronunciationAssessmentResult {
  accuracyScore: number
  fluencyScore: number
  completenessScore: number
  prosodyScore: number
  omittedWords: number
  repeatedWords: number
  mispronouncedWords: string[]
  recognizedText: string
}

export interface STTCallbacks {
  onRecognizing: (text: string) => void
  onRecognized: (text: string) => void
  onError: (error: string) => void
}

let SpeechSDK: typeof import('microsoft-cognitiveservices-speech-sdk') | null = null

async function getSDK() {
  if (!SpeechSDK) {
    SpeechSDK = await import('microsoft-cognitiveservices-speech-sdk')
  }
  return SpeechSDK
}

function getSpeechConfig(sdk: typeof import('microsoft-cognitiveservices-speech-sdk')) {
  const key = (process.env.NEXT_PUBLIC_AZURE_SPEECH_KEY || '').trim()
  const region = (process.env.NEXT_PUBLIC_AZURE_SPEECH_REGION || 'eastus').trim()
  return sdk.SpeechConfig.fromSubscription(key, region)
}

type WordDetail = {
  Word: string
  ErrorType?: string
  PronunciationAssessment?: { AccuracyScore: number }
}

// 발음 평가 + 실시간 STT (읽기 화면용)
export async function startPronunciationAssessment(
  referenceText: string,
  onWordHighlight: (recognizedText: string) => void,
  onComplete: (result: PronunciationAssessmentResult) => void,
  onError: (error: string) => void,
  onSegmentResult?: (result: PronunciationAssessmentResult) => void
): Promise<() => void> {
  const sdk = await getSDK()
  const speechConfig = getSpeechConfig(sdk)
  speechConfig.speechRecognitionLanguage = 'ko-KR'

  const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput()

  const pronunciationConfig = new sdk.PronunciationAssessmentConfig(
    referenceText,
    sdk.PronunciationAssessmentGradingSystem.HundredMark,
    sdk.PronunciationAssessmentGranularity.Phoneme,
    true
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(pronunciationConfig as any).enableProsodyAssessment?.()

  const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig)
  pronunciationConfig.applyTo(recognizer)

  let omittedWords = 0
  let repeatedWords = 0
  let lastAccuracy = 0
  let lastFluency = 0
  let lastCompleteness = 0
  let lastProsody = 0
  const allMispronouncedWords: string[] = []

  recognizer.recognizing = (_, e) => {
    onWordHighlight(e.result.text)
  }

  recognizer.recognized = (_, e) => {
    if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
      const pronunciationResult = sdk.PronunciationAssessmentResult.fromResult(e.result)
      lastAccuracy = pronunciationResult.accuracyScore
      lastFluency = pronunciationResult.fluencyScore
      lastCompleteness = pronunciationResult.completenessScore

      // 운율(Prosody) 점수 — JSON에서 추출
      try {
        const json = JSON.parse(
          e.result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult) ?? '{}'
        )
        lastProsody = Math.round(json?.NBest?.[0]?.PronunciationAssessment?.ProsodyScore ?? 0)
      } catch {
        lastProsody = 0
      }

      // 누락/반복/오발음 단어 집계
      for (const word of (pronunciationResult.detailResult.Words ?? []) as WordDetail[]) {
        if (word.ErrorType === 'Omission') {
          omittedWords++
        } else if (word.ErrorType === 'Insertion') {
          repeatedWords++
        } else if (
          word.ErrorType === 'Mispronunciation' ||
          ((word.PronunciationAssessment?.AccuracyScore ?? 100) < 60 && !word.ErrorType)
        ) {
          if (word.Word) allMispronouncedWords.push(word.Word)
        }
      }

      onWordHighlight(e.result.text)

      // Cache intermediate result so timeout fallback has real scores even if sessionStopped fires late
      onSegmentResult?.({
        accuracyScore: Math.round(lastAccuracy),
        fluencyScore: Math.round(lastFluency),
        completenessScore: Math.round(lastCompleteness),
        prosodyScore: lastProsody,
        omittedWords,
        repeatedWords,
        mispronouncedWords: allMispronouncedWords.filter((w, i, arr) => arr.indexOf(w) === i),
        recognizedText: e.result.text,
      })
    }
  }

  recognizer.sessionStopped = () => {
    recognizer.stopContinuousRecognitionAsync()
    onComplete({
      accuracyScore: Math.round(lastAccuracy),
      fluencyScore: Math.round(lastFluency),
      completenessScore: Math.round(lastCompleteness),
      prosodyScore: lastProsody,
      omittedWords,
      repeatedWords,
      mispronouncedWords: allMispronouncedWords.filter((w, i, arr) => arr.indexOf(w) === i),
      recognizedText: '',
    })
  }

  recognizer.canceled = (_, e) => {
    if (e.reason === sdk.CancellationReason.Error) {
      onError(`인식 오류: ${e.errorDetails}`)
    }
    recognizer.stopContinuousRecognitionAsync()
  }

  recognizer.startContinuousRecognitionAsync()

  return () => {
    recognizer.stopContinuousRecognitionAsync()
  }
}

// 단순 STT (사전입력 + 자유발화용)
export async function startSTT(callbacks: STTCallbacks): Promise<() => void> {
  const sdk = await getSDK()
  const speechConfig = getSpeechConfig(sdk)
  speechConfig.speechRecognitionLanguage = 'ko-KR'

  const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput()
  const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig)

  recognizer.recognizing = (_, e) => {
    callbacks.onRecognizing(e.result.text)
  }

  recognizer.recognized = (_, e) => {
    if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
      callbacks.onRecognized(e.result.text)
    }
  }

  recognizer.canceled = (_, e) => {
    if (e.reason === sdk.CancellationReason.Error) {
      callbacks.onError(e.errorDetails)
    }
  }

  recognizer.startContinuousRecognitionAsync()

  return () => {
    recognizer.stopContinuousRecognitionAsync()
  }
}

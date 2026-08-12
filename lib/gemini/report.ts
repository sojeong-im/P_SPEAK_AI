import { GoogleGenerativeAI } from '@google/generative-ai'
import type { TypeScores, StageType } from '@/types'
import { SPEAK_TYPES } from '@/lib/constants'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

// Try models in order. Gemini 3.1 Flash-Lite Preview is the newest 3.x line
// the Gemini API exposes by ID; if it's unavailable in our region/account
// we fall back to Gemini 3 Flash and then the previously-used 2.x stable.
const MODEL_CANDIDATES = [
  'gemini-3.1-flash-lite-preview',
  'gemini-3-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash-001',
  'gemini-1.5-flash',
]

function getTopTypes(typeScores: TypeScores, count = 3) {
  return Object.entries(typeScores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, count)
    .map(([key]) => {
      const typeId = parseInt(key.replace('type', ''))
      const t = SPEAK_TYPES.find(s => s.id === typeId)
      return t ? `${t.shortTitle} (Type ${t.id})` : `Type ${typeId}`
    })
}

function avgScore(a: number, b: number) {
  return Math.round((a + b) / 2)
}

export async function generateVoicePrintReport(params: {
  name: string
  accuracy1: number
  fluency1: number
  completeness1: number
  prosody1: number
  mispronounced1: string[]
  accuracy2: number
  fluency2: number
  completeness2: number
  prosody2: number
  mispronounced2: string[]
  freeSpeechText: string
  selectedStage: StageType
  stageDetail: string
  typeScores: TypeScores
  freeSpeechAccuracy?: number
  freeSpeechFluency?: number
  freeSpeechCompleteness?: number
  freeSpeechProsody?: number
}): Promise<string> {
  const topTypes = getTopTypes(params.typeScores)
  const avgAccuracy = avgScore(params.accuracy1, params.accuracy2)
  const avgFluency = avgScore(params.fluency1, params.fluency2)
  const avgCompleteness = avgScore(params.completeness1, params.completeness2)
  const avgProsody = avgScore(params.prosody1, params.prosody2)
  const pronunciationAnalyzed = avgAccuracy > 0 || avgFluency > 0 || avgCompleteness > 0

  const combined = [...params.mispronounced1, ...params.mispronounced2]
  const mispronouncedAll = combined.filter((w, i, arr) => arr.indexOf(w) === i)
  const mispronouncedText = mispronouncedAll.length > 0
    ? mispronouncedAll.join(', ')
    : '없음'

  const prompt = `다음 데이터를 바탕으로 스피치 종합 리포트를 작성해줘.

[이름]: ${params.name}
[원하는 자리]: ${params.selectedStage}
[그 자리에서 하고 싶은 말]: ${params.stageDetail || '(미입력)'}
[자유 발화 내용]: ${params.freeSpeechText || '(발화 없음)'}
[자유 발화 발음 점수]: ${(params.freeSpeechAccuracy ?? 0) > 0
    ? `정확도 ${params.freeSpeechAccuracy}점, 유창성 ${params.freeSpeechFluency}점, 완전성 ${params.freeSpeechCompleteness}점${(params.freeSpeechProsody ?? 0) > 0 ? `, 운율 ${params.freeSpeechProsody}점` : ''}`
    : '(미측정)'}
[발음 점수 평균]: ${pronunciationAnalyzed ? `정확도 ${avgAccuracy}점, 유창성 ${avgFluency}점, 완전성 ${avgCompleteness}점${avgProsody > 0 ? `, 운율 ${avgProsody}점` : ''}` : '분석 불가'}
[지문1 간장공장]: ${params.accuracy1 > 0 ? `정확도 ${params.accuracy1}점, 유창성 ${params.fluency1}점${params.prosody1 > 0 ? `, 운율 ${params.prosody1}점` : ''}` : '분석 불가'}
[지문2 경찰청]: ${params.accuracy2 > 0 ? `정확도 ${params.accuracy2}점, 유창성 ${params.fluency2}점${params.prosody2 > 0 ? `, 운율 ${params.prosody2}점` : ''}` : '분석 불가'}
[오발음 단어]: ${pronunciationAnalyzed ? mispronouncedText : '분석 불가'}
[말하기 성향 1위]: ${topTypes[0] || '-'}
[말하기 성향 2위]: ${topTypes[1] || '-'}
[말하기 성향 3위]: ${topTypes[2] || '-'}

구성 (반드시 이 순서대로):
1. 첫 줄: "${params.name}님의 스피치 DNA는 [핵심 진단 한 문장]입니다." 형식으로 두괄식 진단 — 가장 중요한 문제/특징을 한 문장에 압축
2. 두 번째 문단: 왜 그런 진단이 나왔는지 근거 (성향/발음/자유 발화/원하는 자리를 연결). 오발음 단어가 있으면 구체적으로 언급
3. 세 번째 문단: 원하는 자리(${params.selectedStage})에서 이 스피치 DNA가 만들 강점 1개 + 보완해야 할 약점 1~2개
4. 네 번째 문단: 자유 발화 내용에 대한 구체적 피드백 (있는 경우만) — 두괄식 여부, 문장 길이, 구체성, 추상성 평가
5. 마지막: "지금 당장 시작할 수 있는 것" 이라는 소제목 후 번호 목록 3개 (${params.selectedStage} 자리 맞춤)

작성 조건:
- 두괄식이 핵심: 결론 먼저, 근거는 그 다음
- ${params.name}님에게 직접 말하듯 따뜻하고 전문적인 톤
- 에니어그램, 심리유형, 성격검사 등 용어 절대 사용 금지
- 마크다운(**, ##, - 등) 사용 금지, 순수 텍스트만
- 각 문단 3~5문장
- 발음 점수가 '분석 불가'인 경우 그 부분은 건너뛰고 성향/자유 발화 중심으로 작성
- 운율 점수가 표시되지 않은 항목은 측정되지 않은 것이므로 분석에 포함하지 말 것 (절대 "운율 0점" 같은 해석을 만들지 말 것)
- 자유 발화가 없거나 매우 짧으면 4번 문단은 생략 가능`

  let lastError: unknown = null
  for (const modelName of MODEL_CANDIDATES) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName })
      const result = await model.generateContent(prompt)
      return result.response.text()
    } catch (e) {
      lastError = e
      console.warn(`[Gemini] Model ${modelName} failed:`, e instanceof Error ? e.message : e)
      continue
    }
  }
  throw new Error(
    `All Gemini models failed. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  )
}

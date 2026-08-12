import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { responses } from '@/lib/db/schema'
import { generateVoicePrintReport } from '@/lib/gemini/report'
import type { TypeScores, StageType } from '@/types'

export const maxDuration = 60 // allow up to 60s for Gemini

export async function POST(request: NextRequest): Promise<NextResponse> {
  let stage = 'init'
  try {
    stage = 'parse_body'
    const body = await request.json()
    const {
      name,
      pronunciation1,
      pronunciation2,
      selectedStage,
      stageDetail,
      freeSpeechText,
      freeSpeechScore,
      typeScores,
      topType,
    } = body

    // Minimal input validation — surface clear 400 rather than opaque 500
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'name 필드가 필요합니다.' }, { status: 400 })
    }
    if (!typeScores || typeof typeScores !== 'object') {
      return NextResponse.json({ error: 'typeScores 필드가 필요합니다.' }, { status: 400 })
    }
    if (typeof topType !== 'number') {
      return NextResponse.json({ error: 'topType 필드가 필요합니다.' }, { status: 400 })
    }

    // Gemini 리포트 생성 (실패해도 저장은 계속 진행)
    stage = 'gemini'
    let geminiReport = ''
    try {
      if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.trim() === '') {
        throw new Error('GEMINI_API_KEY is not configured')
      }
      geminiReport = await generateVoicePrintReport({
        name,
        accuracy1: pronunciation1?.accuracyScore ?? 0,
        fluency1: pronunciation1?.fluencyScore ?? 0,
        completeness1: pronunciation1?.completenessScore ?? 0,
        prosody1: pronunciation1?.prosodyScore ?? 0,
        mispronounced1: pronunciation1?.mispronouncedWords ?? [],
        accuracy2: pronunciation2?.accuracyScore ?? 0,
        fluency2: pronunciation2?.fluencyScore ?? 0,
        completeness2: pronunciation2?.completenessScore ?? 0,
        prosody2: pronunciation2?.prosodyScore ?? 0,
        mispronounced2: pronunciation2?.mispronouncedWords ?? [],
        freeSpeechText: freeSpeechText ?? '',
        selectedStage: selectedStage as StageType,
        stageDetail: stageDetail ?? '',
        typeScores: typeScores as TypeScores,
        freeSpeechAccuracy: Number(freeSpeechScore?.accuracyScore ?? 0),
        freeSpeechFluency: Number(freeSpeechScore?.fluencyScore ?? 0),
        freeSpeechCompleteness: Number(freeSpeechScore?.completenessScore ?? 0),
        freeSpeechProsody: Number(freeSpeechScore?.prosodyScore ?? 0),
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[report] Gemini error:', msg)
      geminiReport = `리포트 생성 중 오류가 발생했습니다. (${msg})`
    }

    stage = 'db_insert'
    const [saved] = await db.insert(responses).values({
      name,
      pronunciation1Accuracy: pronunciation1?.accuracyScore ?? 0,
      pronunciation1Fluency: pronunciation1?.fluencyScore ?? 0,
      pronunciation1Completeness: pronunciation1?.completenessScore ?? 0,
      pronunciation1Prosody: pronunciation1?.prosodyScore ?? 0,
      pronunciation1OmittedWords: pronunciation1?.omittedWords ?? 0,
      pronunciation1RepeatedWords: pronunciation1?.repeatedWords ?? 0,
      pronunciation1MispronouncedWords: pronunciation1?.mispronouncedWords ?? [],
      pronunciation2Accuracy: pronunciation2?.accuracyScore ?? 0,
      pronunciation2Fluency: pronunciation2?.fluencyScore ?? 0,
      pronunciation2Completeness: pronunciation2?.completenessScore ?? 0,
      pronunciation2Prosody: pronunciation2?.prosodyScore ?? 0,
      pronunciation2OmittedWords: pronunciation2?.omittedWords ?? 0,
      pronunciation2RepeatedWords: pronunciation2?.repeatedWords ?? 0,
      pronunciation2MispronouncedWords: pronunciation2?.mispronouncedWords ?? [],
      selectedStage: selectedStage ?? '',
      stageDetail: stageDetail ?? '',
      freeSpeechText: freeSpeechText ?? '',
      freeSpeechAccuracy: freeSpeechScore?.accuracyScore ?? 0,
      freeSpeechFluency: freeSpeechScore?.fluencyScore ?? 0,
      freeSpeechCompleteness: freeSpeechScore?.completenessScore ?? 0,
      freeSpeechProsody: freeSpeechScore?.prosodyScore ?? 0,
      typeScores,
      topType,
      geminiReport,
    }).returning()

    return NextResponse.json({ success: true, id: saved.id, geminiReport })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined
    console.error(`[report] FAILED at stage=${stage}:`, msg)
    if (stack) console.error(stack)
    return NextResponse.json(
      { error: '저장에 실패했습니다.', stage, detail: msg },
      { status: 500 }
    )
  }
}

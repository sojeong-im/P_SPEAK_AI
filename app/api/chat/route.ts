import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')
const MODEL_CANDIDATES = [
  'gemini-3.1-flash-lite-preview',
  'gemini-3-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash-001',
  'gemini-1.5-flash',
]

const SYSTEM_PROMPT = `당신은 사회성 스피치(Social Speech) 훈련을 돕는 따뜻하고 친절한 AI 파트너입니다.
사용자가 말을 걸면, 상황에 맞는 자연스러운 스몰토크나 대화(핑퐁)를 이어가세요.
절대 길게 말하지 말고, 1~2문장으로 짧게 대답하며 사용자에게 가벼운 질문을 던져서 대화를 유도하세요.
친근한 존댓말을 사용하세요.`

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json()

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid messages' }, { status: 400 })
    }

    const history = messages.slice(0, -1).map((m: any) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }))
    const lastMessage = messages[messages.length - 1].content

    let lastError: unknown = null
    for (const modelName of MODEL_CANDIDATES) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName })
        const chat = model.startChat({
          history,
          systemInstruction: { role: 'system', parts: [{ text: SYSTEM_PROMPT }] },
        })

        const result = await chat.sendMessage(lastMessage)
        const responseText = result.response.text()

        return NextResponse.json({ reply: responseText })
      } catch (e) {
        lastError = e
        console.warn(`[Gemini Chat] Model ${modelName} failed:`, e)
        continue
      }
    }
    
    throw new Error(`All Gemini models failed. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`)

  } catch (error) {
    console.error('Chat API Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

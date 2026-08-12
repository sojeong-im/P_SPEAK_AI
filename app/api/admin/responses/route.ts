import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { responses } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'

function checkAdmin(request: NextRequest): boolean {
  const auth = request.headers.get('x-admin-password')
  return auth === process.env.ADMIN_PASSWORD
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!checkAdmin(request)) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (id) {
    const [row] = await db.select().from(responses).where(eq(responses.id, id))
    if (!row) return NextResponse.json({ error: '없음' }, { status: 404 })
    return NextResponse.json(row)
  }

  const rows = await db.select({
    id: responses.id,
    name: responses.name,
    topType: responses.topType,
    pronunciation1Accuracy: responses.pronunciation1Accuracy,
    pronunciation1Fluency: responses.pronunciation1Fluency,
    pronunciation2Accuracy: responses.pronunciation2Accuracy,
    pronunciation2Fluency: responses.pronunciation2Fluency,
    selectedStage: responses.selectedStage,
    consultationInterest: responses.consultationInterest,
    createdAt: responses.createdAt,
  }).from(responses).orderBy(desc(responses.createdAt))

  return NextResponse.json(rows)
}

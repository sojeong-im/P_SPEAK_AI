import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { responses } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export const runtime = 'nodejs'

// Public single-response read for shareable result URLs.
// UUID v4 (~122 bits of entropy) gives URL-as-capability security: holding
// the link is permission to view that specific result. Listing or guessing
// is impractical. Do NOT expose any list endpoint here.
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const id = params?.id?.trim()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Light-weight UUID shape check to short-circuit obvious garbage
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  const [row] = await db.select().from(responses).where(eq(responses.id, id))
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })

  return NextResponse.json({ ok: true, response: row })
}

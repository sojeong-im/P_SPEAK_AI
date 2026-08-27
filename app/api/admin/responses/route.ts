import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { responses } from '@/lib/db/schema'
import { desc } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    if (authHeader !== 'Bearer 00347') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch all responses ordered by newest first
    const data = await db.select().from(responses).orderBy(desc(responses.createdAt))
    
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Admin API Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

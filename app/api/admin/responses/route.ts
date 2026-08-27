import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { responses } from '@/lib/db/schema'
import { desc } from 'drizzle-orm'
import { adminAuth } from '@/lib/firebase/admin'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const token = authHeader.split('Bearer ')[1]
    
    // Verify Firebase token
    try {
      await adminAuth.verifyIdToken(token)
    } catch (e) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Fetch all responses ordered by newest first
    const data = await db.select().from(responses).orderBy(desc(responses.createdAt))
    
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Admin API Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

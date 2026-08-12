// Idempotent migration: ADD COLUMN IF NOT EXISTS so re-running is safe.
// Uses @neondatabase/serverless Pool which speaks the wire protocol over WS,
// avoiding the manual /sql HTTP-API auth headers (which changed format).
import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'ws'
import { config } from 'dotenv'

config({ path: '.env.local' })

const DATABASE_URL = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL(_UNPOOLED) not set')
  process.exit(1)
}

neonConfig.webSocketConstructor = ws

const SQL = `
ALTER TABLE responses ADD COLUMN IF NOT EXISTS pronunciation1_prosody integer DEFAULT 0;
ALTER TABLE responses ADD COLUMN IF NOT EXISTS pronunciation1_mispronounced_words jsonb DEFAULT '[]';
ALTER TABLE responses ADD COLUMN IF NOT EXISTS pronunciation2_prosody integer DEFAULT 0;
ALTER TABLE responses ADD COLUMN IF NOT EXISTS pronunciation2_mispronounced_words jsonb DEFAULT '[]';
ALTER TABLE responses ADD COLUMN IF NOT EXISTS free_speech_accuracy integer DEFAULT 0;
ALTER TABLE responses ADD COLUMN IF NOT EXISTS free_speech_fluency integer DEFAULT 0;
ALTER TABLE responses ADD COLUMN IF NOT EXISTS free_speech_completeness integer DEFAULT 0;
ALTER TABLE responses ADD COLUMN IF NOT EXISTS free_speech_prosody integer DEFAULT 0;
`

const pool = new Pool({ connectionString: DATABASE_URL })

try {
  await pool.query(SQL)
  console.log('Migration applied successfully.')
} catch (e) {
  console.error('Migration failed:', e?.message ?? e)
  process.exit(1)
} finally {
  await pool.end()
}

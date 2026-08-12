import type { Config } from 'drizzle-kit'
import * as dotenv from 'dotenv'
import { neonConfig } from '@neondatabase/serverless'
import ws from 'ws'

dotenv.config({ path: '.env.local' })
neonConfig.webSocketConstructor = ws

export default {
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!,
  },
} satisfies Config

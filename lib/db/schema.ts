import { pgTable, uuid, text, integer, jsonb, timestamp, boolean } from 'drizzle-orm/pg-core'

export const responses = pgTable('responses', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),

  // 발음 평가 — 지문 1 (간장공장)
  pronunciation1Accuracy: integer('pronunciation1_accuracy').default(0),
  pronunciation1Fluency: integer('pronunciation1_fluency').default(0),
  pronunciation1Completeness: integer('pronunciation1_completeness').default(0),
  pronunciation1Prosody: integer('pronunciation1_prosody').default(0),
  pronunciation1OmittedWords: integer('pronunciation1_omitted_words').default(0),
  pronunciation1RepeatedWords: integer('pronunciation1_repeated_words').default(0),
  pronunciation1MispronouncedWords: jsonb('pronunciation1_mispronounced_words').$type<string[]>().default([]),

  // 발음 평가 — 지문 2 (경찰청)
  pronunciation2Accuracy: integer('pronunciation2_accuracy').default(0),
  pronunciation2Fluency: integer('pronunciation2_fluency').default(0),
  pronunciation2Completeness: integer('pronunciation2_completeness').default(0),
  pronunciation2Prosody: integer('pronunciation2_prosody').default(0),
  pronunciation2OmittedWords: integer('pronunciation2_omitted_words').default(0),
  pronunciation2RepeatedWords: integer('pronunciation2_repeated_words').default(0),
  pronunciation2MispronouncedWords: jsonb('pronunciation2_mispronounced_words').$type<string[]>().default([]),

  // 무대 선택
  selectedStage: text('selected_stage').default(''),
  stageDetail: text('stage_detail').default(''),

  // 자유 발화
  freeSpeechText: text('free_speech_text').default(''),

  // 자유 발화 SpeechSuper para.eval 점수 (자기 발화 일관성)
  freeSpeechAccuracy: integer('free_speech_accuracy').default(0),
  freeSpeechFluency: integer('free_speech_fluency').default(0),
  freeSpeechCompleteness: integer('free_speech_completeness').default(0),
  freeSpeechProsody: integer('free_speech_prosody').default(0),

  // 성향 테스트
  typeScores: jsonb('type_scores').$type<Record<string, number>>().notNull(),
  topType: integer('top_type').notNull(),

  // 리포트
  geminiReport: text('gemini_report').default(''),

  // 상담 신청
  consultationInterest: boolean('consultation_interest').default(false),

  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type Response = typeof responses.$inferSelect
export type NewResponse = typeof responses.$inferInsert

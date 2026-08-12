'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { sessionStore } from '@/lib/session-store';

const STEPS = ['시작', 'STEP 1', 'STEP 2', 'STEP 3', '결과'];
const ACTIVE_STEP = 0;

const EASING = [0.25, 0.46, 0.45, 0.94] as unknown as import('framer-motion').Easing;

const fadeInUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.1,
      duration: 0.55,
      ease: EASING,
    },
  }),
};

export default function GoalPage() {
  const router = useRouter();
  const [name, setName] = useState('');

  const isValid = name.trim().length > 0;

  const handleSubmit = () => {
    if (!isValid) return;
    sessionStore.setName(name.trim());
    router.push('/reading');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && isValid) {
      handleSubmit();
    }
  };

  return (
    <main
      className="min-h-screen flex flex-col items-center px-4 py-10"
      style={{ backgroundColor: '#F7FAF9', fontFamily: 'Pretendard, sans-serif' }}
    >
      <style jsx global>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
      `}</style>

      <div className="w-full max-w-xl flex flex-col gap-8">

        {/* 뒤로가기 버튼 */}
        <motion.button
          custom={0}
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          onClick={() => router.push('/')}
          className="flex items-center gap-1.5 w-fit transition-opacity duration-150 hover:opacity-60"
          style={{ color: '#6B7280', fontSize: '14px' }}
        >
          <span>←</span>
          <span>홈으로</span>
        </motion.button>

        {/* 진행 단계 */}
        <motion.div
          custom={1}
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          className="flex items-center gap-2 flex-wrap"
          style={{ fontSize: '13px' }}
        >
          {STEPS.map((step, idx) => (
            <span key={step} className="flex items-center gap-2">
              <span
                style={{
                  color: idx === ACTIVE_STEP ? '#00C9A7' : '#B0BAC5',
                  fontWeight: idx === ACTIVE_STEP ? 700 : 400,
                  padding: idx === ACTIVE_STEP ? '2px 10px' : undefined,
                  borderRadius: idx === ACTIVE_STEP ? '999px' : undefined,
                  border: idx === ACTIVE_STEP ? '1.5px solid #00C9A7' : undefined,
                  backgroundColor: idx === ACTIVE_STEP ? 'rgba(0, 201, 167, 0.08)' : undefined,
                }}
              >
                {step}
              </span>
              {idx < STEPS.length - 1 && (
                <span style={{ color: '#D8DDE8', fontSize: '11px' }}>›</span>
              )}
            </span>
          ))}
        </motion.div>

        {/* 브랜드 칩 */}
        <motion.div
          custom={2}
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          className="flex items-center gap-2"
        >
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1"
            style={{
              backgroundColor: 'rgba(0, 201, 167, 0.10)',
              border: '1px solid rgba(0, 201, 167, 0.3)',
              color: '#00A88C',
              fontSize: '12px',
              fontWeight: 600,
              letterSpacing: '0.02em',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: '#00C9A7',
                display: 'inline-block',
              }}
            />
            SPEAKUP VOICE PRINT
          </span>
        </motion.div>

        {/* 메인 카드 */}
        <motion.div
          custom={3}
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          className="rounded-2xl flex flex-col gap-8"
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E5EDE9',
            boxShadow: '0 4px 24px 0 rgba(0,0,0,0.05)',
            padding: '32px 28px',
          }}
        >
          {/* 헤드라인 */}
          <div className="flex flex-col gap-2">
            <h1
              className="font-extrabold leading-snug whitespace-pre-line"
              style={{
                fontSize: 'clamp(24px, 5vw, 34px)',
                color: '#0F172A',
                letterSpacing: '-0.02em',
              }}
            >
              {'안녕하세요!\n이름을 알려주세요 😊'}
            </h1>
            <p style={{ fontSize: '15px', color: '#6B7280', lineHeight: '1.6' }}>
              분석 결과에 이름이 함께 표시됩니다.
            </p>
          </div>

          {/* 이름 입력 */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="name-input"
              style={{ fontSize: '13px', color: '#6B7280', fontWeight: 500 }}
            >
              이름 (닉네임도 좋아요)
            </label>
            <input
              id="name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="예: 김민준, 수진, Julie..."
              autoFocus
              className="w-full rounded-xl px-4 py-3.5 outline-none transition-all duration-200"
              style={{
                backgroundColor: '#F8FAF9',
                border: '1.5px solid #E0E8E5',
                color: '#0F172A',
                fontSize: '16px',
                fontFamily: 'Pretendard, sans-serif',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#00C9A7';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,201,167,0.12)';
                e.currentTarget.style.backgroundColor = '#FFFFFF';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#E0E8E5';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.backgroundColor = '#F8FAF9';
              }}
            />
            {name.trim().length > 0 && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: EASING }}
                style={{ fontSize: '12px', color: '#00A88C' }}
              >
                반갑습니다, {name.trim()}님!
              </motion.p>
            )}
          </div>

          {/* 안내 문구 */}
          <div
            className="rounded-xl px-4 py-3"
            style={{ backgroundColor: 'rgba(0,201,167,0.06)', border: '1px solid rgba(0,201,167,0.15)' }}
          >
            <p style={{ fontSize: '13px', color: '#374151', lineHeight: '1.65' }}>
              이름 입력 후 <strong style={{ color: '#00A88C' }}>발음 테스트 → 자리 선택 → 스피치</strong> 순서로
              진행됩니다. 총 5~7분 소요됩니다.
            </p>
          </div>
        </motion.div>

        {/* 시작하기 버튼 */}
        <motion.div
          custom={4}
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          className="flex flex-col items-center gap-2"
        >
          <motion.button
            onClick={handleSubmit}
            disabled={!isValid}
            whileTap={isValid ? { scale: 0.97 } : {}}
            className="w-full rounded-2xl font-bold transition-all duration-200"
            style={{
              backgroundColor: isValid ? '#00C9A7' : '#E8EFF0',
              color: isValid ? '#FFFFFF' : '#B0BAC5',
              fontSize: '17px',
              padding: '17px',
              cursor: isValid ? 'pointer' : 'not-allowed',
              boxShadow: isValid ? '0 4px 18px 0 rgba(0,201,167,0.35)' : 'none',
              letterSpacing: '-0.01em',
              fontFamily: 'Pretendard, sans-serif',
            }}
          >
            시작하기 →
          </motion.button>
          {!isValid && (
            <p style={{ fontSize: '12px', color: '#B0BAC5' }}>
              이름을 입력하면 시작할 수 있어요
            </p>
          )}
        </motion.div>

      </div>
    </main>
  );
}

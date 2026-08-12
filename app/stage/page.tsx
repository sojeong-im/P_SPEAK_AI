'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { sessionStore } from '@/lib/session-store';
import type { StageType } from '@/types';

// ─── Constants ───────────────────────────────────────────────────────────────

const STEPS = ['시작', 'STEP 1', 'STEP 2', 'STEP 3', 'STEP 4', '결과'];
const ACTIVE_STEP = 2;
const TOTAL_SECONDS = 900; // 15 min

const EASING = [0.25, 0.46, 0.45, 0.94] as unknown as import('framer-motion').Easing;

const STAGE_OPTIONS: {
  value: StageType;
  label: string;
  sub: string;
}[] = [
  { value: '취업/커리어', label: '취업 / 커리어', sub: '면접, 연봉 협상 등' },
  { value: '대중 발표', label: '대중 발표', sub: '사내 발표, 다수 앞 스피치 등' },
  { value: '인간관계', label: '인간관계', sub: '오해 푸는 대화, 거절, 부탁 등' },
  { value: '기타', label: '기타', sub: '직접 입력' },
];

// ─── Animation variants ───────────────────────────────────────────────────────

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

const cardVariants = {
  hidden: { opacity: 0, scale: 0.97, y: 12 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.35, ease: EASING },
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    y: -8,
    transition: { duration: 0.2, ease: EASING },
  },
};

// ─── Timer display helper ─────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function StagePage() {
  const router = useRouter();

  const [selectedStage, setSelectedStage] = useState<StageType | null>(null);
  const [customStage, setCustomStage] = useState('');
  const [stageDetail, setStageDetail] = useState('');
  const [timeLeft, setTimeLeft] = useState(TOTAL_SECONDS);
  const [timerStarted, setTimerStarted] = useState(false);

  // Timer countdown
  useEffect(() => {
    const id = setTimeout(() => setTimerStarted(true), 600);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!timerStarted) return;
    if (timeLeft <= 0) return;
    const id = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [timerStarted, timeLeft]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const progress = ((TOTAL_SECONDS - timeLeft) / TOTAL_SECONDS) * 100;
  const timerFraction = timeLeft / TOTAL_SECONDS;

  // Effective stage value: if 기타, use customStage text
  const effectiveStage: StageType | null =
    selectedStage === '기타' ? '기타' : selectedStage;

  const isValid =
    effectiveStage !== null &&
    (selectedStage !== '기타' || customStage.trim().length > 0) &&
    stageDetail.trim().length > 0;

  const handleSubmit = () => {
    if (!isValid || !effectiveStage) return;
    const stageValue =
      selectedStage === '기타' && customStage.trim()
        ? (`기타` as StageType)
        : effectiveStage;
    sessionStore.setStage(stageValue, stageDetail.trim());
    router.push('/free-speech');
  };

  // Circumference for SVG timer ring
  const RADIUS = 54;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const strokeDashoffset = CIRCUMFERENCE * timerFraction;

  const timerColor =
    timeLeft > 300 ? '#00C9A7' : timeLeft > 60 ? '#F59E0B' : '#EF4444';

  return (
    <main
      className="min-h-screen flex flex-col items-center px-4 py-10"
      style={{ backgroundColor: '#F7FAF9', fontFamily: 'Pretendard, sans-serif' }}
    >
      <style jsx global>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');

        textarea:focus {
          outline: none;
        }
      `}</style>

      <div className="w-full max-w-xl flex flex-col gap-8">

        {/* 뒤로가기 버튼 */}
        <motion.button
          custom={0}
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 w-fit transition-opacity duration-150 hover:opacity-60"
          style={{ color: '#6B7280', fontSize: '14px' }}
        >
          <span>←</span>
          <span>이전으로</span>
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

        {/* 프로그레스 바 */}
        <motion.div
          custom={2}
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          className="flex flex-col gap-1.5"
        >
          <div className="flex justify-between items-center">
            <span style={{ fontSize: '12px', color: '#9CA3AF' }}>진행률</span>
            <span style={{ fontSize: '12px', color: '#00C9A7', fontWeight: 600 }}>50%</span>
          </div>
          <div
            className="w-full rounded-full overflow-hidden"
            style={{ height: '6px', backgroundColor: '#E5EDE9' }}
          >
            <motion.div
              initial={{ width: '50%' }}
              animate={{ width: '60%' }}
              transition={{ duration: 1.2, ease: EASING, delay: 0.5 }}
              style={{ height: '100%', backgroundColor: '#00C9A7', borderRadius: '999px' }}
            />
          </div>
        </motion.div>

        {/* ─── 타이머 카드 ─── */}
        <motion.div
          custom={3}
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          className="rounded-2xl flex flex-col items-center gap-5"
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E5EDE9',
            boxShadow: '0 4px 24px 0 rgba(0,0,0,0.05)',
            padding: '32px 28px',
          }}
        >
          <div className="flex flex-col items-center gap-1">
            <p style={{ fontSize: '13px', color: '#9CA3AF', fontWeight: 500 }}>
              아래 질문에 대해 충분히 생각해보세요
            </p>
            <p style={{ fontSize: '13px', color: '#00A88C', fontWeight: 600 }}>
              15분 타이머가 시작됩니다
            </p>
          </div>

          {/* SVG 원형 타이머 */}
          <div className="relative flex items-center justify-center" style={{ width: 140, height: 140 }}>
            <svg
              width="140"
              height="140"
              viewBox="0 0 140 140"
              style={{ transform: 'rotate(-90deg)', position: 'absolute', top: 0, left: 0 }}
            >
              {/* 배경 링 */}
              <circle
                cx="70"
                cy="70"
                r={RADIUS}
                fill="none"
                stroke="#EFF4F2"
                strokeWidth="8"
              />
              {/* 진행 링 */}
              <motion.circle
                cx="70"
                cy="70"
                r={RADIUS}
                fill="none"
                stroke={timerColor}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                initial={{ strokeDashoffset: 0 }}
                animate={{ strokeDashoffset }}
                transition={{ duration: 1, ease: 'linear' }}
              />
            </svg>

            {/* 시간 텍스트 */}
            <div className="flex flex-col items-center" style={{ position: 'relative', zIndex: 1 }}>
              <motion.span
                key={timeLeft}
                initial={{ opacity: 0.6, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2, ease: EASING }}
                style={{
                  fontSize: '30px',
                  fontWeight: 800,
                  color: timerColor,
                  letterSpacing: '-0.03em',
                  lineHeight: 1,
                  fontFamily: 'Pretendard, monospace',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatTime(timeLeft)}
              </motion.span>
              <span style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '3px' }}>남은 시간</span>
            </div>
          </div>

          <div
            className="rounded-xl px-4 py-3 w-full text-center"
            style={{ backgroundColor: 'rgba(0,201,167,0.06)', border: '1px solid rgba(0,201,167,0.15)' }}
          >
            <p
              style={{
                fontSize: '15px',
                fontWeight: 600,
                color: '#0F172A',
                lineHeight: '1.7',
                letterSpacing: '-0.01em',
                textAlign: 'left',
              }}
            >
              만약 말하기에 대한 두려움이 완벽히 사라진다면,
              <br />
              당신은 가장 먼저 어떤 무대에 서고 싶나요?
              <br />
              <span style={{ fontSize: '13px', fontWeight: 400, color: '#374151' }}>
                아래 항목 중 나의 &apos;1순위&apos;를 정하고, 그곳에서 내가 원하는 바를 속 시원하게 이야기하는 장면을 구체적으로 묘사해 주세요.
              </span>
            </p>
          </div>

          <p style={{ fontSize: '12px', color: '#9CA3AF', textAlign: 'center' }}>
            타이머가 끝나지 않아도 언제든 다음으로 넘어갈 수 있어요
          </p>
        </motion.div>

        {/* ─── 무대 선택 카드 ─── */}
        <motion.div
          custom={4}
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          className="rounded-2xl flex flex-col gap-5"
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E5EDE9',
            boxShadow: '0 4px 24px 0 rgba(0,0,0,0.05)',
            padding: '28px 24px',
          }}
        >
          <div>
            <h2
              className="font-bold"
              style={{ fontSize: '18px', color: '#0F172A', letterSpacing: '-0.02em' }}
            >
              어떤 무대를 생각하고 계신가요?
            </h2>
            <p style={{ fontSize: '13px', color: '#6B7280', marginTop: '4px' }}>
              가장 가까운 상황을 선택해주세요
            </p>
          </div>

          {/* 옵션 그리드 */}
          <div className="grid grid-cols-2 gap-3">
            {STAGE_OPTIONS.map((option) => {
              const isSelected = selectedStage === option.value;
              return (
                <motion.button
                  key={option.value}
                  onClick={() => {
                    setSelectedStage(option.value);
                    if (option.value !== '기타') setCustomStage('');
                  }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: 0.15, ease: EASING }}
                  className="flex flex-col gap-1.5 rounded-xl p-4 text-left transition-all duration-200"
                  style={{
                    backgroundColor: isSelected ? 'rgba(0,201,167,0.08)' : '#F8FAF9',
                    border: isSelected ? '2px solid #00C9A7' : '1.5px solid #E5EDE9',
                    cursor: 'pointer',
                  }}
                >
                  <span
                    style={{
                      fontSize: '15px',
                      fontWeight: 700,
                      color: isSelected ? '#00A88C' : '#0F172A',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {option.label}
                  </span>
                  <span style={{ fontSize: '12px', color: '#9CA3AF', lineHeight: '1.4' }}>
                    {option.sub}
                  </span>
                </motion.button>
              );
            })}
          </div>

          {/* 기타 선택 시 커스텀 입력 */}
          <AnimatePresence>
            {selectedStage === '기타' && (
              <motion.div
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="flex flex-col gap-1.5"
              >
                <label style={{ fontSize: '13px', color: '#6B7280', fontWeight: 500 }}>
                  어떤 무대인지 알려주세요
                </label>
                <input
                  type="text"
                  value={customStage}
                  onChange={(e) => setCustomStage(e.target.value)}
                  placeholder="예: 결혼식 주례사, 학부모 총회 발표..."
                  autoFocus
                  className="w-full rounded-xl px-4 py-3 outline-none transition-all duration-200"
                  style={{
                    backgroundColor: '#F8FAF9',
                    border: '1.5px solid #E0E8E5',
                    color: '#0F172A',
                    fontSize: '15px',
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
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ─── 하고 싶은 말 입력 카드 ─── */}
        <motion.div
          custom={5}
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          className="rounded-2xl flex flex-col gap-5"
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E5EDE9',
            boxShadow: '0 4px 24px 0 rgba(0,0,0,0.05)',
            padding: '28px 24px',
          }}
        >
          <div>
            <h2
              className="font-bold"
              style={{ fontSize: '18px', color: '#0F172A', letterSpacing: '-0.02em' }}
            >
              무대에서 하고 싶은 말
            </h2>
            <p style={{ fontSize: '13px', color: '#6B7280', marginTop: '4px', lineHeight: '1.5' }}>
              그 무대에 섰을 때, 꼭 전달하고 싶은 메시지는 무엇인가요?
            </p>
          </div>

          <div className="relative">
            <textarea
              value={stageDetail}
              onChange={(e) => setStageDetail(e.target.value)}
              placeholder="그 무대에서 전달하고 싶은 메시지, 꼭 하고 싶은 말을 자유롭게 써주세요..."
              rows={6}
              className="w-full rounded-xl px-4 py-3.5 resize-none transition-all duration-200"
              style={{
                backgroundColor: '#F8FAF9',
                border: '1.5px solid #E0E8E5',
                color: '#0F172A',
                fontSize: '15px',
                lineHeight: '1.75',
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
            {stageDetail.trim().length > 0 && (
              <span
                style={{
                  position: 'absolute',
                  bottom: '10px',
                  right: '14px',
                  fontSize: '11px',
                  color: '#B0BAC5',
                }}
              >
                {stageDetail.length}자
              </span>
            )}
          </div>

          <div
            className="rounded-xl px-4 py-3"
            style={{ backgroundColor: '#F8FAF9', border: '1px solid #E5EDE9' }}
          >
            <p style={{ fontSize: '12px', color: '#6B7280', lineHeight: '1.6' }}>
              완벽하게 쓰지 않아도 괜찮아요. 지금 떠오르는 생각, 감정, 바라는 것을 그대로 써주세요.
              이 내용이 스피치 분석에 반영됩니다.
            </p>
          </div>
        </motion.div>

        {/* ─── 다음으로 버튼 ─── */}
        <motion.div
          custom={6}
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          className="flex flex-col items-center gap-2 pb-10"
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
            다음으로 →
          </motion.button>
          {!isValid && (
            <p style={{ fontSize: '12px', color: '#B0BAC5' }}>
              {!selectedStage
                ? '무대 유형을 선택해주세요'
                : selectedStage === '기타' && !customStage.trim()
                ? '무대 이름을 입력해주세요'
                : '하고 싶은 말을 입력하면 활성화됩니다'}
            </p>
          )}
        </motion.div>

      </div>
    </main>
  );
}

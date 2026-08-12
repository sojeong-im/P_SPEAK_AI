'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';

const fadeInUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.14,
      duration: 0.55,
      ease: [0.25, 0.46, 0.45, 0.94] as unknown as import('framer-motion').Easing,
    },
  }),
};

export default function LandingPage() {
  const router = useRouter();

  return (
    <main
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-4"
      style={{ backgroundColor: '#F7FAF9', fontFamily: 'Pretendard, sans-serif' }}
    >
      {/* 배경 — 민트 원형 그라디언트 블롭 */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* 큰 블롭 좌상 */}
        <div
          style={{
            position: 'absolute',
            top: '-10%',
            left: '-15%',
            width: '500px',
            height: '500px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(0,201,167,0.12) 0%, transparent 70%)',
          }}
        />
        {/* 큰 블롭 우하 */}
        <div
          style={{
            position: 'absolute',
            bottom: '-10%',
            right: '-10%',
            width: '600px',
            height: '600px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(0,229,191,0.10) 0%, transparent 70%)',
          }}
        />
        {/* 작은 민트 원들 (떠다니는 느낌) */}
        {[
          { size: 8, top: '15%', left: '8%', delay: '0s', dur: '6s' },
          { size: 5, top: '25%', right: '12%', delay: '1.5s', dur: '8s' },
          { size: 10, top: '70%', left: '5%', delay: '0.8s', dur: '7s' },
          { size: 6, top: '60%', right: '8%', delay: '2s', dur: '5.5s' },
          { size: 4, top: '40%', left: '20%', delay: '3s', dur: '9s' },
          { size: 7, top: '80%', right: '20%', delay: '1s', dur: '6.5s' },
        ].map((dot, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: dot.size,
              height: dot.size,
              borderRadius: '50%',
              backgroundColor: '#00C9A7',
              top: dot.top,
              left: (dot as { left?: string }).left,
              right: (dot as { right?: string }).right,
              opacity: 0.35,
              animation: `float-up ${dot.dur} ease-in-out infinite`,
              animationDelay: dot.delay,
            }}
          />
        ))}
      </div>

      <style jsx global>{`
        @keyframes float-up {
          0%, 100% { transform: translateY(0px); opacity: 0.35; }
          50% { transform: translateY(-18px); opacity: 0.15; }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 4px 20px rgba(0,201,167,0.35); }
          50% { box-shadow: 0 4px 36px rgba(0,201,167,0.65), 0 0 60px rgba(0,201,167,0.15); }
        }
      `}</style>

      <div className="relative z-10 flex flex-col items-center text-center max-w-2xl w-full gap-7">

        {/* 태그 */}
        <motion.div custom={0} variants={fadeInUp} initial="hidden" animate="visible">
          <span
            className="inline-block text-xs font-semibold tracking-widest px-4 py-1.5 rounded-full"
            style={{
              color: '#009E84',
              border: '1px solid rgba(0,201,167,0.5)',
              backgroundColor: 'rgba(0,201,167,0.08)',
              letterSpacing: '0.12em',
            }}
          >
            PULSE × AI
          </span>
        </motion.div>

        {/* 메인 헤드라인 */}
        <motion.h1
          custom={1}
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          className="font-extrabold leading-tight whitespace-pre-line"
          style={{ fontSize: 'clamp(38px, 7vw, 66px)', color: '#111827', letterSpacing: '-0.02em' }}
        >
          {'PULSE가 당신의\n사회성 스피치를 코칭합니다'}
        </motion.h1>

        {/* 서브텍스트 */}
        <motion.p
          custom={2}
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          className="whitespace-pre-line leading-relaxed"
          style={{ fontSize: '17px', color: '#6B7280' }}
        >
          {'AI와 함께하는 실시간 핑퐁 대화로\n어떤 자리에서도 당당하게 말하는 법을 익혀보세요'}
        </motion.p>

        {/* 분석 아이템 3가지 */}
        <motion.div
          custom={3}
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          className="flex items-center gap-3 flex-wrap justify-center"
        >
          {['발음 분석', '말하기 성향', '종합 리포트'].map((label, idx) => (
            <span key={idx} className="flex items-center gap-2 px-4 py-2 rounded-full"
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #E0E8E5',
                fontSize: '14px',
                color: '#374151',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <span className="font-medium">{label}</span>
            </span>
          ))}
        </motion.div>

        {/* CTA 버튼 */}
        <motion.div custom={4} variants={fadeInUp} initial="hidden" animate="visible" className="flex flex-col items-center gap-3 mt-2">
          <button
            onClick={() => router.push('/goal')}
            className="font-bold rounded-2xl cursor-pointer transition-all duration-200 active:scale-95 w-[280px]"
            style={{
              backgroundColor: '#00C9A7',
              color: '#FFFFFF',
              fontSize: '18px',
              padding: '16px 0',
              animation: 'pulse-glow 2.5s ease-in-out infinite',
              boxShadow: '0 4px 20px rgba(0,201,167,0.35)',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#00B396'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#00C9A7'; }}
          >
            분석 시작하기 →
          </button>
          
          <button
            onClick={() => router.push('/social-speech')}
            className="font-bold rounded-2xl cursor-pointer transition-all duration-200 active:scale-95 w-[280px]"
            style={{
              backgroundColor: '#FFFFFF',
              color: '#00C9A7',
              border: '2px solid #00C9A7',
              fontSize: '16px',
              padding: '14px 0',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#F0FAF7'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#FFFFFF'; }}
          >
            AI 펄스 대화 연습하기 🎙️
          </button>
          <p style={{ fontSize: '13px', color: '#9CA3AF' }}>약 10분 소요</p>
        </motion.div>
      </div>
    </main>
  );
}

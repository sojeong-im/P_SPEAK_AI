import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PULSE 사회성 음성 AI',
  description: '발음, 성향, 말하기 습관을 종합 분석해 당신이 말하지 못하는 진짜 이유를 찾아드립니다.',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
  openGraph: {
    title: 'PULSE 사회성 음성 AI',
    description: '발음, 성향, 말하기 습관을 종합 분석해 당신이 말하지 못하는 진짜 이유를 찾아드립니다.',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        />
      </head>
      <body className="min-h-screen antialiased" style={{ background: '#F7FAF9', color: '#111827' }}>
        {children}
      </body>
    </html>
  )
}

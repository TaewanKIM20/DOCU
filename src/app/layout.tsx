import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '.skkf — Universal Document Platform',
  description: 'DOCX, PDF, 이미지 등 모든 문서를 통일된 포맷으로 편집하고 PDF로 내보내기',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  )
}

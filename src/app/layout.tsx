import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'DOCU | Multi-format document editor',
  description: 'Upload Word, PDF, image, text, and HWPX documents, reorder them, edit them in one workspace, and export them as a single PDF.',
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

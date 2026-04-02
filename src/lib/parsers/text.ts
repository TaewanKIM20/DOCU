/**
 * 텍스트/마크다운 파서
 *
 * TXT: 줄바꿈과 빈 줄 기반으로 단락 구분
 * MD: marked 라이브러리로 Markdown → HTML 변환
 */

import { marked } from 'marked'
import { decodeText } from '../skkf/reader'

export interface TextParseResult {
  html: string
  warnings: string[]
}

/**
 * TXT 버퍼 → HTML
 */
export async function parseTxt(buffer: Buffer): Promise<TextParseResult> {
  const text = decodeText(buffer)

  // 빈 줄 기준으로 단락 분리
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)

  const htmlBody = paragraphs
    .map((p) => {
      // 들여쓰기된 줄은 preformatted로
      if (p.startsWith('  ') || p.startsWith('\t')) {
        return `<pre>${escapeHtml(p)}</pre>`
      }
      const lines = p.split('\n').map(escapeHtml).join('<br>')
      return `<p>${lines}</p>`
    })
    .join('\n')

  return {
    html: wrapHtml(htmlBody),
    warnings: [],
  }
}

/**
 * Markdown 버퍼 → HTML
 */
export async function parseMd(buffer: Buffer): Promise<TextParseResult> {
  const text = decodeText(buffer)

  // marked 설정 (보안 주의: 신뢰할 수 있는 파일만 처리)
  marked.setOptions({
    breaks: true,       // 단일 줄바꿈도 <br>로
    gfm: true,         // GitHub Flavored Markdown
  })

  const htmlBody = await marked(text)

  return {
    html: wrapHtml(htmlBody as string),
    warnings: [],
  }
}

function wrapHtml(body: string): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: 'Malgun Gothic', 'Segoe UI', sans-serif; font-size: 11pt; line-height: 1.7; max-width: 800px; margin: 0 auto; padding: 20px; }
  h1 { font-size: 2em; border-bottom: 2px solid #eee; padding-bottom: 0.3em; }
  h2 { font-size: 1.5em; border-bottom: 1px solid #eee; padding-bottom: 0.2em; }
  h3 { font-size: 1.17em; }
  code { background: #f3f3f3; padding: 2px 4px; border-radius: 3px; font-family: 'Consolas', monospace; }
  pre { background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 4px solid #ddd; margin-left: 0; padding-left: 16px; color: #555; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #ddd; padding: 6px 10px; }
  th { background: #f5f5f5; }
  img { max-width: 100%; }
  p { margin: 0.5em 0; }
  ul, ol { padding-left: 24px; }
</style>
</head>
<body>${body}</body>
</html>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

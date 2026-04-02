/**
 * PDF 파서
 *
 * PDF 구조 특성:
 *   - 텍스트가 좌표(x, y) 기반으로 저장됨
 *   - 단락/줄바꿈 논리가 없음 → 휴리스틱으로 추정
 *   - pdf-parse 라이브러리가 좌표 분석 후 텍스트 추출
 *
 * 한계:
 *   - 스캔 PDF (이미지만 있는 경우) → 텍스트 추출 불가, OCR 필요
 *   - 복잡한 다단 레이아웃은 순서가 뒤바뀔 수 있음
 *   - 표 구조는 복원 불가 (텍스트로만 추출)
 */

import pdfParse from 'pdf-parse'

export interface PdfParseResult {
  html: string
  warnings: string[]
  pageCount: number
  isScanned: boolean
}

/**
 * PDF 버퍼 → HTML
 *
 * 핵심 알고리즘:
 * 1. pdf-parse로 텍스트 추출
 * 2. 빈 줄 기반으로 단락 구분
 * 3. 줄 길이와 패턴으로 제목 후보 탐지
 * 4. HTML 단락으로 감싸기
 */
export async function parsePdf(buffer: Buffer): Promise<PdfParseResult> {
  const warnings: string[] = []
  let data: Awaited<ReturnType<typeof pdfParse>>

  try {
    data = await pdfParse(buffer, {
      // 페이지별 텍스트 렌더링 커스터마이즈
      pagerender: renderPage,
    })
  } catch (err) {
    throw new Error(`PDF 파싱 실패: ${(err as Error).message}`)
  }

  const rawText = data.text
  const pageCount = data.numpages

  // 텍스트가 거의 없으면 스캔 PDF로 판단
  const charPerPage = rawText.length / pageCount
  const isScanned = charPerPage < 50

  if (isScanned) {
    warnings.push(
      '이 PDF는 스캔된 이미지로 구성된 것으로 보입니다. 텍스트 추출이 제한적입니다. OCR 처리가 필요합니다.'
    )
  }

  const html = convertTextToHtml(rawText, pageCount)

  return { html, warnings, pageCount, isScanned }
}

/**
 * pdf-parse 페이지 렌더러 — 페이지 구분자 삽입
 */
async function renderPage(pageData: {
  getTextContent: (opts: object) => Promise<{ items: Array<{ str: string; transform: number[] }> }>
  pageNumber: number
}): Promise<string> {
  const textContent = await pageData.getTextContent({
    normalizeWhitespace: false,
    disableCombineTextItems: false,
  })

  let lastY: number | null = null
  let text = ''

  for (const item of textContent.items) {
    const y = item.transform[5] // Y 좌표

    if (lastY !== null && Math.abs(y - lastY) > 5) {
      // Y 좌표가 바뀌면 줄바꿈
      text += '\n'
    }

    text += item.str
    lastY = y
  }

  // 페이지 구분자
  return text + `\n\n--- 페이지 ${pageData.pageNumber} ---\n\n`
}

/**
 * 추출된 텍스트를 시멘틱 HTML로 변환
 *
 * 휴리스틱 규칙:
 * - 짧은 줄(40자 미만) + 대문자 비율 높음 → 제목 후보
 * - 빈 줄 연속 → 단락 구분
 * - "--- 페이지 N ---" → <hr> + 페이지 표시
 */
function convertTextToHtml(text: string, pageCount: number): string {
  const lines = text.split('\n')
  const htmlParts: string[] = [
    `<p style="color:#888;font-size:0.85em">📄 PDF 문서 (총 ${pageCount}페이지) — 서식은 원본과 다를 수 있습니다</p>`,
  ]

  let paragraphBuffer: string[] = []

  const flushParagraph = () => {
    const joined = paragraphBuffer.join(' ').trim()
    if (joined) {
      // 제목 휴리스틱: 짧고 마침표 없음
      if (joined.length < 60 && !joined.endsWith('.') && !joined.endsWith(',')) {
        htmlParts.push(`<h2>${escapeHtml(joined)}</h2>`)
      } else {
        htmlParts.push(`<p>${escapeHtml(joined)}</p>`)
      }
    }
    paragraphBuffer = []
  }

  for (const raw of lines) {
    const line = raw.trim()

    // 페이지 구분자
    if (/^--- 페이지 \d+ ---$/.test(line)) {
      flushParagraph()
      htmlParts.push(`<hr class="page-break" title="${line}" />`)
      continue
    }

    // 빈 줄 → 단락 구분
    if (line === '') {
      flushParagraph()
      continue
    }

    paragraphBuffer.push(line)
  }

  flushParagraph()

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: 'Malgun Gothic', sans-serif; font-size: 11pt; line-height: 1.8; }
  h2 { font-size: 1.3em; font-weight: bold; margin: 1em 0 0.3em; }
  p { margin: 0.4em 0; }
  hr.page-break { border: none; border-top: 2px dashed #ccc; margin: 20px 0; }
</style>
</head>
<body>${htmlParts.join('\n')}</body>
</html>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

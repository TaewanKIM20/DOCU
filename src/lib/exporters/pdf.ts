/**
 * PDF 내보내기 (Exporter)
 *
 * 파이프라인: HTML → Puppeteer (Headless Chrome) → PDF
 *
 * Puppeteer는 실제 브라우저 렌더링 엔진을 사용하므로
 * CSS, 이미지, 폰트가 그대로 반영됨.
 *
 * 한계:
 *   - 서버에 Chromium이 필요 (puppeteer가 자동 설치)
 *   - 메모리 사용량이 높음 → 프로덕션에서는 풀링 필요
 */

import puppeteer from 'puppeteer'

export interface PdfExportOptions {
  /** 용지 형식 */
  format?: 'A4' | 'A3' | 'Letter' | 'Legal'
  /** 여백 (mm) */
  margin?: {
    top?: string
    right?: string
    bottom?: string
    left?: string
  }
  /** 배경색/이미지 포함 여부 */
  printBackground?: boolean
  /** 머리글/바닥글 표시 여부 */
  displayHeaderFooter?: boolean
  /** 머리글 HTML */
  headerTemplate?: string
  /** 바닥글 HTML */
  footerTemplate?: string
}

const DEFAULT_OPTIONS: PdfExportOptions = {
  format: 'A4',
  margin: {
    top: '20mm',
    right: '20mm',
    bottom: '20mm',
    left: '20mm',
  },
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: `<div style="font-size:9px;color:#999;width:100%;text-align:right;padding-right:20mm;">
    <span class="title"></span>
  </div>`,
  footerTemplate: `<div style="font-size:9px;color:#999;width:100%;text-align:center;">
    <span class="pageNumber"></span> / <span class="totalPages"></span>
  </div>`,
}

/**
 * HTML 문자열 → PDF Buffer
 */
export async function exportToPdf(
  html: string,
  options: PdfExportOptions = {}
): Promise<Buffer> {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',  // Docker/서버 환경 대응
      '--disable-gpu',
    ],
  })

  try {
    const page = await browser.newPage()

    // 뷰포트 설정 (A4 기준)
    await page.setViewport({ width: 1240, height: 1754 })

    // HTML 콘텐츠 로드
    // setContent 사용: 외부 URL 요청 없이 직접 HTML 주입
    await page.setContent(html, {
      waitUntil: 'networkidle0',  // 모든 리소스 로드 대기
    })

    // 한국어 폰트 로딩 대기
    await page.evaluateHandle('document.fonts.ready')

    const pdfBuffer = await page.pdf({
      format: opts.format,
      margin: opts.margin,
      printBackground: opts.printBackground,
      displayHeaderFooter: opts.displayHeaderFooter,
      headerTemplate: opts.headerTemplate,
      footerTemplate: opts.footerTemplate,
    })

    return Buffer.from(pdfBuffer)
  } finally {
    await browser.close()
  }
}

/**
 * TipTap HTML (편집기 내용)을 인쇄용 HTML로 변환
 * — 편집기 UI 요소 제거, 인쇄 스타일 추가
 */
export function wrapForPrint(editorHtml: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap');

  * { box-sizing: border-box; }

  body {
    font-family: 'Noto Sans KR', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
    font-size: 11pt;
    line-height: 1.8;
    color: #111;
    margin: 0;
    padding: 0;
  }

  /* 제목 */
  h1 { font-size: 22pt; font-weight: 700; margin: 0 0 16px; }
  h2 { font-size: 16pt; font-weight: 700; margin: 20px 0 10px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  h3 { font-size: 13pt; font-weight: 700; margin: 16px 0 8px; }
  h4 { font-size: 11pt; font-weight: 700; margin: 14px 0 6px; }

  /* 본문 */
  p { margin: 0 0 8px; }

  /* 목록 */
  ul, ol { padding-left: 24pt; margin: 8px 0; }
  li { margin: 4px 0; }

  /* 표 */
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  td, th { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
  th { background: #f0f0f0; font-weight: 700; }

  /* 인용 */
  blockquote {
    border-left: 4px solid #aaa;
    margin: 12px 0;
    padding: 8px 16px;
    color: #555;
    background: #fafafa;
  }

  /* 코드 */
  code { font-family: 'Consolas', 'Monaco', monospace; background: #f3f3f3; padding: 1px 4px; border-radius: 2px; font-size: 9pt; }
  pre { background: #f5f5f5; padding: 10px 14px; border-radius: 4px; font-size: 9pt; overflow-x: auto; }
  pre code { background: none; padding: 0; }

  /* 이미지 */
  img { max-width: 100%; height: auto; display: block; margin: 8px auto; }

  /* 페이지 나누기 */
  hr.page-break { page-break-after: always; border: none; }

  /* 강조 */
  mark { background: #fff3cd; }

  @media print {
    body { font-size: 10pt; }
    h1 { font-size: 20pt; }
    h2 { font-size: 15pt; }
  }
</style>
</head>
<body>
${editorHtml}
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

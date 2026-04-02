import puppeteer from 'puppeteer'

export interface PdfExportOptions {
  format?: 'A4' | 'A3' | 'Letter' | 'Legal'
  margin?: {
    top?: string
    right?: string
    bottom?: string
    left?: string
  }
  printBackground?: boolean
  displayHeaderFooter?: boolean
  headerTemplate?: string
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

export async function exportToPdf(
  html: string,
  options: PdfExportOptions = {}
): Promise<Buffer> {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })

  try {
    const page = await browser.newPage()

    await page.setViewport({ width: 1240, height: 1754 })
    await page.setContent(html, { waitUntil: 'networkidle0' })
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

export function prepareHtmlForPrint(html: string, title: string): string {
  if (/<html[\s>]/i.test(html)) {
    return injectPrintStyles(html, title)
  }

  return wrapForPrint(html, title)
}

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

  h1 { font-size: 22pt; font-weight: 700; margin: 0 0 16px; }
  h2 { font-size: 16pt; font-weight: 700; margin: 20px 0 10px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  h3 { font-size: 13pt; font-weight: 700; margin: 16px 0 8px; }
  h4 { font-size: 11pt; font-weight: 700; margin: 14px 0 6px; }

  p { margin: 0 0 8px; }

  ul, ol { padding-left: 24pt; margin: 8px 0; }
  li { margin: 4px 0; }

  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  td, th { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
  th { background: #f0f0f0; font-weight: 700; }

  blockquote {
    border-left: 4px solid #aaa;
    margin: 12px 0;
    padding: 8px 16px;
    color: #555;
    background: #fafafa;
  }

  code {
    font-family: 'Consolas', 'Monaco', monospace;
    background: #f3f3f3;
    padding: 1px 4px;
    border-radius: 2px;
    font-size: 9pt;
  }

  pre {
    background: #f5f5f5;
    padding: 10px 14px;
    border-radius: 4px;
    font-size: 9pt;
    overflow-x: auto;
  }

  pre code { background: none; padding: 0; }

  img { max-width: 100%; height: auto; display: block; margin: 8px auto; }

  hr.page-break { page-break-after: always; border: none; }

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

function injectPrintStyles(html: string, title: string): string {
  const safeTitle = escapeHtml(title)
  const printPatch = `
<style data-skkf-print-patch>
  * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  html,
  body {
    background: #fff !important;
  }

  body {
    margin: 0 !important;
  }

  [contenteditable="true"]:hover,
  [contenteditable="true"]:focus {
    background: transparent !important;
    box-shadow: none !important;
    outline: none !important;
  }

  .editor-container,
  .pdf-page {
    box-shadow: none !important;
  }
</style>`

  let nextHtml = html

  if (/<title>[\s\S]*?<\/title>/i.test(nextHtml)) {
    nextHtml = nextHtml.replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`)
  }

  if (/<head[\s>][\s\S]*<\/head>/i.test(nextHtml)) {
    if (!/<title>[\s\S]*?<\/title>/i.test(nextHtml)) {
      nextHtml = nextHtml.replace(/<head([^>]*)>/i, `<head$1><title>${safeTitle}</title>`)
    }

    return nextHtml.replace(/<\/head>/i, `${printPatch}</head>`)
  }

  if (/<html[\s>]/i.test(nextHtml)) {
    return nextHtml.replace(
      /<html([^>]*)>/i,
      `<html$1><head><meta charset="UTF-8" /><title>${safeTitle}</title>${printPatch}</head>`
    )
  }

  return wrapForPrint(nextHtml, title)
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

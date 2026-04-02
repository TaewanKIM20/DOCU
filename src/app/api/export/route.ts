/**
 * POST /api/export
 *
 * .skkf 파일의 HTML 내용을 PDF로 변환
 *
 * Request: { skkfBase64: string, title?: string, options?: PdfExportOptions }
 * Response: { success, pdfBase64 } | { success: false, error }
 */

import { NextRequest, NextResponse } from 'next/server'
import { readSKKFBuffer } from '@/lib/skkf/reader'
import { exportToPdf, prepareHtmlForPrint } from '@/lib/exporters/pdf'
import { ExportApiResponse } from '@/lib/skkf/schema'

export async function POST(request: NextRequest): Promise<NextResponse<ExportApiResponse>> {
  try {
    const body = await request.json()
    const { skkfBase64, title, options } = body

    if (!skkfBase64) {
      return NextResponse.json(
        { success: false, error: '.skkf 데이터가 없습니다. 먼저 문서를 저장한 뒤 다시 시도해 주세요.' },
        { status: 400 }
      )
    }

    // 1. .skkf 파일 읽기
    const skkfBuffer = Buffer.from(skkfBase64, 'base64')
    const { manifest, html } = await readSKKFBuffer(skkfBuffer)

    const docTitle = title || manifest.title || '문서'

    // 2. 편집기 HTML을 인쇄용 HTML로 변환
    const printHtml = prepareHtmlForPrint(html, docTitle)

    // 3. Puppeteer로 PDF 변환
    const pdfBuffer = await exportToPdf(printHtml, {
      format: options?.format || 'A4',
      margin: options?.margin || {
        top: '20mm',
        right: '20mm',
        bottom: '25mm',
        left: '20mm',
      },
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:9px;color:#aaa;width:100%;text-align:right;padding:0 20mm;">${docTitle}</div>`,
      footerTemplate: `<div style="font-size:9px;color:#aaa;width:100%;text-align:center;padding-bottom:10px;">
        <span class="pageNumber"></span> / <span class="totalPages"></span>
      </div>`,
    })

    const pdfBase64 = pdfBuffer.toString('base64')

    return NextResponse.json({ success: true, pdfBase64 })
  } catch (error) {
    console.error('[/api/export] 에러:', error)
    return NextResponse.json(
      { success: false, error: `PDF 내보내기에 실패했습니다: ${(error as Error).message}` },
      { status: 500 }
    )
  }
}

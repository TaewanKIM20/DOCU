/**
 * POST /api/export
 *
 * Convert one or more SKKF/HTML documents into a merged downloadable PDF.
 */

import { NextRequest, NextResponse } from 'next/server'
import { readSKKFBuffer } from '@/lib/skkf/reader'
import { exportToPdf, mergePdfBuffers, PdfExportOptions, prepareHtmlForPrint } from '@/lib/exporters/pdf'
import { ExportApiResponse } from '@/lib/skkf/schema'

interface ExportDocumentInput {
  skkfBase64?: string
  html?: string
  title?: string
}

function buildPdfOptions(html: string, title: string, options?: any): PdfExportOptions {
  const isLayoutDocument = /data-layout-document/i.test(html) || /class="pdf-page/i.test(html)

  return isLayoutDocument
    ? {
        format: options?.format || 'A4',
        preferCSSPageSize: true,
        margin: options?.margin || {
          top: '0',
          right: '0',
          bottom: '0',
          left: '0',
        },
        printBackground: options?.printBackground ?? true,
        displayHeaderFooter: options?.displayHeaderFooter ?? false,
        headerTemplate: options?.headerTemplate,
        footerTemplate: options?.footerTemplate,
      }
    : {
        format: options?.format || 'A4',
        margin: options?.margin || {
          top: '20mm',
          right: '20mm',
          bottom: '25mm',
          left: '20mm',
        },
        printBackground: options?.printBackground ?? true,
        displayHeaderFooter: options?.displayHeaderFooter ?? true,
        headerTemplate:
          options?.headerTemplate ||
          `<div style="font-size:9px;color:#aaa;width:100%;text-align:right;padding:0 20mm;">${title}</div>`,
        footerTemplate:
          options?.footerTemplate ||
          `<div style="font-size:9px;color:#aaa;width:100%;text-align:center;padding-bottom:10px;">
            <span class="pageNumber"></span> / <span class="totalPages"></span>
          </div>`,
      }
}

async function resolveDocumentPayload(document: ExportDocumentInput) {
  if (document.html) {
    return {
      title: document.title || '문서',
      html: document.html,
    }
  }

  if (!document.skkfBase64) {
    throw new Error('PDF 내보내기용 문서 데이터가 없습니다.')
  }

  const skkfBuffer = Buffer.from(document.skkfBase64, 'base64')
  const { manifest, html } = await readSKKFBuffer(skkfBuffer)
  return {
    title: document.title || manifest.title || '문서',
    html,
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<ExportApiResponse>> {
  try {
    const body = await request.json()
    const { skkfBase64, html, title, options } = body

    const requestedDocuments: ExportDocumentInput[] = Array.isArray(body.documents)
      ? body.documents
      : [{ skkfBase64, html, title }]

    const validDocuments = requestedDocuments.filter(
      (document) => Boolean(document?.html) || Boolean(document?.skkfBase64)
    )

    if (validDocuments.length === 0) {
      return NextResponse.json(
        { success: false, error: '내보낼 문서가 없습니다. 다시 시도해주세요.' },
        { status: 400 }
      )
    }

    const pdfBuffers: Buffer[] = []

    for (const document of validDocuments) {
      const resolved = await resolveDocumentPayload(document)
      const printHtml = prepareHtmlForPrint(resolved.html, resolved.title)
      const pdfOptions = buildPdfOptions(resolved.html, resolved.title, options)
      pdfBuffers.push(await exportToPdf(printHtml, pdfOptions))
    }

    const mergedPdfBuffer = await mergePdfBuffers(pdfBuffers)
    const pdfBase64 = mergedPdfBuffer.toString('base64')

    return NextResponse.json({ success: true, pdfBase64 })
  } catch (error) {
    console.error('[/api/export] error:', error)
    return NextResponse.json(
      { success: false, error: `PDF 내보내기에 실패했습니다: ${(error as Error).message}` },
      { status: 500 }
    )
  }
}

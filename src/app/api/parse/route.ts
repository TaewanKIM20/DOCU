/**
 * POST /api/parse
 *
 * 업로드된 파일을 파싱하여 .skkf 파일로 변환
 *
 * Request: multipart/form-data { file: File }
 * Response: { success, skkfBase64, manifest, warnings } | { success: false, error }
 */

import { NextRequest, NextResponse } from 'next/server'
import { detectFormat } from '@/lib/skkf/reader'
import { createSKKFBuffer } from '@/lib/skkf/writer'
import { SKKFManifest, ParseApiResponse } from '@/lib/skkf/schema'

export const runtime = 'nodejs'
export const maxDuration = 60

const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

export async function POST(request: NextRequest): Promise<NextResponse<ParseApiResponse>> {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ success: false, error: '업로드된 파일이 없습니다.' }, { status: 400 })
    }

    const fileName = file.name
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // 1. 포맷 감지 (Magic Bytes 기반)
    const format = await detectFormat(buffer, fileName)
    const warnings: string[] = []
    let html = ''

    // 2. 포맷별 파서 실행
    switch (format) {
      case 'docx': {
        const { parseDocx } = await import('@/lib/parsers/docx')
        const result = await parseDocx(buffer)
        html = result.html
        warnings.push(...result.warnings)
        break
      }

      case 'doc': {
        // 구형 DOC (OLE2) — mammoth로 시도, 실패하면 안내
        try {
          const { parseDocx } = await import('@/lib/parsers/docx')
          const result = await parseDocx(buffer)
          html = result.html
          warnings.push('구형 DOC 포맷입니다. 일부 서식이 손실될 수 있습니다.')
          warnings.push(...result.warnings)
        } catch {
          return NextResponse.json(
            {
              success: false,
              error:
                '구형 DOC 파일은 직접 변환이 어렵습니다. Microsoft Word에서 DOCX로 다시 저장한 뒤 다시 업로드해 주세요.',
            },
            { status: 422 }
          )
        }
        break
      }

      case 'pdf': {
        const { parsePdf } = await import('@/lib/parsers/pdf')
        const result = await parsePdf(buffer)
        html = result.html
        warnings.push(...result.warnings)
        if (result.isScanned) {
          warnings.push(`총 ${result.pageCount}페이지의 스캔 PDF입니다. OCR 결과라 글자 위치가 일부 달라질 수 있습니다.`)
        }
        break
      }

      case 'png':
      case 'jpg':
      case 'webp': {
        const { parseImage } = await import('@/lib/parsers/image')
        const ext = fileName.split('.').pop()?.toLowerCase() ?? 'png'
        const mimeType = MIME_MAP[ext] ?? 'image/png'
        console.log(`[parse] 이미지 OCR 시작: ${fileName} (${mimeType})`)
        const result = await parseImage(buffer, fileName, mimeType)
        console.log(`[parse] OCR 완료. 경고: ${result.warnings.join(' | ')}`)
        html = result.html
        warnings.push(...result.warnings)
        break
      }

      case 'txt': {
        const { parseTxt } = await import('@/lib/parsers/text')
        const result = await parseTxt(buffer)
        html = result.html
        warnings.push(...result.warnings)
        break
      }

      case 'md': {
        const { parseMd } = await import('@/lib/parsers/text')
        const result = await parseMd(buffer)
        html = result.html
        warnings.push(...result.warnings)
        break
      }

      case 'hwpx': {
        // HWPX는 XML 기반 ZIP — 기본 텍스트 추출
        warnings.push('HWPX 파일은 현재 기본 텍스트만 추출됩니다. 표, 이미지, 고급 서식은 일부 누락될 수 있습니다.')
        html = await parseHwpx(buffer)
        break
      }

      case 'skkf': {
        // 기존 .skkf 파일을 다시 열기
        const { readSKKFBuffer } = await import('@/lib/skkf/reader')
        const existing = await readSKKFBuffer(buffer)
        return NextResponse.json({
          success: true,
          skkfBase64: buffer.toString('base64'),
          manifest: existing.manifest,
          html: existing.html,
          warnings: ['기존 .skkf 파일을 불러왔습니다.'],
        })
      }

      default: {
        return NextResponse.json(
          { success: false, error: `지원하지 않는 파일 형식입니다: ${format}` },
          { status: 415 }
        )
      }
    }

    // 3. manifest 구성
    const manifest: SKKFManifest = {
      version: '1.0',
      title: fileName.replace(/\.[^.]+$/, ''), // 확장자 제거
      originalFileName: fileName,
      originalFormat: format,
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      charCount: html.replace(/<[^>]+>/g, '').length,
    }

    // 4. .skkf 파일 생성
    const skkfBuffer = await createSKKFBuffer({ html, manifest, warnings })
    const skkfBase64 = skkfBuffer.toString('base64')

    return NextResponse.json({ success: true, skkfBase64, manifest, html, warnings })
  } catch (error) {
    console.error('[/api/parse] 에러:', error)
    return NextResponse.json(
      { success: false, error: `파일 파싱 중 오류가 발생했습니다: ${(error as Error).message}` },
      { status: 500 }
    )
  }
}

/**
 * HWPX 기본 텍스트 추출 (XML 파싱)
 * HWPX = ZIP { Contents/content.hpf, Contents/section0.xml, ... }
 */
async function parseHwpx(buffer: Buffer): Promise<string> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(buffer)

  const textParts: string[] = []

  // 섹션 파일 찾기 (section0.xml, section1.xml, ...)
  const sectionFiles = Object.keys(zip.files).filter((f) =>
    f.match(/Contents\/section\d+\.xml/i)
  )

  for (const sectionPath of sectionFiles.sort()) {
    const content = await zip.file(sectionPath)?.async('string')
    if (!content) continue

    // XML에서 텍스트 추출 (태그 제거)
    const text = content
      .replace(/<hp:t[^>]*>/g, '') // 텍스트 태그 시작
      .replace(/<\/hp:t>/g, '\n')   // 텍스트 태그 끝 → 줄바꿈
      .replace(/<[^>]+>/g, '')      // 나머지 태그 제거
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')

    textParts.push(text)
  }

  const rawText = textParts.join('\n')
  const paragraphs = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((p) => `<p>${p}</p>`)
    .join('\n')

  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8">
<style>body{font-family:'Malgun Gothic',sans-serif;font-size:11pt;line-height:1.7}p{margin:0.4em 0}</style>
</head>
<body>
<p style="color:#f59e0b;font-size:0.85em">HWPX 기본 텍스트 추출 결과입니다. 원본 서식은 완전히 복원되지 않을 수 있습니다.</p>
${paragraphs}
</body>
</html>`
}

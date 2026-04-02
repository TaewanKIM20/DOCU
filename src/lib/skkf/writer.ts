/**
 * .skkf 파일 생성기 (Writer)
 * ParseResult → ZIP Buffer (.skkf)
 */

import JSZip from 'jszip'
import { ParseResult, SKKF_VERSION, SKKF_PATHS } from './schema'

/**
 * ParseResult를 .skkf ZIP 바이너리로 직렬화
 */
export async function createSKKFBuffer(result: ParseResult): Promise<Buffer> {
  const zip = new JSZip()

  // manifest.json 저장
  zip.file(
    SKKF_PATHS.MANIFEST,
    JSON.stringify({ ...result.manifest, version: SKKF_VERSION }, null, 2)
  )

  // content.html 저장
  zip.file(SKKF_PATHS.CONTENT, result.html)

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  return buffer
}

/**
 * 수정된 HTML과 기존 manifest로 .skkf 파일 업데이트
 */
export async function updateSKKFBuffer(
  originalBuffer: Buffer,
  newHtml: string,
  title?: string
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(originalBuffer)

  // 기존 manifest 읽기
  const manifestFile = zip.file(SKKF_PATHS.MANIFEST)
  if (!manifestFile) throw new Error('manifest.json not found in .skkf file')

  const manifestStr = await manifestFile.async('string')
  const manifest = JSON.parse(manifestStr)

  // 수정 일시 + 제목 갱신
  manifest.modified = new Date().toISOString()
  manifest.charCount = newHtml.replace(/<[^>]+>/g, '').length
  if (title) manifest.title = title

  zip.file(SKKF_PATHS.MANIFEST, JSON.stringify(manifest, null, 2))
  zip.file(SKKF_PATHS.CONTENT, newHtml)

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  return buffer
}

/**
 * .skkf 파일 판독기 (Reader)
 * ZIP Buffer → manifest + HTML content
 */

import JSZip from 'jszip'
import {
  SKKFManifest,
  SKKF_PATHS,
  MAGIC_BYTES,
  ZIP_CONTENT_TYPE_MAP,
  SupportedInputFormat,
} from './schema'

export interface SKKFReadResult {
  manifest: SKKFManifest
  html: string
}

/**
 * .skkf ZIP 버퍼를 읽어 manifest + HTML 반환
 */
export async function readSKKFBuffer(buffer: Buffer): Promise<SKKFReadResult> {
  const zip = await JSZip.loadAsync(buffer)

  const manifestFile = zip.file(SKKF_PATHS.MANIFEST)
  if (!manifestFile) throw new Error('유효하지 않은 .skkf 파일: manifest.json 없음')

  const contentFile = zip.file(SKKF_PATHS.CONTENT)
  if (!contentFile) throw new Error('유효하지 않은 .skkf 파일: content.html 없음')

  const manifest: SKKFManifest = JSON.parse(await manifestFile.async('string'))
  const html = await contentFile.async('string')

  return { manifest, html }
}

/**
 * Magic Bytes를 이용한 파일 포맷 감지
 * 확장자보다 실제 바이너리 시그니처를 우선 사용
 */
export async function detectFormat(
  buffer: Buffer,
  fileName: string
): Promise<SupportedInputFormat> {
  // 앞 4바이트 hex 추출
  const hex = buffer.slice(0, 4).toString('hex').toLowerCase()

  // 직접 매핑된 포맷 확인
  if (MAGIC_BYTES[hex]) {
    const detected = MAGIC_BYTES[hex]

    // ZIP 기반 포맷은 내부 구조로 세분화
    if (detected === 'zip') {
      return await classifyZip(buffer)
    }

    return detected as SupportedInputFormat
  }

  // Magic Bytes 매핑 실패 시 확장자 fallback
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  const extMap: Record<string, SupportedInputFormat> = {
    docx: 'docx',
    doc: 'doc',
    pdf: 'pdf',
    png: 'png',
    jpg: 'jpg',
    jpeg: 'jpg',
    webp: 'webp',
    txt: 'txt',
    md: 'md',
    hwpx: 'hwpx',
    skkf: 'skkf',
  }

  if (extMap[ext]) return extMap[ext]

  throw new Error(`지원하지 않는 파일 형식: ${fileName}`)
}

/**
 * ZIP 내부 파일 목록으로 DOCX / HWPX / SKKF 구분
 */
async function classifyZip(buffer: Buffer): Promise<SupportedInputFormat> {
  const zip = await JSZip.loadAsync(buffer)
  const files = Object.keys(zip.files)

  for (const [signature, format] of Object.entries(ZIP_CONTENT_TYPE_MAP)) {
    if (files.some((f) => f === signature || f.startsWith(signature))) {
      return format
    }
  }

  // 알 수 없는 ZIP
  throw new Error('알 수 없는 ZIP 기반 포맷입니다.')
}

/**
 * 텍스트 인코딩 추정 (UTF-8 / EUC-KR 대응)
 * Node.js TextDecoder 활용
 */
export function decodeText(buffer: Buffer): string {
  // BOM 감지
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.slice(3).toString('utf-8')
  }

  // UTF-16 LE BOM
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer.slice(2))
  }

  // UTF-16 BE BOM
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buffer.slice(2))
  }

  // 기본 UTF-8 시도
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    return text
  } catch {
    // EUC-KR fallback (한글 레거시 파일)
    try {
      return new TextDecoder('euc-kr').decode(buffer)
    } catch {
      return buffer.toString('utf-8')
    }
  }
}

/**
 * .skkf (SKKU File Format) — 커스텀 문서 포맷 스펙
 *
 * 내부 구조: ZIP 압축 파일
 * ├── manifest.json   → 메타데이터
 * ├── content.html    → HTML 기반 문서 본문 (이미지는 base64 인라인)
 * └── (향후 확장: assets/, comments.json, revision-history.json ...)
 *
 * 버전 히스토리:
 *   1.0 — 초기 릴리즈 (HTML + 메타데이터)
 */

export const SKKF_VERSION = '1.0'
export const SKKF_MIME_TYPE = 'application/x-skkf'
export const SKKF_EXTENSION = '.skkf'

/** ZIP 내부 파일 경로 상수 */
export const SKKF_PATHS = {
  MANIFEST: 'manifest.json',
  CONTENT: 'content.html',
  ASSETS_DIR: 'assets/',
} as const

/** 지원 입력 포맷 */
export type SupportedInputFormat =
  | 'docx'
  | 'doc'
  | 'pdf'
  | 'png'
  | 'jpg'
  | 'jpeg'
  | 'webp'
  | 'txt'
  | 'md'
  | 'hwpx'
  | 'skkf' // 기존 .skkf 파일 열기

/** Magic Bytes 기반 포맷 감지 맵 */
export const MAGIC_BYTES: Record<string, SupportedInputFormat | 'zip'> = {
  '504b0304': 'zip',    // ZIP (docx, hwpx, skkf 등)
  '25504446': 'pdf',    // %PDF
  'ffd8ffe0': 'jpg',    // JPEG
  'ffd8ffe1': 'jpg',    // JPEG EXIF
  'ffd8ffe2': 'jpg',    // JPEG
  'ffd8ffdb': 'jpg',    // JPEG
  '89504e47': 'png',    // PNG
  '52494646': 'webp',   // RIFF (WebP)
  'd0cf11e0': 'doc',    // 구형 Office (DOC, XLS)
}

/** ZIP 내부 Content-Type으로 최종 포맷 판별 */
export const ZIP_CONTENT_TYPE_MAP: Record<string, SupportedInputFormat> = {
  // DOCX 시그니처
  'word/document.xml': 'docx',
  // HWPX 시그니처
  'Contents/content.hpf': 'hwpx',
  // .skkf 시그니처
  'manifest.json': 'skkf',
}

/** .skkf manifest.json 스키마 */
export interface SKKFManifest {
  /** 포맷 버전 */
  version: string
  /** 문서 제목 */
  title: string
  /** 원본 파일명 */
  originalFileName: string
  /** 원본 포맷 */
  originalFormat: SupportedInputFormat
  /** 생성 일시 (ISO 8601) */
  created: string
  /** 마지막 수정 일시 (ISO 8601) */
  modified: string
  /** 문자 수 (approximate) */
  charCount?: number
  /** 작성자 (선택) */
  author?: string
}

/** 파싱 결과 */
export interface ParseResult {
  /** HTML 형식의 문서 내용 */
  html: string
  /** 메타데이터 */
  manifest: SKKFManifest
  /** 경고 메시지 (서식 손실 등) */
  warnings: string[]
}

/** API 응답: parse 엔드포인트 */
export interface ParseApiResponse {
  success: boolean
  /** base64 인코딩된 .skkf ZIP 바이너리 */
  skkfBase64?: string
  manifest?: SKKFManifest
  html?: string
  error?: string
  warnings?: string[]
}

/** API 응답: export 엔드포인트 */
export interface ExportApiResponse {
  success: boolean
  /** base64 인코딩된 PDF 바이너리 */
  pdfBase64?: string
  error?: string
}

/** API 응답: save 엔드포인트 */
export interface SaveApiResponse {
  success: boolean
  /** base64 인코딩된 .skkf ZIP 바이너리 */
  skkfBase64?: string
  error?: string
}

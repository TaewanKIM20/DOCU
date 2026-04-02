/**
 * 이미지 파서 (PNG, JPG, WEBP)
 *
 * 이미지 파일은 "편집 가능한 텍스트"가 없으므로
 * 이미지를 그대로 HTML <img> 태그로 임베딩.
 *
 * sharp를 이용해 이미지 메타데이터(width, height) 추출.
 * 필요시 리사이징도 지원.
 */

import sharp from 'sharp'

export interface ImageParseResult {
  html: string
  warnings: string[]
  width: number
  height: number
  format: string
}

/**
 * 이미지 버퍼 → HTML (base64 임베딩)
 */
export async function parseImage(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<ImageParseResult> {
  const warnings: string[] = []

  // sharp로 메타데이터 추출
  const metadata = await sharp(buffer).metadata()
  const { width = 0, height = 0, format = 'unknown' } = metadata

  // 너무 큰 이미지면 리사이즈 (4096px 이상)
  let finalBuffer = buffer
  if (width > 4096 || height > 4096) {
    warnings.push(`이미지가 매우 큽니다 (${width}×${height}). 품질 유지를 위해 4096px로 리사이즈했습니다.`)
    finalBuffer = await sharp(buffer)
      .resize(4096, 4096, { fit: 'inside', withoutEnlargement: true })
      .toBuffer()
  }

  const base64 = finalBuffer.toString('base64')
  const dataUrl = `data:${mimeType};base64,${base64}`

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<style>
  body {
    font-family: 'Malgun Gothic', sans-serif;
    background: #f8f8f8;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px;
  }
  .image-container {
    background: white;
    padding: 16px;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    max-width: 100%;
  }
  img {
    max-width: 100%;
    height: auto;
    display: block;
  }
  .image-meta {
    margin-top: 8px;
    font-size: 0.8em;
    color: #888;
    text-align: center;
  }
  .caption-input {
    margin-top: 12px;
    width: 100%;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 0.9em;
    text-align: center;
    font-style: italic;
    color: #555;
  }
</style>
</head>
<body>
  <div class="image-container">
    <img src="${dataUrl}" alt="${escapeHtml(fileName)}" />
    <div class="image-meta">${escapeHtml(fileName)} — ${width}×${height}px (${format.toUpperCase()})</div>
    <p class="caption-input" contenteditable="true" data-placeholder="이미지 캡션을 입력하세요...">이미지 캡션</p>
  </div>
</body>
</html>`

  return { html, warnings, width, height, format }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

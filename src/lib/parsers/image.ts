/**
 * [최종 통합본] 고화질 문서 OCR 및 편집 레이어 생성
 * 특징: 원본 화질 보존형 전처리 + 실시간 로그 출력 + 글자 영역 인페인팅
 */

import sharp from 'sharp'
import path from 'path'
import os from 'os'

export interface ImageParseResult {
  html: string
  warnings: string[]
}

const TESSDATA_CACHE = path.join(os.homedir(), '.skkf-tessdata')

// ─── 진입점 ──────────────────────────────────────────────────────────────────

export async function parseImage(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<ImageParseResult> {
  const warnings: string[] = []

  try {
    // 1. 이미지 메타데이터 확인 (리사이징 없이 원본 유지 시도)
    const meta = await sharp(buffer).metadata()
    const imgW = meta.width ?? 1000
    const imgH = meta.height ?? 1000

    // 화질이 좋은 경우 전처리가 오히려 독이 될 수 있으므로, 
    // 최소한의 그레이스케일 작업만 진행하여 가독성을 높입니다.
    const imgBuffer = await sharp(buffer)
      .grayscale()
      .toBuffer()

    const base64Image = buffer.toString('base64') // 배경은 원본 그대로 사용
    const imageSrc = `data:${mimeType};base64,${base64Image}`

    // 2. OCR 실행 (로그 출력 포함)
    console.log(`[OCR 시작] 파일명: ${fileName}, 해상도: ${imgW}x${imgH}`)
    const ocrData = await runDocumentOCR(imgBuffer)

    if (!ocrData.tsv || ocrData.text.trim().length < 2) {
      console.warn('[OCR 실패] 텍스트를 찾지 못했습니다.')
      warnings.push('텍스트 인식에 실패했습니다. 이미지 내 글자가 너무 작거나 흐리거나 폰트가 특수할 수 있습니다.')
      return fallbackImageHtml(base64Image, fileName, mimeType, warnings)
    }

    console.log(`[OCR 성공] 신뢰도: ${ocrData.confidence}%, 텍스트 길이: ${ocrData.text.length}`)

    // 3. TSV 데이터 파싱
    const rows = parseTsv(ocrData.tsv)
    const lines = rows.filter(r => r.level === 4 && r.text?.trim())

    // 4. 글자 영역 지우기 (인페인팅 배경 생성)
    const cleanedImageBuffer = await createCleanedBackground(buffer, lines, imgW, imgH)
    const cleanedImageSrc = `data:${mimeType};base64,${cleanedImageBuffer.toString('base64')}`

    // 5. 색상 샘플링용 원본 데이터
    const { data: pixelData, info: pixelInfo } = await sharp(buffer)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    // 6. 최종 HTML 생성
    const html = buildLayeredHtml(lines, imgW, imgH, cleanedImageSrc, pixelData, pixelInfo)
    
    return { html, warnings }

  } catch (err) {
    console.error('[OCR 치명적 에러]:', err)
    return fallbackImageHtml(
      buffer.toString('base64'),
      fileName,
      mimeType,
      [`이미지 OCR 처리 중 서버 오류가 발생했습니다: ${(err as Error).message}`]
    )
  }
}

// ─── OCR 로직 (로그 및 상세 설정 강화) ──────────────────────────────────────────

async function runDocumentOCR(imgBuffer: Buffer) {
  const { createWorker } = await import('tesseract.js')
  
  // 터미널에 진행률 표시
  const worker = await createWorker('kor+eng', 1, {
    cachePath: TESSDATA_CACHE,
    logger: m => {
      if (m.status === 'recognizing text') {
        process.stdout.write(`\r[OCR 진행] ${Math.round(m.progress * 100)}% `)
      }
    }
  })

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: '3' as any, // 자동 레이아웃 분석
      tessedit_char_whitelist: '',       // 모든 문자 허용
      preserve_interword_spaces: '1',
    })

    const { data } = await worker.recognize(imgBuffer)
    console.log('\n[OCR 완료]')
    
    return {
      text: data.text || '',
      tsv: data.tsv || '',
      confidence: data.confidence || 0,
    }
  } finally {
    await worker.terminate()
  }
}

// ─── 이미지 글자 영역 지우기 ──────────────────────────────────────────────────

async function createCleanedBackground(
  origBuffer: Buffer,
  lines: any[],
  width: number,
  height: number
): Promise<Buffer> {
  // 글자 영역을 배경색(흰색)으로 덮는 마스크
  const svgShapes = lines.map(line => `
    <rect x="${line.left - 1}" y="${line.top - 1}" 
          width="${line.width + 2}" height="${line.height + 2}" 
          fill="white" />
  `).join('')

  const mask = Buffer.from(`<svg width="${width}" height="${height}">${svgShapes}</svg>`)

  return sharp(origBuffer)
    .composite([{ input: mask, blend: 'over' }])
    .toBuffer()
}

// ─── HTML 에디터 빌더 ────────────────────────────────────────────────────────

function buildLayeredHtml(
  lines: any[],
  imgW: number,
  imgH: number,
  imageSrc: string,
  pixelData: Buffer,
  pixelInfo: any
): string {
  const lineElements = lines.map((line, idx) => {
    const top = (line.top / imgH) * 100
    const left = (line.left / imgW) * 100
    const width = (line.width / imgW) * 100
    const height = (line.height / imgH) * 100
    const fontSize = line.height * 0.85 

    const color = sampleTextColor(pixelData, pixelInfo, line)

    return `
      <div contenteditable="true" 
           data-layout-editable="true"
           spellcheck="false"
           style="position: absolute; 
                  top: ${top}%; left: ${left}%; width: ${width}%; 
                  min-height: ${height}%;
                  font-size: ${fontSize}px; color: ${color};
                  line-height: 1.1; white-space: pre-wrap; outline: none;
                  overflow-wrap: anywhere;
                  display: flex; align-items: center;
                  z-index: 10;">${escapeHtml(line.text.trim())}</div>`
  }).join('')

  return `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <style>
    body { margin: 0; padding: 20px; background: #f0f2f5; display: flex; justify-content: center; font-family: sans-serif; }
    .editor-container { position: relative; display: inline-block; background: white; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
    .base-layer { display: block; max-width: 100%; height: auto; pointer-events: none; }
    [contenteditable="true"]:hover { background: rgba(0, 100, 255, 0.08); border-radius: 2px; }
    [contenteditable="true"]:focus { background: white !important; color: black !important; box-shadow: 0 0 0 3px #4a90e2; z-index: 100; }
  </style>
</head>
<body data-layout-document="true">
  <div class="editor-container">
    <img src="${imageSrc}" class="base-layer" />
    ${lineElements}
  </div>
</body>
</html>`
}

// ─── 유틸리티 ────────────────────────────────────────────────────────────────

function parseTsv(tsv: string) {
  if (!tsv) return []
  return tsv.trim().split('\n').slice(1).map(l => {
    const c = l.split('\t')
    return {
      level: parseInt(c[0]) || 0,
      left: parseInt(c[6]) || 0,
      top: parseInt(c[7]) || 0,
      width: parseInt(c[8]) || 0,
      height: parseInt(c[9]) || 0,
      text: c[11] || ''
    }
  })
}

function sampleTextColor(pixels: Buffer, info: any, bbox: any): string {
  try {
    const { width, channels } = info
    const x = Math.min(Math.max(Math.floor(bbox.left + bbox.width / 2), 0), info.width - 1)
    const y = Math.min(Math.max(Math.floor(bbox.top + bbox.height / 2), 0), info.height - 1)
    const i = (y * width + x) * channels
    const r = pixels[i], g = pixels[i+1], b = pixels[i+2]
    if (r > 200 && g > 200 && b > 200) return '#222'
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  } catch { return '#333' }
}

function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function fallbackImageHtml(base64: string, fileName: string, mimeType: string, warnings: string[]) {
  return {
    html: `<!DOCTYPE html><html><body><img src="data:${mimeType};base64,${base64}" style="max-width:100%"/></body></html>`,
    warnings
  }
}

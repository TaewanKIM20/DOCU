/**
 * DOCX 파서
 * mammoth 라이브러리를 사용해 DOCX → HTML 변환
 *
 * 구조: DOCX = ZIP { word/document.xml (본문), word/styles.xml (스타일), ... }
 * mammoth이 XML을 파싱하고 시멘틱 HTML로 변환
 */

import mammoth from 'mammoth'

export interface DocxParseResult {
  html: string
  warnings: string[]
}

/**
 * DOCX 버퍼 → 시멘틱 HTML
 *
 * mammoth 스타일 맵:
 *   - Word 스타일 이름 → HTML 태그로 변환
 *   - 한국어 문서에서 사용되는 스타일명 추가 매핑
 */
export async function parseDocx(buffer: Buffer): Promise<DocxParseResult> {
  const styleMap = [
    // 한국어/영어 제목 스타일
    "p[style-name='제목 1'] => h1:fresh",
    "p[style-name='제목 2'] => h2:fresh",
    "p[style-name='제목 3'] => h3:fresh",
    "p[style-name='제목 4'] => h4:fresh",
    "p[style-name='Heading 1'] => h1:fresh",
    "p[style-name='Heading 2'] => h2:fresh",
    "p[style-name='Heading 3'] => h3:fresh",
    "p[style-name='Heading 4'] => h4:fresh",
    // 인용
    "p[style-name='인용'] => blockquote:fresh",
    "p[style-name='Quote'] => blockquote:fresh",
    // 코드
    "p[style-name='코드'] => pre:fresh",
    "p[style-name='Code'] => pre:fresh",
    // 목록 단락 스타일은 mammoth 기본 처리에 맡김 (직접 매핑 시 번호 순서 깨짐)
    // 표 캡션
    "p[style-name='표 캡션'] => p.caption:fresh",
    "p[style-name='Table Caption'] => p.caption:fresh",
    // 강조
    "r[style-name='강조'] => em",
    "r[style-name='Emphasis'] => em",
    // 굵은 강조
    "r[style-name='굵게'] => strong",
    "r[style-name='Strong'] => strong",
  ].join('\n')

  const result = await mammoth.convertToHtml(
    { buffer },
    {
      styleMap,
      convertImage: mammoth.images.imgElement(async (image) => {
        // 이미지를 base64 Data URL로 임베딩
        const buffer = await image.read()
        const base64 = buffer.toString('base64')
        return { src: `data:${image.contentType};base64,${base64}` }
      }),
    }
  )

  const warnings = result.messages
    .filter((m) => m.type === 'warning')
    .map((m) => m.message)

  return {
    html: wrapHtml(fixListHtml(result.value)),
    warnings,
  }
}

/**
 * HTML 목록 후처리
 * 1. 공백·&nbsp;만 있는 빈 <li> 제거 → 빈칸에 목록 점 찍히는 문제 해결
 * 2. 연속된 <ol>/<ul> 병합 → 순서 번호가 모두 1.로 시작되는 문제 해결
 */
function fixListHtml(html: string): string {
  let out = html

  // 빈 <li> 제거 (공백, &nbsp;, <br> 만 있는 경우 포함)
  out = out.replace(/<li>(\s|&nbsp;|<br\s*\/?>)*<\/li>/gi, '')

  // 연속된 <ol> 병합 (</ol> 바로 뒤에 <ol>이 오는 경우)
  // 한 번만 하면 3개 이상 연속도 처리되도록 반복
  let prev = ''
  while (prev !== out) {
    prev = out
    out = out.replace(/<\/ol>(\s*)<ol>/gi, '$1')
  }

  // 연속된 <ul> 병합
  prev = ''
  while (prev !== out) {
    prev = out
    out = out.replace(/<\/ul>(\s*)<ul>/gi, '$1')
  }

  // 병합 후 내용이 비어버린 <ol>/<ul> 제거
  out = out.replace(/<ol>(\s*)<\/ol>/gi, '')
  out = out.replace(/<ul>(\s*)<\/ul>/gi, '')

  return out
}

/**
 * mammoth HTML 결과를 완전한 HTML 문서로 감싸기
 */
function wrapHtml(body: string): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: 'Malgun Gothic', sans-serif; font-size: 11pt; line-height: 1.6; }
  h1 { font-size: 2em; margin: 0.67em 0; }
  h2 { font-size: 1.5em; margin: 0.75em 0; }
  h3 { font-size: 1.17em; margin: 0.83em 0; }
  p { margin: 0.5em 0; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #ccc; padding: 6px 10px; }
  img { max-width: 100%; height: auto; }
  blockquote { border-left: 4px solid #ccc; margin-left: 0; padding-left: 16px; color: #555; }
  pre { background: #f5f5f5; padding: 12px; border-radius: 4px; font-family: monospace; }
</style>
</head>
<body>${body}</body>
</html>`
}

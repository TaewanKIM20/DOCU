import sharp from 'sharp'
import path from 'path'
import os from 'os'
import { pathToFileURL } from 'url'

const CanvasModule = eval('require')('canvas')
const TEXT_ASCENT_CACHE = new Map<string, number>()

const TESSDATA_CACHE = path.join(os.homedir(), '.skkf-tessdata')
const PDF_LAYOUT_SCALE = 2
const PDF_MAX_PAGES = 10
const TEXT_LAYER_MIN_CHARS_PER_PAGE = 6
const DEFAULT_FONT_ASCENT_RATIO = 0.8
const PDF_TEXT_OP_NAMES = [
  'beginText',
  'endText',
  'setCharSpacing',
  'setWordSpacing',
  'setHScale',
  'setLeading',
  'setFont',
  'setTextRenderingMode',
  'setTextRise',
  'moveText',
  'setLeadingMoveText',
  'setTextMatrix',
  'nextLine',
  'showText',
  'showSpacedText',
  'nextLineShowText',
  'nextLineSetSpacingShowText',
  'setCharWidth',
  'setCharWidthAndBounds',
] as const
const STANDARD_FONT_DATA_URL = (() => {
  const fontPath = path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts')
  const href = pathToFileURL(fontPath).href
  return href.endsWith('/') ? href : `${href}/`
})()

type PdfJsLib = typeof import('pdfjs-dist/legacy/build/pdf.mjs')

interface TextFragment {
  text: string
  left: number
  top: number
  width: number
  height: number
  fontSize: number
  baseline: number
  anchorLeft: number
  anchorTop: number
  fontFamily: string
  fontWeight: string
  fontStyle: 'normal' | 'italic'
  lineHeight: number
  angle: number
  direction: 'ltr' | 'rtl'
  spaceWidth: number
  color: string
  layoutMode: 'absolute' | 'pdfjs'
  transform?: [number, number, number, number, number, number]
  targetWidth?: number
  isVertical?: boolean
  hasEOL: boolean
}

interface TextLine {
  text: string
  left: number
  top: number
  width: number
  height: number
  fontSize: number
  baseline: number
  anchorLeft: number
  anchorTop: number
  fontFamily: string
  fontWeight: string
  fontStyle: 'normal' | 'italic'
  lineHeight: number
  angle: number
  direction: 'ltr' | 'rtl'
  spaceWidth: number
  color: string
  layoutMode: 'absolute' | 'pdfjs'
  transform?: [number, number, number, number, number, number]
  targetWidth?: number
  isVertical?: boolean
}

interface RenderTextLine {
  text: string
  left: number
  top: number
  width: number
  height: number
  fontSize: number
  baseline?: number
  anchorLeft?: number
  anchorTop?: number
  fontFamily?: string
  fontWeight?: string
  fontStyle?: 'normal' | 'italic'
  lineHeight?: number
  angle?: number
  direction?: 'ltr' | 'rtl'
  spaceWidth?: number
  color?: string
  layoutMode?: 'absolute' | 'pdfjs'
  transform?: [number, number, number, number, number, number]
  targetWidth?: number
  isVertical?: boolean
}

interface PageTextQuality {
  totalChars: number
  hangulCount: number
  questionCount: number
  replacementCount: number
  likelyGarbled: boolean
}

interface ImageRaster {
  pixels: Buffer
  info: {
    width: number
    height: number
    channels: number
  }
}

interface PageTextLayout {
  width: number
  height: number
  lines: TextLine[]
  textLength: number
  quality: PageTextQuality
}

export interface PdfParseResult {
  html: string
  warnings: string[]
  pageCount: number
  isScanned: boolean
}

ensurePdfNodeGlobals()

class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createPatchedCanvas(width, height)
    const context = canvas.getContext('2d')
    return { canvas, context }
  }

  reset(canvasAndContext: { canvas: any }, width: number, height: number) {
    canvasAndContext.canvas.width = Math.max(1, Math.ceil(width))
    canvasAndContext.canvas.height = Math.max(1, Math.ceil(height))
  }

  destroy(canvasAndContext: { canvas: any; context: any }) {
    canvasAndContext.canvas.width = 0
    canvasAndContext.canvas.height = 0
    canvasAndContext.canvas = null
    canvasAndContext.context = null
  }
}

function ensurePdfNodeGlobals() {
  if (typeof process !== 'undefined' && typeof (process as any).getBuiltinModule === 'undefined') {
    ;(process as any).getBuiltinModule = (name: string) => {
      try {
        return eval('require')(name.replace(/^node:/, ''))
      } catch {
        return undefined
      }
    }
  }

  if (typeof globalThis === 'undefined') return

  if (!(globalThis as any).Image) {
    ;(globalThis as any).Image = CanvasModule.Image
  }

  if (!(globalThis as any).ImageData) {
    ;(globalThis as any).ImageData = CanvasModule.ImageData
  }

  if (!(globalThis as any).OffscreenCanvas) {
    ;(globalThis as any).OffscreenCanvas = class OffscreenCanvasPolyfill {
      private _canvas: any

      constructor(width: number, height: number) {
        this._canvas = createPatchedCanvas(width, height)
      }

      get width() {
        return this._canvas.width
      }

      set width(value: number) {
        this._canvas.width = Math.max(1, Math.ceil(value))
      }

      get height() {
        return this._canvas.height
      }

      set height(value: number) {
        this._canvas.height = Math.max(1, Math.ceil(value))
      }

      getContext(type: string, options?: any) {
        return this._canvas.getContext(type, options)
      }

      transferToImageBitmap() {
        return this._canvas
      }

      async convertToBlob(options?: { type?: string }) {
        const mimeType = options?.type || 'image/png'
        const buffer = this._canvas.toBuffer(mimeType)
        return new Blob([buffer], { type: mimeType })
      }
    }
  }

  if (!(globalThis as any).createImageBitmap) {
    ;(globalThis as any).createImageBitmap = async (source: any) => normalizeDrawable(source)
  }

  if (!(Promise as any).withResolvers) {
    ;(Promise as any).withResolvers = function withResolvers() {
      let resolve!: (value: unknown) => void
      let reject!: (reason?: unknown) => void
      const promise = new Promise((res, rej) => {
        resolve = res
        reject = rej
      })
      return { promise, resolve, reject }
    }
  }

  if (!(globalThis as any).DOMMatrix) {
    ;(globalThis as any).DOMMatrix = class DOMMatrix {
      a = 1
      b = 0
      c = 0
      d = 1
      e = 0
      f = 0
    }
  }

  if (!(globalThis as any).Path2D) {
    ;(globalThis as any).Path2D = class Path2D {
      addPath() {}
      closePath() {}
      moveTo() {}
      lineTo() {}
      bezierCurveTo() {}
      quadraticCurveTo() {}
      arc() {}
      arcTo() {}
      ellipse() {}
      rect() {}
    }
  }
}

function createPatchedCanvas(width: number, height: number) {
  const canvas = CanvasModule.createCanvas(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)))
  patchContext(canvas.getContext('2d'))
  return canvas
}

function patchContext(context: any) {
  if (!context || context.__skkfPatched) return

  const originalDrawImage = context.drawImage.bind(context)
  context.drawImage = (image: any, ...args: any[]) => originalDrawImage(normalizeDrawableSync(image), ...args)

  const originalCreatePattern = context.createPattern.bind(context)
  context.createPattern = (image: any, repetition: string | null) =>
    originalCreatePattern(normalizeDrawableSync(image), repetition)

  context.__skkfPatched = true
}

function normalizeDrawableSync(source: any) {
  if (!source) return source
  if (source instanceof CanvasModule.Canvas || source instanceof CanvasModule.Image) return source
  if (source._canvas) return source._canvas
  if (source.canvas instanceof CanvasModule.Canvas) return source.canvas
  return source
}

async function normalizeDrawable(source: any) {
  const normalized = normalizeDrawableSync(source)
  if (normalized !== source) return normalized

  if (source instanceof Blob) {
    const arrayBuffer = await source.arrayBuffer()
    return CanvasModule.loadImage(Buffer.from(arrayBuffer))
  }

  if (source instanceof ArrayBuffer) {
    return CanvasModule.loadImage(Buffer.from(source))
  }

  if (ArrayBuffer.isView(source)) {
    return CanvasModule.loadImage(Buffer.from(source.buffer, source.byteOffset, source.byteLength))
  }

  if (source?.data && Number.isInteger(source.width) && Number.isInteger(source.height)) {
    const canvas = createPatchedCanvas(source.width, source.height)
    const context = canvas.getContext('2d')
    const imageData = new CanvasModule.ImageData(
      new Uint8ClampedArray(source.data),
      source.width,
      source.height
    )
    context.putImageData(imageData, 0, 0)
    return canvas
  }

  return source
}

export async function parsePdf(buffer: Buffer): Promise<PdfParseResult> {
  const warnings: string[] = []
  const { pdfjsLib, pdfDocument } = await loadPdfDocument(buffer)

  const pageCount = Math.min(pdfDocument.numPages, PDF_MAX_PAGES)
  if (pdfDocument.numPages > PDF_MAX_PAGES) {
    warnings.push(`문서가 길어 처음 ${PDF_MAX_PAGES}페이지만 불러왔습니다.`)
  }

  const layouts: PageTextLayout[] = []

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber)
    layouts.push(await extractTextLayout(page, pdfjsLib, PDF_LAYOUT_SCALE))
    page.cleanup()
  }

  const totalTextLength = layouts.reduce((sum, layout) => sum + layout.textLength, 0)
  const hasSelectableText = totalTextLength / Math.max(pageCount, 1) >= TEXT_LAYER_MIN_CHARS_PER_PAGE

  {
    const pageModes = layouts.map((layout) => decidePageMode(layout, hasSelectableText))
    const ocrPageCount = pageModes.filter((mode) => mode === 'ocr').length
    const selectablePageCount = pageModes.filter((mode) => mode === 'selectable').length

    if (!hasSelectableText) {
      warnings.push(`총 ${pageCount}페이지가 스캔 PDF로 보여 OCR로 인식했습니다. 글자 위치는 원본과 약간 다를 수 있습니다.`)
    } else if (ocrPageCount > 0) {
      warnings.push('일부 페이지는 텍스트 추출 품질이 낮아 OCR로 다시 인식했습니다.')
    }

    let renderFallbackUsed = false
    let ocrWorker: any = null
    const pageHtmls: string[] = []

    try {
      if (ocrPageCount > 0) {
        ocrWorker = await createOcrWorker()
      }

      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        const page = await pdfDocument.getPage(pageNumber)
        const layout = layouts[pageNumber - 1]
        const pageMode = pageModes[pageNumber - 1]

        try {
          if (pageMode === 'selectable') {
            let renderedBuffer: Buffer | null = null
            let raster: ImageRaster | null = null

            try {
              renderedBuffer = await renderPageToImage(page, PDF_LAYOUT_SCALE)
              raster = await readImageRaster(renderedBuffer)
            } catch {
              renderedBuffer = null
              raster = null
            }

            const styledLines = raster ? applyVisualStylesToLines(layout.lines, raster) : layout.lines
            let imageSrc: string | undefined

            try {
              const backgroundBuffer = await renderPageBackgroundToImage(page, pdfjsLib, PDF_LAYOUT_SCALE)
              imageSrc = `data:image/jpeg;base64,${backgroundBuffer.toString('base64')}`
            } catch {
              if (renderedBuffer) {
                const cleanedBuffer = await createCleanedBackgroundFromLines(
                  renderedBuffer,
                  layout.width,
                  layout.height,
                  styledLines
                )
                imageSrc = `data:image/jpeg;base64,${cleanedBuffer.toString('base64')}`
                renderFallbackUsed = true
              } else {
                renderFallbackUsed = true
              }
            }

            pageHtmls.push(buildTextLayerPageHtml(styledLines, layout.width, layout.height, imageSrc, pageNumber))
            continue
          }

          const renderedBuffer = await renderPageToImage(page, PDF_LAYOUT_SCALE)
          const pageImage = await sharp(renderedBuffer)
            .flatten({ background: { r: 255, g: 255, b: 255 } })
            .toBuffer({ resolveWithObject: true })

          const lines = ocrWorker
            ? await extractOcrLinesFromPageImage(pageImage, ocrWorker)
            : []

          const cleanedBuffer = lines.length
            ? await createCleanedBackgroundFromLines(
                renderedBuffer,
                pageImage.info.width,
                pageImage.info.height,
                lines
              )
            : await sharp(renderedBuffer)
                .flatten({ background: { r: 255, g: 255, b: 255 } })
                .jpeg({ quality: 88 })
                .toBuffer()

          pageHtmls.push(
            buildTextLayerPageHtml(
              lines,
              pageImage.info.width,
              pageImage.info.height,
              `data:image/jpeg;base64,${cleanedBuffer.toString('base64')}`,
              pageNumber
            )
          )
        } catch (error) {
          if (layout.lines.length > 0) {
            renderFallbackUsed = true
            pageHtmls.push(buildTextLayerPageHtml(layout.lines, layout.width, layout.height, undefined, pageNumber))
            continue
          }

          throw new Error(`PDF 이미지 변환 실패: ${(error as Error).message}`)
        } finally {
          page.cleanup()
        }
      }
    } finally {
      if (ocrWorker) {
        await ocrWorker.terminate()
      }
    }

    if (renderFallbackUsed) {
      warnings.push('일부 페이지는 배경 렌더링이 어려워 텍스트 레이어만 표시하거나 전체 렌더 이미지를 정리해 사용했습니다.')
    }

    return {
      html: wrapPdfHtml(pageHtmls.join('\n')),
      warnings,
      pageCount,
      isScanned: selectablePageCount === 0,
    }
  }

  if (hasSelectableText) {
    let renderFallbackUsed = false
    const pageHtmls: string[] = []

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber)
      const layout = layouts[pageNumber - 1]
      let imageSrc: string | undefined

      try {
        const backgroundBuffer = await renderPageBackgroundToImage(page, pdfjsLib, PDF_LAYOUT_SCALE)
        imageSrc = `data:image/jpeg;base64,${backgroundBuffer.toString('base64')}`
      } catch {
        try {
          const renderedBuffer = await renderPageToImage(page, PDF_LAYOUT_SCALE)
          const cleanedBuffer = await createCleanedBackgroundFromLines(
            renderedBuffer,
            layout.width,
            layout.height,
            layout.lines
          )
          imageSrc = `data:image/jpeg;base64,${cleanedBuffer.toString('base64')}`
        } catch {
          renderFallbackUsed = true
        }
      } finally {
        page.cleanup()
      }

      pageHtmls.push(buildTextLayerPageHtml(layout.lines, layout.width, layout.height, imageSrc, pageNumber))
    }

    if (renderFallbackUsed) {
      warnings.push('일부 PDF 요소를 배경 이미지로 렌더링하지 못해 텍스트 레이어만 표시했습니다.')
    }

    return {
      html: wrapPdfHtml(pageHtmls.join('\n')),
      warnings,
      pageCount,
      isScanned: false,
    }
  }

  warnings.push(`총 ${pageCount}페이지의 스캔 PDF로 보입니다. OCR 결과라 글자 위치가 일부 달라질 수 있습니다.`)

  const pageImages: Buffer[] = []

  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber)
      try {
        pageImages.push(await renderPageToImage(page, PDF_LAYOUT_SCALE))
      } finally {
        page.cleanup()
      }
    }
  } catch (error) {
    if (totalTextLength > 0) {
      warnings.push('PDF 배경 이미지를 만들지 못해 배경 없이 텍스트 레이어만 표시했습니다.')
      return {
        html: wrapPdfHtml(
          layouts.map((layout, index) =>
            buildTextLayerPageHtml(layout.lines, layout.width, layout.height, undefined, index + 1)
          ).join('\n')
        ),
        warnings,
        pageCount,
        isScanned: false,
      }
    }

    throw new Error(`PDF 이미지 변환 실패: ${(error as Error).message}`)
  }

  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('kor+eng', 1, { cachePath: TESSDATA_CACHE })

  await worker.setParameters({
    tessedit_pageseg_mode: '3' as any,
    preserve_interword_spaces: '1',
  })

  const pageHtmls: string[] = []

  try {
    for (let index = 0; index < pageImages.length; index += 1) {
      const sourceBuffer = pageImages[index]
      const pageImage = await sharp(sourceBuffer)
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .toBuffer({ resolveWithObject: true })

      const ocrBuffer = await sharp(pageImage.data, { raw: pageImage.info })
        .grayscale()
        .normalize()
        .toBuffer()

      const { data } = await worker.recognize(ocrBuffer)
      const rows = parseTsv(data.tsv || '')
      const lines = rows
        .filter((row) => row.level === 4 && row.text?.trim())
        .map((row) => ({
          text: row.text.trim(),
          left: row.left,
          top: row.top,
          width: row.width,
          height: row.height,
          fontSize: Math.max(row.height * 0.85, 8),
        }))

      const cleanedBuffer = await createCleanedBackgroundFromLines(
        sourceBuffer,
        pageImage.info.width,
        pageImage.info.height,
        lines
      )

      pageHtmls.push(
        buildTextLayerPageHtml(
          lines,
          pageImage.info.width,
          pageImage.info.height,
          `data:image/jpeg;base64,${cleanedBuffer.toString('base64')}`,
          index + 1
        )
      )
    }
  } finally {
    await worker.terminate()
  }

  return {
    html: wrapPdfHtml(pageHtmls.join('\n')),
    warnings,
    pageCount,
    isScanned: true,
  }
}

async function loadPdfDocument(buffer: Buffer) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    disableFontFace: true,
    verbosity: 0,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    CanvasFactory: NodeCanvasFactory as any,
  } as any)

  const pdfDocument = await loadingTask.promise
  return { pdfjsLib, pdfDocument }
}

async function renderPageToImage(page: any, scale: number): Promise<Buffer> {
  const viewport = page.getViewport({ scale })
  const canvasFactory = new NodeCanvasFactory()
  const canvasAndContext = canvasFactory.create(viewport.width, viewport.height)

  try {
    await page.render({
      canvasContext: canvasAndContext.context as any,
      viewport,
      canvasFactory: canvasFactory as any,
    } as any).promise

    return canvasAndContext.canvas.toBuffer('image/png')
  } finally {
    canvasFactory.destroy(canvasAndContext)
  }
}

async function renderPageBackgroundToImage(page: any, pdfjsLib: PdfJsLib, scale: number): Promise<Buffer> {
  const viewport = page.getViewport({ scale })
  const canvasFactory = new NodeCanvasFactory()
  const canvasAndContext = canvasFactory.create(viewport.width, viewport.height)
  const annotationMode = pdfjsLib.AnnotationMode.DISABLE
  const { cacheKey } = page._transport.getRenderingIntent('display', annotationMode, null, false)
  const previousState = page._intentStates.get(cacheKey)

  try {
    const operatorList = await page.getOperatorList({
      intent: 'display',
      annotationMode,
    })

    const filteredOperatorList = filterTextOperators(operatorList, pdfjsLib)

    page._intentStates.set(cacheKey, {
      operatorList: filteredOperatorList,
      displayReadyCapability: { promise: Promise.resolve(false) },
      renderTasks: new Set(),
      streamReaderCancelTimeout: null,
    })

    await page.render({
      canvasContext: canvasAndContext.context as any,
      viewport,
      intent: 'display',
      annotationMode,
    } as any).promise

    return sharp(canvasAndContext.canvas.toBuffer('image/png'))
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({ quality: 90 })
      .toBuffer()
  } finally {
    if (previousState) {
      page._intentStates.set(cacheKey, previousState)
    } else {
      page._intentStates.delete(cacheKey)
    }
    canvasFactory.destroy(canvasAndContext)
  }
}

async function extractTextLayout(page: any, pdfjsLib: PdfJsLib, scale: number): Promise<PageTextLayout> {
  const viewport = page.getViewport({ scale })
  const textContent = await page.getTextContent({
    normalizeWhitespace: false,
    disableCombineTextItems: false,
  } as any)
  const styles = (textContent as any).styles || {}

  const fragments = textContent.items
    .filter((item: any) => typeof item?.str === 'string')
    .map((item: any) => createTextFragment(item, viewport, styles, pdfjsLib))
    .filter((item: TextFragment) => item.text.trim().length > 0)

  const lines = [...fragments]
    .sort((a, b) => {
      if (Math.abs(a.top - b.top) > 1.5) return a.top - b.top
      return a.left - b.left
    })
    .map(fragmentToLine)

  return {
    width: Math.ceil(viewport.width),
    height: Math.ceil(viewport.height),
    lines,
    textLength: lines.reduce((sum, line) => sum + line.text.length, 0),
    quality: analyzePageTextQuality(lines),
  }
}

function createTextFragment(
  item: any,
  viewport: any,
  styles: Record<string, any>,
  pdfjsLib: PdfJsLib
): TextFragment {
  const text = String(item.str || '').replace(/\u0000/g, '')
  const transformed = pdfjsLib.Util.transform(viewport.transform, item.transform)
  const horizontalScale = Math.hypot(transformed[0], transformed[1])
  const verticalScale = Math.hypot(transformed[2], transformed[3])
  const style = styles[item.fontName] || {}
  const normalizedFontFamily = normalizeFontFamily(style.fontFamily, text)
  const { fontWeight, fontStyle } = inferFontPresentation(item.fontName, style.fontFamily)
  const fontSize = clamp(Math.max(verticalScale, 8), 8, Math.max(viewport.width, viewport.height))
  const measuredAscentRatio = getFontAscentRatio(normalizedFontFamily)
  const styleAscentRatio =
    typeof style.ascent === 'number' ? clamp(style.ascent, 0.45, 0.95) : measuredAscentRatio
  const ascentRatio = clamp((measuredAscentRatio * 0.7 + styleAscentRatio * 0.3), 0.45, 0.92)
  const descentRatio =
    typeof style.descent === 'number'
      ? clamp(Math.abs(style.descent), 0.08, 0.45)
      : clamp(1 - ascentRatio, 0.08, 0.45)
  let angle = Math.atan2(transformed[1], transformed[0])
  if (style.vertical) {
    angle += Math.PI / 2
  }
  const lineHeight = Math.max((item.height || 0) * viewport.scale, fontSize * (ascentRatio + descentRatio), 10)
  const width = Math.max(Math.abs(item.width || 0) * viewport.scale, estimateTextWidth(text, horizontalScale || fontSize))
  const anchorLeft = transformed[4]
  const anchorTop = transformed[5]
  const fontAscent = fontSize * ascentRatio
  const left = anchorLeft + fontAscent * Math.sin(angle)
  const top = anchorTop - fontAscent * Math.cos(angle)
  const baseline = anchorTop
  const visibleChars = Array.from(text.replace(/\s+/g, '')).length
  const avgGlyphWidth = visibleChars > 0 ? width / visibleChars : fontSize * 0.55
  const angleDegrees = roundMetric((angle * 180) / Math.PI, 2)

  return {
    text,
    left,
    top,
    width: Math.max(width, 1),
    height: Math.max(lineHeight, 10),
    fontSize,
    baseline,
    anchorLeft,
    anchorTop,
    fontFamily: normalizedFontFamily,
    fontWeight,
    fontStyle,
    lineHeight: Math.max(lineHeight, 10),
    angle: angleDegrees,
    direction: item.dir === 'rtl' ? 'rtl' : 'ltr',
    spaceWidth: clamp(avgGlyphWidth * 0.9, fontSize * 0.2, fontSize * 0.95),
    color: '#111111',
    layoutMode: 'pdfjs',
    transform: [
      transformed[0],
      transformed[1],
      transformed[2],
      transformed[3],
      transformed[4],
      transformed[5],
    ],
    targetWidth: Math.max((style.vertical ? Math.abs(item.height || 0) : Math.abs(item.width || 0)) * viewport.scale, 1),
    isVertical: style.vertical === true,
    hasEOL: item.hasEOL === true,
  }
}

function analyzePageTextQuality(lines: Array<Pick<TextLine, 'text'>>): PageTextQuality {
  const rawText = lines.map((line) => line.text).join(' ')
  const visibleText = rawText.replace(/\s+/g, '')
  const totalChars = Array.from(visibleText).length
  const hangulCount = (visibleText.match(/[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7A3]/gu) || []).length
  const questionCount = (visibleText.match(/[\u003F\uFF1F]/g) || []).length
  const replacementCount = (visibleText.match(/[\uFFFD\u25A1]/g) || []).length
  const asciiLetterCount = (visibleText.match(/[A-Za-z]/g) || []).length
  const questionRatio = totalChars > 0 ? questionCount / totalChars : 0
  const replacementRatio = totalChars > 0 ? replacementCount / totalChars : 0
  const likelyGarbled =
    totalChars >= 8 &&
    (
      replacementRatio >= 0.04 ||
      (questionCount >= 3 && questionRatio >= 0.18 && hangulCount === 0) ||
      (questionRatio >= 0.35 && asciiLetterCount <= Math.floor(totalChars * 0.45))
    )

  return {
    totalChars,
    hangulCount,
    questionCount,
    replacementCount,
    likelyGarbled,
  }
}

function mergeFragmentsIntoLines(fragments: TextFragment[], pageWidth: number): TextLine[] {
  const sorted = [...fragments].sort((a, b) => {
    if (Math.abs(a.baseline - b.baseline) > 1.5) return a.baseline - b.baseline
    return a.left - b.left
  })

  const lines: TextLine[] = []
  let current: TextLine | null = null

  const flush = () => {
    if (!current) return
    current.text = current.text.replace(/\s+$/g, '')
    if (current.text.trim()) {
      current.width = roundMetric(current.width)
      current.height = roundMetric(current.height)
      current.top = roundMetric(current.top)
      current.left = roundMetric(current.left)
      current.baseline = roundMetric(current.baseline)
      current.anchorLeft = roundMetric(current.anchorLeft)
      current.anchorTop = roundMetric(current.anchorTop)
      current.fontSize = roundMetric(current.fontSize, 2)
      current.lineHeight = roundMetric(current.lineHeight, 2)
      current.spaceWidth = roundMetric(current.spaceWidth, 2)
      lines.push(current)
    }
    current = null
  }

  for (const fragment of sorted) {
    if (!current) {
      current = fragmentToLine(fragment)
      if (fragment.hasEOL) flush()
      continue
    }

    const sameBaseline =
      Math.abs(fragment.baseline - current.baseline) <=
      Math.max(2, Math.max(current.lineHeight, fragment.lineHeight) * 0.28)
    const sameAngle = Math.abs(fragment.angle - current.angle) <= 1.5
    const sameDirection = fragment.direction === current.direction
    const similarFont = current.fontFamily === fragment.fontFamily
    const similarSize =
      Math.abs(fragment.fontSize - current.fontSize) <=
      Math.max(1.5, Math.max(current.fontSize, fragment.fontSize) * 0.25)
    const gap = fragment.left - (current.left + current.width)
    const overlapAllowance = Math.max(2, Math.max(current.fontSize, fragment.fontSize) * 0.35)
    const mergeableGap =
      gap >= -overlapAllowance &&
      gap <= Math.max(18, Math.max(current.fontSize, fragment.fontSize) * 1.8, pageWidth * 0.025)

    if (!sameBaseline || !sameAngle || !sameDirection || !similarFont || !similarSize || !mergeableGap) {
      flush()
      current = fragmentToLine(fragment)
      if (fragment.hasEOL) flush()
      continue
    }

    const spaceCount = computeGapSpaceCount(gap, Math.max(current.spaceWidth, fragment.spaceWidth))
    const spacer =
      spaceCount > 0 && !/[\s-]$/u.test(current.text) && !/^\s/u.test(fragment.text)
        ? ' '.repeat(spaceCount)
        : ''

    current.text += `${spacer}${fragment.text}`
    current.width = Math.max(current.width, fragment.left + fragment.width - current.left)
    const bottom = Math.max(current.top + current.height, fragment.top + fragment.height)
    current.top = Math.min(current.top, fragment.top)
    current.height = bottom - current.top
    current.fontSize = Math.max(current.fontSize, fragment.fontSize)
    current.baseline = (current.baseline + fragment.baseline) / 2
    current.anchorLeft = Math.min(current.anchorLeft, fragment.anchorLeft)
    current.anchorTop = (current.anchorTop + fragment.anchorTop) / 2
    current.lineHeight = Math.max(current.lineHeight, fragment.lineHeight)
    current.spaceWidth = Math.max(current.spaceWidth, fragment.spaceWidth)

    if (fragment.hasEOL) flush()
  }

  flush()
  return lines
}

async function createCleanedBackgroundFromLines(
  imageBuffer: Buffer,
  width: number,
  height: number,
  lines: Array<Pick<TextLine, 'left' | 'top' | 'width' | 'height'>>
) {
  const svg = lines
    .map((line) => {
      const left = Math.max(0, Math.floor(line.left - 2))
      const top = Math.max(0, Math.floor(line.top - 2))
      const rectWidth = Math.min(width - left, Math.ceil(line.width + 4))
      const rectHeight = Math.min(height - top, Math.ceil(line.height + 4))
      return `<rect x="${left}" y="${top}" width="${rectWidth}" height="${rectHeight}" fill="white" />`
    })
    .join('')

  return sharp(imageBuffer)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .composite([{ input: Buffer.from(`<svg width="${width}" height="${height}">${svg}</svg>`) }])
    .jpeg({ quality: 88 })
    .toBuffer()
}

function filterTextOperators(operatorList: any, pdfjsLib: PdfJsLib) {
  const textOps = new Set<number>(
    PDF_TEXT_OP_NAMES
      .map((name) => pdfjsLib.OPS[name])
      .filter((value): value is number => typeof value === 'number')
  )

  const fnArray: number[] = []
  const argsArray: any[] = []

  for (let index = 0; index < operatorList.fnArray.length; index += 1) {
    const fn = operatorList.fnArray[index]
    if (textOps.has(fn)) continue
    fnArray.push(fn)
    argsArray.push(operatorList.argsArray[index])
  }

  return {
    fnArray,
    argsArray,
    lastChunk: true,
    separateAnnots: operatorList.separateAnnots,
  }
}

function decidePageMode(layout: PageTextLayout, hasDocumentSelectableText: boolean) {
  if (!hasDocumentSelectableText) return 'ocr' as const
  if (layout.textLength === 0) return 'ocr' as const
  if (layout.quality.likelyGarbled) return 'ocr' as const
  return 'selectable' as const
}

async function createOcrWorker() {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('kor+eng', 1, { cachePath: TESSDATA_CACHE })

  await worker.setParameters({
    tessedit_pageseg_mode: '3' as any,
    preserve_interword_spaces: '1',
  })

  return worker
}

async function extractOcrLinesFromPageImage(pageImage: { data: Buffer; info: { width: number; height: number; channels: number } }, worker: any) {
  const raster: ImageRaster = {
    pixels: pageImage.data,
    info: {
      width: pageImage.info.width,
      height: pageImage.info.height,
      channels: pageImage.info.channels,
    },
  }
  const ocrBuffer = await sharp(pageImage.data, { raw: pageImage.info as any })
    .grayscale()
    .normalize()
    .toBuffer()

  const { data } = await worker.recognize(ocrBuffer)
  const rows = parseTsv(data.tsv || '')

  return rows
    .filter((row) => row.level === 4 && row.text?.trim())
    .map((row) => ({
      text: row.text.trim(),
      left: row.left,
      top: row.top,
      width: row.width,
      height: row.height,
      fontSize: Math.max(row.height * 0.85, 8),
      lineHeight: Math.max(row.height, 10),
      fontFamily: normalizeFontFamily(undefined, row.text),
      fontWeight: '400',
      fontStyle: 'normal' as const,
      color: sampleTextColor(raster, row),
    }))
}

function buildTextLayerPageHtml(
  lines: RenderTextLine[],
  width: number,
  height: number,
  imageSrc: string | undefined,
  pageNumber: number
) {
  const lineElements = lines
    .map((rawLine) => {
      const line = hydrateRenderLine(rawLine)

      return `
        <div
          contenteditable="true"
          data-layout-editable="true"
          data-layout-mode="${line.layoutMode}"
          data-target-width="${roundMetric(line.width, 2)}"
          data-font-size="${roundMetric(line.fontSize, 2)}"
          data-line-height="${roundMetric(Math.max(line.lineHeight, line.fontSize), 2)}"
          data-angle="${roundMetric(line.angle, 2)}"
          ${line.transform ? `data-tx="${line.transform.map((value) => roundMetric(value, 4)).join(',')}"` : ''}
          ${typeof line.targetWidth === 'number' ? `data-pdf-width="${roundMetric(line.targetWidth, 2)}"` : ''}
          ${line.isVertical ? 'data-vertical="1"' : ''}
          spellcheck="false"
          style="
            position:absolute;
            top:${roundMetric(line.top, 2)}px;
            left:${roundMetric(line.left, 2)}px;
            font-size:${roundMetric(Math.max(line.fontSize, 8), 2)}px;
            line-height:${line.layoutMode === 'pdfjs' ? '1' : `${roundMetric(Math.max(line.lineHeight, line.fontSize), 2)}px`};
            font-family:${line.fontFamily};
            font-weight:${line.fontWeight};
            font-style:${line.fontStyle};
            direction:${line.direction};
            color:${line.color};
            white-space:pre;
            display:inline-block;
            min-width:1px;
            min-height:${line.layoutMode === 'pdfjs' ? '1px' : `${roundMetric(Math.max(line.lineHeight, line.fontSize), 2)}px`};
            word-break:normal;
            overflow:visible;
            padding:0;
            margin:0;
            border:0;
            background:transparent;
            font-kerning:normal;
            text-rendering:geometricPrecision;
            transform-origin:top left;
            outline:none;
          "
        >${escapeHtml(line.text)}</div>
      `
    })
    .join('')

  return `
    <div
      class="pdf-page${imageSrc ? '' : ' pdf-page--text-only'}"
      data-page-number="${pageNumber}"
      style="position:relative; width:${width}px; height:${height}px; margin:0 auto 2rem; overflow:hidden;"
    >
      ${imageSrc ? `<img src="${imageSrc}" style="width:100%; height:100%; display:block;" />` : ''}
      ${lineElements}
    </div>
  `
}

function wrapPdfHtml(content: string) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      background: #f3f4f6;
      font-family: 'Noto Sans KR', 'Malgun Gothic', sans-serif;
    }
    .pdf-page {
      background: white;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
    }
    .pdf-page > img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
    }
    .pdf-page--text-only {
      border: 1px solid #e5e7eb;
    }
    [data-layout-editable="true"] {
      z-index: 1;
      caret-color: #111827;
    }
    [data-layout-editable="true"]:hover {
      background: rgba(59, 130, 246, 0.08);
      border-radius: 2px;
    }
    [data-layout-editable="true"]:focus {
      background: white;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.35);
      border-radius: 2px;
    }
  </style>
  <script>
    (() => {
      const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

      function getMeasureRoot() {
        let root = document.getElementById('skkf-pdf-measure')
        if (root) return root

        root = document.createElement('div')
        root.id = 'skkf-pdf-measure'
        root.setAttribute('aria-hidden', 'true')
        root.style.cssText = [
          'position:fixed',
          'left:-100000px',
          'top:0',
          'visibility:hidden',
          'pointer-events:none',
          'white-space:pre',
          'padding:0',
          'margin:0',
        ].join(';')
        document.body.appendChild(root)
        return root
      }

      function getMeasureCanvas() {
        let canvas = document.getElementById('skkf-pdf-measure-canvas')
        if (canvas instanceof HTMLCanvasElement) return canvas

        canvas = document.createElement('canvas')
        canvas.id = 'skkf-pdf-measure-canvas'
        canvas.width = 256
        canvas.height = 128
        canvas.style.display = 'none'
        document.body.appendChild(canvas)
        return canvas
      }

      function getFontAscentRatio(fontFamily) {
        const cacheKey = fontFamily
        window.__skkfFontAscentCache = window.__skkfFontAscentCache || new Map()
        const cache = window.__skkfFontAscentCache
        if (cache.has(cacheKey)) return cache.get(cacheKey)

        const canvas = getMeasureCanvas()
        const context = canvas.getContext('2d')
        context.font = '100px ' + fontFamily
        const metrics = context.measureText('Ag')
        const ascent = metrics.fontBoundingBoxAscent || metrics.actualBoundingBoxAscent || 80
        const descent = Math.abs(metrics.fontBoundingBoxDescent || metrics.actualBoundingBoxDescent || 20)
        const ratio = clamp(ascent / Math.max(ascent + descent, 1), 0.45, 0.92)
        cache.set(cacheKey, ratio)
        return ratio
      }

      function measureTextWidth(element) {
        const styles = window.getComputedStyle(element)
        const measureRoot = getMeasureRoot()

        measureRoot.style.font = styles.font
        measureRoot.style.fontFamily = styles.fontFamily
        measureRoot.style.fontSize = styles.fontSize
        measureRoot.style.fontWeight = styles.fontWeight
        measureRoot.style.fontStyle = styles.fontStyle
        measureRoot.style.lineHeight = styles.lineHeight
        measureRoot.style.letterSpacing = '0px'
        measureRoot.style.wordSpacing = '0px'
        measureRoot.textContent = (element.innerText || '').replace(/\r/g, '')

        return measureRoot.getBoundingClientRect().width
      }

      function applyPdfJsGeometry(element) {
        const txValue = element.dataset.tx
        if (!txValue) return

        const tx = txValue.split(',').map((value) => parseFloat(value))
        if (tx.length !== 6 || tx.some((value) => !Number.isFinite(value))) return

        let angle = Math.atan2(tx[1], tx[0])
        if (element.dataset.vertical === '1') {
          angle += Math.PI / 2
        }

        const fontHeight = Math.max(Math.hypot(tx[2], tx[3]), 1)
        const fontAscent = fontHeight * getFontAscentRatio(window.getComputedStyle(element).fontFamily)
        let left = tx[4]
        let top = tx[5] - fontAscent

        if (Math.abs(angle) > 0.0001) {
          left = tx[4] + fontAscent * Math.sin(angle)
          top = tx[5] - fontAscent * Math.cos(angle)
        }

        element.style.left = left.toFixed(2) + 'px'
        element.style.top = top.toFixed(2) + 'px'
        element.style.fontSize = fontHeight.toFixed(2) + 'px'
        element.style.lineHeight = '1'
        element.dataset.fontSize = fontHeight.toFixed(2)
        element.dataset.angle = (angle * 180 / Math.PI).toFixed(2)
        if (element.dataset.pdfWidth) {
          element.dataset.targetWidth = element.dataset.pdfWidth
        }
      }

      function syncEditableWidth(element) {
        if (element.dataset.layoutMode === 'pdfjs') {
          applyPdfJsGeometry(element)
        }

        const targetWidth = parseFloat(element.dataset.targetWidth || '0')
        const fontSize = parseFloat(element.dataset.fontSize || '0') || parseFloat(window.getComputedStyle(element).fontSize) || 12
        const lineHeight = parseFloat(element.dataset.lineHeight || '0') || fontSize
        const angle = parseFloat(element.dataset.angle || '0')
        const text = (element.innerText || '').replace(/\r/g, '')
        const naturalWidth = measureTextWidth(element)
        const transforms = []
        const scaleX =
          targetWidth > 0 && naturalWidth > 0 ? clamp(targetWidth / naturalWidth, 0.25, 6) : 1

        if (Math.abs(angle) > 0.1) {
          transforms.push('rotate(' + angle.toFixed(2) + 'deg)')
        }

        if (text && Math.abs(scaleX - 1) > 0.01) {
          transforms.push('scaleX(' + scaleX.toFixed(4) + ')')
        }

        element.style.transform = transforms.join(' ')
        if (element.dataset.layoutMode !== 'pdfjs') {
          element.style.lineHeight = lineHeight + 'px'
        }
      }

      function syncAllEditableWidths() {
        document.querySelectorAll('[data-layout-editable="true"]').forEach((element) => {
          syncEditableWidth(element)
        })
      }

      document.addEventListener(
        'input',
        (event) => {
          const target = event.target
          if (target instanceof HTMLElement && target.matches('[data-layout-editable="true"]')) {
            syncEditableWidth(target)
          }
        },
        true
      )

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', syncAllEditableWidths, { once: true })
      } else {
        syncAllEditableWidths()
      }

      window.addEventListener('load', syncAllEditableWidths, { once: true })
    })()
  </script>
</head>
<body data-layout-document="true">${content}</body>
</html>`
}

function parseTsv(tsv: string) {
  if (!tsv) return []

  return tsv
    .trim()
    .split('\n')
    .slice(1)
    .map((line) => {
      const columns = line.split('\t')
      return {
        level: parseInt(columns[0]) || 0,
        left: parseInt(columns[6]) || 0,
        top: parseInt(columns[7]) || 0,
        width: parseInt(columns[8]) || 0,
        height: parseInt(columns[9]) || 0,
        text: columns[11] || '',
      }
    })
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function computeGapSpaceCount(gap: number, spaceWidth: number) {
  if (!Number.isFinite(gap) || !Number.isFinite(spaceWidth) || spaceWidth <= 0) return 0
  if (gap <= spaceWidth * 0.45) return 0
  return Math.max(1, Math.min(8, Math.round(gap / spaceWidth)))
}

function estimateTextWidth(text: string, fontSize: number) {
  const characters = Array.from(text)
  if (characters.length === 0) return fontSize * 0.5

  return characters.reduce((width, character) => {
    if (/\s/u.test(character)) return width + fontSize * 0.3
    if (/[A-Z0-9]/u.test(character)) return width + fontSize * 0.58
    if (/[a-z]/u.test(character)) return width + fontSize * 0.5
    return width + fontSize * 0.92
  }, 0)
}

function fragmentToLine(fragment: TextFragment): TextLine {
  return { ...fragment }
}

function hydrateRenderLine(line: RenderTextLine): TextLine {
  return {
    text: line.text,
    left: line.left,
    top: line.top,
    width: line.width,
    height: line.height,
    fontSize: line.fontSize,
    baseline: line.baseline ?? line.top + line.height,
    anchorLeft: line.anchorLeft ?? line.left,
    anchorTop: line.anchorTop ?? line.baseline ?? line.top + line.height,
    fontFamily: line.fontFamily ?? normalizeFontFamily(undefined, line.text),
    fontWeight: line.fontWeight ?? '400',
    fontStyle: line.fontStyle ?? 'normal',
    lineHeight: line.lineHeight ?? Math.max(line.height, line.fontSize),
    angle: line.angle ?? 0,
    direction: line.direction ?? 'ltr',
    spaceWidth: line.spaceWidth ?? Math.max(line.fontSize * 0.3, 4),
    color: line.color ?? '#111111',
    layoutMode: line.layoutMode ?? 'absolute',
    transform: line.transform,
    targetWidth: line.targetWidth,
    isVertical: line.isVertical,
  }
}

function normalizeFontFamily(fontFamily: unknown, sampleText = '') {
  const prefersHangul = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7A3]/u.test(sampleText)

  if (typeof fontFamily !== 'string') {
    return getFallbackFontStack('sans-serif', prefersHangul).map(formatFontFamilyToken).join(', ')
  }

  const families = fontFamily
    .split(',')
    .map((token) => token.replace(/["']/g, '').replace(/[^\p{L}\p{N}\s_-]/gu, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const nonGenericFamilies = families.filter((family) => !isGenericFamily(family))
  const genericFamilies = families.filter((family) => isGenericFamily(family))
  const preferredGeneric = genericFamilies[0] ?? 'sans-serif'
  const fallbackFamilies = getFallbackFontStack(preferredGeneric, prefersHangul)
  const uniqueFamilies = [...nonGenericFamilies, ...fallbackFamilies, ...genericFamilies].filter(
    (family, index, source) => source.findIndex((item) => item.toLowerCase() === family.toLowerCase()) === index
  )

  return uniqueFamilies.map(formatFontFamilyToken).join(', ')
}

function getFallbackFontStack(genericFamily: string, prefersHangul: boolean) {
  switch (genericFamily.toLowerCase()) {
    case 'serif':
      return prefersHangul
        ? ['Noto Serif KR', 'Batang', 'Times New Roman', 'serif']
        : ['Times New Roman', 'Georgia', 'serif']
    case 'monospace':
      return ['Consolas', 'Courier New', 'monospace']
    case 'system-ui':
      return prefersHangul
        ? ['Malgun Gothic', 'Apple SD Gothic Neo', 'system-ui']
        : ['Segoe UI', 'Arial', 'system-ui']
    case 'cursive':
    case 'fantasy':
      return [genericFamily]
    default:
      return prefersHangul
        ? ['Noto Sans KR', 'Malgun Gothic', 'Apple SD Gothic Neo', 'sans-serif']
        : ['Arial', 'Helvetica Neue', 'sans-serif']
  }
}

function inferFontPresentation(fontName: unknown, fontFamily: unknown) {
  const signature = `${typeof fontName === 'string' ? fontName : ''} ${typeof fontFamily === 'string' ? fontFamily : ''}`
  const normalized = signature.toLowerCase()

  let fontWeight = '400'
  if (/(black|heavy)/.test(normalized)) fontWeight = '900'
  else if (/(extrabold|ultrabold)/.test(normalized)) fontWeight = '800'
  else if (/(semibold|demibold)/.test(normalized)) fontWeight = '600'
  else if (/(medium)/.test(normalized)) fontWeight = '500'
  else if (/(bold)/.test(normalized)) fontWeight = '700'
  else if (/(light)/.test(normalized)) fontWeight = '300'

  const fontStyle: 'normal' | 'italic' = /(italic|oblique)/.test(normalized) ? 'italic' : 'normal'

  return { fontWeight, fontStyle }
}

async function readImageRaster(imageBuffer: Buffer): Promise<ImageRaster> {
  const { data, info } = await sharp(imageBuffer)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  return {
    pixels: data,
    info: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  }
}

function applyVisualStylesToLines(lines: TextLine[], raster: ImageRaster): TextLine[] {
  return lines.map((line) => ({
    ...line,
    color: sampleTextColor(raster, line),
  }))
}

function sampleTextColor(raster: ImageRaster, box: Pick<RenderTextLine, 'left' | 'top' | 'width' | 'height'>) {
  const { pixels, info } = raster
  const startX = clamp(Math.floor(box.left), 0, Math.max(info.width - 1, 0))
  const startY = clamp(Math.floor(box.top), 0, Math.max(info.height - 1, 0))
  const endX = clamp(Math.ceil(box.left + box.width), startX + 1, info.width)
  const endY = clamp(Math.ceil(box.top + box.height), startY + 1, info.height)
  const stepX = Math.max(1, Math.floor((endX - startX) / 8))
  const stepY = Math.max(1, Math.floor((endY - startY) / 5))

  let best: { luminance: number; r: number; g: number; b: number } | null = null

  for (let y = startY; y < endY; y += stepY) {
    for (let x = startX; x < endX; x += stepX) {
      const index = (y * info.width + x) * info.channels
      const r = pixels[index] ?? 255
      const g = pixels[index + 1] ?? r
      const b = pixels[index + 2] ?? r
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b

      if (!best || luminance < best.luminance) {
        best = { luminance, r, g, b }
      }
    }
  }

  if (!best || best.luminance > 245) {
    return '#111111'
  }

  return rgbToHex(best.r, best.g, best.b)
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`
}

function getFontAscentRatio(fontFamily: string) {
  const cacheKey = fontFamily.toLowerCase()
  const cached = TEXT_ASCENT_CACHE.get(cacheKey)
  if (typeof cached === 'number') {
    return cached
  }

  const canvas = CanvasModule.createCanvas(256, 256)
  const context = canvas.getContext('2d')
  context.font = `100px ${fontFamily}`
  const metrics = context.measureText('Ag')
  const ascent = metrics.fontBoundingBoxAscent || metrics.actualBoundingBoxAscent || 0
  const descent = Math.abs(metrics.fontBoundingBoxDescent || metrics.actualBoundingBoxDescent || 0)
  const ratio =
    ascent > 0 ? clamp(ascent / Math.max(ascent + descent, 1), 0.45, 0.92) : DEFAULT_FONT_ASCENT_RATIO

  TEXT_ASCENT_CACHE.set(cacheKey, ratio)
  return ratio
}

function formatFontFamilyToken(token: string) {
  const genericFamilies = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui'])
  return genericFamilies.has(token.toLowerCase()) || !token.includes(' ') ? token : `'${token}'`
}

function isGenericFamily(token: string) {
  return new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui']).has(
    token.toLowerCase()
  )
}

function roundMetric(value: number, precision = 3) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

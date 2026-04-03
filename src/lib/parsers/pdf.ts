import sharp from 'sharp'
import path from 'path'
import os from 'os'
import { pathToFileURL } from 'url'
import * as CanvasModule from 'canvas'
import { EDITOR_FONT_CSS_IMPORT } from '@/lib/editor-fonts'
const TEXT_ASCENT_CACHE = new Map<string, number>()

const TESSDATA_CACHE = path.join(os.homedir(), '.skkf-tessdata')
const PDF_LAYOUT_SCALE = 2
const PDF_LAYOUT_CSS_SCALE = 96 / (72 * PDF_LAYOUT_SCALE)
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

interface TextVisualRaster {
  source: ImageRaster
  background: ImageRaster | null
  mask: Uint8Array
}

interface GraphicObject {
  id: string
  kind: 'shape'
  objectType: 'rect' | 'line'
  left: number
  top: number
  width: number
  height: number
  rotation: number
  fillColor?: string
  strokeColor?: string
  strokeWidth?: number
}

interface ExtractedGraphicLayer {
  objects: GraphicObject[]
  omittedOpIndexes: number[]
}

interface PageTextLayout {
  width: number
  height: number
  lines: TextLine[]
  objects: GraphicObject[]
  omittedGraphicOpIndexes: number[]
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
    warnings.push(`臾몄꽌媛 湲몄뼱 泥섏쓬 ${PDF_MAX_PAGES}?섏씠吏留?遺덈윭?붿뒿?덈떎.`)
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
      warnings.push(`珥?${pageCount}?섏씠吏媛 ?ㅼ틪 PDF濡?蹂댁뿬 OCR濡??몄떇?덉뒿?덈떎. 湲???꾩튂???먮낯怨??쎄컙 ?ㅻ? ???덉뒿?덈떎.`)
    } else if (ocrPageCount > 0) {
      warnings.push('?쇰? ?섏씠吏???띿뒪??異붿텧 ?덉쭏????븘 OCR濡??ㅼ떆 ?몄떇?덉뒿?덈떎.')
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

            let imageSrc: string | undefined
            let styledLines = layout.lines
            let pageObjects = layout.objects

            try {
              const visualBackgroundBuffer = await renderPageBackgroundToImage(
                page,
                pdfjsLib,
                PDF_LAYOUT_SCALE
              )
              if (raster && renderedBuffer) {
                try {
                  const backgroundRaster = await readImageRaster(visualBackgroundBuffer)
                  const textVisualRaster = buildTextVisualRaster(raster, backgroundRaster)
                  styledLines = applyVisualStylesToLines(layout.lines, textVisualRaster)
                } catch {
                  styledLines = applyVisualStylesToLines(layout.lines, raster)
                }
              } else if (raster) {
                styledLines = applyVisualStylesToLines(layout.lines, raster)
              }

              const editorBackgroundBuffer =
                layout.objects.length > 0 && layout.omittedGraphicOpIndexes.length > 0
                  ? await renderPageBackgroundToImage(
                      page,
                      pdfjsLib,
                      PDF_LAYOUT_SCALE,
                      new Set(layout.omittedGraphicOpIndexes)
                    )
                  : visualBackgroundBuffer
              imageSrc = `data:image/jpeg;base64,${editorBackgroundBuffer.toString('base64')}`
            } catch {
              if (raster) {
                styledLines = applyVisualStylesToLines(layout.lines, raster)
              }
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

            pageHtmls.push(
              buildScaledTextLayerPageHtml(styledLines, pageObjects, layout.width, layout.height, imageSrc, pageNumber)
            )
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
            buildScaledTextLayerPageHtml(
              lines,
              [],
              pageImage.info.width,
              pageImage.info.height,
              `data:image/jpeg;base64,${cleanedBuffer.toString('base64')}`,
              pageNumber
            )
          )
        } catch (error) {
          if (layout.lines.length > 0) {
            renderFallbackUsed = true
            pageHtmls.push(
              buildScaledTextLayerPageHtml(layout.lines, layout.objects, layout.width, layout.height, undefined, pageNumber)
            )
            continue
          }

          throw new Error(`PDF ?대?吏 蹂???ㅽ뙣: ${(error as Error).message}`)
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
      warnings.push('?쇰? ?섏씠吏??諛곌꼍 ?뚮뜑留곸씠 ?대젮???띿뒪???덉씠?대쭔 ?쒖떆?섍굅???꾩껜 ?뚮뜑 ?대?吏瑜??뺣━???ъ슜?덉뒿?덈떎.')
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
      let styledLines = layout.lines
      let pageObjects = layout.objects

      try {
        const renderedBuffer = await renderPageToImage(page, PDF_LAYOUT_SCALE)
        const raster = await readImageRaster(renderedBuffer)
        const visualBackgroundBuffer = await renderPageBackgroundToImage(page, pdfjsLib, PDF_LAYOUT_SCALE)

        try {
          const backgroundRaster = await readImageRaster(visualBackgroundBuffer)
          styledLines = applyVisualStylesToLines(layout.lines, buildTextVisualRaster(raster, backgroundRaster))
        } catch {
          styledLines = applyVisualStylesToLines(layout.lines, raster)
        }

        const editorBackgroundBuffer =
          layout.objects.length > 0 && layout.omittedGraphicOpIndexes.length > 0
            ? await renderPageBackgroundToImage(
                page,
                pdfjsLib,
                PDF_LAYOUT_SCALE,
                new Set(layout.omittedGraphicOpIndexes)
              )
            : visualBackgroundBuffer
        imageSrc = `data:image/jpeg;base64,${editorBackgroundBuffer.toString('base64')}`
      } catch {
        try {
          const renderedBuffer = await renderPageToImage(page, PDF_LAYOUT_SCALE)
          styledLines = await enrichSelectableLinesWithRenderedStyles(
            layout.lines,
            `data:image/png;base64,${renderedBuffer.toString('base64')}`
          ).catch(() => layout.lines)
          const cleanedBuffer = await createCleanedBackgroundFromLines(
            renderedBuffer,
            layout.width,
            layout.height,
            styledLines
          )
          imageSrc = `data:image/jpeg;base64,${cleanedBuffer.toString('base64')}`
        } catch {
          renderFallbackUsed = true
        }
      } finally {
        page.cleanup()
      }

      pageHtmls.push(
        buildScaledTextLayerPageHtml(styledLines, pageObjects, layout.width, layout.height, imageSrc, pageNumber)
      )
    }

    if (renderFallbackUsed) {
      warnings.push('?쇰? PDF ?붿냼瑜?諛곌꼍 ?대?吏濡??뚮뜑留곹븯吏 紐삵빐 ?띿뒪???덉씠?대쭔 ?쒖떆?덉뒿?덈떎.')
    }

    return {
      html: wrapPdfHtml(pageHtmls.join('\n')),
      warnings,
      pageCount,
      isScanned: false,
    }
  }

  warnings.push(`珥?${pageCount}?섏씠吏???ㅼ틪 PDF濡?蹂댁엯?덈떎. OCR 寃곌낵??湲???꾩튂媛 ?쇰? ?щ씪吏????덉뒿?덈떎.`)

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
      warnings.push('PDF 諛곌꼍 ?대?吏瑜?留뚮뱾吏 紐삵빐 諛곌꼍 ?놁씠 ?띿뒪???덉씠?대쭔 ?쒖떆?덉뒿?덈떎.')
      return {
        html: wrapPdfHtml(
          layouts.map((layout, index) =>
            buildScaledTextLayerPageHtml(layout.lines, layout.objects, layout.width, layout.height, undefined, index + 1)
          ).join('\n')
        ),
        warnings,
        pageCount,
        isScanned: false,
      }
    }

    throw new Error(`PDF ?대?吏 蹂???ㅽ뙣: ${(error as Error).message}`)
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
        buildScaledTextLayerPageHtml(
          lines,
          [],
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

async function renderPageBackgroundToImage(
  page: any,
  pdfjsLib: PdfJsLib,
  scale: number,
  omittedOpIndexes = new Set<number>()
): Promise<Buffer> {
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

    const filteredOperatorList = filterTextOperators(operatorList, pdfjsLib, omittedOpIndexes)

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
  const graphicLayer = await extractGraphicObjects(page, pdfjsLib, viewport)
  const styles = (textContent as any).styles || {}

  const fragments = textContent.items
    .filter((item: any) => typeof item?.str === 'string')
    .map((item: any) => createTextFragment(item, viewport, styles, pdfjsLib))
    .filter((item: TextFragment) => item.text.length > 0)

  const lines = mergeFragmentsIntoLines(fragments)

  return {
    width: Math.ceil(viewport.width),
    height: Math.ceil(viewport.height),
    lines,
    objects: graphicLayer.objects,
    omittedGraphicOpIndexes: graphicLayer.omittedOpIndexes,
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
  const text = String(item.str || '').replace(/\u0000+/g, ' ')
  const transformed = normalizeTransformMatrix(pdfjsLib.Util.transform(viewport.transform, item.transform))
  const horizontalScale = safeHypot(transformed[0], transformed[1], estimateTextWidth(text, 10))
  const verticalScale = safeHypot(
    transformed[2],
    transformed[3],
    Math.max(getFiniteNumber(item.height, 8) * getFiniteNumber(viewport.scale, 1), 8)
  )
  const style = styles[item.fontName] || {}
  const fontSignature = [style.fontFamily, style.loadedName, style.fontSubstitution, style.fallbackName, item.fontName]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(', ')
  const normalizedFontFamily = normalizeFontFamily(fontSignature || style.fontFamily, text)
  const { fontWeight, fontStyle } = inferFontPresentation(item.fontName, fontSignature || style.fontFamily)
  const fontSize = clamp(Math.max(verticalScale, 8), 8, Math.max(viewport.width, viewport.height))
  const measuredAscentRatio = getFontAscentRatio(normalizedFontFamily)
  const styleAscentRatio =
    isFiniteNumber(style.ascent) ? clamp(style.ascent, 0.45, 0.95) : measuredAscentRatio
  const ascentRatio = clamp((measuredAscentRatio * 0.7 + styleAscentRatio * 0.3), 0.45, 0.92)
  const descentRatio =
    isFiniteNumber(style.descent)
      ? clamp(Math.abs(style.descent), 0.08, 0.45)
      : clamp(1 - ascentRatio, 0.08, 0.45)
  let angle = Math.atan2(transformed[1], transformed[0])
  if (style.vertical) {
    angle += Math.PI / 2
  }
  const rawHeight = Math.max(getFiniteNumber(item.height, fontSize / Math.max(getFiniteNumber(viewport.scale, 1), 1)), 0)
  const rawWidth = Math.max(getFiniteNumber(item.width, 0), 0)
  const lineHeight = Math.max(rawHeight * getFiniteNumber(viewport.scale, 1), fontSize * (ascentRatio + descentRatio), 10)
  const width = Math.max(rawWidth * getFiniteNumber(viewport.scale, 1), estimateTextWidth(text, horizontalScale || fontSize))
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
    spaceWidth: clamp(avgGlyphWidth * 0.42, fontSize * 0.16, fontSize * 0.55),
    color: '#111111',
    layoutMode: 'pdfjs',
    transform: transformed,
    targetWidth: Math.max((style.vertical ? rawHeight : rawWidth) * getFiniteNumber(viewport.scale, 1), 1),
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

function mergeFragmentsIntoLines(fragments: TextFragment[]): TextLine[] {
  return [...fragments]
    .filter((fragment) => fragment.text.trim().length > 0)
    .sort((a, b) => {
      if (Math.abs(a.baseline - b.baseline) > 1.5) return a.baseline - b.baseline
      return a.left - b.left
    })
    .map((fragment) => normalizeTextLine(fragmentToLine(fragment)))
}

async function createCleanedBackgroundFromLines(
  imageBuffer: Buffer,
  width: number,
  height: number,
  lines: Array<Pick<RenderTextLine, 'left' | 'top' | 'width' | 'height' | 'fontSize'> & { baseline?: number }>
) {
  const maskRects = lines
    .map((line) => {
      const fontSize = Math.max(getFiniteNumber(line.fontSize, line.height * 0.82), 1)
      const baseline = getFiniteNumber(line.baseline, line.top + Math.min(line.height, fontSize * 0.8))
      const padX = Math.max(1, Math.min(2.5, fontSize * 0.08))
      const padTop = Math.max(1, Math.min(2, fontSize * 0.06))
      const padBottom = Math.max(0.75, Math.min(1.5, fontSize * 0.04))
      const glyphTop = Math.max(line.top, baseline - fontSize * 0.94)
      const glyphBottom = Math.min(line.top + line.height, baseline + fontSize * 0.18)
      const left = Math.max(0, Math.floor(line.left - padX))
      const top = Math.max(0, Math.floor(glyphTop - padTop))
      const rectWidth = Math.min(width - left, Math.ceil(line.width + padX * 2))
      const rectHeight = Math.min(height - top, Math.ceil(Math.max(glyphBottom - glyphTop, 1) + padTop + padBottom))
      return `<rect x="${left}" y="${top}" width="${rectWidth}" height="${rectHeight}" rx="${Math.min(2, rectHeight / 4)}" ry="${Math.min(2, rectHeight / 4)}" fill="white" />`
    })
    .join('')

  const flattened = await sharp(imageBuffer)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .png()
    .toBuffer()

  if (!maskRects) {
    return sharp(flattened)
      .jpeg({ quality: 88 })
      .toBuffer()
  }

  const maskSvg = Buffer.from(
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="black" />
      ${maskRects}
    </svg>`
  )

  const maskBuffer = await sharp(maskSvg)
    .resize(width, height)
    .removeAlpha()
    .extractChannel(0)
    .blur(1.2)
    .toBuffer()

  const blurredOverlay = await sharp(flattened)
    .blur(10)
    .joinChannel(maskBuffer)
    .png()
    .toBuffer()

  return sharp(flattened)
    .composite([{ input: blurredOverlay }])
    .jpeg({ quality: 88 })
    .toBuffer()
}

function filterTextOperators(operatorList: any, pdfjsLib: PdfJsLib, omittedOpIndexes = new Set<number>()) {
  const textOps = new Set<number>(
    PDF_TEXT_OP_NAMES
      .map((name) => pdfjsLib.OPS[name])
      .filter((value): value is number => typeof value === 'number')
  )

  const fnArray: number[] = []
  const argsArray: any[] = []

  for (let index = 0; index < operatorList.fnArray.length; index += 1) {
    if (omittedOpIndexes.has(index)) continue
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

async function extractGraphicObjects(page: any, pdfjsLib: PdfJsLib, viewport: any): Promise<ExtractedGraphicLayer> {
  const operatorList = await page.getOperatorList({
    intent: 'display',
    annotationMode: pdfjsLib.AnnotationMode.DISABLE,
  })

  const objects: GraphicObject[] = []
  const omittedOpIndexes = new Set<number>()
  const baseTransform = normalizeTransformMatrix(viewport.transform)
  const stack: Array<{
    ctm: [number, number, number, number, number, number]
    strokeColor: string
    fillColor: string
    lineWidth: number
  }> = []

  let state = {
    ctm: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number],
    strokeColor: '#111111',
    fillColor: '#111111',
    lineWidth: 1,
  }
  let pendingPath: Array<{ type: 'rect' | 'line'; x1: number; y1: number; x2?: number; y2?: number; width?: number; height?: number }> = []
  let pendingConstructIndex = -1

  const commitPath = (mode: 'fill' | 'stroke' | 'fillStroke', opIndex: number) => {
    if (pendingPath.length === 0 || pendingConstructIndex < 0) return

    const transform = normalizeTransformMatrix(pdfjsLib.Util.transform(baseTransform, state.ctm))
    const scaleX = Math.max(safeHypot(transform[0], transform[1], 1), 0.001)
    const scaleY = Math.max(safeHypot(transform[2], transform[3], 1), 0.001)
    const strokeWidth = Math.max(state.lineWidth * ((scaleX + scaleY) / 2), 1)

    for (const segment of pendingPath) {
      if (segment.type === 'rect' && typeof segment.width === 'number' && typeof segment.height === 'number') {
        const bbox = getTransformedBoundingBox(
          transform,
          segment.x1,
          segment.y1,
          segment.x1 + segment.width,
          segment.y1 + segment.height
        )
        if (!bbox) continue

        objects.push({
          id: `shape-${pendingConstructIndex}-${objects.length}`,
          kind: 'shape',
          objectType: 'rect',
          left: bbox.left,
          top: bbox.top,
          width: bbox.width,
          height: bbox.height,
          rotation: 0,
          fillColor: mode === 'stroke' ? 'transparent' : state.fillColor,
          strokeColor: mode === 'fill' ? undefined : state.strokeColor,
          strokeWidth: mode === 'fill' ? 0 : strokeWidth,
        })
        continue
      }

      if (segment.type === 'line' && typeof segment.x2 === 'number' && typeof segment.y2 === 'number') {
        const start = applyMatrixToPoint(transform, segment.x1, segment.y1)
        const end = applyMatrixToPoint(transform, segment.x2, segment.y2)
        const dx = end.x - start.x
        const dy = end.y - start.y
        const length = Math.max(Math.hypot(dx, dy), 1)
        const rotation = roundMetric((Math.atan2(dy, dx) * 180) / Math.PI, 2)
        const top = Math.min(start.y, end.y) - strokeWidth / 2
        const left = Math.min(start.x, end.x)
        const centerX = (start.x + end.x) / 2
        const centerY = (start.y + end.y) / 2

        objects.push({
          id: `shape-${pendingConstructIndex}-${objects.length}`,
          kind: 'shape',
          objectType: 'line',
          left: centerX - length / 2,
          top: centerY - strokeWidth / 2,
          width: length,
          height: strokeWidth,
          rotation,
          fillColor: state.strokeColor,
          strokeWidth: 0,
        })
      }
    }

    omittedOpIndexes.add(pendingConstructIndex)
    omittedOpIndexes.add(opIndex)
    pendingPath = []
    pendingConstructIndex = -1
  }

  for (let index = 0; index < operatorList.fnArray.length; index += 1) {
    const fn = operatorList.fnArray[index]
    const args = operatorList.argsArray[index]

    switch (fn) {
      case pdfjsLib.OPS.save:
        stack.push({
          ctm: [...state.ctm] as [number, number, number, number, number, number],
          strokeColor: state.strokeColor,
          fillColor: state.fillColor,
          lineWidth: state.lineWidth,
        })
        break
      case pdfjsLib.OPS.restore: {
        const previous = stack.pop()
        if (previous) {
          state = previous
        }
        break
      }
      case pdfjsLib.OPS.transform:
        if (Array.isArray(args) && args.length === 6) {
          state.ctm = normalizeTransformMatrix(pdfjsLib.Util.transform(state.ctm, args))
        }
        break
      case pdfjsLib.OPS.setLineWidth:
        state.lineWidth = Math.max(getFiniteNumber(args?.[0], state.lineWidth), 0.25)
        break
      case pdfjsLib.OPS.setStrokeRGBColor:
        state.strokeColor = rgbToHex((args?.[0] ?? 0) * 255, (args?.[1] ?? 0) * 255, (args?.[2] ?? 0) * 255)
        break
      case pdfjsLib.OPS.setFillRGBColor:
        state.fillColor = rgbToHex((args?.[0] ?? 0) * 255, (args?.[1] ?? 0) * 255, (args?.[2] ?? 0) * 255)
        break
      case pdfjsLib.OPS.setStrokeGray: {
        const value = clamp((args?.[0] ?? 0) * 255, 0, 255)
        state.strokeColor = rgbToHex(value, value, value)
        break
      }
      case pdfjsLib.OPS.setFillGray: {
        const value = clamp((args?.[0] ?? 0) * 255, 0, 255)
        state.fillColor = rgbToHex(value, value, value)
        break
      }
      case pdfjsLib.OPS.constructPath: {
        const [ops, pathArgs] = Array.isArray(args) ? args : [[], []]
        pendingPath = parseGraphicPath(ops, pathArgs, pdfjsLib)
        pendingConstructIndex = index
        break
      }
      case pdfjsLib.OPS.stroke:
      case pdfjsLib.OPS.closeStroke:
        commitPath('stroke', index)
        break
      case pdfjsLib.OPS.fill:
      case pdfjsLib.OPS.eoFill:
        commitPath('fill', index)
        break
      case pdfjsLib.OPS.fillStroke:
      case pdfjsLib.OPS.eoFillStroke:
      case pdfjsLib.OPS.closeFillStroke:
      case pdfjsLib.OPS.closeEOFillStroke:
        commitPath('fillStroke', index)
        break
      case pdfjsLib.OPS.endPath:
        pendingPath = []
        pendingConstructIndex = -1
        break
    }
  }

  return {
    objects: objects.filter((object) => object.width >= 1 && object.height >= 1),
    omittedOpIndexes: [...omittedOpIndexes],
  }
}

function parseGraphicPath(ops: any, pathArgs: any, pdfjsLib: PdfJsLib) {
  const parsed: Array<{ type: 'rect' | 'line'; x1: number; y1: number; x2?: number; y2?: number; width?: number; height?: number }> = []
  const opList = Array.isArray(ops) ? ops : []
  const argList = Array.isArray(pathArgs) ? pathArgs : []
  let cursor = 0
  let currentPoint: { x: number; y: number } | null = null
  let subpathStart: { x: number; y: number } | null = null

  for (const op of opList) {
    switch (op) {
      case pdfjsLib.OPS.rectangle: {
        const x = getFiniteNumber(argList[cursor], 0)
        const y = getFiniteNumber(argList[cursor + 1], 0)
        const width = getFiniteNumber(argList[cursor + 2], 0)
        const height = getFiniteNumber(argList[cursor + 3], 0)
        cursor += 4
        parsed.push({ type: 'rect', x1: x, y1: y, width, height })
        currentPoint = { x, y }
        subpathStart = { x, y }
        break
      }
      case pdfjsLib.OPS.moveTo: {
        const x = getFiniteNumber(argList[cursor], 0)
        const y = getFiniteNumber(argList[cursor + 1], 0)
        cursor += 2
        currentPoint = { x, y }
        subpathStart = { x, y }
        break
      }
      case pdfjsLib.OPS.lineTo: {
        const x = getFiniteNumber(argList[cursor], 0)
        const y = getFiniteNumber(argList[cursor + 1], 0)
        cursor += 2
        if (currentPoint) {
          parsed.push({ type: 'line', x1: currentPoint.x, y1: currentPoint.y, x2: x, y2: y })
        }
        currentPoint = { x, y }
        break
      }
      case pdfjsLib.OPS.closePath:
        if (currentPoint && subpathStart) {
          parsed.push({ type: 'line', x1: currentPoint.x, y1: currentPoint.y, x2: subpathStart.x, y2: subpathStart.y })
          currentPoint = { ...subpathStart }
        }
        break
      case pdfjsLib.OPS.curveTo:
        cursor += 6
        break
      case pdfjsLib.OPS.curveTo2:
      case pdfjsLib.OPS.curveTo3:
        cursor += 4
        break
      default:
        break
    }
  }

  return parsed
}

function applyMatrixToPoint(transform: [number, number, number, number, number, number], x: number, y: number) {
  return {
    x: transform[0] * x + transform[2] * y + transform[4],
    y: transform[1] * x + transform[3] * y + transform[5],
  }
}

function getTransformedBoundingBox(
  transform: [number, number, number, number, number, number],
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  const points = [
    applyMatrixToPoint(transform, x1, y1),
    applyMatrixToPoint(transform, x2, y1),
    applyMatrixToPoint(transform, x1, y2),
    applyMatrixToPoint(transform, x2, y2),
  ]

  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  const right = Math.max(...xs)
  const bottom = Math.max(...ys)
  if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) {
    return null
  }

  return {
    left,
    top,
    width: Math.max(right - left, 1),
    height: Math.max(bottom - top, 1),
  }
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
      color: sampleTextColor(raster, {
        left: row.left,
        top: row.top,
        width: row.width,
        height: row.height,
        fontSize: Math.max(row.height * 0.85, 8),
      }),
    }))
}

function buildTextLayerPageHtml(
  lines: RenderTextLine[],
  objects: GraphicObject[],
  width: number,
  height: number,
  imageSrc: string | undefined,
  pageNumber: number
) {
  const objectElements = objects.map((object) => buildGraphicObjectHtml(object)).join('')
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
            letter-spacing:0;
            font-kerning:normal;
            font-variant-ligatures:none;
            font-feature-settings:'liga' 0, 'clig' 0, 'dlig' 0, 'kern' 1;
            font-synthesis:none;
            text-rendering:geometricPrecision;
            transform-origin:top left;
            outline:none;
            z-index:2;
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
      ${objectElements}
      ${lineElements}
    </div>
  `
}

function buildScaledTextLayerPageHtml(
  lines: RenderTextLine[],
  objects: GraphicObject[],
  width: number,
  height: number,
  imageSrc: string | undefined,
  pageNumber: number
) {
  return buildTextLayerPageHtml(
    lines.map((line) => scaleRenderLineForCss(line)),
    objects.map((object) => scaleGraphicObjectForCss(object)),
    scalePdfMetric(width, 2),
    scalePdfMetric(height, 2),
    imageSrc,
    pageNumber
  )
}

function buildGraphicObjectHtml(object: GraphicObject) {
  const strokeWidth = Math.max(getFiniteNumber(object.strokeWidth, 0), 0)
  const hasStroke = Boolean(object.strokeColor) && strokeWidth > 0
  const suppressWhiteFill = object.objectType === 'rect' && isNearWhiteColor(object.fillColor)
  const fillColor =
    object.objectType === 'line'
      ? object.strokeColor || '#111111'
      : suppressWhiteFill
        ? 'transparent'
        : object.fillColor && object.fillColor !== 'transparent'
          ? object.fillColor
          : 'transparent'
  const borderStyle =
    object.objectType === 'line' || !hasStroke
      ? 'none'
      : `${roundMetric(strokeWidth, 2)}px solid ${object.strokeColor}`
  const rotationStyle = Math.abs(object.rotation) > 0.01 ? `rotate(${roundMetric(object.rotation, 2)}deg)` : 'none'

  return `
    <div
      data-layout-object="true"
      data-layout-object-id="${escapeHtml(object.id)}"
      data-layout-object-type="${object.objectType}"
      tabindex="0"
      contenteditable="false"
      style="
        position:absolute;
        left:${roundMetric(object.left, 2)}px;
        top:${roundMetric(object.top, 2)}px;
        width:${roundMetric(Math.max(object.width, 1), 2)}px;
        height:${roundMetric(Math.max(object.height, 1), 2)}px;
        background:${fillColor};
        border:${borderStyle};
        transform:${rotationStyle};
        transform-origin:center center;
        box-sizing:border-box;
        cursor:move;
        z-index:1;
        overflow:visible;
        user-select:none;
      "
    ></div>
  `
}

function wrapPdfHtml(content: string) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <style>
    ${EDITOR_FONT_CSS_IMPORT}
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      background: #f3f4f6;
      font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
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
    [data-layout-object="true"] {
      outline: none;
    }
    [data-layout-object="true"][data-layout-selected="true"] {
      box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.55);
    }
    [data-layout-runtime="true"] {
      position: absolute;
      inset: auto;
      z-index: 5;
      pointer-events: auto;
    }
    .layout-object-handle {
      width: 10px;
      height: 10px;
      border-radius: 9999px;
      background: #2563eb;
      border: 2px solid white;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.25);
    }
    .layout-object-handle[data-handle="nw"] { left: -5px; top: -5px; cursor: nwse-resize; }
    .layout-object-handle[data-handle="ne"] { right: -5px; top: -5px; cursor: nesw-resize; }
    .layout-object-handle[data-handle="sw"] { left: -5px; bottom: -5px; cursor: nesw-resize; }
    .layout-object-handle[data-handle="se"] { right: -5px; bottom: -5px; cursor: nwse-resize; }
    [data-layout-editable="true"] {
      z-index: 2;
      caret-color: #111827;
    }
    [data-layout-editable="true"]:hover {
      background: transparent;
      border-radius: 2px;
      box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.18);
    }
    [data-layout-editable="true"]:focus {
      background: transparent;
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

      function getTextProfile(text) {
        const compact = (text || '').replace(/\s+/g, '')
        return {
          visibleCount: Array.from(compact).length,
          hangulCount: (compact.match(/[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7A3]/gu) || []).length,
          latinCount: (compact.match(/[A-Za-z]/g) || []).length,
        }
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
        const profile = getTextProfile(text)
        const transforms = []
        element.style.letterSpacing = '0px'
        const naturalWidth = measureTextWidth(element)
        let fittedWidth = naturalWidth

        if (targetWidth > 0 && naturalWidth > 0 && profile.visibleCount > 1) {
          const delta = targetWidth - naturalWidth
          const spacingSlots = Math.max(profile.visibleCount - 1, 1)
          const prefersHangulSpacing = profile.hangulCount > profile.latinCount
          const maxPositiveSpacing = prefersHangulSpacing ? fontSize * 0.08 : fontSize * 0.16
          const maxNegativeSpacing = Math.min(fontSize * 0.03, 1.2)
          let letterSpacing = 0

          if (delta > 0.5) {
            letterSpacing = clamp(delta / spacingSlots, 0, maxPositiveSpacing)
          } else if (delta < -0.5 && Math.abs(delta) <= spacingSlots * maxNegativeSpacing * 1.25) {
            letterSpacing = clamp(delta / spacingSlots, -maxNegativeSpacing, 0)
          }

          if (Math.abs(letterSpacing) > 0.001) {
            element.style.letterSpacing = letterSpacing.toFixed(3) + 'px'
            fittedWidth = naturalWidth + letterSpacing * spacingSlots
          }
        }

        const prefersHangulScale = profile.hangulCount > profile.latinCount
        const minScaleX = profile.visibleCount <= 1 ? 0.72 : prefersHangulScale ? 0.88 : 0.82
        const maxScaleX = profile.visibleCount <= 1 ? 1.45 : prefersHangulScale ? 1.18 : 1.28
        const scaleX =
          targetWidth > 0 && fittedWidth > 0 ? clamp(targetWidth / fittedWidth, minScaleX, maxScaleX) : 1

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

      function isLayoutObject(target) {
        return target instanceof HTMLElement && target.matches('[data-layout-object="true"]')
      }

      function clearObjectSelection() {
        document.querySelectorAll('[data-layout-object="true"][data-layout-selected="true"]').forEach((element) => {
          element.removeAttribute('data-layout-selected')
          element.querySelectorAll('[data-layout-runtime="true"]').forEach((runtimeNode) => runtimeNode.remove())
        })
      }

      function ensureObjectHandles(element) {
        if (!(element instanceof HTMLElement)) return
        if (element.querySelector('[data-layout-runtime="true"]')) return

        ;['nw', 'ne', 'sw', 'se'].forEach((handle) => {
          const knob = document.createElement('div')
          knob.dataset.layoutRuntime = 'true'
          knob.dataset.handle = handle
          knob.className = 'layout-object-handle'
          element.appendChild(knob)
        })
      }

      function selectObject(element) {
        if (!(element instanceof HTMLElement)) return
        clearObjectSelection()
        element.dataset.layoutSelected = 'true'
        ensureObjectHandles(element)
        element.focus({ preventScroll: true })
      }

      function getSelectedObject() {
        const selected = document.querySelector('[data-layout-object="true"][data-layout-selected="true"]')
        return selected instanceof HTMLElement ? selected : null
      }

      let pointerState = null

      document.addEventListener('pointerdown', (event) => {
        const target = event.target
        if (!(target instanceof HTMLElement)) return

        const handle = target.closest('[data-layout-runtime="true"][data-handle]')
        const objectElement = handle?.parentElement || target.closest('[data-layout-object="true"]')
        if (!isLayoutObject(objectElement)) {
          clearObjectSelection()
          return
        }

        const element = objectElement
        selectObject(element)
        event.preventDefault()

        const rect = element.getBoundingClientRect()
        pointerState = {
          pointerId: event.pointerId,
          mode: handle instanceof HTMLElement ? 'resize' : 'drag',
          handle: handle instanceof HTMLElement ? handle.dataset.handle || 'se' : null,
          startX: event.clientX,
          startY: event.clientY,
          left: parseFloat(element.style.left || '0') || 0,
          top: parseFloat(element.style.top || '0') || 0,
          width: parseFloat(element.style.width || '0') || rect.width,
          height: parseFloat(element.style.height || '0') || rect.height,
        }

        if (typeof element.setPointerCapture === 'function') {
          element.setPointerCapture(event.pointerId)
        }
      }, true)

      document.addEventListener('pointermove', (event) => {
        if (!pointerState || event.pointerId !== pointerState.pointerId) return
        const element = getSelectedObject()
        if (!element) return

        const dx = event.clientX - pointerState.startX
        const dy = event.clientY - pointerState.startY

        if (pointerState.mode === 'drag') {
          element.style.left = (pointerState.left + dx).toFixed(2) + 'px'
          element.style.top = (pointerState.top + dy).toFixed(2) + 'px'
          return
        }

        let nextLeft = pointerState.left
        let nextTop = pointerState.top
        let nextWidth = pointerState.width
        let nextHeight = pointerState.height
        const handle = pointerState.handle || 'se'

        if (handle.includes('e')) {
          nextWidth = Math.max(1, pointerState.width + dx)
        }
        if (handle.includes('s')) {
          nextHeight = Math.max(1, pointerState.height + dy)
        }
        if (handle.includes('w')) {
          nextLeft = pointerState.left + dx
          nextWidth = Math.max(1, pointerState.width - dx)
        }
        if (handle.includes('n')) {
          nextTop = pointerState.top + dy
          nextHeight = Math.max(1, pointerState.height - dy)
        }

        element.style.left = nextLeft.toFixed(2) + 'px'
        element.style.top = nextTop.toFixed(2) + 'px'
        element.style.width = nextWidth.toFixed(2) + 'px'
        element.style.height = nextHeight.toFixed(2) + 'px'
      }, true)

      document.addEventListener('pointerup', (event) => {
        if (!pointerState || event.pointerId !== pointerState.pointerId) return
        pointerState = null
      }, true)

      document.addEventListener('keydown', (event) => {
        const active = document.activeElement
        if (active instanceof HTMLElement && active.matches('[data-layout-editable="true"]')) return

        const selected = getSelectedObject()
        if (!selected) return

        if (event.key === 'Escape') {
          clearObjectSelection()
          return
        }

        if (event.key === 'Backspace' || event.key === 'Delete') {
          event.preventDefault()
          selected.remove()
          return
        }

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
          event.preventDefault()
          const clone = selected.cloneNode(true)
          if (clone instanceof HTMLElement) {
            clearObjectSelection()
            clone.removeAttribute('data-layout-selected')
            clone.querySelectorAll('[data-layout-runtime="true"]').forEach((runtimeNode) => runtimeNode.remove())
            clone.style.left = ((parseFloat(selected.style.left || '0') || 0) + 12).toFixed(2) + 'px'
            clone.style.top = ((parseFloat(selected.style.top || '0') || 0) + 12).toFixed(2) + 'px'
            selected.parentElement?.appendChild(clone)
            selectObject(clone)
          }
          return
        }

        const step = event.shiftKey ? 10 : 1
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          selected.style.left = ((parseFloat(selected.style.left || '0') || 0) - step).toFixed(2) + 'px'
        } else if (event.key === 'ArrowRight') {
          event.preventDefault()
          selected.style.left = ((parseFloat(selected.style.left || '0') || 0) + step).toFixed(2) + 'px'
        } else if (event.key === 'ArrowUp') {
          event.preventDefault()
          selected.style.top = ((parseFloat(selected.style.top || '0') || 0) - step).toFixed(2) + 'px'
        } else if (event.key === 'ArrowDown') {
          event.preventDefault()
          selected.style.top = ((parseFloat(selected.style.top || '0') || 0) + step).toFixed(2) + 'px'
        }
      }, true)

      window.__skkfSyncEditableWidth = syncEditableWidth
      window.__skkfSyncAllEditableWidths = syncAllEditableWidths

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
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.min(Math.max(value, min), max)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function getFiniteNumber(value: unknown, fallback: number) {
  return isFiniteNumber(value) ? value : fallback
}

function safeHypot(a: unknown, b: unknown, fallback: number) {
  const result = Math.hypot(getFiniteNumber(a, 0), getFiniteNumber(b, 0))
  return result > 0 ? result : fallback
}

function normalizeTransformMatrix(transform: unknown): [number, number, number, number, number, number] {
  const source = Array.isArray(transform) ? transform : []
  return [
    getFiniteNumber(source[0], 1),
    getFiniteNumber(source[1], 0),
    getFiniteNumber(source[2], 0),
    getFiniteNumber(source[3], 1),
    getFiniteNumber(source[4], 0),
    getFiniteNumber(source[5], 0),
  ]
}

function scaleRenderLineForCss(line: RenderTextLine): RenderTextLine {
  const scaledTransform =
    Array.isArray(line.transform) && line.transform.length === 6
      ? normalizeTransformMatrix(line.transform).map((value) => scalePdfMetric(value, 4)) as [
          number,
          number,
          number,
          number,
          number,
          number,
        ]
      : undefined

  return {
    ...line,
    left: scalePdfMetric(line.left, 2),
    top: scalePdfMetric(line.top, 2),
    width: scalePdfMetric(line.width, 2),
    height: scalePdfMetric(line.height, 2),
    fontSize: scalePdfMetric(line.fontSize, 2),
    baseline: typeof line.baseline === 'number' ? scalePdfMetric(line.baseline, 2) : line.baseline,
    anchorLeft: typeof line.anchorLeft === 'number' ? scalePdfMetric(line.anchorLeft, 2) : line.anchorLeft,
    anchorTop: typeof line.anchorTop === 'number' ? scalePdfMetric(line.anchorTop, 2) : line.anchorTop,
    lineHeight: typeof line.lineHeight === 'number' ? scalePdfMetric(line.lineHeight, 2) : line.lineHeight,
    spaceWidth: typeof line.spaceWidth === 'number' ? scalePdfMetric(line.spaceWidth, 2) : line.spaceWidth,
    transform: scaledTransform,
    targetWidth: typeof line.targetWidth === 'number' ? scalePdfMetric(line.targetWidth, 2) : line.targetWidth,
  }
}

function scaleGraphicObjectForCss(object: GraphicObject): GraphicObject {
  return {
    ...object,
    left: scalePdfMetric(object.left, 2),
    top: scalePdfMetric(object.top, 2),
    width: scalePdfMetric(object.width, 2),
    height: scalePdfMetric(object.height, 2),
    strokeWidth: typeof object.strokeWidth === 'number' ? scalePdfMetric(object.strokeWidth, 2) : object.strokeWidth,
  }
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
  return normalizeTextLine({
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
  })
}

function normalizeTextLine(line: TextLine, forceAbsolute = false): TextLine {
  const fontSize = Math.max(getFiniteNumber(line.fontSize, 12), 1)
  const lineHeight = Math.max(getFiniteNumber(line.lineHeight, fontSize * 1.25), fontSize, 1)
  const width = Math.max(getFiniteNumber(line.width, estimateTextWidth(line.text, fontSize)), 1)
  const height = Math.max(getFiniteNumber(line.height, lineHeight), 1)
  const left = getFiniteNumber(line.left, getFiniteNumber(line.anchorLeft, 0))
  const top = getFiniteNumber(
    line.top,
    getFiniteNumber(line.anchorTop, lineHeight) - Math.min(fontSize * DEFAULT_FONT_ASCENT_RATIO, lineHeight)
  )
  const baseline = getFiniteNumber(line.baseline, top + height)
  const anchorLeft = getFiniteNumber(line.anchorLeft, left)
  const anchorTop = getFiniteNumber(line.anchorTop, baseline)
  const angle = getFiniteNumber(line.angle, 0)
  const spaceWidth = Math.max(getFiniteNumber(line.spaceWidth, fontSize * 0.3), 1)
  const hasValidTransform =
    Array.isArray(line.transform) &&
    line.transform.length === 6 &&
    line.transform.every((value) => Number.isFinite(value))
  const layoutMode = forceAbsolute || !hasValidTransform ? 'absolute' : line.layoutMode

  return {
    ...line,
    left: roundMetric(left),
    top: roundMetric(top),
    width: roundMetric(width),
    height: roundMetric(height),
    fontSize: roundMetric(fontSize, 2),
    baseline: roundMetric(baseline),
    anchorLeft: roundMetric(anchorLeft),
    anchorTop: roundMetric(anchorTop),
    lineHeight: roundMetric(lineHeight, 2),
    angle: roundMetric(angle, 2),
    spaceWidth: roundMetric(spaceWidth, 2),
    layoutMode,
    transform:
      layoutMode === 'pdfjs' && hasValidTransform
        ? normalizeTransformMatrix(line.transform).map((value) => roundMetric(value, 4)) as [
            number,
            number,
            number,
            number,
            number,
            number,
          ]
        : undefined,
    targetWidth: roundMetric(
      Math.max(getFiniteNumber(layoutMode === 'pdfjs' ? line.targetWidth : width, width), 1),
      2
    ),
  }
}

function normalizeFontFamily(fontFamily: unknown, sampleText = '') {
  const prefersHangul = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7A3]/u.test(sampleText)

  if (typeof fontFamily !== 'string') {
    return getFallbackFontStack('sans-serif', prefersHangul).map(formatFontFamilyToken).join(', ')
  }

  const families = fontFamily
    .split(',')
    .map((token) =>
      normalizeKnownFontFamily(
        token.replace(/["']/g, '').replace(/[^\p{L}\p{N}\s_-]/gu, ' ').replace(/\s+/g, ' ').trim()
      )
    )
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
        ? ['Batang', '바탕', 'Nanum Myeongjo', '나눔명조', 'Noto Serif KR', 'Times New Roman', 'serif']
        : ['Cambria', 'Times New Roman', 'Georgia', 'serif']
    case 'monospace':
      return ['Consolas', 'Courier New', 'monospace']
    case 'system-ui':
      return prefersHangul
        ? ['Malgun Gothic', '맑은 고딕', 'Apple SD Gothic Neo', 'Noto Sans KR', 'system-ui']
        : ['Aptos', 'Calibri', 'Segoe UI', 'Arial', 'system-ui']
    case 'cursive':
    case 'fantasy':
      return [genericFamily]
    default:
      return prefersHangul
        ? ['Malgun Gothic', '맑은 고딕', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Nanum Gothic', '나눔고딕', 'sans-serif']
        : ['Aptos', 'Calibri', 'Segoe UI', 'Arial', 'Helvetica Neue', 'sans-serif']
  }
}
function matchPreferredKoreanFontFamily(normalized: string) {
  if (/(gungsuh|gungseo|hygungso)/.test(normalized)) return 'Gungsuh'
  if (/(batang|myeongjo|hysmyeongjo|hymyeongjo)/.test(normalized)) return 'Batang'
  if (/(dotum)/.test(normalized)) return 'Dotum'
  if (/(gulim)/.test(normalized)) return 'Gulim'
  if (/(malgungothic|malgun|mgothic|hygothic)/.test(normalized)) return 'Malgun Gothic'
  if (/(notosanskr|notosanscjkkr)/.test(normalized)) return 'Noto Sans KR'
  if (/(notoserifkr|notoserifcjkkr)/.test(normalized)) return 'Noto Serif KR'
  if (/(nanumgothic|nanumsquare)/.test(normalized)) return 'Nanum Gothic'
  if (/(nanummyeongjo)/.test(normalized)) return 'Nanum Myeongjo'
  return null
}

function normalizeKnownFontFamily(token: string) {
  if (!token) return token

  const normalized = token.toLowerCase().replace(/[\s_-]+/g, '')
  const preferredKoreanFont = matchPreferredKoreanFontFamily(normalized)
  if (preferredKoreanFont) return preferredKoreanFont

  const knownFamilies: Array<[string[], string]> = [
    [['malgungothic', 'malgun', 'mgothic'], 'Malgun Gothic'],
    [['applesdgothicneo'], 'Apple SD Gothic Neo'],
    [['notosanskr', 'notosanscjkkr'], 'Noto Sans KR'],
    [['nanumgothic', 'nanumsquare'], 'Nanum Gothic'],
    [['gulim'], 'Gulim'],
    [['dotum'], 'Dotum'],
    [['batang', 'myeongjo'], 'Batang'],
    [['nanummyeongjo'], 'Nanum Myeongjo'],
    [['notoserifkr', 'notoserifcjkkr'], 'Noto Serif KR'],
    [['gungsuh', 'gungseo', 'hygungso'], 'Gungsuh'],
    [['aptos'], 'Aptos'],
    [['calibri'], 'Calibri'],
    [['cambria'], 'Cambria'],
    [['arial'], 'Arial'],
    [['timesnewroman'], 'Times New Roman'],
    [['couriernew'], 'Courier New'],
  ]

  for (const [aliases, canonical] of knownFamilies) {
    if (aliases.some((alias) => normalized.includes(alias))) {
      return canonical
    }
  }

  return token
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

async function enrichSelectableLinesWithRenderedStyles(lines: TextLine[], imageSrc: string) {
  const prefix = imageSrc.startsWith('data:image/png;base64,')
    ? 'data:image/png;base64,'
    : imageSrc.startsWith('data:image/jpeg;base64,')
      ? 'data:image/jpeg;base64,'
      : null
  if (!prefix) return lines

  const raster = await readImageRaster(Buffer.from(imageSrc.slice(prefix.length), 'base64'))
  return applyVisualStylesToLines(lines, raster)
}

function applyVisualStylesToLines(lines: TextLine[], raster: ImageRaster | TextVisualRaster): TextLine[] {
  return lines.map((line) => ({
    ...line,
    color: sampleTextColor(raster, line),
    fontWeight: sampleTextWeight(raster, line, line.fontWeight, line.text),
  }))
}

function buildTextVisualRaster(source: ImageRaster, background: ImageRaster): TextVisualRaster {
  if (
    source.info.width !== background.info.width ||
    source.info.height !== background.info.height ||
    source.info.channels !== background.info.channels
  ) {
    return {
      source,
      background: null,
      mask: new Uint8Array(source.info.width * source.info.height),
    }
  }

  const mask = new Uint8Array(source.info.width * source.info.height)
  const channelCount = source.info.channels

  for (let index = 0; index < source.info.width * source.info.height; index += 1) {
    const offset = index * channelCount
    const rDelta = Math.abs((source.pixels[offset] ?? 255) - (background.pixels[offset] ?? 255))
    const gDelta = Math.abs((source.pixels[offset + 1] ?? 255) - (background.pixels[offset + 1] ?? 255))
    const bDelta = Math.abs((source.pixels[offset + 2] ?? 255) - (background.pixels[offset + 2] ?? 255))
    const delta = rDelta + gDelta + bDelta
    const strongestChannelDelta = Math.max(rDelta, gDelta, bDelta)
    if (delta >= 12 || strongestChannelDelta >= 5) {
      mask[index] = clamp(Math.round(delta * 2 + strongestChannelDelta * 4), 1, 255)
    }
  }

  return { source, background, mask }
}

function sampleTextColor(
  raster: ImageRaster | TextVisualRaster,
  box: Pick<RenderTextLine, 'left' | 'top' | 'width' | 'height' | 'fontSize'> & { baseline?: number }
) {
  const source = isTextVisualRaster(raster) ? raster.source : raster
  const background = isTextVisualRaster(raster) ? raster.background : null
  const mask = isTextVisualRaster(raster) ? raster.mask : null
  const { pixels, info } = source
  const startX = clamp(Math.floor(box.left), 0, Math.max(info.width - 1, 0))
  const fontSize = Math.max(getFiniteNumber(box.fontSize, box.height * 0.82), 1)
  const baseline = getFiniteNumber(box.baseline, box.top + Math.min(box.height, fontSize * 0.8))
  const startY = clamp(
    Math.floor(Math.max(box.top, baseline - fontSize * 0.95)),
    0,
    Math.max(info.height - 1, 0)
  )
  const endX = clamp(Math.ceil(box.left + box.width), startX + 1, info.width)
  const endY = clamp(
    Math.ceil(Math.min(box.top + box.height, baseline + fontSize * 0.2)),
    startY + 1,
    info.height
  )
  const stepX = Math.max(1, Math.floor((endX - startX) / 10))
  const stepY = Math.max(1, Math.floor((endY - startY) / 5))

  let weightedR = 0
  let weightedG = 0
  let weightedB = 0
  let totalWeight = 0
  let weightedBgR = 0
  let weightedBgG = 0
  let weightedBgB = 0
  let totalBgWeight = 0
  let fallbackBest: { luminance: number; r: number; g: number; b: number } | null = null
  let bestContrastCandidate: { score: number; contrast: number; r: number; g: number; b: number } | null = null

  for (let y = startY; y < endY; y += stepY) {
    for (let x = startX; x < endX; x += stepX) {
      const pixelIndex = y * info.width + x
      const maskValue = mask ? mask[pixelIndex] ?? 0 : 255
      if (mask && maskValue < 6) continue

      const index = (y * info.width + x) * info.channels
      const r = pixels[index] ?? 255
      const g = pixels[index + 1] ?? r
      const b = pixels[index + 2] ?? r
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b

      const baselineDistance = Math.abs((y + 0.5) - baseline)
      const baselineWeight = Math.max(0.25, 1 - baselineDistance / Math.max(fontSize * 0.55, 1))
      const maskWeight = Math.max(maskValue / 255, 0.12)
      let weight = Math.max(0, 255 - luminance)
      let localContrast = 1

      if (background) {
        const bgPixels = background.pixels
        const bgR = bgPixels[index] ?? 255
        const bgG = bgPixels[index + 1] ?? bgR
        const bgB = bgPixels[index + 2] ?? bgR
        const diff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB)
        localContrast = contrastRatio({ r, g, b }, { r: bgR, g: bgG, b: bgB })
        weight = diff * Math.max(localContrast - 0.8, 0.35)
        if (weight > 0) {
          weightedBgR += bgR * weight
          weightedBgG += bgG * weight
          weightedBgB += bgB * weight
          totalBgWeight += weight
        }
      }

      weight *= baselineWeight * maskWeight
      if (weight > 0) {
        weightedR += r * weight
        weightedG += g * weight
        weightedB += b * weight
        totalWeight += weight
      }

      const saturation = Math.max(r, g, b) - Math.min(r, g, b)
      const candidateScore = weight * Math.max(localContrast, 1) * (1 + saturation / 64)
      if (!bestContrastCandidate || candidateScore > bestContrastCandidate.score) {
        bestContrastCandidate = {
          score: candidateScore,
          contrast: localContrast,
          r,
          g,
          b,
        }
      }

      if (!fallbackBest || luminance < fallbackBest.luminance) {
        fallbackBest = { luminance, r, g, b }
      }
    }
  }

  if (totalWeight > 0) {
    const sampledR = weightedR / totalWeight
    const sampledG = weightedG / totalWeight
    const sampledB = weightedB / totalWeight

    if (background && totalBgWeight > 0) {
      const bgR = weightedBgR / totalBgWeight
      const bgG = weightedBgG / totalBgWeight
      const bgB = weightedBgB / totalBgWeight
      const sampledLum = 0.2126 * sampledR + 0.7152 * sampledG + 0.0722 * sampledB
      const backgroundLum = 0.2126 * bgR + 0.7152 * bgG + 0.0722 * bgB
      const contrast = contrastRatio(
        { r: sampledR, g: sampledG, b: sampledB },
        { r: bgR, g: bgG, b: bgB }
      )

      if (contrast < 1.18) {
        if (bestContrastCandidate && bestContrastCandidate.contrast >= 1.08) {
          return rgbToHex(bestContrastCandidate.r, bestContrastCandidate.g, bestContrastCandidate.b)
        }
        return backgroundLum < 0.42 ? '#ffffff' : '#111111'
      }
    }

    return rgbToHex(sampledR, sampledG, sampledB)
  }

  if (bestContrastCandidate) {
    return rgbToHex(bestContrastCandidate.r, bestContrastCandidate.g, bestContrastCandidate.b)
  }

  if (!fallbackBest || fallbackBest.luminance > 248) {
    return '#111111'
  }

  return rgbToHex(fallbackBest.r, fallbackBest.g, fallbackBest.b)
}

function sampleTextWeight(
  raster: ImageRaster | TextVisualRaster,
  box: Pick<RenderTextLine, 'left' | 'top' | 'width' | 'height'>,
  currentWeight: string,
  text: string
) {
  if (parseInt(currentWeight, 10) >= 600) return currentWeight
  if (!isTextVisualRaster(raster)) return currentWeight

  const { width, height } = raster.source.info
  const startX = clamp(Math.floor(box.left), 0, Math.max(width - 1, 0))
  const startY = clamp(Math.floor(box.top), 0, Math.max(height - 1, 0))
  const endX = clamp(Math.ceil(box.left + box.width), startX + 1, width)
  const endY = clamp(Math.ceil(box.top + box.height), startY + 1, height)
  const area = Math.max((endX - startX) * (endY - startY), 1)

  let inkPixels = 0
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const maskValue = raster.mask[y * width + x] ?? 0
      if (maskValue >= 16) inkPixels += maskValue / 255
    }
  }

  const visibleChars = Array.from(text.replace(/\s+/g, '')).length
  if (visibleChars === 0 || inkPixels < 12) return currentWeight

  const coverage = inkPixels / area
  const hangulCount = (text.match(/[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7A3]/gu) || []).length
  const prefersHangulThreshold = hangulCount >= Math.max(1, visibleChars / 2)
  const boldThreshold = prefersHangulThreshold ? 0.26 : 0.21
  const semiBoldThreshold = prefersHangulThreshold ? 0.22 : 0.17

  if (coverage >= boldThreshold) return '700'
  if (coverage >= semiBoldThreshold) return '600'
  return currentWeight
}

function isTextVisualRaster(raster: ImageRaster | TextVisualRaster): raster is TextVisualRaster {
  return 'source' in raster && raster.source != null && raster.mask instanceof Uint8Array
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`
}

function isNearWhiteColor(color?: string) {
  if (!color) return false
  const normalized = color.trim().toLowerCase()
  if (normalized === 'white') return true
  const hex = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!hex) return false

  const raw = hex[1]
  const expanded = raw.length === 3 ? raw.split('').map((char) => `${char}${char}`).join('') : raw
  const r = parseInt(expanded.slice(0, 2), 16)
  const g = parseInt(expanded.slice(2, 4), 16)
  const b = parseInt(expanded.slice(4, 6), 16)
  return r >= 236 && g >= 236 && b >= 236
}

function contrastRatio(
  foreground: { r: number; g: number; b: number },
  background: { r: number; g: number; b: number }
) {
  const fg = relativeLuminance(foreground.r, foreground.g, foreground.b)
  const bg = relativeLuminance(background.r, background.g, background.b)
  const lighter = Math.max(fg, bg)
  const darker = Math.min(fg, bg)
  return (lighter + 0.05) / (darker + 0.05)
}

function relativeLuminance(r: number, g: number, b: number) {
  const normalize = (value: number) => {
    const channel = clamp(value, 0, 255) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }

  const red = normalize(r)
  const green = normalize(g)
  const blue = normalize(b)
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
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

  const safeRatio = Number.isFinite(ratio) ? ratio : DEFAULT_FONT_ASCENT_RATIO
  TEXT_ASCENT_CACHE.set(cacheKey, safeRatio)
  return safeRatio
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
  if (!Number.isFinite(value)) {
    return 0
  }
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function scalePdfMetric(value: number, precision = 2) {
  return roundMetric(getFiniteNumber(value, 0) * PDF_LAYOUT_CSS_SCALE, precision)
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}


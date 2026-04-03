'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { EDITOR_FONT_CSS_IMPORT } from '@/lib/editor-fonts'

export interface LayoutEditorHandle {
  getHtml: () => string
  flush: () => string
  applyFontFamily: (fontFamily: string | null) => void
  applyFontSize: (fontSize: string | null) => void
  toggleBold: () => void
  toggleItalic: () => void
  toggleUnderline: () => void
  applyTextColor: (color: string | null) => void
  applyTextAlign: (align: 'left' | 'center' | 'right' | 'justify') => void
  undo: () => void
  redo: () => void
}

interface LayoutEditorProps {
  html: string
  onChange: (html: string) => void
}

const FRAME_HELPER_STYLE = `
  ${EDITOR_FONT_CSS_IMPORT}

  html {
    background: #f3f4f6;
    font-family: 'Malgun Gothic', '맑은 고딕', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
  }

  body {
    margin: 0;
    font-family: 'Malgun Gothic', '맑은 고딕', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
  }

  [contenteditable="true"] {
    cursor: text;
  }

  [contenteditable="true"]:focus {
    caret-color: #111827;
  }
`

function normalizeHtml(html: string): string {
  if (/<html[\s>]/i.test(html)) return html

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
</head>
<body>${html}</body>
</html>`
}

function stripRuntimeLayoutArtifacts(root: HTMLElement) {
  const sanitize = (element: Element) => {
    element.removeAttribute('data-layout-selected')
    element.removeAttribute('data-layout-runtime')
    if (element instanceof HTMLElement) {
      element.classList.remove('layout-object--selected')
    }
  }

  sanitize(root)
  root.querySelectorAll('[data-layout-runtime="true"]').forEach((element) => element.remove())
  root.querySelectorAll('*').forEach((element) => sanitize(element))
}

function serializeFrameDocument(doc: Document): string {
  const clonedRoot = doc.documentElement.cloneNode(true) as HTMLElement
  stripRuntimeLayoutArtifacts(clonedRoot)
  return `<!DOCTYPE html>\n${clonedRoot.outerHTML}`
}

function convertFontSizeToPx(fontSize: string) {
  const value = fontSize.trim()
  if (!value) return null

  if (value.endsWith('pt')) {
    const pt = parseFloat(value)
    if (!Number.isFinite(pt)) return null
    return `${Math.round((pt * 96) / 72 * 100) / 100}px`
  }

  if (value.endsWith('px')) {
    const px = parseFloat(value)
    if (!Number.isFinite(px)) return null
    return `${Math.round(px * 100) / 100}px`
  }

  const numeric = parseFloat(value)
  if (!Number.isFinite(numeric)) return null
  return `${Math.round(numeric * 100) / 100}px`
}

function getEditableElement(doc: Document): HTMLElement | null {
  const active = doc.activeElement
  if (active instanceof HTMLElement && active.matches('[data-layout-editable="true"]')) {
    return active
  }

  const selection = doc.getSelection()
  const anchorNode = selection?.anchorNode
  if (!anchorNode) return null

  const anchorElement =
    anchorNode instanceof HTMLElement ? anchorNode : anchorNode.parentElement

  return anchorElement?.closest('[data-layout-editable="true"]') as HTMLElement | null
}

const LayoutEditor = forwardRef<LayoutEditorHandle, LayoutEditorProps>(function LayoutEditor(
  { html, onChange },
  ref
) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const emitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastLoadedHtmlRef = useRef('')
  const onChangeRef = useRef(onChange)
  const historyRef = useRef<string[]>([])
  const historyIndexRef = useRef(-1)
  const isRestoringHistoryRef = useRef(false)
  const [frameHeight, setFrameHeight] = useState(1200)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const clearEmitTimer = useCallback(() => {
    if (!emitTimerRef.current) return
    clearTimeout(emitTimerRef.current)
    emitTimerRef.current = null
  }, [])

  const measureHeight = useCallback(() => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return

    const nextHeight = Math.max(
      doc.documentElement.scrollHeight,
      doc.body?.scrollHeight ?? 0,
      900
    )

    setFrameHeight(nextHeight)
  }, [])

  const pushHistorySnapshot = useCallback((snapshot: string) => {
    if (!snapshot || isRestoringHistoryRef.current) return

    const currentHistory = historyRef.current
    const currentSnapshot = currentHistory[historyIndexRef.current]
    if (currentSnapshot === snapshot) return

    const nextHistory = currentHistory.slice(0, historyIndexRef.current + 1)
    nextHistory.push(snapshot)

    if (nextHistory.length > 100) {
      nextHistory.shift()
    }

    historyRef.current = nextHistory
    historyIndexRef.current = nextHistory.length - 1
  }, [])

  const emitHtml = useCallback((options?: { skipHistory?: boolean }) => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return ''

    const nextHtml = serializeFrameDocument(doc)
    lastLoadedHtmlRef.current = nextHtml
    if (!options?.skipHistory) {
      pushHistorySnapshot(nextHtml)
    }
    onChangeRef.current(nextHtml)
    return nextHtml
  }, [pushHistorySnapshot])

  const scheduleEmitHtml = useCallback(() => {
    clearEmitTimer()
    emitTimerRef.current = setTimeout(() => {
      emitHtml()
      emitTimerRef.current = null
    }, 150)
  }, [clearEmitTimer, emitHtml])

  const syncEditable = useCallback((doc: Document, editable: HTMLElement, shouldSyncWidth = true) => {
    const syncEditableWidth = (doc.defaultView as any)?.__skkfSyncEditableWidth
    if (shouldSyncWidth && typeof syncEditableWidth === 'function') {
      syncEditableWidth(editable)
    }

    measureHeight()
    emitHtml()
  }, [emitHtml, measureHeight])

  const restoreHistorySnapshot = useCallback((snapshot: string) => {
    const iframe = iframeRef.current
    if (!iframe || !snapshot) return

    clearEmitTimer()
    isRestoringHistoryRef.current = true
    lastLoadedHtmlRef.current = snapshot
    iframe.srcdoc = snapshot
  }, [clearEmitTimer])

  const bindFrame = useCallback(() => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return

    cleanupRef.current?.()

    if (!doc.getElementById('skkf-layout-editor-style')) {
      const style = doc.createElement('style')
      style.id = 'skkf-layout-editor-style'
      style.textContent = FRAME_HELPER_STYLE
      doc.head?.appendChild(style)
    }

    const handleInput = () => {
      measureHeight()
      scheduleEmitHtml()
    }

    const handleFocusOut = () => {
      measureHeight()
      emitHtml()
    }

    doc.addEventListener('input', handleInput, true)
    doc.addEventListener('focusout', handleFocusOut, true)

    const observer = new MutationObserver(() => {
      measureHeight()
      scheduleEmitHtml()
    })

    if (doc.body) {
      observer.observe(doc.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
      })
    }

    measureHeight()

    cleanupRef.current = () => {
      doc.removeEventListener('input', handleInput, true)
      doc.removeEventListener('focusout', handleFocusOut, true)
      observer.disconnect()
    }
  }, [emitHtml, measureHeight, scheduleEmitHtml])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const handleLoad = () => {
      bindFrame()
      emitHtml({ skipHistory: isRestoringHistoryRef.current })
      isRestoringHistoryRef.current = false
    }

    iframe.addEventListener('load', handleLoad)
    return () => {
      iframe.removeEventListener('load', handleLoad)
    }
  }, [bindFrame, emitHtml])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe || !html) return

    const normalizedHtml = normalizeHtml(html)
    if (normalizedHtml === lastLoadedHtmlRef.current) return

    historyRef.current = [normalizedHtml]
    historyIndexRef.current = 0
    isRestoringHistoryRef.current = false
    lastLoadedHtmlRef.current = normalizedHtml
    iframe.srcdoc = normalizedHtml
  }, [html])

  useImperativeHandle(
    ref,
    () => ({
      getHtml: () => {
        const doc = iframeRef.current?.contentDocument
        return doc ? serializeFrameDocument(doc) : lastLoadedHtmlRef.current
      },
      flush: () => {
        clearEmitTimer()
        return emitHtml() || lastLoadedHtmlRef.current
      },
      applyFontFamily: (fontFamily: string | null) => {
        const doc = iframeRef.current?.contentDocument
        if (!doc) return

        const editable = getEditableElement(doc)
        if (!editable) return

        if (fontFamily) {
          editable.style.fontFamily = fontFamily
        } else {
          editable.style.removeProperty('font-family')
        }

        syncEditable(doc, editable)
      },
      applyFontSize: (fontSize: string | null) => {
        const doc = iframeRef.current?.contentDocument
        if (!doc) return

        const editable = getEditableElement(doc)
        if (!editable) return

        const nextSize = fontSize ? convertFontSizeToPx(fontSize) : null
        if (!nextSize) return

        const computed = doc.defaultView?.getComputedStyle(editable)
        const currentFontSize = parseFloat(editable.dataset.fontSize || computed?.fontSize || '0') || 12
        const nextFontSize = parseFloat(nextSize)
        const sizeRatio = nextFontSize > 0 && currentFontSize > 0 ? nextFontSize / currentFontSize : 1
        const currentTargetWidth = parseFloat(editable.dataset.targetWidth || '0')
        const currentLineHeight = parseFloat(editable.dataset.lineHeight || '0')

        editable.dataset.userFontSize = nextSize
        editable.style.fontSize = nextSize
        editable.dataset.fontSize = `${Math.round(nextFontSize * 100) / 100}`

        if (currentTargetWidth > 0 && Number.isFinite(sizeRatio)) {
          editable.dataset.targetWidth = `${Math.round(currentTargetWidth * sizeRatio * 100) / 100}`
        }

        if (currentLineHeight > 0 && Number.isFinite(sizeRatio)) {
          editable.dataset.lineHeight = `${Math.round(currentLineHeight * sizeRatio * 100) / 100}`
        }

        syncEditable(doc, editable)
      },
      toggleBold: () => {
        const doc = iframeRef.current?.contentDocument
        if (!doc) return

        const editable = getEditableElement(doc)
        if (!editable) return

        const computed = doc.defaultView?.getComputedStyle(editable)
        const currentWeight = parseInt(editable.style.fontWeight || computed?.fontWeight || '400', 10)
        const nextWeight = currentWeight >= 600 ? '400' : '700'

        editable.style.fontWeight = nextWeight

        syncEditable(doc, editable)
      },
      toggleItalic: () => {
        const doc = iframeRef.current?.contentDocument
        if (!doc) return

        const editable = getEditableElement(doc)
        if (!editable) return

        const computed = doc.defaultView?.getComputedStyle(editable)
        const nextStyle = (editable.style.fontStyle || computed?.fontStyle) === 'italic' ? 'normal' : 'italic'
        editable.style.fontStyle = nextStyle
        syncEditable(doc, editable)
      },
      toggleUnderline: () => {
        const doc = iframeRef.current?.contentDocument
        if (!doc) return

        const editable = getEditableElement(doc)
        if (!editable) return

        const computed = doc.defaultView?.getComputedStyle(editable)
        const currentDecoration = editable.style.textDecorationLine || computed?.textDecorationLine || ''
        if (currentDecoration.includes('underline')) {
          editable.style.removeProperty('text-decoration')
          editable.style.removeProperty('text-decoration-line')
        } else {
          editable.style.textDecorationLine = 'underline'
        }
        syncEditable(doc, editable, false)
      },
      applyTextColor: (color: string | null) => {
        const doc = iframeRef.current?.contentDocument
        if (!doc) return

        const editable = getEditableElement(doc)
        if (!editable) return

        if (color) {
          editable.style.color = color
        } else {
          editable.style.removeProperty('color')
        }

        syncEditable(doc, editable, false)
      },
      applyTextAlign: (align: 'left' | 'center' | 'right' | 'justify') => {
        const doc = iframeRef.current?.contentDocument
        if (!doc) return

        const editable = getEditableElement(doc)
        if (!editable) return

        editable.style.textAlign = align
        syncEditable(doc, editable, false)
      },
      undo: () => {
        if (historyIndexRef.current <= 0) return
        historyIndexRef.current -= 1
        restoreHistorySnapshot(historyRef.current[historyIndexRef.current] || '')
      },
      redo: () => {
        if (historyIndexRef.current >= historyRef.current.length - 1) return
        historyIndexRef.current += 1
        restoreHistorySnapshot(historyRef.current[historyIndexRef.current] || '')
      },
    }),
    [clearEmitTimer, emitHtml, restoreHistorySnapshot, syncEditable]
  )

  useEffect(() => {
    return () => {
      clearEmitTimer()
      cleanupRef.current?.()
    }
  }, [clearEmitTimer])

  return (
    <iframe
      ref={iframeRef}
      title="Layout editor"
      className="w-full border-0 bg-white"
      style={{ height: `${frameHeight}px` }}
    />
  )
})

export default LayoutEditor

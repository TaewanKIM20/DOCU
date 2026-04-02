'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

export interface LayoutEditorHandle {
  getHtml: () => string
  flush: () => string
}

interface LayoutEditorProps {
  html: string
  onChange: (html: string) => void
}

const FRAME_HELPER_STYLE = `
  html {
    background: #f3f4f6;
  }

  body {
    margin: 0;
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

function serializeFrameDocument(doc: Document): string {
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`
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

  const emitHtml = useCallback(() => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return ''

    const nextHtml = serializeFrameDocument(doc)
    lastLoadedHtmlRef.current = nextHtml
    onChangeRef.current(nextHtml)
    return nextHtml
  }, [])

  const scheduleEmitHtml = useCallback(() => {
    clearEmitTimer()
    emitTimerRef.current = setTimeout(() => {
      emitHtml()
      emitTimerRef.current = null
    }, 150)
  }, [clearEmitTimer, emitHtml])

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
      emitHtml()
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
    }),
    [clearEmitTimer, emitHtml]
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

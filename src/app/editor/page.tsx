'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import Color from '@tiptap/extension-color'
import TextStyle from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import FontFamily from '@tiptap/extension-font-family'
import Toolbar from '@/components/Toolbar'
import LayoutEditor, { LayoutEditorHandle } from '@/components/LayoutEditor'
import { SKKFManifest } from '@/lib/skkf/schema'
import { FontSize } from '@/lib/extensions/font-size'

const LAYOUT_FORMATS = new Set(['pdf', 'png', 'jpg', 'webp'])

function extractBody(html: string): string {
  const match = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  return match ? match[1].trim() : html
}

function isLayoutDocument(html: string, manifest: SKKFManifest | null): boolean {
  if (!html) return false

  const hasLayoutMarkers =
    html.includes('data-layout-document') ||
    html.includes('data-layout-editable') ||
    (/<html[\s>]/i.test(html) &&
      /contenteditable\s*=\s*["']true["']/i.test(html) &&
      /position\s*:\s*absolute/i.test(html))

  if (hasLayoutMarkers) return true
  return manifest ? LAYOUT_FORMATS.has(manifest.originalFormat) : false
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteChars = atob(base64)
  const byteArrays: ArrayBuffer[] = []

  for (let i = 0; i < byteChars.length; i += 512) {
    const slice = byteChars.slice(i, i + 512)
    const byteNumbers = new Array(slice.length).fill(0).map((_, j) => slice.charCodeAt(j))
    byteArrays.push(new Uint8Array(byteNumbers).buffer as ArrayBuffer)
  }

  return new Blob(byteArrays, { type: mimeType })
}

export default function EditorPage() {
  const router = useRouter()
  const [skkfBase64, setSkkfBase64] = useState('')
  const [manifest, setManifest] = useState<SKKFManifest | null>(null)
  const [title, setTitle] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [documentHtml, setDocumentHtml] = useState('')
  const [initialRichHtml, setInitialRichHtml] = useState('')
  const [layoutMode, setLayoutMode] = useState(false)

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const documentHtmlRef = useRef('')
  const isHydratingEditorRef = useRef(false)
  const layoutEditorRef = useRef<LayoutEditorHandle>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      Image.configure({ inline: false, allowBase64: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      FontFamily,
      FontSize,
    ],
    immediatelyRender: false,
    content: '',
    editorProps: {
      attributes: {
        class:
          'prose prose-base max-w-none min-h-[70vh] p-8 focus:outline-none font-sans leading-relaxed',
      },
    },
  })

  const getCurrentHtml = useCallback(() => {
    if (layoutMode) {
      const nextHtml = layoutEditorRef.current?.getHtml() ?? documentHtmlRef.current
      documentHtmlRef.current = nextHtml
      setDocumentHtml(nextHtml)
      return nextHtml
    }

    const nextHtml = editor?.getHTML() ?? documentHtmlRef.current
    documentHtmlRef.current = nextHtml
    setDocumentHtml(nextHtml)
    return nextHtml
  }, [editor, layoutMode])

  const saveDocument = useCallback(
    async (html?: string, showStatus = true): Promise<string | null> => {
      const currentHtml = html ?? getCurrentHtml()
      if (!skkfBase64 || !currentHtml) return null

      setIsSaving(true)

      try {
        const res = await fetch('/api/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skkfBase64, html: currentHtml, title }),
        })

        const data = await res.json()

        if (data.success && data.skkfBase64) {
          setSkkfBase64(data.skkfBase64)
          sessionStorage.setItem('skkfData', data.skkfBase64)
          sessionStorage.setItem('skkfHtml', currentHtml)
          if (showStatus) setStatusMsg('문서를 저장했습니다.')
          return data.skkfBase64
        }

        if (showStatus) setStatusMsg(data.error || '문서 저장에 실패했습니다.')
        return null
      } catch {
        if (showStatus) setStatusMsg('문서 저장 중 오류가 발생했습니다.')
        return null
      } finally {
        setIsSaving(false)
        if (showStatus) {
          setTimeout(() => setStatusMsg(''), 2000)
        }
      }
    },
    [getCurrentHtml, skkfBase64, title]
  )

  const scheduleAutoSave = useCallback(
    (nextHtml: string) => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current)
      }

      autoSaveTimer.current = setTimeout(() => {
        void saveDocument(nextHtml, false)
      }, 3000)
    },
    [saveDocument]
  )

  useEffect(() => {
    const storedData = sessionStorage.getItem('skkfData')
    const storedManifest = sessionStorage.getItem('skkfManifest')
    const storedHtml = sessionStorage.getItem('skkfHtml')
    const storedWarnings = sessionStorage.getItem('skkfWarnings')

    if (!storedData || !storedHtml) {
      router.push('/')
      return
    }

    const nextManifest: SKKFManifest | null = storedManifest ? JSON.parse(storedManifest) : null
    const nextLayoutMode = isLayoutDocument(storedHtml, nextManifest)

    setSkkfBase64(storedData)
    setManifest(nextManifest)
    setTitle(nextManifest?.title || '')
    setWarnings(storedWarnings ? JSON.parse(storedWarnings) : [])
    setLayoutMode(nextLayoutMode)
    setDocumentHtml(storedHtml)
    documentHtmlRef.current = storedHtml
    setInitialRichHtml(nextLayoutMode ? '' : extractBody(storedHtml))
  }, [router])

  useEffect(() => {
    if (!editor || layoutMode) return

    isHydratingEditorRef.current = true
    editor.commands.setContent(initialRichHtml || '', false)

    const timer = setTimeout(() => {
      isHydratingEditorRef.current = false
    }, 0)

    return () => {
      clearTimeout(timer)
    }
  }, [editor, initialRichHtml, layoutMode])

  useEffect(() => {
    if (!editor) return

    const handleUpdate = () => {
      if (layoutMode || isHydratingEditorRef.current) return

      const nextHtml = editor.getHTML()
      if (nextHtml === documentHtmlRef.current) return

      documentHtmlRef.current = nextHtml
      setDocumentHtml(nextHtml)
      scheduleAutoSave(nextHtml)
    }

    editor.on('update', handleUpdate)
    return () => {
      editor.off('update', handleUpdate)
    }
  }, [editor, layoutMode, scheduleAutoSave])

  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current)
      }
    }
  }, [])

  const handleLayoutChange = useCallback(
    (nextHtml: string) => {
      if (!nextHtml || nextHtml === documentHtmlRef.current) return

      documentHtmlRef.current = nextHtml
      setDocumentHtml(nextHtml)
      scheduleAutoSave(nextHtml)
    },
    [scheduleAutoSave]
  )

  const handleDownloadSkkf = useCallback(async () => {
    const currentHtml = layoutMode
      ? layoutEditorRef.current?.flush() ?? documentHtmlRef.current
      : getCurrentHtml()

    const latestBase64 = (await saveDocument(currentHtml, false)) ?? skkfBase64
    if (!latestBase64) return

    const blob = base64ToBlob(latestBase64, 'application/x-skkf')
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title || 'document'}.skkf`
    a.click()
    URL.revokeObjectURL(url)
    setStatusMsg('.skkf 파일 다운로드가 완료되었습니다.')
    setTimeout(() => setStatusMsg(''), 2000)
  }, [getCurrentHtml, layoutMode, saveDocument, skkfBase64, title])

  const handleExportPdf = useCallback(async () => {
    if (!skkfBase64) return

    const currentHtml = layoutMode
      ? layoutEditorRef.current?.flush() ?? documentHtmlRef.current
      : getCurrentHtml()

    setIsExporting(true)
    setStatusMsg('PDF를 생성하고 있습니다...')

    try {
      const latestBase64 = (await saveDocument(currentHtml, false)) ?? skkfBase64

      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skkfBase64: latestBase64, title }),
      })

      const data = await res.json()

      if (data.success && data.pdfBase64) {
        const blob = base64ToBlob(data.pdfBase64, 'application/pdf')
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${title || 'document'}.pdf`
        a.click()
        URL.revokeObjectURL(url)
        setStatusMsg('PDF 다운로드가 완료되었습니다.')
      } else {
        setStatusMsg(`PDF 내보내기 실패: ${data.error}`)
      }
    } catch {
      setStatusMsg('PDF 내보내기 중 오류가 발생했습니다.')
    } finally {
      setIsExporting(false)
      setTimeout(() => setStatusMsg(''), 3000)
    }
  }, [getCurrentHtml, layoutMode, saveDocument, skkfBase64, title])

  const renderLayoutToolbar = () => (
    <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
      <div className="px-4 py-2 border-b border-gray-100">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="문서 제목"
          className="w-full text-lg font-semibold text-gray-800 bg-transparent border-none outline-none placeholder-gray-400"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        <span className="text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">
          레이아웃 고정 모드: 원본 배치를 유지한 채 텍스트만 수정합니다.
        </span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={handleDownloadSkkf}
            className="px-3 py-1 rounded text-sm bg-indigo-100 text-indigo-700 hover:bg-indigo-200 font-medium"
          >
            .skkf 다운로드
          </button>
          <button
            onClick={() => void saveDocument(undefined, true)}
            disabled={isSaving}
            className="px-3 py-1 rounded text-sm bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 font-medium"
          >
            {isSaving ? '저장 중...' : '저장'}
          </button>
          <button
            onClick={handleExportPdf}
            disabled={isExporting}
            className="px-3 py-1 rounded text-sm bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 font-medium"
          >
            {isExporting ? 'PDF 생성 중...' : 'PDF 다운로드'}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {layoutMode ? (
        renderLayoutToolbar()
      ) : (
        <Toolbar
          editor={editor}
          onSave={() => void saveDocument(undefined, true)}
          onExportPdf={handleExportPdf}
          onDownloadSkkf={handleDownloadSkkf}
          isSaving={isSaving}
          isExporting={isExporting}
          title={title}
          onTitleChange={setTitle}
        />
      )}

      {warnings.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-start gap-2">
          <span className="text-amber-500 text-sm">주의</span>
          <div className="text-amber-700 text-sm flex-1">
            {warnings.map((warning, index) => (
              <div key={index}>{warning}</div>
            ))}
          </div>
          <button
            onClick={() => setWarnings([])}
            className="text-amber-400 hover:text-amber-600 text-xs"
          >
            닫기
          </button>
        </div>
      )}

      {statusMsg && (
        <div className="fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded-lg text-sm shadow-lg z-50 animate-fade-in">
          {statusMsg}
        </div>
      )}

      <div className="flex-1 overflow-y-auto bg-gray-100 py-8">
        {layoutMode ? (
          <div className="max-w-6xl mx-auto px-4">
            <div className="bg-white shadow-md rounded overflow-hidden">
              <LayoutEditor ref={layoutEditorRef} html={documentHtml} onChange={handleLayoutChange} />
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto bg-white shadow-md rounded min-h-[29.7cm]">
            <EditorContent editor={editor} className="h-full" />
          </div>
        )}
      </div>

      <div className="bg-white border-t border-gray-200 px-4 py-1 flex items-center gap-4 text-xs text-gray-400">
        {manifest && (
          <>
            <span>원본: {manifest.originalFileName}</span>
            <span>형식: {manifest.originalFormat.toUpperCase()}</span>
            <span>생성: {new Date(manifest.created).toLocaleDateString('ko-KR')}</span>
            <span>수정: {new Date(manifest.modified).toLocaleDateString('ko-KR')}</span>
          </>
        )}
        <span className="ml-auto">.skkf v{manifest?.version || '1.0'}</span>
      </div>
    </div>
  )
}

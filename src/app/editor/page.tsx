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
import {
  createEditorSession,
  EDITOR_SESSION_STORAGE_KEY,
  isLayoutSessionDocument,
  updateEditorSession,
  type EditorSessionDocument,
  type EditorSessionState,
} from '@/lib/editor-session'
import { EDITOR_FONT_FAMILIES } from '@/lib/editor-fonts'
import { FontSize } from '@/lib/extensions/font-size'

const LAYOUT_FONT_SIZES = ['8pt', '9pt', '10pt', '11pt', '12pt', '14pt', '16pt', '18pt', '20pt', '24pt', '28pt', '32pt', '36pt']

function extractBody(html: string): string {
  const match = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  return match ? match[1].trim() : html
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

function formatTimestamp(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('ko-KR')
}

function migrateLegacySessionFromStorage() {
  const skkfBase64 = sessionStorage.getItem('skkfData')
  const html = sessionStorage.getItem('skkfHtml')
  const manifestText = sessionStorage.getItem('skkfManifest')
  const warningsText = sessionStorage.getItem('skkfWarnings')

  if (!skkfBase64 || !html || !manifestText) return null

  try {
    const manifest = JSON.parse(manifestText)
    const warnings = warningsText ? JSON.parse(warningsText) : []
    const session = createEditorSession([
      {
        id: crypto.randomUUID(),
        skkfBase64,
        html,
        manifest,
        warnings,
      },
    ])
    sessionStorage.setItem(EDITOR_SESSION_STORAGE_KEY, JSON.stringify(session))
    return session
  } catch {
    return null
  }
}

export default function EditorPage() {
  const router = useRouter()
  const [session, setSession] = useState<EditorSessionState | null>(null)
  const [title, setTitle] = useState('')
  const [statusMsg, setStatusMsg] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [documentHtml, setDocumentHtml] = useState('')
  const [initialRichHtml, setInitialRichHtml] = useState('')
  const [layoutMode, setLayoutMode] = useState(false)
  const [layoutFontFamily, setLayoutFontFamily] = useState('')
  const [layoutFontSize, setLayoutFontSize] = useState('')
  const [layoutTextColor, setLayoutTextColor] = useState('#111111')

  const sessionRef = useRef<EditorSessionState | null>(null)
  const documentHtmlRef = useRef('')
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingAutoSaveDocIdRef = useRef<string | null>(null)
  const layoutEditorRef = useRef<LayoutEditorHandle>(null)
  const isHydratingEditorRef = useRef(false)

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
        class: 'prose prose-base max-w-none min-h-[70vh] p-8 focus:outline-none font-sans leading-relaxed',
      },
    },
  })

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  const persistSession = useCallback((nextSession: EditorSessionState) => {
    sessionRef.current = nextSession
    setSession(nextSession)
    sessionStorage.setItem(EDITOR_SESSION_STORAGE_KEY, JSON.stringify(nextSession))
  }, [])

  useEffect(() => {
    const storedSession = sessionStorage.getItem(EDITOR_SESSION_STORAGE_KEY)
    if (storedSession) {
      try {
        const parsedSession = JSON.parse(storedSession) as EditorSessionState
        if (Array.isArray(parsedSession.documents) && parsedSession.documents.length > 0) {
          setSession(parsedSession)
          return
        }
      } catch {
        sessionStorage.removeItem(EDITOR_SESSION_STORAGE_KEY)
      }
    }

    const migrated = migrateLegacySessionFromStorage()
    if (migrated) {
      setSession(migrated)
      return
    }

    router.push('/')
  }, [router])

  const currentIndex = session?.activeIndex ?? 0
  const currentDocument = session?.documents[currentIndex] ?? null

  useEffect(() => {
    if (!currentDocument) return

    const nextLayoutMode = isLayoutSessionDocument(currentDocument)
    setLayoutMode(nextLayoutMode)
    setTitle(currentDocument.manifest.title || '')
    setDocumentHtml(currentDocument.html)
    documentHtmlRef.current = currentDocument.html
    setInitialRichHtml(nextLayoutMode ? '' : extractBody(currentDocument.html))
  }, [currentDocument])

  useEffect(() => {
    if (!editor || !currentDocument || layoutMode) return

    isHydratingEditorRef.current = true
    editor.commands.setContent(initialRichHtml || '', false)

    const timer = setTimeout(() => {
      isHydratingEditorRef.current = false
    }, 0)

    return () => clearTimeout(timer)
  }, [currentDocument, editor, initialRichHtml, layoutMode])

  const updateCurrentDocument = useCallback(
    (updater: (document: EditorSessionDocument) => EditorSessionDocument) => {
      const currentSession = sessionRef.current
      if (!currentSession || !currentSession.documents[currentSession.activeIndex]) return

      const nextSession = updateEditorSession(
        currentSession,
        (documents) =>
          documents.map((document, index) =>
            index === currentSession.activeIndex ? updater(document) : document
          ),
        currentSession.activeIndex
      )
      persistSession(nextSession)
    },
    [persistSession]
  )

  const saveDocumentById = useCallback(
    async (documentId: string, htmlOverride?: string, showStatus = true) => {
      const currentSession = sessionRef.current
      const document = currentSession?.documents.find((item) => item.id === documentId)
      if (!document) return null

      const html = htmlOverride ?? document.html
      setIsSaving(true)

      try {
        const response = await fetch('/api/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            skkfBase64: document.skkfBase64,
            html,
            title: document.manifest.title,
          }),
        })

        const data = await response.json()
        if (!response.ok || !data.success || !data.skkfBase64) {
          throw new Error(data.error || '문서 저장에 실패했습니다.')
        }

        const nextSession = updateEditorSession(
          currentSession!,
          (documents) =>
            documents.map((item) =>
              item.id === documentId
                ? {
                    ...item,
                    skkfBase64: data.skkfBase64,
                    html,
                    manifest: {
                      ...item.manifest,
                      title: item.manifest.title,
                      modified: new Date().toISOString(),
                      charCount: html.replace(/<[^>]+>/g, '').length,
                    },
                  }
                : item
            ),
          currentSession!.activeIndex
        )

        persistSession(nextSession)

        if (showStatus) {
          setStatusMsg('문서를 저장했습니다.')
          setTimeout(() => setStatusMsg(''), 2000)
        }

        return data.skkfBase64 as string
      } catch (error) {
        if (showStatus) {
          setStatusMsg(error instanceof Error ? error.message : '문서 저장 중 오류가 발생했습니다.')
          setTimeout(() => setStatusMsg(''), 2500)
        }
        return null
      } finally {
        setIsSaving(false)
      }
    },
    [persistSession]
  )

  const scheduleAutoSave = useCallback((documentId: string, nextHtml: string) => {
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current)
    }

    pendingAutoSaveDocIdRef.current = documentId
    autoSaveTimer.current = setTimeout(() => {
      const targetId = pendingAutoSaveDocIdRef.current
      if (!targetId) return
      void saveDocumentById(targetId, nextHtml, false)
    }, 3000)
  }, [saveDocumentById])

  const handleCurrentHtmlChange = useCallback(
    (nextHtml: string) => {
      if (!currentDocument || nextHtml === documentHtmlRef.current) return

      documentHtmlRef.current = nextHtml
      setDocumentHtml(nextHtml)
      updateCurrentDocument((document) => ({
        ...document,
        html: nextHtml,
      }))
      scheduleAutoSave(currentDocument.id, nextHtml)
    },
    [currentDocument, scheduleAutoSave, updateCurrentDocument]
  )

  useEffect(() => {
    if (!editor) return

    const handleUpdate = () => {
      if (layoutMode || isHydratingEditorRef.current || !currentDocument) return
      handleCurrentHtmlChange(editor.getHTML())
    }

    editor.on('update', handleUpdate)
    return () => {
      editor.off('update', handleUpdate)
    }
  }, [currentDocument, editor, handleCurrentHtmlChange, layoutMode])

  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current)
      }
    }
  }, [])

  const syncCurrentEditorSnapshot = useCallback(() => {
    if (!currentDocument) return ''
    const nextHtml = layoutMode
      ? layoutEditorRef.current?.flush() ?? documentHtmlRef.current
      : editor?.getHTML() ?? documentHtmlRef.current

    documentHtmlRef.current = nextHtml
    setDocumentHtml(nextHtml)

    updateCurrentDocument((document) => ({
      ...document,
      html: nextHtml,
      manifest: {
        ...document.manifest,
        title,
      },
    }))

    return nextHtml
  }, [currentDocument, editor, layoutMode, title, updateCurrentDocument])

  const saveCurrentDocument = useCallback(
    async (showStatus = true) => {
      if (!currentDocument) return null
      const currentHtml = syncCurrentEditorSnapshot()
      return saveDocumentById(currentDocument.id, currentHtml, showStatus)
    },
    [currentDocument, saveDocumentById, syncCurrentEditorSnapshot]
  )


  const handleExportPdf = useCallback(async () => {
    const currentSession = sessionRef.current
    if (!currentDocument || !currentSession) return

    setIsExporting(true)
    setStatusMsg('세션 전체 문서를 하나의 PDF로 생성하고 있습니다...')

    try {
      await saveCurrentDocument(false)
      const latestSession = sessionRef.current
      if (!latestSession) {
        throw new Error('편집 세션을 찾을 수 없습니다.')
      }

      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || currentDocument.manifest.title,
          documents: latestSession.documents.map((document) => ({
            skkfBase64: document.skkfBase64,
            html: document.html,
            title: document.manifest.title,
          })),
        }),
      })

      const data = await response.json()
      if (!response.ok || !data.success || !data.pdfBase64) {
        throw new Error(data.error || 'PDF 내보내기에 실패했습니다.')
      }

      const blob = base64ToBlob(data.pdfBase64, 'application/pdf')
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const baseName =
        latestSession.documents.length > 1
          ? `${latestSession.documents[0]?.manifest.title || 'documents'}-bundle`
          : title || currentDocument.manifest.title || 'document'
      link.download = `${baseName}.pdf`
      link.click()
      URL.revokeObjectURL(url)

      setStatusMsg('세션 전체 문서를 하나의 PDF로 다운로드했습니다.')
    } catch (error) {
      setStatusMsg(error instanceof Error ? error.message : 'PDF 내보내기 중 오류가 발생했습니다.')
    } finally {
      setIsExporting(false)
      setTimeout(() => setStatusMsg(''), 3000)
    }
  }, [currentDocument, saveCurrentDocument, title])

  const setActiveDocument = useCallback(
    (index: number) => {
      const currentSession = sessionRef.current
      if (!currentSession || index < 0 || index >= currentSession.documents.length) return
      syncCurrentEditorSnapshot()
      persistSession({
        ...currentSession,
        activeIndex: index,
        updatedAt: new Date().toISOString(),
      })
    },
    [persistSession, syncCurrentEditorSnapshot]
  )

  const reorderDocuments = useCallback(
    (fromIndex: number, toIndex: number) => {
      const currentSession = sessionRef.current
      if (!currentSession || fromIndex === toIndex || toIndex < 0 || toIndex >= currentSession.documents.length) return

      syncCurrentEditorSnapshot()

      const nextDocuments = [...currentSession.documents]
      const [moved] = nextDocuments.splice(fromIndex, 1)
      nextDocuments.splice(toIndex, 0, moved)
      const nextActiveIndex = nextDocuments.findIndex((document) => document.id === moved.id)

      persistSession({
        ...currentSession,
        documents: nextDocuments,
        activeIndex: nextActiveIndex,
        updatedAt: new Date().toISOString(),
      })
    },
    [persistSession, syncCurrentEditorSnapshot]
  )

  const handleTitleChange = useCallback(
    (nextTitle: string) => {
      setTitle(nextTitle)
      updateCurrentDocument((document) => ({
        ...document,
        manifest: {
          ...document.manifest,
          title: nextTitle,
        },
      }))
    },
    [updateCurrentDocument]
  )

  const handleLayoutFontFamilyChange = useCallback((fontFamily: string) => {
    setLayoutFontFamily(fontFamily)
    layoutEditorRef.current?.applyFontFamily(fontFamily || null)
  }, [])

  const handleLayoutFontSizeChange = useCallback((fontSize: string) => {
    setLayoutFontSize(fontSize)
    layoutEditorRef.current?.applyFontSize(fontSize || null)
  }, [])

  const renderLayoutToolbar = () => (
    <div className="docu-editor-toolbar">
      <div className="docu-editor-toolbar-title">
        <div>
          <div className="docu-section-label">레이아웃 편집기</div>
          <input
            type="text"
            value={title}
            onChange={(event) => handleTitleChange(event.target.value)}
            placeholder="문서 제목"
            className="mt-1 w-full border-none bg-transparent text-2xl font-semibold text-slate-950 outline-none placeholder:text-slate-400"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void saveCurrentDocument(true)} disabled={isSaving} className="docu-button docu-button-primary">
            {isSaving ? '저장 중...' : '저장'}
          </button>
          <button type="button" onClick={handleExportPdf} disabled={isExporting} className="docu-button docu-button-dark">
            {isExporting ? 'PDF 생성 중...' : 'PDF 내보내기'}
          </button>
        </div>
      </div>

      <div className="docu-tool-row">
        <div className="docu-tool-group">
          <span className="docu-tool-label">모드</span>
          <span className="border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-medium text-teal-700">
            PDF / IMAGE OBJECTS
          </span>
        </div>

        <div className="docu-tool-group">
          <span className="docu-tool-label">글꼴</span>
          <select
            value={layoutFontFamily}
            onChange={(event) => handleLayoutFontFamilyChange(event.target.value)}
            className="docu-tool-select min-w-[220px]"
          >
            <option value="">기본 글꼴</option>
            {EDITOR_FONT_FAMILIES.map((font) => (
              <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                {font.label}
              </option>
            ))}
          </select>
          <select
            value={layoutFontSize}
            onChange={(event) => handleLayoutFontSizeChange(event.target.value)}
            className="docu-tool-select w-[92px]"
          >
            <option value="">크기</option>
            {LAYOUT_FONT_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        <div className="docu-tool-group">
          <span className="docu-tool-label">텍스트</span>
          <button type="button" onClick={() => layoutEditorRef.current?.toggleBold()} className="docu-tool-button">B</button>
          <button type="button" onClick={() => layoutEditorRef.current?.toggleItalic()} className="docu-tool-button">I</button>
          <button type="button" onClick={() => layoutEditorRef.current?.toggleUnderline()} className="docu-tool-button">U</button>
          <label className="docu-tool-color">
            <span>색상</span>
            <input
              type="color"
              value={layoutTextColor}
              onChange={(event) => {
                setLayoutTextColor(event.target.value)
                layoutEditorRef.current?.applyTextColor(event.target.value)
              }}
              className="h-7 w-7 cursor-pointer border-none bg-transparent p-0"
            />
          </label>
        </div>

        <div className="docu-tool-group">
          <span className="docu-tool-label">정렬</span>
          {(['left', 'center', 'right', 'justify'] as const).map((align) => (
            <button
              key={align}
              type="button"
              onClick={() => layoutEditorRef.current?.applyTextAlign(align)}
              className="docu-tool-button"
            >
              {align === 'left' ? '좌' : align === 'center' ? '중' : align === 'right' ? '우' : '균'}
            </button>
          ))}
        </div>

        <div className="docu-tool-group">
          <span className="docu-tool-label">기록</span>
          <button type="button" onClick={() => layoutEditorRef.current?.undo()} className="docu-tool-button">Undo</button>
          <button type="button" onClick={() => layoutEditorRef.current?.redo()} className="docu-tool-button">Redo</button>
        </div>
      </div>
    </div>
  )

  if (!session || !currentDocument) {
    return null
  }

  return (
    <div className="bg-docu-base min-h-screen">
      <div className="docu-editor-layout">
        <aside className="docu-sidebar-flat">
          <div className="border-b border-slate-200 p-4">
            <div className="docu-brand-title">DOCU</div>
            <p className="mt-2 text-sm text-slate-500">문서 편집 세션</p>
            <button type="button" onClick={() => router.push('/')} className="docu-button docu-button-secondary mt-4">
              새 문서 추가
            </button>
          </div>

          <div className="border-b border-slate-200 px-4 py-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="border border-slate-200 bg-white px-3 py-3">
                <div className="text-xs uppercase tracking-[0.12em] text-slate-500">문서 수</div>
                <div className="mt-2 text-2xl font-semibold text-slate-950">{session.documents.length}</div>
              </div>
              <div className="border border-slate-200 bg-white px-3 py-3">
                <div className="text-xs uppercase tracking-[0.12em] text-slate-500">활성 문서</div>
                <div className="mt-2 text-2xl font-semibold text-slate-950">{currentIndex + 1}</div>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {session.documents.map((document, index) => {
              const active = index === currentIndex
              const warningCount = document.warnings.length

              return (
                <button
                  key={document.id}
                  type="button"
                  onClick={() => setActiveDocument(index)}
                  className={`docu-sidebar-row ${active ? 'bg-stone-100' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-slate-300 bg-white text-sm font-medium text-slate-900">
                      {index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-950">{document.manifest.title}</div>
                      <div className="mt-1 truncate text-xs text-slate-500">{document.manifest.originalFileName}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                          {document.manifest.originalFormat.toUpperCase()}
                        </span>
                        {warningCount > 0 && (
                          <span className="border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
                            경고 {warningCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <span
                      onClick={(event) => {
                        event.stopPropagation()
                        reorderDocuments(index, index - 1)
                      }}
                      className={`docu-button docu-button-secondary ${index === 0 ? 'pointer-events-none opacity-40' : ''}`}
                    >
                      위
                    </span>
                    <span
                      onClick={(event) => {
                        event.stopPropagation()
                        reorderDocuments(index, index + 1)
                      }}
                      className={`docu-button docu-button-secondary ${index === session.documents.length - 1 ? 'pointer-events-none opacity-40' : ''}`}
                    >
                      아래
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </aside>

        <main className="docu-editor-main">
          <div className="docu-editor-header">
            <div>
              <div className="docu-section-label">현재 편집 중</div>
              <div className="mt-1 text-2xl font-semibold text-slate-950">
                {currentIndex + 1} / {session.documents.length} · {currentDocument.manifest.title}
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                <span>원본: {currentDocument.manifest.originalFileName}</span>
                <span>형식: {currentDocument.manifest.originalFormat.toUpperCase()}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveDocument(currentIndex - 1)}
                disabled={currentIndex === 0}
                className="docu-button docu-button-secondary"
              >
                이전 문서
              </button>
              <button
                type="button"
                onClick={() => setActiveDocument(currentIndex + 1)}
                disabled={currentIndex >= session.documents.length - 1}
                className="docu-button docu-button-secondary"
              >
                다음 문서
              </button>
            </div>
          </div>

          <div className="docu-editor-stage pb-3 pt-4">
            {layoutMode ? (
              renderLayoutToolbar()
            ) : (
              <Toolbar
                editor={editor}
                onSave={() => void saveCurrentDocument(true)}
                onExportPdf={handleExportPdf}
                isSaving={isSaving}
                isExporting={isExporting}
                title={title}
                onTitleChange={handleTitleChange}
              />
            )}
          </div>

          {currentDocument.warnings.length > 0 && (
            <div className="docu-editor-stage border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {currentDocument.warnings.map((warning, index) => (
                <div key={`${currentDocument.id}-warning-${index}`}>{warning}</div>
              ))}
            </div>
          )}

          {statusMsg && (
            <div className="docu-editor-stage mt-3 border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
              {statusMsg}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-auto py-4">
            <div className="docu-editor-stage">
              {layoutMode ? (
                <div className="docu-panel overflow-hidden p-0">
                  <LayoutEditor
                    key={currentDocument.id}
                    ref={layoutEditorRef}
                    html={documentHtml}
                    onChange={handleCurrentHtmlChange}
                  />
                </div>
              ) : (
                <div className="editor-a4 animate-fade-in overflow-hidden">
                  <EditorContent editor={editor} />
                </div>
              )}
            </div>
          </div>

          <footer className="border-t border-slate-200 bg-white py-3 text-xs text-slate-500">
            <div className="docu-editor-stage flex flex-wrap gap-4">
              <span>생성: {formatTimestamp(currentDocument.manifest.created)}</span>
              <span>수정: {formatTimestamp(currentDocument.manifest.modified)}</span>
              <span>문자 수: {currentDocument.manifest.charCount ?? 0}</span>
            </div>
          </footer>
        </main>
      </div>
    </div>
  )
}

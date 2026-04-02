'use client'

/**
 * 에디터 페이지
 * URL 쿼리: ?data=<base64_skkf>
 * 또는 sessionStorage에서 skkfData 읽기
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useEditor } from '@tiptap/react'
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
import { EditorContent } from '@tiptap/react'
import Toolbar from '@/components/Toolbar'
import { SKKFManifest } from '@/lib/skkf/schema'
import { FontSize } from '@/lib/extensions/font-size'

export default function EditorPage() {
  const router = useRouter()
  const [skkfBase64, setSkkfBase64] = useState<string>('')
  const [manifest, setManifest] = useState<SKKFManifest | null>(null)
  const [title, setTitle] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string>('')
  const [warnings, setWarnings] = useState<string[]>([])
  const autoSaveTimer = useRef<NodeJS.Timeout>()

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
    content: '',
    editorProps: {
      attributes: {
        class:
          'prose prose-base max-w-none min-h-[70vh] p-8 focus:outline-none font-sans leading-relaxed',
      },
    },
    onUpdate: ({ editor }) => {
      // 자동 저장 (3초 디바운스)
      clearTimeout(autoSaveTimer.current)
      autoSaveTimer.current = setTimeout(() => {
        handleSave(editor.getHTML(), false)
      }, 3000)
    },
  })

  // sessionStorage에서 .skkf 데이터 로드
  useEffect(() => {
    const storedData = sessionStorage.getItem('skkfData')
    const storedManifest = sessionStorage.getItem('skkfManifest')
    const storedHtml = sessionStorage.getItem('skkfHtml')
    const storedWarnings = sessionStorage.getItem('skkfWarnings')

    if (!storedData || !storedHtml) {
      router.push('/')
      return
    }

    setSkkfBase64(storedData)

    if (storedManifest) {
      const m: SKKFManifest = JSON.parse(storedManifest)
      setManifest(m)
      setTitle(m.title)
    }

    if (storedWarnings) {
      setWarnings(JSON.parse(storedWarnings))
    }

    // 에디터에 HTML 주입
    if (editor && storedHtml) {
      // iframe을 통해 HTML 파싱 (DOCTYPE, head 등 제거하고 body 내용만 추출)
      const bodyContent = extractBody(storedHtml)
      editor.commands.setContent(bodyContent || storedHtml)
    }
  }, [editor, router])

  /**
   * HTML에서 <body> 내용만 추출
   */
  const extractBody = (html: string): string => {
    const match = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)
    return match ? match[1].trim() : html
  }

  /**
   * 서버에 저장 (sessionStorage + API 동기화)
   */
  const handleSave = useCallback(
    async (html?: string, showStatus = true) => {
      if (!skkfBase64 || !editor) return

      const currentHtml = html || editor.getHTML()
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
          if (showStatus) setStatusMsg('✓ 저장됨')
        }
      } catch (err) {
        if (showStatus) setStatusMsg('저장 실패')
      } finally {
        setIsSaving(false)
        if (showStatus) setTimeout(() => setStatusMsg(''), 2000)
      }
    },
    [skkfBase64, editor, title]
  )

  /**
   * .skkf 파일 다운로드
   */
  const handleDownloadSkkf = useCallback(async () => {
    if (!editor) return

    // 먼저 저장
    await handleSave(editor.getHTML(), false)

    const blob = base64ToBlob(skkfBase64, 'application/x-skkf')
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title || 'document'}.skkf`
    a.click()
    URL.revokeObjectURL(url)
    setStatusMsg('✓ .skkf 저장 완료')
    setTimeout(() => setStatusMsg(''), 2000)
  }, [skkfBase64, editor, title, handleSave])

  /**
   * PDF 내보내기
   */
  const handleExportPdf = useCallback(async () => {
    if (!editor || !skkfBase64) return

    setIsExporting(true)
    setStatusMsg('PDF 생성 중...')

    try {
      // 현재 HTML 저장
      const currentHtml = editor.getHTML()
      await handleSave(currentHtml, false)

      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skkfBase64, title }),
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
        setStatusMsg('✓ PDF 다운로드 완료')
      } else {
        setStatusMsg(`PDF 실패: ${data.error}`)
      }
    } catch (err) {
      setStatusMsg('PDF 변환 중 오류 발생')
    } finally {
      setIsExporting(false)
      setTimeout(() => setStatusMsg(''), 3000)
    }
  }, [skkfBase64, editor, title, handleSave])

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* 툴바 */}
      <Toolbar
        editor={editor}
        onSave={() => handleSave()}
        onExportPdf={handleExportPdf}
        onDownloadSkkf={handleDownloadSkkf}
        isSaving={isSaving}
        isExporting={isExporting}
        title={title}
        onTitleChange={setTitle}
      />

      {/* 경고 메시지 */}
      {warnings.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-start gap-2">
          <span className="text-amber-500 text-sm">⚠️</span>
          <div className="text-amber-700 text-sm flex-1">
            {warnings.map((w, i) => <div key={i}>{w}</div>)}
          </div>
          <button
            onClick={() => setWarnings([])}
            className="text-amber-400 hover:text-amber-600 text-xs"
          >
            닫기
          </button>
        </div>
      )}

      {/* 상태 메시지 */}
      {statusMsg && (
        <div className="fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded-lg text-sm shadow-lg z-50 animate-fade-in">
          {statusMsg}
        </div>
      )}

      {/* 에디터 영역 (A4 스타일) */}
      <div className="flex-1 overflow-y-auto bg-gray-100 py-8">
        <div className="max-w-4xl mx-auto bg-white shadow-md rounded min-h-[29.7cm]">
          <EditorContent editor={editor} className="h-full" />
        </div>
      </div>

      {/* 하단 상태바 */}
      <div className="bg-white border-t border-gray-200 px-4 py-1 flex items-center gap-4 text-xs text-gray-400">
        {manifest && (
          <>
            <span>원본: {manifest.originalFileName}</span>
            <span>포맷: {manifest.originalFormat.toUpperCase()}</span>
            <span>생성: {new Date(manifest.created).toLocaleDateString('ko-KR')}</span>
            <span>수정: {new Date(manifest.modified).toLocaleDateString('ko-KR')}</span>
          </>
        )}
        <span className="ml-auto">.skkf v{manifest?.version || '1.0'}</span>
      </div>
    </div>
  )
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

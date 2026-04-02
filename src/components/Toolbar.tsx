'use client'

/**
 * 에디터 툴바
 * TipTap Editor 인스턴스에 명령을 전달하는 버튼 모음
 */

import { Editor } from '@tiptap/react'

interface ToolbarProps {
  editor: Editor | null
  onSave: () => void
  onExportPdf: () => void
  onDownloadSkkf: () => void
  isSaving: boolean
  isExporting: boolean
  title: string
  onTitleChange: (title: string) => void
}

const FONT_FAMILIES = [
  { label: '맑은 고딕', value: "'Malgun Gothic', sans-serif" },
  { label: '굴림', value: "'Gulim', sans-serif" },
  { label: '바탕', value: "'Batang', serif" },
  { label: '돋움', value: "'Dotum', sans-serif" },
  { label: '궁서', value: "'Gungsuh', serif" },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Times New Roman', value: "'Times New Roman', serif" },
  { label: 'Calibri', value: 'Calibri, sans-serif' },
  { label: 'Courier New', value: "'Courier New', monospace" },
]

const FONT_SIZES = ['8pt', '9pt', '10pt', '11pt', '12pt', '14pt', '16pt', '18pt', '20pt', '24pt', '28pt', '32pt', '36pt']

export default function Toolbar({
  editor,
  onSave,
  onExportPdf,
  onDownloadSkkf,
  isSaving,
  isExporting,
  title,
  onTitleChange,
}: ToolbarProps) {
  if (!editor) return null

  const btn = (
    active: boolean,
    onClick: () => void,
    label: string,
    tooltip?: string,
    disabled?: boolean
  ) => (
    <button
      key={label}
      onClick={onClick}
      title={tooltip || label}
      disabled={disabled}
      className={`px-2 py-1 rounded text-sm font-medium transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {label}
    </button>
  )

  // 현재 글꼴 감지
  const currentFontFamily = editor.getAttributes('textStyle').fontFamily || ''
  const currentFontSize = editor.getAttributes('textStyle').fontSize || ''

  // 표 안에 있는지 여부
  const inTable = editor.isActive('table')

  return (
    <div className="toolbar sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
      {/* 문서 제목 */}
      <div className="px-4 py-2 border-b border-gray-100">
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="문서 제목"
          className="w-full text-lg font-semibold text-gray-800 bg-transparent border-none outline-none placeholder-gray-400"
        />
      </div>

      {/* 1행: 글꼴 · 크기 · 제목 수준 · 텍스트 서식 · 정렬 */}
      <div className="flex flex-wrap items-center gap-1 px-4 py-1.5 border-b border-gray-100">
        {/* 글꼴 선택 */}
        <select
          title="글꼴"
          value={currentFontFamily}
          onChange={(e) => {
            if (e.target.value) {
              editor.chain().focus().setFontFamily(e.target.value).run()
            } else {
              editor.chain().focus().unsetFontFamily().run()
            }
          }}
          className="px-2 py-1 text-sm border border-gray-200 rounded bg-white text-gray-700 max-w-[130px]"
        >
          <option value="">글꼴</option>
          {FONT_FAMILIES.map((f) => (
            <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
              {f.label}
            </option>
          ))}
        </select>

        {/* 글자 크기 */}
        <select
          title="글자 크기"
          value={currentFontSize}
          onChange={(e) => {
            if (e.target.value) {
              editor.chain().focus().setFontSize(e.target.value).run()
            } else {
              editor.chain().focus().unsetFontSize().run()
            }
          }}
          className="px-2 py-1 text-sm border border-gray-200 rounded bg-white text-gray-700 w-[72px]"
        >
          <option value="">크기</option>
          {FONT_SIZES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <div className="w-px h-6 bg-gray-300 mx-0.5" />

        {/* 제목 수준 */}
        <select
          title="문단 스타일"
          onChange={(e) => {
            const level = parseInt(e.target.value)
            if (level === 0) {
              editor.chain().focus().setParagraph().run()
            } else {
              editor.chain().focus().toggleHeading({ level: level as 1|2|3|4 }).run()
            }
          }}
          className="px-2 py-1 text-sm border border-gray-200 rounded bg-white text-gray-700"
          value={
            editor.isActive('heading', { level: 1 }) ? '1' :
            editor.isActive('heading', { level: 2 }) ? '2' :
            editor.isActive('heading', { level: 3 }) ? '3' :
            editor.isActive('heading', { level: 4 }) ? '4' : '0'
          }
        >
          <option value="0">본문</option>
          <option value="1">제목 1</option>
          <option value="2">제목 2</option>
          <option value="3">제목 3</option>
          <option value="4">제목 4</option>
        </select>

        <div className="w-px h-6 bg-gray-300 mx-0.5" />

        {/* 텍스트 서식 */}
        {btn(editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'B', '굵게 (Ctrl+B)')}
        {btn(editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'I', '기울임 (Ctrl+I)')}
        {btn(editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), 'U', '밑줄 (Ctrl+U)')}
        {btn(editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run(), 'S̶', '취소선')}

        <div className="w-px h-6 bg-gray-300 mx-0.5" />

        {/* 정렬 */}
        {btn(editor.isActive({ textAlign: 'left' }), () => editor.chain().focus().setTextAlign('left').run(), '◀', '왼쪽 정렬')}
        {btn(editor.isActive({ textAlign: 'center' }), () => editor.chain().focus().setTextAlign('center').run(), '▬', '가운데 정렬')}
        {btn(editor.isActive({ textAlign: 'right' }), () => editor.chain().focus().setTextAlign('right').run(), '▶', '오른쪽 정렬')}
        {btn(editor.isActive({ textAlign: 'justify' }), () => editor.chain().focus().setTextAlign('justify').run(), '≡', '양쪽 정렬')}

        <div className="w-px h-6 bg-gray-300 mx-0.5" />

        {/* 목록 / 인용 */}
        {btn(editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), '• 목록', '순서 없는 목록')}
        {btn(editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), '1. 목록', '순서 있는 목록')}
        {btn(editor.isActive('blockquote'), () => editor.chain().focus().toggleBlockquote().run(), '❝', '인용')}

        <div className="w-px h-6 bg-gray-300 mx-0.5" />

        {/* 색상 도구 */}
        {btn(editor.isActive('highlight'), () => editor.chain().focus().toggleHighlight().run(), '형광펜', '하이라이트')}

        <label title="텍스트 색상" className="flex items-center cursor-pointer">
          <span className="text-xs text-gray-500 mr-1">색</span>
          <input
            type="color"
            className="w-6 h-6 rounded cursor-pointer border border-gray-200"
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          />
        </label>

        <div className="w-px h-6 bg-gray-300 mx-0.5" />

        {/* 이미지 삽입 */}
        <label
          title="이미지 삽입"
          className="px-2 py-1 rounded text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 cursor-pointer"
        >
          🖼 이미지
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              const reader = new FileReader()
              reader.onload = () => {
                editor.chain().focus().setImage({ src: reader.result as string }).run()
              }
              reader.readAsDataURL(file)
            }}
          />
        </label>

        <div className="w-px h-6 bg-gray-300 mx-0.5" />

        {/* 실행 취소 / 다시 실행 */}
        <button
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="실행 취소 (Ctrl+Z)"
          className="px-2 py-1 rounded text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40"
        >
          ↩
        </button>
        <button
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="다시 실행 (Ctrl+Y)"
          className="px-2 py-1 rounded text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40"
        >
          ↪
        </button>

        {/* 저장 / 내보내기 (오른쪽 끝) */}
        <div className="ml-auto flex gap-2">
          <button
            onClick={onDownloadSkkf}
            title=".skkf 파일로 다운로드"
            className="px-3 py-1 rounded text-sm bg-indigo-100 text-indigo-700 hover:bg-indigo-200 font-medium"
          >
            💾 .skkf 저장
          </button>
          <button
            onClick={onSave}
            disabled={isSaving}
            title="저장"
            className="px-3 py-1 rounded text-sm bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 font-medium"
          >
            {isSaving ? '저장 중...' : '✓ 저장'}
          </button>
          <button
            onClick={onExportPdf}
            disabled={isExporting}
            title="PDF로 내보내기"
            className="px-3 py-1 rounded text-sm bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 font-medium"
          >
            {isExporting ? 'PDF 생성 중...' : '📄 PDF'}
          </button>
        </div>
      </div>

      {/* 2행: 표 조작 (표 안에 커서가 있을 때만 표시) */}
      {inTable && (
        <div className="flex flex-wrap items-center gap-1 px-4 py-1.5 bg-blue-50 border-b border-blue-100">
          <span className="text-xs text-blue-500 font-semibold mr-1">표:</span>

          {/* 표 삽입 버튼 (이미 표 안이므로 필요없음 - 행/열 추가) */}
          <button
            onClick={() => editor.chain().focus().addRowBefore().run()}
            title="위에 행 추가"
            className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700 hover:bg-blue-200"
          >↑ 행 추가</button>
          <button
            onClick={() => editor.chain().focus().addRowAfter().run()}
            title="아래에 행 추가"
            className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700 hover:bg-blue-200"
          >↓ 행 추가</button>
          <button
            onClick={() => editor.chain().focus().deleteRow().run()}
            title="현재 행 삭제"
            className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-600 hover:bg-red-200"
          >행 삭제</button>

          <div className="w-px h-4 bg-blue-200 mx-0.5" />

          <button
            onClick={() => editor.chain().focus().addColumnBefore().run()}
            title="왼쪽에 열 추가"
            className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700 hover:bg-blue-200"
          >← 열 추가</button>
          <button
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            title="오른쪽에 열 추가"
            className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700 hover:bg-blue-200"
          >→ 열 추가</button>
          <button
            onClick={() => editor.chain().focus().deleteColumn().run()}
            title="현재 열 삭제"
            className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-600 hover:bg-red-200"
          >열 삭제</button>

          <div className="w-px h-4 bg-blue-200 mx-0.5" />

          <button
            onClick={() => editor.chain().focus().mergeCells().run()}
            title="셀 병합"
            className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700 hover:bg-blue-200"
          >셀 병합</button>
          <button
            onClick={() => editor.chain().focus().splitCell().run()}
            title="셀 분할"
            className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700 hover:bg-blue-200"
          >셀 분할</button>

          <div className="w-px h-4 bg-blue-200 mx-0.5" />

          <button
            onClick={() => editor.chain().focus().deleteTable().run()}
            title="표 전체 삭제"
            className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-600 hover:bg-red-200"
          >표 삭제</button>
        </div>
      )}

      {/* 표가 없을 때 표 삽입 버튼 (1행 오른쪽에 넣기 어려우므로 여기에) */}
      {!inTable && (
        <div className="flex items-center gap-1 px-4 py-1 border-b border-gray-100">
          <button
            onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            title="표 삽입 (3×3)"
            className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600 hover:bg-gray-200"
          >
            ⊞ 표 삽입 (3×3)
          </button>
          <button
            onClick={() => {
              const rows = parseInt(prompt('행 수', '3') || '3')
              const cols = parseInt(prompt('열 수', '3') || '3')
              if (rows > 0 && cols > 0) {
                editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
              }
            }}
            title="크기 지정하여 표 삽입"
            className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600 hover:bg-gray-200"
          >
            ⊞ 표 삽입 (크기 지정)
          </button>
        </div>
      )}
    </div>
  )
}

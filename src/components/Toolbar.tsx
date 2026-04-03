'use client'

import { Editor } from '@tiptap/react'
import { EDITOR_FONT_FAMILIES } from '@/lib/editor-fonts'

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

const FONT_SIZES = ['8pt', '9pt', '10pt', '11pt', '12pt', '14pt', '16pt', '18pt', '20pt', '24pt', '28pt', '32pt', '36pt']

function ToolbarButton({
  active = false,
  disabled = false,
  onClick,
  children,
  title,
}: {
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`docu-tool-button ${active ? 'docu-tool-button-active' : ''}`}
    >
      {children}
    </button>
  )
}

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

  const currentFontFamily = editor.getAttributes('textStyle').fontFamily || ''
  const currentFontSize = editor.getAttributes('textStyle').fontSize || ''
  const inTable = editor.isActive('table')

  return (
    <div className="docu-editor-toolbar">
      <div className="docu-editor-toolbar-title">
        <div>
          <div className="docu-section-label">리치 편집기</div>
          <input
            type="text"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="문서 제목"
            className="mt-1 w-full border-none bg-transparent text-2xl font-semibold text-slate-950 outline-none placeholder:text-slate-400"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onDownloadSkkf} className="docu-button docu-button-secondary">
            워크스페이스 저장
          </button>
          <button type="button" onClick={onSave} disabled={isSaving} className="docu-button docu-button-primary">
            {isSaving ? '저장 중...' : '저장'}
          </button>
          <button type="button" onClick={onExportPdf} disabled={isExporting} className="docu-button docu-button-dark">
            {isExporting ? 'PDF 생성 중...' : 'PDF 내보내기'}
          </button>
        </div>
      </div>

      <div className="docu-tool-row">
        <div className="docu-tool-group">
          <span className="docu-tool-label">글꼴</span>
          <select
            value={currentFontFamily}
            onChange={(event) => {
              if (event.target.value) {
                editor.chain().focus().setFontFamily(event.target.value).run()
              } else {
                editor.chain().focus().unsetFontFamily().run()
              }
            }}
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
            value={currentFontSize}
            onChange={(event) => {
              if (event.target.value) {
                editor.chain().focus().setFontSize(event.target.value).run()
              } else {
                editor.chain().focus().unsetFontSize().run()
              }
            }}
            className="docu-tool-select w-[92px]"
          >
            <option value="">크기</option>
            {FONT_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        <div className="docu-tool-group">
          <span className="docu-tool-label">문단</span>
          <select
            value={
              editor.isActive('heading', { level: 1 })
                ? '1'
                : editor.isActive('heading', { level: 2 })
                  ? '2'
                  : editor.isActive('heading', { level: 3 })
                    ? '3'
                    : editor.isActive('heading', { level: 4 })
                      ? '4'
                      : '0'
            }
            onChange={(event) => {
              const level = Number(event.target.value)
              if (level === 0) {
                editor.chain().focus().setParagraph().run()
                return
              }
              editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 | 4 }).run()
            }}
            className="docu-tool-select w-[116px]"
          >
            <option value="0">본문</option>
            <option value="1">제목 1</option>
            <option value="2">제목 2</option>
            <option value="3">제목 3</option>
            <option value="4">제목 4</option>
          </select>
          <ToolbarButton active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>B</ToolbarButton>
          <ToolbarButton active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>I</ToolbarButton>
          <ToolbarButton active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>U</ToolbarButton>
          <ToolbarButton active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>S</ToolbarButton>
          <ToolbarButton active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()}>H</ToolbarButton>
          <label className="docu-tool-color">
            <span>색상</span>
            <input
              type="color"
              onChange={(event) => editor.chain().focus().setColor(event.target.value).run()}
              className="h-7 w-7 cursor-pointer border-none bg-transparent p-0"
            />
          </label>
        </div>

        <div className="docu-tool-group">
          <span className="docu-tool-label">정렬</span>
          <ToolbarButton active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}>좌</ToolbarButton>
          <ToolbarButton active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}>중</ToolbarButton>
          <ToolbarButton active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}>우</ToolbarButton>
          <ToolbarButton active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()}>균</ToolbarButton>
        </div>

        <div className="docu-tool-group">
          <span className="docu-tool-label">삽입</span>
          <ToolbarButton active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>목록</ToolbarButton>
          <ToolbarButton active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1.</ToolbarButton>
          <ToolbarButton active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>인용</ToolbarButton>
          <label className="docu-tool-button cursor-pointer">
            이미지
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = () => {
                  editor.chain().focus().setImage({ src: reader.result as string }).run()
                }
                reader.readAsDataURL(file)
                event.currentTarget.value = ''
              }}
            />
          </label>
        </div>

        <div className="docu-tool-group">
          <span className="docu-tool-label">기록</span>
          <ToolbarButton disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>Undo</ToolbarButton>
          <ToolbarButton disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>Redo</ToolbarButton>
        </div>
      </div>

      <div className="border-t border-slate-200 px-4 py-3">
        {inTable ? (
          <div className="docu-tool-row">
            <div className="docu-tool-group">
              <span className="docu-tool-label">표</span>
              <ToolbarButton onClick={() => editor.chain().focus().addRowBefore().run()}>행 위</ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().addRowAfter().run()}>행 아래</ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().deleteRow().run()}>행 삭제</ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().addColumnBefore().run()}>열 왼쪽</ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().addColumnAfter().run()}>열 오른쪽</ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().deleteColumn().run()}>열 삭제</ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().mergeCells().run()}>셀 병합</ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().splitCell().run()}>셀 분할</ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().deleteTable().run()}>표 삭제</ToolbarButton>
            </div>
          </div>
        ) : (
          <div className="docu-tool-row">
            <div className="docu-tool-group">
              <span className="docu-tool-label">빠른 삽입</span>
              <ToolbarButton
                onClick={() =>
                  editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
                }
              >
                3x3 표
              </ToolbarButton>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

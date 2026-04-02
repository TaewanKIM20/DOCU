'use client'

/**
 * RichEditor — TipTap 기반 리치 텍스트 에디터
 *
 * TipTap은 ProseMirror 위에 구축된 headless 에디터.
 * 내부 데이터 모델: ProseMirror Document (JSON)
 * 입출력: HTML ↔ ProseMirror JSON (양방향 변환 지원)
 */

import { useEditor, EditorContent } from '@tiptap/react'
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
import { useEffect, useCallback } from 'react'

interface RichEditorProps {
  /** 초기 HTML 내용 */
  content: string
  /** 내용 변경 콜백 (HTML 형식) */
  onChange: (html: string) => void
}

export default function RichEditor({ content, onChange }: RichEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // StarterKit에 포함된 기능 설정
        heading: { levels: [1, 2, 3, 4] },
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
        codeBlock: {
          languageClassPrefix: 'language-',
        },
      }),
      // 이미지 (base64 임베딩 지원)
      Image.configure({
        inline: false,
        allowBase64: true,
      }),
      // 표
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      // 텍스트 정렬
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      // 밑줄
      Underline,
      // 텍스트 색상 (TextStyle 의존)
      TextStyle,
      Color,
      // 하이라이트
      Highlight.configure({ multicolor: true }),
    ],
    content,
    editorProps: {
      attributes: {
        class:
          'prose prose-sm sm:prose max-w-none min-h-[60vh] p-6 focus:outline-none font-sans leading-relaxed',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
  })

  // content prop 변경 시 에디터 내용 동기화
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, false)
    }
  }, [content, editor])

  if (!editor) return null

  return (
    <div className="editor-wrapper h-full overflow-y-auto bg-white">
      <EditorContent editor={editor} className="h-full" />
    </div>
  )
}

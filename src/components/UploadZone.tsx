'use client'

/**
 * UploadZone — 파일 업로드 드래그앤드롭 영역
 */

import { useCallback, useState, useRef } from 'react'

interface UploadZoneProps {
  onFileSelected: (file: File) => void
  isLoading: boolean
}

const ACCEPTED_FORMATS = [
  { ext: 'DOCX', desc: 'Word 문서', color: 'blue' },
  { ext: 'DOC', desc: 'Word 97-2003', color: 'blue' },
  { ext: 'PDF', desc: 'PDF 문서', color: 'red' },
  { ext: 'PNG', desc: '이미지', color: 'green' },
  { ext: 'JPG', desc: '이미지', color: 'green' },
  { ext: 'WEBP', desc: '이미지', color: 'green' },
  { ext: 'TXT', desc: '텍스트', color: 'gray' },
  { ext: 'MD', desc: '마크다운', color: 'purple' },
  { ext: 'HWPX', desc: '한글 파일', color: 'teal' },
  { ext: 'SKKF', desc: 'SKKF 파일', color: 'indigo' },
]

export default function UploadZone({ onFileSelected, isLoading }: UploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    (file: File) => {
      if (file) onFileSelected(file)
    },
    [onFileSelected]
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const onDragLeave = useCallback(() => setIsDragOver(false), [])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-8">
      {/* 로고 */}
      <div className="mb-8 text-center">
        <div className="text-5xl font-black text-indigo-600 tracking-tight">.skkf</div>
        <div className="text-lg text-gray-500 mt-2">Universal Document Platform</div>
        <div className="text-sm text-gray-400 mt-1">모든 문서를 하나의 포맷으로</div>
      </div>

      {/* 드래그앤드롭 영역 */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => !isLoading && fileInputRef.current?.click()}
        className={`
          w-full max-w-xl border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer
          transition-all duration-200 select-none
          ${isDragOver
            ? 'border-indigo-500 bg-indigo-50 scale-[1.02]'
            : 'border-gray-300 bg-white hover:border-indigo-400 hover:bg-indigo-50/30'
          }
          ${isLoading ? 'opacity-60 cursor-not-allowed' : ''}
        `}
      >
        {isLoading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <div className="text-gray-600 font-medium">파일 변환 중...</div>
            <div className="text-gray-400 text-sm">잠시만 기다려주세요</div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="text-5xl">📂</div>
            <div className="text-gray-700 font-semibold text-lg">
              {isDragOver ? '놓아주세요!' : '파일을 드래그하거나 클릭하여 업로드'}
            </div>
            <div className="text-gray-400 text-sm">
              변환하고 싶은 문서를 올려주세요
            </div>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".docx,.doc,.pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.hwpx,.skkf"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />

      {/* 지원 포맷 뱃지 */}
      <div className="mt-8 w-full max-w-xl">
        <div className="text-xs text-gray-400 text-center mb-3 uppercase tracking-wider">지원 형식</div>
        <div className="flex flex-wrap gap-2 justify-center">
          {ACCEPTED_FORMATS.map(({ ext, desc, color }) => (
            <span
              key={ext}
              title={desc}
              className={`
                px-2.5 py-1 rounded-full text-xs font-semibold
                ${color === 'blue' ? 'bg-blue-100 text-blue-700' : ''}
                ${color === 'red' ? 'bg-red-100 text-red-700' : ''}
                ${color === 'green' ? 'bg-green-100 text-green-700' : ''}
                ${color === 'gray' ? 'bg-gray-100 text-gray-600' : ''}
                ${color === 'purple' ? 'bg-purple-100 text-purple-700' : ''}
                ${color === 'teal' ? 'bg-teal-100 text-teal-700' : ''}
                ${color === 'indigo' ? 'bg-indigo-100 text-indigo-700' : ''}
              `}
            >
              .{ext.toLowerCase()}
            </span>
          ))}
        </div>
      </div>

      {/* 안내 문구 */}
      <div className="mt-6 text-xs text-gray-400 text-center max-w-sm leading-relaxed">
        업로드된 파일은 서버에서 변환 후 .skkf 포맷으로 편집 가능합니다.
        편집 완료 후 .skkf로 저장하거나 PDF로 내보낼 수 있습니다.
      </div>
    </div>
  )
}

'use client'

import { useCallback, useRef, useState } from 'react'

interface UploadZoneProps {
  onFilesSelected: (files: File[]) => void
  isBusy: boolean
}

const ACCEPT = '.docx,.doc,.pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.hwpx,.skkf'

const SUPPORTED_FORMATS = ['docx', 'doc', 'pdf', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'md', 'hwpx', 'skkf']

export default function UploadZone({ onFilesSelected, isBusy }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const emitFiles = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return
      onFilesSelected(Array.from(list))
    },
    [onFilesSelected]
  )

  return (
    <section className="docu-upload-panel">
      <div className="docu-upload-header">
        <div>
          <p className="docu-section-label">업로드 영역</p>
          <h2 className="mt-2 text-[1.45rem] font-semibold tracking-tight text-slate-950">문서를 여기에 올리세요</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
            여러 파일을 한 번에 추가할 수 있습니다. 업로드가 끝나면 오른쪽에서 순서를 정리하고 그대로 편집기로 넘어갑니다.
          </p>
        </div>
      </div>

      <div className="p-5 pt-0 sm:p-6 sm:pt-0">
        <div
          onClick={() => !isBusy && inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault()
            setIsDragOver(true)
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(event) => {
            event.preventDefault()
            setIsDragOver(false)
            if (isBusy) return
            emitFiles(event.dataTransfer.files)
          }}
          className={`docu-upload-surface ${isDragOver ? 'docu-upload-surface-active' : ''} ${isBusy ? 'docu-upload-surface-busy' : ''}`}
        >
          <div className="docu-upload-mark" aria-hidden="true">
            {isBusy ? (
              <span className="docu-loader-orbit">
                <span className="docu-loader-ring docu-loader-ring-a" />
                <span className="docu-loader-ring docu-loader-ring-b" />
                <span className="docu-loader-core" />
              </span>
            ) : (
              '+'
            )}
          </div>

          <div className="mt-5 text-[1.75rem] font-semibold tracking-tight text-slate-950 sm:text-[2rem]">
            {isBusy
              ? '문서를 편집 세션으로 준비하고 있습니다.'
              : isDragOver
                ? '지금 놓으면 바로 문서 큐에 추가됩니다'
                : '파일을 드래그하거나 클릭해서 추가하세요'}
          </div>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-[0.98rem]">
            Word, PDF, 이미지, 텍스트, HWPX를 지원합니다. 한 번에 여러 개를 넣고, 이후 순서와 편집 흐름을 그대로 이어갈 수 있습니다.
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                if (!isBusy) inputRef.current?.click()
              }}
              disabled={isBusy}
              className="docu-button docu-button-primary min-w-[138px]"
            >
              파일 선택
            </button>
            <span className="docu-upload-hint">
              {isBusy ? (
                <>
                  <span className="docu-loading-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                  문서를 준비 중입니다
                </>
              ) : (
                '드래그 앤 드롭 가능'
              )}
            </span>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(event) => {
            emitFiles(event.target.files)
            event.currentTarget.value = ''
          }}
        />

        <div className="mt-5">
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">지원 형식</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {SUPPORTED_FORMATS.map((format) => (
              <span key={format} className="docu-format-chip">
                .{format}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

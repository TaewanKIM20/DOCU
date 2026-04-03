'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import UploadZone from '@/components/UploadZone'
import {
  createEditorSession,
  EDITOR_SESSION_STORAGE_KEY,
  type EditorSessionDocument,
} from '@/lib/editor-session'
import { ParseApiResponse } from '@/lib/skkf/schema'

type QueueStatus = 'queued' | 'processing' | 'done' | 'error'

interface UploadQueueItem {
  id: string
  file: File
  status: QueueStatus
  error?: string
}

function createQueueItem(file: File): UploadQueueItem {
  return {
    id: crypto.randomUUID(),
    file,
    status: 'queued',
  }
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getStatusLabel(status: QueueStatus, error?: string) {
  if (status === 'queued') return '대기 중'
  if (status === 'processing') return '변환 중'
  if (status === 'done') return '준비 완료'
  return error || '실패'
}

function getStatusClass(status: QueueStatus) {
  if (status === 'done') return 'border-emerald-200/80 bg-emerald-50/80 text-emerald-700'
  if (status === 'processing') return 'border-sky-200/80 bg-sky-50/80 text-sky-700'
  if (status === 'error') return 'border-rose-200/80 bg-rose-50/80 text-rose-700'
  return 'border-white/60 bg-white/60 text-slate-600'
}

export default function HomePage() {
  const router = useRouter()
  const [queue, setQueue] = useState<UploadQueueItem[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState('')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [hasSavedSession, setHasSavedSession] = useState(false)

  useEffect(() => {
    setHasSavedSession(Boolean(sessionStorage.getItem(EDITOR_SESSION_STORAGE_KEY)))
  }, [])

  const readyCount = useMemo(() => queue.filter((item) => item.status !== 'error').length, [queue])
  const completedCount = useMemo(
    () => queue.filter((item) => item.status === 'done' || item.status === 'error').length,
    [queue]
  )
  const processingProgress = queue.length > 0 ? Math.max(10, Math.round((completedCount / queue.length) * 100)) : 0

  const reorderQueue = useCallback((sourceId: string, targetId: string) => {
    setQueue((current) => {
      const sourceIndex = current.findIndex((item) => item.id === sourceId)
      const targetIndex = current.findIndex((item) => item.id === targetId)
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return current

      const next = [...current]
      const [moved] = next.splice(sourceIndex, 1)
      next.splice(targetIndex, 0, moved)
      return next
    })
  }, [])

  const handleFilesSelected = useCallback((files: File[]) => {
    setError('')
    setQueue((current) => [...current, ...files.map((file) => createQueueItem(file))])
  }, [])

  const updateQueueItem = useCallback((id: string, patch: Partial<UploadQueueItem>) => {
    setQueue((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }, [])

  const clearLegacySingleDocumentKeys = useCallback(() => {
    sessionStorage.removeItem('skkfData')
    sessionStorage.removeItem('skkfManifest')
    sessionStorage.removeItem('skkfWarnings')
    sessionStorage.removeItem('skkfHtml')
  }, [])

  const handleStartEditing = useCallback(async () => {
    if (queue.length === 0) {
      setError('먼저 문서를 하나 이상 추가해 주세요.')
      return
    }

    setIsProcessing(true)
    setError('')

    try {
      const documents: EditorSessionDocument[] = []
      let failedCount = 0

      for (const item of queue) {
        updateQueueItem(item.id, { status: 'processing', error: undefined })

        try {
          const formData = new FormData()
          formData.append('file', item.file)

          const response = await fetch('/api/parse', {
            method: 'POST',
            body: formData,
          })

          const data = (await response.json()) as ParseApiResponse
          if (!response.ok || !data.success || !data.skkfBase64 || !data.manifest || !data.html) {
            throw new Error(data.error || `${item.file.name} 파일 변환에 실패했습니다.`)
          }

          documents.push({
            id: crypto.randomUUID(),
            skkfBase64: data.skkfBase64,
            html: data.html,
            manifest: data.manifest,
            warnings: data.warnings || [],
          })

          updateQueueItem(item.id, { status: 'done' })
        } catch (processingError) {
          failedCount += 1
          updateQueueItem(item.id, {
            status: 'error',
            error: processingError instanceof Error ? processingError.message : '문서 처리 중 오류가 발생했습니다.',
          })
        }
      }

      if (documents.length === 0) {
        setError('처리된 문서가 없습니다. 파일 형식과 상태를 다시 확인해 주세요.')
        setIsProcessing(false)
        return
      }

      clearLegacySingleDocumentKeys()
      const session = createEditorSession(documents)
      sessionStorage.setItem(EDITOR_SESSION_STORAGE_KEY, JSON.stringify(session))
      setHasSavedSession(true)

      if (failedCount > 0) {
        setError(`${failedCount}개 문서는 처리하지 못했습니다. 성공한 문서만 편집기로 이동합니다.`)
      }

      router.push('/editor')
    } catch (unexpectedError) {
      setError(unexpectedError instanceof Error ? unexpectedError.message : '문서를 준비하는 중 오류가 발생했습니다.')
      setIsProcessing(false)
    }
  }, [clearLegacySingleDocumentKeys, queue, router, updateQueueItem])

  return (
    <main className="bg-docu-base min-h-screen">
      {isProcessing && (
        <div className="docu-processing-overlay" aria-live="polite" aria-busy="true">
          <div className="docu-processing-card">
            <div className="docu-processing-loader" aria-hidden="true">
              <span className="docu-processing-ring docu-processing-ring-a" />
              <span className="docu-processing-ring docu-processing-ring-b" />
              <span className="docu-processing-ring docu-processing-ring-c" />
              <span className="docu-processing-core" />
            </div>
            <div className="docu-section-label">세션 준비 중</div>
            <h2 className="mt-3 text-[2rem] font-semibold tracking-tight text-slate-950 sm:text-[2.4rem]">
              문서를 편집 가능한 상태로 정리하고 있습니다
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
              업로드한 파일을 순서대로 변환한 뒤, 다음 편집 화면으로 바로 이어집니다.
            </p>

            <div className="docu-processing-progress">
              <div className="docu-processing-progress-head">
                <strong>
                  {completedCount} / {queue.length}
                </strong>
                <span>문서 처리됨</span>
              </div>
              <div className="docu-processing-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={processingProgress}>
                <span style={{ width: `${processingProgress}%` }} />
              </div>
            </div>
          </div>
        </div>
      )}

      <section className="docu-page-band docu-page-band-shell">
        <div className="docu-page-content">
          <header className="docu-shell-bar">
            <div>
              <div className="docu-brand-title">DOCU</div>
              <p className="mt-1 text-sm text-slate-600">문서를 하나의 흐름으로 정리하고 편집하는 작업 공간</p>
            </div>
            <div className="flex items-center gap-2">
              {hasSavedSession && (
                <button type="button" onClick={() => router.push('/editor')} className="docu-button docu-button-secondary">
                  이전 세션 열기
                </button>
              )}
            </div>
          </header>
        </div>
      </section>

      <section className="docu-page-band docu-page-band-workbench docu-home-hero">
        <div className="docu-page-content h-full">
          <div className="docu-home-hero-grid">
            <section className="docu-home-copy">
              <p className="docu-section-label">멀티 문서 워크플로</p>
              <h1 className="docu-home-title">
                문서 편집,
                <br />
                한 흐름으로.
              </h1>
              <p className="docu-home-lead">
                업로드, 순서 정리, 편집, PDF 병합까지 같은 세션 안에서 자연스럽게 이어집니다.
              </p>

              <div className="docu-home-flow">
                <div className="docu-home-flow-item">
                  <span>01</span>
                  <strong>올리기</strong>
                  <p>여러 파일을 한 번에 추가</p>
                </div>
                <div className="docu-home-flow-item">
                  <span>02</span>
                  <strong>정렬</strong>
                  <p>문서 순서를 바로 조정</p>
                </div>
                <div className="docu-home-flow-item">
                  <span>03</span>
                  <strong>편집</strong>
                  <p>문서별로 이동하며 수정</p>
                </div>
              </div>
            </section>

            <section className="docu-home-art">
              <div className="docu-home-glow docu-home-glow-a" />
              <div className="docu-home-glow docu-home-glow-b" />
              <div className="docu-home-sheet docu-home-sheet-back" />
              <div className="docu-home-sheet docu-home-sheet-mid" />
              <div className="docu-home-sheet docu-home-sheet-front">
                <div className="docu-home-sheet-head">
                  <span className="docu-home-sheet-dot" />
                  <span className="docu-home-sheet-dot" />
                  <span className="docu-home-sheet-dot" />
                </div>
                <div className="docu-home-sheet-body">
                  <div className="docu-home-sheet-line w-[68%]" />
                  <div className="docu-home-sheet-line w-[82%]" />
                  <div className="docu-home-sheet-line w-[54%]" />
                  <div className="docu-home-sheet-grid">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>
            </section>
          </div>

          {error && <div className="docu-home-alert mt-6">{error}</div>}

          <div className="docu-home-main-grid mt-6">
            <UploadZone onFilesSelected={handleFilesSelected} isBusy={isProcessing} />

            <section className="docu-queue-panel">
              <div className="docu-queue-header">
                <div>
                  <p className="docu-section-label">현재 순서</p>
                  <h2 className="mt-2 text-[1.45rem] font-semibold tracking-tight text-slate-950">편집 대기 문서</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    오른쪽 문서 순서가 편집기와 최종 PDF 순서에 그대로 반영됩니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleStartEditing}
                  disabled={isProcessing || readyCount === 0}
                  className="docu-button docu-button-primary min-w-[170px]"
                >
                  편집 시작{readyCount > 0 ? ` (${readyCount})` : ''}
                </button>
              </div>

              {queue.length === 0 ? (
                <div className="docu-queue-empty">
                  <div className="docu-queue-empty-number">0</div>
                  <p>아직 추가된 문서가 없습니다.</p>
                  <span>왼쪽 업로드 영역에 파일을 올리면 여기에 순서대로 쌓입니다.</span>
                </div>
              ) : (
                <div className="docu-list-table">
                  {queue.map((item, index) => {
                    const extension = item.file.name.split('.').pop()?.toUpperCase() || 'FILE'

                    return (
                      <article
                        key={item.id}
                        draggable={!isProcessing}
                        onDragStart={() => setDraggingId(item.id)}
                        onDragOver={(event) => {
                          event.preventDefault()
                        }}
                        onDrop={(event) => {
                          event.preventDefault()
                          if (draggingId) reorderQueue(draggingId, item.id)
                          setDraggingId(null)
                        }}
                        onDragEnd={() => setDraggingId(null)}
                        className={`docu-list-row ${draggingId === item.id ? 'bg-white/70' : ''}`}
                      >
                        <div className="docu-list-index">{index + 1}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-sm font-medium text-slate-950">{item.file.name}</h3>
                            <span className="border border-white/60 bg-white/55 px-2 py-0.5 text-[11px] text-slate-600 backdrop-blur-sm">
                              {extension}
                            </span>
                            <span className="text-xs text-slate-400">{formatFileSize(item.file.size)}</span>
                          </div>
                          <div className={`mt-2 inline-flex border px-2.5 py-1 text-xs backdrop-blur-sm ${getStatusClass(item.status)}`}>
                            {getStatusLabel(item.status, item.error)}
                          </div>
                        </div>
                        <div className="docu-list-actions">
                          <button
                            type="button"
                            onClick={() =>
                              setQueue((current) => {
                                if (index === 0) return current
                                const next = [...current]
                                ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
                                return next
                              })
                            }
                            disabled={isProcessing || index === 0}
                            className="docu-button docu-button-secondary"
                          >
                            위
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setQueue((current) => {
                                if (index >= current.length - 1) return current
                                const next = [...current]
                                ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
                                return next
                              })
                            }
                            disabled={isProcessing || index >= queue.length - 1}
                            className="docu-button docu-button-secondary"
                          >
                            아래
                          </button>
                          <button
                            type="button"
                            onClick={() => setQueue((current) => current.filter((entry) => entry.id !== item.id))}
                            disabled={isProcessing}
                            className="docu-button docu-button-secondary text-rose-700"
                          >
                            제거
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </section>
    </main>
  )
}

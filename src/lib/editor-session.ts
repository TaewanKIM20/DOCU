import { SKKFManifest } from '@/lib/skkf/schema'

export const EDITOR_SESSION_STORAGE_KEY = 'skkfEditorSession'
export const EDITOR_SESSION_VERSION = '2.0'

export interface EditorSessionDocument {
  id: string
  skkfBase64: string
  html: string
  manifest: SKKFManifest
  warnings: string[]
}

export interface EditorSessionState {
  version: string
  activeIndex: number
  createdAt: string
  updatedAt: string
  documents: EditorSessionDocument[]
}

export function isLayoutSessionDocument(document: Pick<EditorSessionDocument, 'html' | 'manifest'>) {
  const { html, manifest } = document
  if (!html) return false

  const hasLayoutMarkers =
    html.includes('data-layout-document') ||
    html.includes('data-layout-editable') ||
    (/<html[\s>]/i.test(html) &&
      /contenteditable\s*=\s*["']true["']/i.test(html) &&
      /position\s*:\s*absolute/i.test(html))

  if (hasLayoutMarkers) return true
  return new Set(['pdf', 'png', 'jpg', 'webp']).has(manifest.originalFormat)
}

export function createEditorSession(documents: EditorSessionDocument[], activeIndex = 0): EditorSessionState {
  const now = new Date().toISOString()
  return {
    version: EDITOR_SESSION_VERSION,
    activeIndex: clampIndex(activeIndex, documents.length),
    createdAt: now,
    updatedAt: now,
    documents,
  }
}

export function updateEditorSession(
  session: EditorSessionState,
  updater: (documents: EditorSessionDocument[]) => EditorSessionDocument[],
  activeIndex = session.activeIndex
): EditorSessionState {
  const documents = updater(session.documents)
  return {
    ...session,
    activeIndex: clampIndex(activeIndex, documents.length),
    updatedAt: new Date().toISOString(),
    documents,
  }
}

function clampIndex(index: number, length: number) {
  if (length <= 0) return 0
  return Math.min(Math.max(index, 0), length - 1)
}

'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import UploadZone from '@/components/UploadZone'

export default function HomePage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>('')

  const handleFileSelected = useCallback(
    async (file: File) => {
      setIsLoading(true)
      setError('')

      try {
        // FormData로 파일 전송
        const formData = new FormData()
        formData.append('file', file)

        const res = await fetch('/api/parse', {
          method: 'POST',
          body: formData,
        })

        const data = await res.json()

        if (!data.success || !data.skkfBase64) {
          setError(data.error || '파일 변환에 실패했습니다.')
          return
        }

        // sessionStorage에 데이터 저장 후 에디터로 이동
        // (URL 파라미터로 넘기면 너무 커질 수 있어 sessionStorage 사용)
        sessionStorage.setItem('skkfData', data.skkfBase64)
        sessionStorage.setItem('skkfManifest', JSON.stringify(data.manifest))
        sessionStorage.setItem('skkfWarnings', JSON.stringify(data.warnings || []))

        // HTML 추출해서도 저장 (에디터 초기화용)
        // 서버에서 HTML을 직접 내려주도록 parse API 확장 가능
        // 여기선 skkf를 다시 읽어 HTML 추출
        await fetchAndStoreHtml(data.skkfBase64)

        router.push('/editor')
      } catch (err) {
        setError('업로드 중 오류가 발생했습니다. 다시 시도해주세요.')
        console.error(err)
      } finally {
        setIsLoading(false)
      }
    },
    [router]
  )

  return (
    <div>
      {error && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-200 text-red-700 px-6 py-3 rounded-xl shadow-lg text-sm max-w-md text-center">
          ❌ {error}
          <button
            onClick={() => setError('')}
            className="ml-3 text-red-400 hover:text-red-600"
          >
            ✕
          </button>
        </div>
      )}
      <UploadZone onFileSelected={handleFileSelected} isLoading={isLoading} />
    </div>
  )
}

/**
 * base64 .skkf → HTML 추출 (클라이언트사이드)
 * ZIP 파싱을 피하기 위해 /api/parse 응답에 html 필드 추가하는 것을 권장
 * 임시: 별도 API 없이 간단히 처리
 */
async function fetchAndStoreHtml(skkfBase64: string) {
  // /api/read-html 엔드포인트 없이 클라이언트에서 JSZip으로 처리
  // 패키지 로딩 최소화를 위해 동적 import 사용
  const JSZip = (await import('jszip')).default
  const buffer = Uint8Array.from(atob(skkfBase64), (c) => c.charCodeAt(0))
  const zip = await JSZip.loadAsync(buffer)
  const htmlFile = zip.file('content.html')
  if (htmlFile) {
    const html = await htmlFile.async('string')
    sessionStorage.setItem('skkfHtml', html)
  }
}

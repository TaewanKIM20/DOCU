/**
 * POST /api/save
 *
 * 편집된 HTML을 기존 .skkf 파일에 저장 (업데이트)
 *
 * Request: { skkfBase64: string, html: string, title?: string }
 * Response: { success, skkfBase64 } | { success: false, error }
 */

import { NextRequest, NextResponse } from 'next/server'
import { updateSKKFBuffer } from '@/lib/skkf/writer'
import { SaveApiResponse } from '@/lib/skkf/schema'

export async function POST(request: NextRequest): Promise<NextResponse<SaveApiResponse>> {
  try {
    const body = await request.json()
    const { skkfBase64, html, title } = body

    if (!skkfBase64 || !html) {
      return NextResponse.json(
        { success: false, error: '.skkf 데이터 또는 HTML 내용이 없습니다.' },
        { status: 400 }
      )
    }

    const skkfBuffer = Buffer.from(skkfBase64, 'base64')
    const updatedBuffer = await updateSKKFBuffer(skkfBuffer, html, title)
    const updatedBase64 = updatedBuffer.toString('base64')

    return NextResponse.json({ success: true, skkfBase64: updatedBase64 })
  } catch (error) {
    console.error('[/api/save] 에러:', error)
    return NextResponse.json(
      { success: false, error: `저장 실패: ${(error as Error).message}` },
      { status: 500 }
    )
  }
}

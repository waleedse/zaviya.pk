import { NextResponse } from 'next/server'
import { unsubscribe } from '@/lib/newsletter'
import { siteUrl } from '@/lib/seo'

/** One click: the link in the mail (GET) and the List-Unsubscribe-Post one-click request (POST) both unsubscribe. */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const ok = await unsubscribe(url.searchParams.get('token') ?? '').catch(() => false)
  const lang = url.searchParams.get('lang') === 'ur' ? '/ur' : ''
  return NextResponse.redirect(`${siteUrl()}${lang}/subscribe?status=${ok ? 'unsubscribed' : 'invalid'}`, 303)
}

export async function POST(request: Request) {
  const ok = await unsubscribe(new URL(request.url).searchParams.get('token') ?? '').catch(() => false)
  return new NextResponse(null, { status: ok ? 200 : 404 })
}

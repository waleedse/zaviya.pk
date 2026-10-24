import { NextResponse } from 'next/server'
import { confirmSubscription } from '@/lib/newsletter'
import { siteUrl } from '@/lib/seo'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const ok = await confirmSubscription(url.searchParams.get('token') ?? '').catch(() => false)
  const lang = url.searchParams.get('lang') === 'ur' ? '/ur' : ''
  return NextResponse.redirect(`${siteUrl()}${lang}/subscribe?status=${ok ? 'confirmed' : 'invalid'}`, 303)
}

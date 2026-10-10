import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const title = searchParams.get('title') ?? 'Zaviya'
  const kicker = searchParams.get('kicker') ?? 'Pakistan'

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#0B0F17',
          color: '#ECEDEE',
          fontFamily: 'system-ui',
        }}
      >
        <div style={{ width: 8, background: '#2BB38A' }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 48 }}>
          <div style={{ fontSize: 18, letterSpacing: 4, textTransform: 'uppercase', color: '#2BB38A' }}>{kicker}</div>
          <div style={{ fontSize: 52, fontWeight: 700, lineHeight: 1.1, maxWidth: 640 }}>{title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 28, fontWeight: 600 }}>
            <span style={{ color: '#2BB38A' }}>z</span>
            <span>aviya</span>
          </div>
        </div>
        <div style={{ width: 360, background: 'linear-gradient(135deg, #121826, #1A2133)' }} />
      </div>
    ),
    { width: 1200, height: 630 },
  )
}

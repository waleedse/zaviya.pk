import { describe, expect, it } from 'vitest'
import { profileLabel } from '@/components/marketing/FollowBox'

describe('FollowBox profile labels', () => {
  it('names the profiles we publish', () => {
    expect(profileLabel('https://www.facebook.com/profile.php?id=61595098214182')).toBe('Facebook')
    expect(profileLabel('https://www.instagram.com/zaviyapk/')).toBe('Instagram')
    expect(profileLabel('https://x.com/zaviyapk')).toBe('X')
    expect(profileLabel('https://whatsapp.com/channel/abc')).toBe('WhatsApp')
  })

  it('skips unknown or broken links', () => {
    expect(profileLabel('https://example.com/zaviya')).toBeNull()
    expect(profileLabel('not a url')).toBeNull()
  })
})

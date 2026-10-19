import { describe, expect, it } from 'vitest'
import { xPostRecovery } from './jobs'

describe('xPostRecovery (ZAV-123)', () => {
  it('opens the compose page after composer_not_found', () => {
    expect(xPostRecovery(new Error('composer_not_found'))).toBe('compose')
  })
  it('reloads the tab when the content script is unreachable', () => {
    expect(xPostRecovery(new Error('content_script_unreachable: Could not establish connection. Receiving end does not exist.'))).toBe('reload')
  })
  it('never repeats a post that may have been sent', () => {
    expect(xPostRecovery(new Error('post_not_sent: composer still open after clicking Post twice'))).toBeNull()
    expect(xPostRecovery(new Error('content_script_no_reply'))).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { generateViaComfy, zImageWorkflow } from './comfy.js'

describe('M3 Z-Image (ComfyUI)', () => {
  it('does nothing without a url', async () => {
    expect(await generateViaComfy('x', { clusterId: '1' })).toBeNull()
  })

  it('queues the workflow, waits for history, then downloads the picture', async () => {
    const urls: string[] = []
    let polls = 0
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      urls.push(String(url))
      if (String(url).endsWith('/prompt')) {
        expect(JSON.parse(init!.body as string).prompt['5'].inputs.text).toBe('a cricket ground')
        return new Response(JSON.stringify({ prompt_id: 'p1' }))
      }
      if (String(url).includes('/history/')) {
        polls++
        return new Response(JSON.stringify(polls < 2 ? {} : { p1: { status: { completed: true, status_str: 'success' }, outputs: { '10': { images: [{ filename: 'a.png', subfolder: '', type: 'output' }] } } } }))
      }
      return new Response(new Uint8Array([1, 2, 3, 4]), { headers: { 'content-type': 'image/png' } })
    }) as unknown as typeof fetch
    const blob = await generateViaComfy('a cricket ground', { url: 'http://m3:1/', clusterId: '9', fetchImpl, pollMs: 1 })
    expect(blob?.size).toBe(4)
    expect(urls.at(-1)).toBe('http://m3:1/view?filename=a.png&subfolder=&type=output')
  })

  it('returns null on a generation error or when the M3 is offline', async () => {
    const errored = (async (url: string) =>
      String(url).endsWith('/prompt') ? new Response(JSON.stringify({ prompt_id: 'p' })) : new Response(JSON.stringify({ p: { status: { status_str: 'error' } } }))) as unknown as typeof fetch
    expect(await generateViaComfy('x', { url: 'http://m3', clusterId: '1', fetchImpl: errored, pollMs: 1 })).toBeNull()
    const offline = (async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    expect(await generateViaComfy('x', { url: 'http://m3', clusterId: '1', fetchImpl: offline })).toBeNull()
  })

  it('builds an 8-step Z-Image Turbo workflow at the asked size', () => {
    const wf = zImageWorkflow('p', 1280, 720, 5, 'z')
    expect(wf['8'].inputs.steps).toBe(8)
    expect(wf['7'].inputs).toMatchObject({ width: 1280, height: 720 })
  })
})

describe('zimagePrompt', async () => {
  const { zimagePrompt } = await import('./flux.js')
  it('keeps only the scene: no "without ..." or "No ..." clauses (Z-Image draws whatever is named)', () => {
    expect(zimagePrompt('A fuel nozzle at a petrol station at dusk, without real people, flags, logos or any text.')).toBe(
      'A realistic photograph: A fuel nozzle at a petrol station at dusk. Natural light, shallow depth of field, wide 16:9 shot, high detail.',
    )
    expect(zimagePrompt('An empty exam hall with rows of desks. No faces, no text.')).toBe(
      'A realistic photograph: An empty exam hall with rows of desks. Natural light, shallow depth of field, wide 16:9 shot, high detail.',
    )
    expect(zimagePrompt('Cricket stumps on a pitch at sunset')).toContain('Cricket stumps on a pitch at sunset.')
  })
})

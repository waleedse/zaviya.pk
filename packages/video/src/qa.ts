/** Video QA with Remotion's bundled ffprobe: the same checks the sample QA script uses. */
import { execFile } from 'node:child_process'
import { statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

interface Stream {
  codec_type: string
  codec_name: string
  pix_fmt?: string
  width?: number
  height?: number
  avg_frame_rate?: string
  r_frame_rate?: string
  sample_rate?: string
}

export interface QaCheck {
  pass: boolean
  value: string
}
export interface QaResult {
  pass: boolean
  checks: Record<'duration' | 'resolution' | 'video' | 'audio' | 'fps' | 'size', QaCheck>
}

export class QaError extends Error {
  constructor(
    public readonly result: QaResult,
    file: string,
  ) {
    const failed = Object.entries(result.checks)
      .filter(([, c]) => !c.pass)
      .map(([k, c]) => `${k} (${c.value})`)
    super(`QA failed for ${file}: ${failed.join(', ')}`)
    this.name = 'QaError'
  }
}

export async function probe(file: string): Promise<{ streams: Stream[]; format: { duration: string } }> {
  const bin = path.join(PKG, 'node_modules', '.bin', 'remotion')
  const { stdout } = await run(bin, ['ffprobe', '-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file], {
    cwd: PKG,
    maxBuffer: 20 * 1024 * 1024,
  })
  return JSON.parse(stdout.slice(stdout.indexOf('{')))
}

const fps = (s?: string) => {
  const [a, b] = (s ?? '0/1').split('/').map(Number)
  return b ? a! / b : 0
}

/** duration within 0.5 s of `expectedSeconds`, 1080x1920, h264 yuv420p, AAC, 30 fps, under 40 MB */
export async function checkVideo(file: string, expectedSeconds: number): Promise<QaResult> {
  const p = await probe(file)
  const v = p.streams.find((s) => s.codec_type === 'video')
  const a = p.streams.find((s) => s.codec_type === 'audio')
  const duration = Number(p.format.duration)
  const sizeMb = statSync(file).size / 1e6
  const checks: QaResult['checks'] = {
    duration: { pass: Math.abs(duration - expectedSeconds) <= 0.5, value: `${duration.toFixed(2)}s (want ${expectedSeconds})` },
    resolution: { pass: v?.width === 1080 && v?.height === 1920, value: `${v?.width}x${v?.height}` },
    video: { pass: v?.codec_name === 'h264' && v?.pix_fmt === 'yuv420p', value: `${v?.codec_name} ${v?.pix_fmt}` },
    audio: { pass: a?.codec_name === 'aac', value: a ? `${a.codec_name} ${a.sample_rate}Hz` : 'none' },
    fps: { pass: Math.abs(fps(v?.avg_frame_rate ?? v?.r_frame_rate) - 30) < 0.01, value: String(v?.avg_frame_rate) },
    size: { pass: sizeMb < 40, value: `${sizeMb.toFixed(1)}MB` },
  }
  return { pass: Object.values(checks).every((c) => c.pass), checks }
}

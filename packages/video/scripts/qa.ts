/** ffprobe (Remotion's bundled binary) checks for every sample MP4. Writes out/qa.json, exits 1 on any failure. */
import { execFileSync } from 'node:child_process'
import { existsSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'out')
const EXPECTED: Record<string, number> = { 'morning-30': 30, 'evening-60': 60, 'ai-tech-60': 60, 'money-45': 45, 'breaking-15': 15, 'sombre-30': 30 }
const NAMES = Object.keys(EXPECTED)

interface Stream {
  codec_type: string
  codec_name: string
  pix_fmt?: string
  width?: number
  height?: number
  r_frame_rate?: string
  avg_frame_rate?: string
  sample_rate?: string
}

function probe(file: string): { streams: Stream[]; format: { duration: string; size: string } } {
  const bin = path.join(ROOT, 'node_modules', '.bin', 'remotion')
  const out = execFileSync(bin, ['ffprobe', '-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  })
  return JSON.parse(out.slice(out.indexOf('{')))
}

const fps = (s?: string) => {
  const [a, b] = (s ?? '0/1').split('/').map(Number)
  return b ? a! / b : 0
}

const results: Record<string, { pass: boolean; checks: Record<string, { pass: boolean; value: unknown }> }> = {}
for (const name of NAMES) {
  const file = path.join(OUT, `${name}.mp4`)
  if (!existsSync(file)) {
    results[name] = { pass: false, checks: { exists: { pass: false, value: 'missing' } } }
    continue
  }
  const p = probe(file)
  const v = p.streams.find((s) => s.codec_type === 'video')
  const a = p.streams.find((s) => s.codec_type === 'audio')
  const duration = Number(p.format.duration)
  const sizeMb = statSync(file).size / 1e6
  const checks = {
    duration: { pass: Math.abs(duration - EXPECTED[name]!) <= 0.5, value: `${duration.toFixed(2)}s (want ${EXPECTED[name]})` },
    resolution: { pass: v?.width === 1080 && v?.height === 1920, value: `${v?.width}x${v?.height}` },
    video: { pass: v?.codec_name === 'h264' && v?.pix_fmt === 'yuv420p', value: `${v?.codec_name} ${v?.pix_fmt}` },
    audio: { pass: a?.codec_name === 'aac', value: a ? `${a.codec_name} ${a.sample_rate}Hz` : 'none' },
    fps: { pass: Math.abs(fps(v?.avg_frame_rate ?? v?.r_frame_rate) - 30) < 0.01, value: v?.avg_frame_rate },
    size: { pass: sizeMb < 40, value: `${sizeMb.toFixed(1)}MB` },
  }
  results[name] = { pass: Object.values(checks).every((c) => c.pass), checks }
}

writeFileSync(path.join(OUT, 'qa.json'), JSON.stringify(results, null, 2) + '\n')
const cols = ['duration', 'resolution', 'video', 'audio', 'fps', 'size'] as const
console.log(['video'.padEnd(10), ...cols.map((c) => c.padEnd(24))].join(' '))
for (const [name, r] of Object.entries(results)) {
  console.log(
    [name.padEnd(10), ...cols.map((c) => `${r.checks[c]?.pass ? 'PASS' : 'FAIL'} ${String(r.checks[c]?.value ?? '-')}`.padEnd(24))].join(' '),
  )
}
const failed = Object.values(results).some((r) => !r.pass)
console.log(failed ? 'QA FAILED' : 'QA PASSED')
process.exit(failed ? 1 : 0)

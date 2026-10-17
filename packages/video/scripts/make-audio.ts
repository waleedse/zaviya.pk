/**
 * Our own music, synthesized from code: deterministic, dependency-free, no samples, no licences.
 * Five 65 s beds (bright-a/b 120 BPM, night-a/b 110 BPM, calm 80 BPM) with a layered detuned-saw pad, a plucked
 * arpeggio on 8th notes, a sub bass, soft kick (1 and 3), clap (2 and 4), hats, a gentle feedback-delay reverb and a
 * riser into bar 1 (the first full groove bar). Plus whoosh / tick / pop effects.
 * 16-bit 48 kHz stereo WAV written with plain Node. Every bed is set to -16 LUFS integrated loudness (ITU BS.1770
 * K-weighting, measured here) with a soft limiter holding the peaks at -3 dBFS, so it sits under the effects.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'public', 'audio')
const PREVIEWS = path.join(ROOT, 'out', 'audio-previews')
const SR = 48000
const PEAK = Math.pow(10, -3 / 20) // -3 dBFS
const TARGET_LUFS = -16
const SECONDS = 65

type Stereo = [Float32Array, Float32Array]

const buf = (seconds: number): Stereo => {
  const n = Math.round(seconds * SR)
  return [new Float32Array(n), new Float32Array(n)]
}

/** Deterministic noise in [-1, 1] (seeded linear congruential generator). */
function noiseGen(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return (s / 0xffffffff) * 2 - 1
  }
}

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12)
const onePole = (fc: number) => 1 - Math.exp((-2 * Math.PI * fc) / SR)

/** Add `len` seconds of `gen(t)` at `atSec`, panned (-1..1). */
function add(b: Stereo, atSec: number, len: number, gen: (t: number, i: number) => number, pan = 0) {
  const start = Math.round(atSec * SR)
  const n = Math.round(len * SR)
  const l = Math.cos(((pan + 1) * Math.PI) / 4)
  const r = Math.sin(((pan + 1) * Math.PI) / 4)
  for (let i = 0; i < n && start + i < b[0].length; i++) {
    if (start + i < 0) continue
    const v = gen(i / SR, i)
    b[0][start + i]! += v * l
    b[1][start + i]! += v * r
  }
}

// ---- voices ------------------------------------------------------------------------------

/** PolyBLEP band-limited saw */
function saw(phase: number, dt: number): number {
  let v = 2 * phase - 1
  if (phase < dt) {
    const t = phase / dt
    v -= t + t - t * t - 1
  } else if (phase > 1 - dt) {
    const t = (phase - 1) / dt
    v -= t * t + t + t + 1
  }
  return v
}

/** Layered pad: 3 detuned saws per note through a one-pole low-pass whose cutoff breathes slowly. */
function padNote(b: Stereo, at: number, len: number, note: number, gain: number, pan: number, bright: number) {
  const f = midi(note)
  const atk = Math.min(0.5, len * 0.3)
  const rel = Math.min(0.8, len * 0.4)
  const detune = [-0.0065, 0, 0.0065]
  const ph = [0.1, 0.4, 0.7]
  let y = 0
  add(
    b,
    at,
    len + rel,
    (t) => {
      const env = Math.min(1, t / atk) * (t > len ? Math.max(0, 1 - (t - len) / rel) : 1)
      const fc = bright * (1 + 0.35 * Math.sin(2 * Math.PI * 0.11 * t + note))
      let x = 0
      for (let k = 0; k < 3; k++) {
        const fr = f * (1 + detune[k]!)
        const dt = fr / SR
        ph[k] = (ph[k]! + dt) % 1
        x += saw(ph[k]!, dt)
      }
      y += onePole(fc) * (x / 3 - y)
      return y * env * gain
    },
    pan,
  )
}

/** Karplus-Strong pluck */
function pluck(b: Stereo, at: number, note: number, gain: number, pan: number, seed: number, decay = 0.996) {
  const n = Math.max(2, Math.round(SR / midi(note)))
  const line = new Float32Array(n)
  const nz = noiseGen(seed)
  let lp = 0
  for (let i = 0; i < n; i++) {
    lp += 0.55 * (nz() - lp)
    line[i] = lp
  }
  let idx = 0
  add(
    b,
    at,
    0.7,
    (t) => {
      const out = line[idx]!
      const next = line[(idx + 1) % n]!
      line[idx] = (out + next) * 0.5 * decay
      idx = (idx + 1) % n
      return out * gain * Math.min(1, t * 400) * Math.exp(-t * 2.2)
    },
    pan,
  )
}

function sub(b: Stereo, at: number, len: number, note: number, gain: number) {
  const f = midi(note)
  add(b, at, len, (t) => {
    const env = Math.min(1, t * 120) * Math.exp(-t * 1.6) * (t > len - 0.05 ? Math.max(0, (len - t) / 0.05) : 1)
    return (Math.sin(2 * Math.PI * f * t) + 0.18 * Math.sin(4 * Math.PI * f * t)) * env * gain
  })
}

function kick(b: Stereo, at: number, gain: number) {
  let ph = 0
  add(b, at, 0.3, (t) => {
    ph += (2 * Math.PI * (44 + 95 * Math.exp(-t * 30))) / SR
    return Math.sin(ph) * Math.exp(-t * 10) * gain * Math.min(1, t * 900)
  })
}

function clap(b: Stereo, at: number, gain: number, seed: number) {
  const nz = noiseGen(seed)
  let hp = 0
  let lp = 0
  let prev = 0
  const a = onePole(2600)
  add(
    b,
    at,
    0.22,
    (t) => {
      const x = nz()
      hp = 0.82 * (hp + x - prev) // ~1 kHz high-pass
      prev = x
      lp += a * (hp - lp)
      const bursts = [0, 0.011, 0.022].reduce((e, o) => e + (t >= o ? Math.exp(-(t - o) * 260) : 0), 0) * 0.5
      return lp * (bursts + Math.exp(-t * 22) * 0.7) * gain
    },
    0.1,
  )
}

function hat(b: Stereo, at: number, gain: number, seed: number, open = false) {
  const nz = noiseGen(seed)
  let prev = 0
  add(
    b,
    at,
    open ? 0.16 : 0.05,
    (t) => {
      const x = nz()
      const hp = x - prev
      prev = x
      return hp * Math.exp(-t * (open ? 22 : 95)) * gain
    },
    0.3,
  )
}

function crash(b: Stereo, at: number, gain: number) {
  const nz = noiseGen(99)
  let prev = 0
  add(b, at, 1.6, (t) => {
    const x = nz()
    const hp = x - prev
    prev = x
    return hp * Math.exp(-t * 3.2) * gain
  })
}

/** Riser: noise through a rising band-pass plus a rising tone, building up to `len` */
function riser(b: Stereo, len: number, gain: number) {
  const nz = noiseGen(5)
  let low = 0
  let band = 0
  let ph = 0
  add(b, 0, len, (t) => {
    const p = t / len
    const fc = 300 * Math.pow(20, p)
    const f = 2 * Math.sin((Math.PI * fc) / SR)
    const x = nz()
    low += f * band
    const high = x - low - 0.4 * band
    band += f * high
    ph += (2 * Math.PI * (180 + 1500 * p * p)) / SR
    const env = p * p * (t > len - 0.02 ? Math.max(0, (len - t) / 0.02) : 1)
    return (band * 0.9 + Math.sin(ph) * 0.25) * env * gain
  })
}

// ---- reverb: a few feedback delays (Schroeder) -------------------------------------------------

function reverb(src: Float32Array, delays: number[], feedback: number, damp: number): Float32Array {
  const out = new Float32Array(src.length)
  for (const d of delays) {
    const n = Math.round(d * SR)
    const line = new Float32Array(n)
    let idx = 0
    let lp = 0
    for (let i = 0; i < src.length; i++) {
      const delayed = line[idx]!
      lp += damp * (delayed - lp)
      line[idx] = src[i]! + lp * feedback
      idx = (idx + 1) % n
      out[i]! += delayed / delays.length
    }
  }
  // two all-pass stages smooth the comb pattern
  for (const d of [0.0051, 0.0017]) {
    const n = Math.round(d * SR)
    const line = new Float32Array(n)
    let idx = 0
    for (let i = 0; i < out.length; i++) {
      const delayed = line[idx]!
      const x = out[i]!
      const y = -0.5 * x + delayed
      line[idx] = x + 0.5 * y
      idx = (idx + 1) % n
      out[i] = y
    }
  }
  return out
}

// ---- arrangement -------------------------------------------------------------------------------------------

interface Spec {
  id: string
  mood: 'bright' | 'night' | 'calm'
  bpm: number
  /** chords as MIDI notes (pad voicing, root first) */
  chords: number[][]
  /** pluck pattern: indices into [root, 3rd, 5th, octave, 10th] one octave up, per 8th note */
  arp: number[]
  /** accents per 8th */
  vel: number[]
  barsPerChord: number
  drums: 'full' | 'soft' | 'none'
  padGain: number
  pluckGain: number
  brightness: number
  seed: number
}

const C3 = 48
const triad = (root: number, minor: boolean) => [root, root + (minor ? 3 : 4), root + 7, root + 12, root + (minor ? 15 : 16)]
const voice = (root: number, minor: boolean) => triad(root, minor)

const SPECS: Spec[] = [
  {
    id: 'bright-a',
    mood: 'bright',
    bpm: 120,
    chords: [voice(C3, false), voice(C3 + 7, false), voice(C3 + 9, true), voice(C3 + 5, false)], // C G Am F
    arp: [0, 2, 1, 3, 2, 1, 2, 4],
    vel: [1, 0.5, 0.75, 0.5, 0.9, 0.5, 0.75, 0.55],
    barsPerChord: 1,
    drums: 'full',
    padGain: 0.2,
    pluckGain: 0.55,
    brightness: 1500,
    seed: 11,
  },
  {
    id: 'bright-b',
    mood: 'bright',
    bpm: 120,
    chords: [voice(C3 + 2, false), voice(C3 + 9, false), voice(C3 + 11, true), voice(C3 + 7, false)], // D A Bm G
    arp: [0, 1, 2, 1, 3, 2, 1, 2],
    vel: [1, 0.6, 0.7, 0.5, 0.95, 0.55, 0.7, 0.5],
    barsPerChord: 1,
    drums: 'full',
    padGain: 0.2,
    pluckGain: 0.5,
    brightness: 1700,
    seed: 23,
  },
  {
    id: 'night-a',
    mood: 'night',
    bpm: 110,
    chords: [voice(C3 + 9, true), voice(C3 + 5, false), voice(C3, false), voice(C3 + 7, false)], // Am F C G
    arp: [0, 2, 3, 2, 1, 2, 3, 4],
    vel: [1, 0.45, 0.7, 0.45, 0.85, 0.45, 0.7, 0.5],
    barsPerChord: 2,
    drums: 'full',
    padGain: 0.22,
    pluckGain: 0.45,
    brightness: 1000,
    seed: 37,
  },
  {
    id: 'night-b',
    mood: 'night',
    bpm: 110,
    chords: [voice(C3 + 4, true), voice(C3, false), voice(C3 + 7, false), voice(C3 + 2, false)], // Em C G D
    arp: [0, 1, 2, 3, 2, 1, 4, 3],
    vel: [1, 0.5, 0.7, 0.6, 0.9, 0.5, 0.7, 0.5],
    barsPerChord: 2,
    drums: 'full',
    padGain: 0.22,
    pluckGain: 0.42,
    brightness: 900,
    seed: 41,
  },
  {
    id: 'calm',
    mood: 'calm',
    bpm: 80,
    chords: [voice(C3 + 9, true), voice(C3 + 5, false), voice(C3 + 2, true), voice(C3 + 4, false)], // Am F Dm E
    arp: [0, 2, 1, 3, 2, 4, 3, 2],
    vel: [1, 0.3, 0.6, 0.3, 0.8, 0.3, 0.55, 0.3],
    barsPerChord: 2,
    drums: 'none',
    padGain: 0.26,
    pluckGain: 0.3,
    brightness: 700,
    seed: 53,
  },
]

function render(spec: Spec): { audio: Stereo; grooveStartSec: number } {
  const beat = 60 / spec.bpm
  const bar = beat * 4
  const eighth = beat / 2
  const grooveStart = bar // bar 0 is the riser, bar 1 is "bar 1" of the groove
  const dry = buf(SECONDS)
  const wet = buf(SECONDS)
  const chordLen = bar * spec.barsPerChord
  const kicks: number[] = []

  // pad and bass follow the chords; the first chord also swells under the riser
  const nChords = Math.ceil(SECONDS / chordLen) + 1
  for (let c = 0; c < nChords; c++) {
    const chord = spec.chords[c % spec.chords.length]!
    const at = c * chordLen - (c === 0 ? 0 : 0.02)
    const notes = [chord[0]! + 12, chord[1]! + 12, chord[2]! + 12, chord[3]!]
    notes.forEach((n, i) => padNote(wet, Math.max(0, at), chordLen + 0.04, n, spec.padGain, (i - 1.5) * 0.35, spec.brightness))
    // sub bass on the root, re-struck on each bar line
    for (let k = 0; k < spec.barsPerChord; k++) {
      const t = c * chordLen + k * bar
      if (t >= grooveStart - 0.001) sub(dry, t, bar * 0.92, chord[0]! - 12, spec.padGain * 2.4)
    }
  }

  const bars = Math.floor(SECONDS / bar)
  for (let bi = 1; bi < bars; bi++) {
    const t0 = bi * bar
    const chord = spec.chords[Math.floor((bi * bar) / chordLen) % spec.chords.length]!
    const tones = [chord[0]! + 12, chord[1]! + 12, chord[2]! + 12, chord[3]! + 12, chord[4]! + 12]
    const breakdown = bi % 8 === 7 // every 8th bar the plucks rest and the pad carries on
    if (spec.drums !== 'none') {
      const pattern = spec.drums === 'full' ? [0, 1, 2, 3] : [0, 2]
      for (const beatNo of pattern) {
        const t = t0 + beatNo * beat
        if (beatNo % 2 === 0) {
          kick(dry, t, spec.drums === 'full' ? 0.5 : 0.3)
          kicks.push(t)
        } else if (spec.drums === 'full') clap(dry, t, 0.32, spec.seed + bi * 7 + beatNo)
      }
      if (spec.drums === 'full') {
        for (let e = 0; e < 8; e++) hat(dry, t0 + e * eighth, e % 2 ? 0.1 : 0.045, spec.seed * 100 + bi * 8 + e, e % 2 === 1 && e === 7)
      }
    } else if (bi % 2 === 1) {
      kick(dry, t0, 0.22)
      kicks.push(t0)
    }
    if (!breakdown) {
      for (let e = 0; e < 8; e++) {
        // calm: plucks only on the beats
        if (spec.drums === 'none' && e % 2 === 1) continue
        const note = tones[spec.arp[e]! % tones.length]!
        pluck(wet, t0 + e * eighth, note, spec.pluckGain * spec.vel[e]!, e % 2 ? 0.35 : -0.35, spec.seed * 1000 + bi * 8 + e)
      }
    }
  }

  // intro: riser into bar 1, then a crash on the downbeat
  riser(wet, grooveStart, 0.5)
  crash(dry, grooveStart, 0.18)
  kick(dry, grooveStart, 0.55)

  // sidechain-style ducking of the wet bus on every kick
  const duck = new Float32Array(wet[0].length).fill(1)
  for (const t of kicks) {
    const s = Math.round(t * SR)
    for (let i = 0; i < 0.3 * SR && s + i < duck.length; i++) duck[s + i] = Math.min(duck[s + i]!, 1 - 0.35 * Math.exp((-i / SR) * 11))
  }
  const ducked: Stereo = [wet[0].map((v, i) => v * duck[i]!), wet[1].map((v, i) => v * duck[i]!)]

  // reverb on the wet bus (different delays per channel for width), mixed with the dry bus
  const rvL = reverb(ducked[0], [0.0297, 0.0371, 0.0411, 0.0437], 0.7, 0.35)
  const rvR = reverb(ducked[1], [0.0313, 0.0353, 0.0427, 0.0459], 0.7, 0.35)
  const out = buf(SECONDS)
  for (let i = 0; i < out[0].length; i++) {
    out[0][i] = dry[0][i]! + ducked[0][i]! * 0.85 + rvL[i]! * 0.55
    out[1][i] = dry[1][i]! + ducked[1][i]! * 0.85 + rvR[i]! * 0.55
  }
  return { audio: out, grooveStartSec: grooveStart }
}

function finish(b: Stereo, fadeIn = 0.05, fadeOut = 1.2): Stereo {
  const n = b[0].length
  let peak = 0
  for (const ch of b) for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(ch[i]!))
  const g = peak > 0 ? PEAK / peak : 1
  for (const ch of b)
    for (let i = 0; i < n; i++) {
      const t = i / SR
      ch[i] = ch[i]! * g * Math.min(1, t / fadeIn) * Math.min(1, (n / SR - t) / fadeOut)
    }
  return b
}

function wav(b: Stereo): Buffer {
  const n = b[0].length
  const data = Buffer.alloc(n * 4)
  for (let i = 0; i < n; i++)
    for (let c = 0; c < 2; c++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, b[c]![i]!)) * 32767), i * 4 + c * 2)
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + data.length, 4)
  h.write('WAVEfmt ', 8)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(2, 22)
  h.writeUInt32LE(SR, 24)
  h.writeUInt32LE(SR * 4, 28)
  h.writeUInt16LE(4, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(data.length, 40)
  return Buffer.concat([h, data])
}

/** Integrated loudness (ITU-R BS.1770-4, K-weighted, 400 ms blocks, absolute and relative gating) */
export function lufs(b: Stereo): number {
  const kw = (x: Float32Array) => {
    const y = new Float32Array(x.length)
    let s1 = 0, s2 = 0, h1 = 0, h2 = 0 // stage 1 high shelf, stage 2 high-pass (direct form I states)
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0
    let a1 = 0, a2 = 0, b1 = 0, b2 = 0
    void s1; void s2; void h1; void h2
    for (let i = 0; i < x.length; i++) {
      const xi = x[i]!
      const v = 1.53512485958697 * xi - 2.69169618940638 * x1 + 1.19839281085285 * x2 + 1.69065929318241 * y1 - 0.73248077421585 * y2
      x2 = x1; x1 = xi; y2 = y1; y1 = v
      const w = v - 2 * a1 + a2 + 1.99004745483398 * b1 - 0.99007225036621 * b2
      a2 = a1; a1 = v; b2 = b1; b1 = w
      y[i] = w
    }
    return y
  }
  const ch = [kw(b[0]), kw(b[1])]
  const block = Math.round(0.4 * SR)
  const step = Math.round(0.1 * SR)
  const energies: number[] = []
  for (let s = 0; s + block <= ch[0]!.length; s += step) {
    let e = 0
    for (const c of ch) {
      let sum = 0
      for (let i = s; i < s + block; i++) sum += c[i]! * c[i]!
      e += sum / block
    }
    energies.push(e)
  }
  const lk = (e: number) => -0.691 + 10 * Math.log10(e)
  const abs = energies.filter((e) => lk(e) > -70)
  if (!abs.length) return -70
  const rel = lk(abs.reduce((a, c) => a + c, 0) / abs.length) - 10
  const gated = abs.filter((e) => lk(e) > rel)
  return lk(gated.reduce((a, c) => a + c, 0) / gated.length)
}

/** Scale to -16 LUFS, then soft-limit peaks to -3 dBFS; repeat so the limiter's loss is made up. Returns final LUFS. */
function toTargetLoudness(b: Stereo): number {
  let loud = lufs(b)
  for (let pass = 0; pass < 6; pass++) {
    const g = Math.pow(10, (TARGET_LUFS - loud) / 20)
    for (const ch of b) for (let i = 0; i < ch.length; i++) ch[i] = PEAK * Math.tanh((ch[i]! * g) / PEAK)
    loud = lufs(b)
    if (Math.abs(loud - TARGET_LUFS) < 0.3) break
  }
  return loud
}

function fades(b: Stereo, fadeIn = 0.05, fadeOut = 1.2) {
  const n = b[0].length
  for (const ch of b)
    for (let i = 0; i < n; i++) {
      const t = i / SR
      ch[i] = ch[i]! * Math.min(1, t / fadeIn) * Math.min(1, (n / SR - t) / fadeOut)
    }
}

// ---- sound effects ------------------------------------------------------------------------------------------

function whoosh(): Stereo {
  const b = buf(0.4)
  const nz = noiseGen(7)
  let low = 0
  let band = 0
  add(b, 0, 0.4, (t) => {
    const fc = 300 * Math.pow(10, (t / 0.4) * 1.1)
    const f = 2 * Math.sin((Math.PI * fc) / SR)
    const x = nz()
    low += f * band
    const high = x - low - 0.35 * band
    band += f * high
    return band * Math.sin(Math.PI * Math.min(1, t / 0.4)) ** 1.5 * 0.9
  })
  return sfxFinish(b, 0.005, 0.05)
}

function tick(): Stereo {
  const b = buf(0.05)
  add(b, 0, 0.05, (t) => (Math.sin(2 * Math.PI * 2400 * t) * 0.8 + Math.sin(2 * Math.PI * 900 * t) * 0.3) * Math.exp(-t * 110))
  return sfxFinish(b, 0.0005, 0.004)
}

function pop(): Stereo {
  const b = buf(0.08)
  let ph = 0
  add(b, 0, 0.08, (t) => {
    ph += (2 * Math.PI * (560 + 700 * Math.min(1, t / 0.04))) / SR
    return Math.sin(ph) * Math.exp(-t * 38)
  })
  return sfxFinish(b, 0.001, 0.01)
}

const sfxFinish = finish

// ---- main ---------------------------------------------------------------------------------------------------------

mkdirSync(OUT, { recursive: true })
mkdirSync(PREVIEWS, { recursive: true })
const tracks: Record<string, unknown>[] = []
for (const spec of SPECS) {
  const { audio, grooveStartSec } = render(spec)
  const loud = toTargetLoudness(audio)
  fades(audio)
  writeFileSync(path.join(OUT, `${spec.id}.wav`), wav(audio))
  writeFileSync(path.join(PREVIEWS, `${spec.id}-10s.wav`), wav([audio[0].slice(0, 10 * SR), audio[1].slice(0, 10 * SR)]))
  tracks.push({ id: spec.id, file: `audio/${spec.id}.wav`, bpm: spec.bpm, firstBeatMs: Math.round(grooveStartSec * 1000), mood: spec.mood })
  console.log(`wrote ${spec.id}.wav  ${spec.bpm} BPM  ${loud.toFixed(1)} LUFS, peak <= -3 dBFS`)
}
writeFileSync(path.join(OUT, 'whoosh.wav'), wav(whoosh()))
writeFileSync(path.join(OUT, 'tick.wav'), wav(tick()))
writeFileSync(path.join(OUT, 'pop.wav'), wav(pop()))
writeFileSync(path.join(OUT, 'tracks.json'), JSON.stringify(tracks, null, 2) + '\n')
console.log('wrote whoosh.wav tick.wav pop.wav tracks.json; previews in out/audio-previews/')

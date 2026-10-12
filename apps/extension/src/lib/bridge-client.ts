import {
  BridgeJobSchema,
  BridgeMessageSchema,
  type BridgeJob,
} from '@zaviya/shared'
import { getSettings, type PlatformKey } from './storage'
import { scanOpenPlatforms } from './tabs'

const EXTENSION_VERSION = chrome.runtime.getManifest().version

type JobHandler = (job: BridgeJob) => Promise<unknown>

export class BridgeClient {
  private ws: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private authenticated = false
  private running = false

  constructor(private readonly onJob: JobHandler) {}

  start(): void {
    this.running = true
    void this.connect()
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && (changes.bridgeUrl || changes.bridgeToken)) {
        this.reconnect()
      }
    })
  }

  isAuthenticated(): boolean {
    return this.authenticated
  }

  /** Called from the keep-alive alarm; reconnects if the socket died while the worker slept. */
  ensureConnected(): void {
    if (!this.running) return
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) void this.connect()
  }

  stop(): void {
    this.running = false
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.ws?.close()
    this.ws = null
    this.authenticated = false
  }

  private reconnect(): void {
    this.ws?.close()
    this.ws = null
    this.authenticated = false
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => void this.connect(), 1_500)
  }

  private async connect(): Promise<void> {
    if (!this.running) return
    const settings = await getSettings()
    if (!settings.bridgeToken) {
      this.scheduleReconnect()
      return
    }

    try {
      const ws = new WebSocket(settings.bridgeUrl)
      this.ws = ws

      ws.onopen = () => {
        this.sendRaw({
          type: 'hello',
          token: settings.bridgeToken,
          version: EXTENSION_VERSION,
        })
      }

      ws.onmessage = (ev) => {
        void this.onMessage(String(ev.data))
      }

      ws.onclose = () => {
        this.authenticated = false
        if (this.heartbeatTimer) {
          clearInterval(this.heartbeatTimer)
          this.heartbeatTimer = null
        }
        this.scheduleReconnect()
      }

      ws.onerror = () => {
        ws.close()
      }
    } catch {
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (!this.running) return
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => void this.connect(), 5_000)
  }

  private async onMessage(raw: string): Promise<void> {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'type' in parsed &&
      (parsed as { type: string }).type === 'hello' &&
      'ok' in parsed &&
      (parsed as { ok: boolean }).ok
    ) {
      this.authenticated = true
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = setInterval(() => void this.sendHeartbeat(), 15_000)
      void this.sendHeartbeat()
      return
    }

    const job = BridgeJobSchema.safeParse(parsed)
    if (job.success) {
      await this.handleJob(job.data)
      return
    }

    const msg = BridgeMessageSchema.safeParse(parsed)
    if (!msg.success) return
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.authenticated) return
    const settings = await getSettings()
    const scanned = await scanOpenPlatforms()
    const tabs: Record<string, boolean> = {}
    for (const key of Object.keys(scanned) as PlatformKey[]) {
      if (settings.platforms[key]) tabs[key] = scanned[key]
    }
    this.sendRaw({ type: 'heartbeat', tabs })
  }

  private async handleJob(job: BridgeJob): Promise<void> {
    const settings = await getSettings()
    const platformForJob = jobPlatform(job)
    if (platformForJob && !settings.platforms[platformForJob]) {
      this.sendRaw({ id: job.id, ok: false, error: 'platform_disabled' })
      return
    }

    try {
      const result = await this.onJob(job)
      this.sendRaw({ id: job.id, ok: true as const, result })
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      this.sendRaw({ id: job.id, ok: false as const, error })
    }
  }

  private sendRaw(payload: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    const check = BridgeMessageSchema.safeParse(payload)
    if (!check.success) {
      console.warn('[zaviya-bridge] refusing to send invalid payload', payload, check.error.message)
      return
    }
    this.ws.send(JSON.stringify(payload))
  }
}

function jobPlatform(job: BridgeJob): PlatformKey | null {
  switch (job.type) {
    case 'x.post':
    case 'x.readList':
    case 'x.search':
    case 'x.trending':
      return 'x'
    case 'instagram.post':
    case 'instagram.readProfile':
      return 'instagram'
    case 'gemini.image':
      return 'gemini'
    default:
      return null
  }
}

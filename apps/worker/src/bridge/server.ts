import { WebSocketServer, WebSocket } from 'ws'
import { BridgeJobSchema, BridgeMessageSchema, type BridgeJob, type HealActionMessage, type HealReport, type HealRequest } from '@zaviya/shared'
import { logger } from '../logger.js'

interface Pending {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class BridgeServer {
  private wss: WebSocketServer | null = null
  private socket: WebSocket | null = null
  private authenticated = false
  private tabs: Record<string, boolean> = {}
  private pending = new Map<string, Pending>()
  private heal: { decide: (r: HealRequest) => Promise<HealActionMessage>; report: (r: HealReport) => Promise<void> } | null = null

  constructor(
    private readonly port: number,
    private readonly token?: string,
    /** 127.0.0.1 on a Mac; 0.0.0.0 inside Docker so the published port reaches it */
    private readonly host = '127.0.0.1',
  ) {}

  start(): void {
    if (!this.token) {
      logger.info('Extension bridge disabled — BRIDGE_TOKEN not set')
      return
    }
    this.wss = new WebSocketServer({ host: this.host, port: this.port, maxPayload: 32 * 1024 * 1024 })
    this.wss.on('connection', (ws) => {
      ws.on('message', (raw) => this.onMessage(ws, raw.toString()))
      ws.on('close', () => {
        if (this.socket === ws) {
          this.socket = null
          this.authenticated = false
        }
      })
    })
    logger.info({ port: this.port }, 'Extension bridge listening')
  }

  stop(): void {
    this.wss?.close()
    this.wss = null
  }

  /** The extension's "eyes": answers heal.request with an allowed action and records heal.report */
  setHealHandler(h: NonNullable<BridgeServer['heal']>): void {
    this.heal = h
  }

  /** Extension is connected and authenticated (it opens platform tabs itself when needed). */
  isOnline(): boolean {
    return Boolean(this.authenticated && this.socket)
  }

  isConnected(platform: string): boolean {
    return Boolean(this.authenticated && this.socket && this.tabs[platform])
  }

  private onMessage(ws: WebSocket, raw: string): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }
    const msg = BridgeMessageSchema.safeParse(parsed)
    if (!msg.success) return

    const data = msg.data
    if ('type' in data && data.type === 'hello') {
      if (this.token && data.token === this.token) {
        this.authenticated = true
        this.socket = ws
        ws.send(JSON.stringify({ type: 'hello', ok: true }))
        logger.info({ version: data.version }, 'extension connected')
      } else {
        ws.close(4001, 'unauthorized')
      }
      return
    }
    if ('type' in data && data.type === 'heartbeat') {
      this.tabs = data.tabs
      return
    }
    if ('type' in data && data.type === 'heal.request') {
      if (ws !== this.socket || !this.authenticated) return
      const req = data
      void (this.heal?.decide(req) ?? Promise.resolve({ type: 'heal.action' as const, id: req.id, source: 'rules' as const, diagnosis: 'no heal handler', action: 'give_up' as const, needsHuman: false }))
        .catch((e): HealActionMessage => ({ type: 'heal.action', id: req.id, source: 'rules', diagnosis: `heal failed: ${e instanceof Error ? e.message : String(e)}`, action: 'give_up', needsHuman: false }))
        .then((reply) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(reply))
        })
      return
    }
    if ('type' in data && data.type === 'heal.report') {
      if (ws !== this.socket || !this.authenticated) return
      void this.heal?.report(data).catch((e) => logger.warn({ err: e }, 'heal report failed'))
      return
    }
    if ('id' in data && 'ok' in data) {
      const p = this.pending.get(data.id)
      if (!p) {
        // Finished after we gave up: still log why, so extension problems are visible.
        logger.warn({ jobId: data.id, ok: data.ok, err: data.ok ? undefined : data.error }, 'bridge job answered after timeout')
        return
      }
      clearTimeout(p.timer)
      this.pending.delete(data.id)
      if (data.ok) p.resolve(data.result)
      else p.reject(new Error(data.error))
    }
  }

  send(job: BridgeJob, timeoutMs = 120_000): Promise<unknown> {
    if (!this.socket || !this.authenticated) {
      return Promise.reject(new Error('bridge not connected'))
    }
    const parsed = BridgeJobSchema.parse(job)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(parsed.id)
        reject(new Error('bridge job timeout'))
      }, timeoutMs)
      this.pending.set(parsed.id, { resolve, reject, timer })
      this.socket!.send(JSON.stringify(parsed))
    })
  }
}

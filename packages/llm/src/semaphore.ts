/** Tiny concurrency limiter (Ollama: max 1 concurrent call). */
export class Semaphore {
  private queue: (() => void)[] = []
  private active = 0

  constructor(private readonly max: number) {}

  async acquire(): Promise<() => void> {
    if (this.active < this.max) {
      this.active++
      return () => this.release()
    }
    await new Promise<void>((resolve) => this.queue.push(resolve))
    this.active++
    return () => this.release()
  }

  private release(): void {
    this.active--
    const next = this.queue.shift()
    if (next) next()
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire()
    try {
      return await fn()
    } finally {
      release()
    }
  }
}

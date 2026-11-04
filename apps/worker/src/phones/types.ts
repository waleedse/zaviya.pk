import type { PhoneImportInput } from '@zaviya/shared'

export type FetchText = (url: string) => Promise<string | null>

export interface AdapterCtx {
  fetchText: FetchText
  /** Runs `fn` over `items` a few at a time (be gentle with the brands' sites) */
  mapLimit: <T>(items: T[], fn: (item: T) => Promise<void>) => Promise<void>
  log: (obj: Record<string, unknown>, msg: string) => void
}

export type Adapter = (ctx: AdapterCtx) => Promise<PhoneImportInput[]>

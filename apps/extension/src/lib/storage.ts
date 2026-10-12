export type PlatformKey = 'x' | 'instagram' | 'facebook' | 'gemini'

export interface ExtensionSettings {
  bridgeUrl: string
  bridgeToken: string
  platforms: Record<PlatformKey, boolean>
  /** Delay before DOM actions (ms). Architecture target: 20_000–90_000 in production. */
  actionDelayMinMs: number
  actionDelayMaxMs: number
  /** JSON overrides for Gemini selectors, e.g. {"sendButton": ["button.new-send"]} */
  geminiSelectorsJson: string
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  bridgeUrl: 'wss://zaviya.209-58-160-74.sslip.io/bridge',
  bridgeToken: 'zaviya-dev-bridge',
  platforms: { x: true, instagram: true, facebook: true, gemini: true },
  actionDelayMinMs: 2_000,
  actionDelayMaxMs: 5_000,
  geminiSelectorsJson: '',
}

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS)
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    platforms: { ...DEFAULT_SETTINGS.platforms, ...stored.platforms },
  }
}

export async function saveSettings(partial: Partial<ExtensionSettings>): Promise<void> {
  await chrome.storage.sync.set(partial)
}

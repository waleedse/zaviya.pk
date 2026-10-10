import { DEFAULT_SETTINGS, getSettings, saveSettings } from '../../lib/storage'

const bridgeUrl = document.getElementById('bridgeUrl') as HTMLInputElement
const bridgeToken = document.getElementById('bridgeToken') as HTMLInputElement
const platformX = document.getElementById('platformX') as HTMLInputElement
const platformInstagram = document.getElementById('platformInstagram') as HTMLInputElement
const platformFacebook = document.getElementById('platformFacebook') as HTMLInputElement
const delayMin = document.getElementById('delayMin') as HTMLInputElement
const delayMax = document.getElementById('delayMax') as HTMLInputElement
const saveBtn = document.getElementById('save') as HTMLButtonElement
const status = document.getElementById('status')!

async function load(): Promise<void> {
  const s = await getSettings()
  bridgeUrl.value = s.bridgeUrl
  bridgeToken.value = s.bridgeToken
  platformX.checked = s.platforms.x
  platformInstagram.checked = s.platforms.instagram
  platformFacebook.checked = s.platforms.facebook
  delayMin.value = String(s.actionDelayMinMs)
  delayMax.value = String(s.actionDelayMaxMs)
}

saveBtn.addEventListener('click', async () => {
  await saveSettings({
    bridgeUrl: bridgeUrl.value.trim() || DEFAULT_SETTINGS.bridgeUrl,
    bridgeToken: bridgeToken.value.trim(),
    platforms: {
      x: platformX.checked,
      instagram: platformInstagram.checked,
      facebook: platformFacebook.checked,
    },
    actionDelayMinMs: Number(delayMin.value) || DEFAULT_SETTINGS.actionDelayMinMs,
    actionDelayMaxMs: Number(delayMax.value) || DEFAULT_SETTINGS.actionDelayMaxMs,
  })
  status.textContent = 'Saved. Background will reconnect if URL/token changed.'
})

void load()

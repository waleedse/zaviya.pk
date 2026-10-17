// Regenerates the saved page states and screenshots next to the HTML fixtures, using the real
// collectInPage() from the extension in headless Chrome:  npx tsx src/heal/fixtures/generate.mjs
// (needs Google Chrome at the default macOS path, or CHROME_BIN)
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import WebSocket from 'ws'
import { collectInPage } from '../../../../extension/src/lib/heal-collect.ts'

const dir = dirname(fileURLToPath(import.meta.url))
const chrome = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const port = 9333 + Math.floor(Math.random() * 500)
const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check', `--user-data-dir=/tmp/zaviya-heal-fixtures-${port}`, '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let list
for (let i = 0; i < 50 && !list; i++) {
  await sleep(300)
  list = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).catch(() => undefined)
}
const page = list.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => ws.once('open', r))
let n = 0
const pending = new Map()
ws.on('message', (m) => {
  const d = JSON.parse(m)
  if (d.id && pending.has(d.id)) pending.get(d.id)(d)
})
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const id = ++n
  pending.set(id, (d) => (d.error ? rej(new Error(d.error.message)) : res(d.result)))
  ws.send(JSON.stringify({ id, method, params }))
})
await cdp('Page.enable')
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
const names = ['cookie', 'dialog', 'error', 'login']
for (const name of names) {
  await cdp('Page.navigate', { url: pathToFileURL(join(dir, `${name}.html`)).href })
  await sleep(700)
  // the extension serialises collectInPage into the page; tsx adds a __name helper that the page lacks
  const expr = `(() => { globalThis.__name = (f) => f; return (${collectInPage.toString()})() })()`
  const res = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true })
  const state = res.result.value
  const shot = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 55 })
  writeFileSync(join(dir, `${name}.state.json`), JSON.stringify({ ...state, url: `https://${name === 'dialog' ? 'x.com/home' : name === 'login' ? 'x.com/i/flow/login' : name === 'error' ? 'x.com/home' : 'x.com/home'}` }, null, 1))
  writeFileSync(join(dir, `${name}.jpg`), Buffer.from(shot.data, 'base64'))
  console.log(name, 'elements', state.elements.length, 'dialogs', state.dialogs.length)
}
ws.close()
proc.kill()

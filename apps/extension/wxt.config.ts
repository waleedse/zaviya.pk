import { defineConfig } from 'wxt'

export default defineConfig({
  extensionApi: 'chrome',
  srcDir: 'src',
  outDir: '.output',
  modulesDir: 'modules',
  manifest: {
    name: 'Zaviya Bridge',
    description: 'Local WebSocket bridge for Zaviya worker (X / Instagram / Facebook tabs)',
    version: '0.1.0',
    permissions: ['storage', 'tabs', 'alarms'],
    host_permissions: [
      '*://x.com/*',
      '*://twitter.com/*',
      '*://www.instagram.com/*',
      '*://*.facebook.com/*',
    ],
  },
})

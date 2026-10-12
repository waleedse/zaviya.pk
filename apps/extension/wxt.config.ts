import { defineConfig } from 'wxt'

export default defineConfig({
  extensionApi: 'chrome',
  srcDir: 'src',
  outDir: '.output',
  modulesDir: 'modules',
  manifest: {
    name: 'Zaviya Bridge',
    description: 'Local bridge for the Zaviya worker: Gemini images, X/Instagram discovery and posting',
    version: '0.3.0',
    // debugger: trusted keyboard input for Gemini, which ignores script-made clicks and key presses
    permissions: ['storage', 'tabs', 'alarms', 'debugger', 'scripting'],
    host_permissions: [
      '*://x.com/*',
      '*://twitter.com/*',
      '*://www.instagram.com/*',
      '*://*.facebook.com/*',
      '*://gemini.google.com/*',
      '*://*.googleusercontent.com/*',
      // Reader tab: news sites the server cannot fetch (blocked IPs, Google News redirects)
      'https://*/*',
    ],
  },
})

import { defineConfig } from '@playwright/test';

const browserName = process.env.E2E_BROWSER === 'firefox' ? 'firefox' : 'chromium';

export default defineConfig({
  testDir: './e2e',
  timeout: 90000,
  use: {
    browserName,
    baseURL: 'http://127.0.0.1:4311',
    trace: 'retain-on-failure',
    launchOptions: browserName === 'chromium'
      ? { args: ['--autoplay-policy=document-user-activation-required'] }
      : { firefoxUserPrefs: { 'media.autoplay.default': 0, 'media.autoplay.block-webaudio': false } },
  },
  webServer: process.env.E2E_REUSE_SERVER ? [] : [
    {
      command: 'ALLOWED_ORIGINS=http://127.0.0.1:4311 PORT=4310 HOST=127.0.0.1 node apps/signaling/dist/index.js',
      cwd: '../..',
      wait: { stdout: /Servidor disponível/ },
    },
    {
      command: 'VITE_TURN_URL=http://127.0.0.1:4310/turn-credentials VITE_SIGNALING_URL=ws://127.0.0.1:4310/signal node node_modules/vite/bin/vite.js dev --host 127.0.0.1 --port 4311',
      wait: { stdout: /Local:/ },
    },
  ],
});

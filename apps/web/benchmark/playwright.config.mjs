import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import base from '../playwright.config';
if (process.env.E2E_REUSE_SERVER) throw new Error('F20 requires isolated local servers; unset E2E_REUSE_SERVER');
export default defineConfig({ ...base, testDir: '.', testMatch: 'capacity.spec.mjs', timeout: 120000,
  globalSetup: './campaign-setup.mjs',
  workers: 1, retries: 0, fullyParallel: false, reporter: [['line'], ['./campaign-reporter.mjs']],
  outputDir: mkdtempSync(join(tmpdir(), 'screen-f20-playwright-')),
  use: { ...base.use, browserName: 'chromium', launchOptions: { args: ['--autoplay-policy=document-user-activation-required'] }, trace: 'off', screenshot: 'off', video: 'off' },
  // Relative server cwd in the existing config is relative to its config directory.
  webServer: base.webServer.map((server, i) => ({ ...server, cwd: i === 0 ? '../../..' : '..' })),
});

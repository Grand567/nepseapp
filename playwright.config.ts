import { defineConfig } from '@playwright/test';

process.env.NO_PROXY = 'localhost,127.0.0.1';
process.env.no_proxy = 'localhost,127.0.0.1';

export default defineConfig({
  testDir: './tests/audit',
  timeout: 180_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 2,
  reporter: [
    ['html', { outputFolder: 'audit-reports/playwright-report', open: 'never' }],
    ['json', { outputFile: 'audit-reports/playwright-report.json' }],
    ['list']
  ],
  use: {
    baseURL: 'http://127.0.0.1:3005',
    viewport: { width: 1440, height: 900 },
    actionTimeout: 60_000,
    navigationTimeout: 60_000,
  },
  webServer: [
    {
      command: 'node --max-old-space-size=2048 proxy/server.mjs',
      url: 'http://127.0.0.1:5000/api/ping',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npx vite preview --port 3005 --host 127.0.0.1',
      url: 'http://127.0.0.1:3005',
      reuseExistingServer: true,
      timeout: 60_000,
    }
  ],
});

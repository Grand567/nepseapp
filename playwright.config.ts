import { defineConfig } from '@playwright/test';

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
    baseURL: 'http://127.0.0.1:3000',
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
      command: 'cmd /c npx vite --port 3000 --host 127.0.0.1',
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: true,
      timeout: 60_000,
    }
  ],
});

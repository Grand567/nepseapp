import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/audit',
  timeout: 180_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 4,
  reporter: [
    ['html', { outputFolder: 'audit-reports/playwright-report', open: 'never' }],
    ['json', { outputFile: 'audit-reports/playwright-report.json' }],
    ['list']
  ],
  use: {
    baseURL: 'http://localhost:3000',
    viewport: { width: 1440, height: 900 },
    actionTimeout: 30_000,
    navigationTimeout: 45_000,
  },
  webServer: {
    command: 'npx vite --port 3000',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});

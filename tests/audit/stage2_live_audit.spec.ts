import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { setupAuditPage } from './audit-helpers';

test.use({
  baseURL: 'http://localhost:3000',
  extraHTTPHeaders: {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache'
  }
});

test('Wave 4.12 Live Market Audit at 11:05 AM NPT', async ({ page, context }) => {
  const state = await setupAuditPage(page);

  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });

  // Dismiss disclaimer if visible
  const disclaimerBtn = page.locator('button:has-text("I understand — proceed to the app")');
  if (await disclaimerBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await disclaimerBtn.click();
    await page.waitForTimeout(500);
  }

  await page.waitForTimeout(3000);

  // 1. Verify Market Open (Live) or session status
  const pageText = await page.evaluate(() => document.body.innerText);
  const isMarketOpen = pageText.includes('Market Open') || pageText.includes('LIVE') || pageText.includes('Live');
  console.log(`[Stage2 Live Audit] Market Open status found: ${isMarketOpen}`);

  // 2. Track turnover across ticks over a monitoring interval
  const turnoverSamples: number[] = [];
  for (let i = 0; i < 3; i++) {
    const textSample = await page.evaluate(() => document.body.innerText);
    // Extract turnover match (e.g., Turnover: 1.25 Cr, or similar)
    const match = textSample.match(/Turnover[:\s]+(?:Rs\.?\s*)?([\d,]+(?:\.\d+)?)/i);
    if (match) {
      const numVal = parseFloat(match[1].replace(/,/g, ''));
      turnoverSamples.push(numVal);
    }
    if (i < 2) await page.waitForTimeout(5000);
  }

  // 3. Verify Broker Share Percentages <= 100%
  // Check any percentage values rendered in broker cards / tables
  const percentViolations = await page.evaluate(() => {
    const allElements = Array.from(document.querySelectorAll('*'));
    const violations: { text: string; value: number }[] = [];
    for (const el of allElements) {
      if (el.children.length === 0 && el.textContent) {
        const text = el.textContent.trim();
        const m = text.match(/^(\d+(?:\.\d+)?)%$/);
        if (m) {
          const val = parseFloat(m[1]);
          if (val > 100.0) {
            violations.push({ text, value: val });
          }
        }
      }
    }
    return violations;
  });

  console.log(`[Stage2 Live Audit] Broker percentage violations count: ${percentViolations.length}`);

  // Screenshot
  const screenshotPath = path.resolve(process.cwd(), 'audit-reports/stage2_live_market.png');
  if (!fs.existsSync(path.dirname(screenshotPath))) {
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
  }
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const auditReport = {
    timestamp: new Date().toISOString(),
    stage: 'Stage 2 — Live Market Audit (11:05 AM NPT)',
    marketOpenDetected: isMarketOpen,
    turnoverSamples,
    brokerShareViolationsCount: percentViolations.length,
    brokerShareViolations: percentViolations,
    consoleErrorsCount: state.consoleErrors.length,
    pageErrorsCount: state.pageErrors.length,
    screenshotPath
  };

  fs.writeFileSync('audit-reports/stage2_live_audit.json', JSON.stringify(auditReport, null, 2));
  console.log('[Stage2 Live Audit] Report written to audit-reports/stage2_live_audit.json');

  expect(percentViolations.length).toBe(0);
});

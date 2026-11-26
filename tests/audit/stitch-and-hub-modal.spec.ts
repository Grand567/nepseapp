/**
 * tests/audit/stitch-and-hub-modal.spec.ts
 *
 * Secondary UI Surfaces Audit:
 * 1. StitchHub Design System: All 7 views under src/views/ (LiveMarketDashboard,
 *    WatchlistScreener, FloorSheetTape, PortfolioAnalytics, WaccTaxCalculator,
 *    StockDetails, OrderExecution)
 * 2. StockInformationHubModal.tsx: Unified Telemetry Hub modal across all 14 internal tabs
 */

import { test, expect } from '@playwright/test';
import { setupAuditPage, assertRuntimeHealth, recordFailure } from './audit-helpers';

const TELEMETRY_HUB_14_TABS = [
  '1. Overview',
  '2. Broker Flow & Smart Money',
  '3. AI Guru & Targets',
  'Stock Score & Selection',
  '4. Technicals',
  '5. Market Depth',
  '6. Floorsheet Tape',
  '7. Volume Profile',
  '8. Fundamentals & Lock-In',
  '9. Dividends & Rights',
  '10. Reports & Notices',
  '11. Price History & Charts',
  '12. Compare Peers',
  '13. BS Seasonality',
];

async function dismissDisclaimerIfVisible(page: any) {
  const btn = page.locator('button:has-text("I understand")').first();
  if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(300);
  }
}

test.describe('Drabyashree NEPSE - Secondary Views (StitchHub & Telemetry Hub Modal)', () => {
  test('Audit all 7 StitchHub screens under src/views/*', async ({ page }) => {
    const state = await setupAuditPage(page);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await dismissDisclaimerIfVisible(page);

    const stitchBtn = page.locator('button.header-stitch-btn').first();
    await expect(stitchBtn).toBeVisible({ timeout: 60000 });
    await stitchBtn.click();

    const bottomNav = page.locator('nav').last();
    await expect(bottomNav).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);

    // 1. LiveMarketDashboard
    let allHealthy = await assertRuntimeHealth(page, state, 'StitchHub', '1_LiveMarketDashboard');

    // 2. WatchlistScreener
    await page.locator('nav button', { hasText: /Watchlist|वाचलिस्ट/ }).first().click();
    await page.waitForTimeout(700);
    allHealthy = (await assertRuntimeHealth(page, state, 'StitchHub', '2_WatchlistScreener')) && allHealthy;

    // 3. FloorSheetTape
    await page.locator('nav button', { hasText: /Floor Sheet|फ्लोरशिट/ }).first().click();
    await page.waitForFunction(() => {
      const main = document.querySelector('main');
      if (!main) return false;
      const hasSpinner = Boolean(main.querySelector('.animate-spin'));
      const txt = main.innerText || '';
      return !hasSpinner && (txt.includes('NABIL') || txt.includes('Rs ') || txt.includes('कित्ता') || !txt.includes('लोड हुँदैछ'));
    }, { timeout: 15000 });
    allHealthy = (await assertRuntimeHealth(page, state, 'StitchHub', '3_FloorSheetTape')) && allHealthy;

    // 4. PortfolioAnalytics
    await page.locator('nav button', { hasText: /Portfolio|पोर्टफोलियो/ }).first().click();
    await page.waitForTimeout(900);
    allHealthy = (await assertRuntimeHealth(page, state, 'StitchHub', '4_PortfolioAnalytics')) && allHealthy;

    // 5. WaccTaxCalculator (opened from Portfolio view)
    const waccBtn = page.locator('main button', { hasText: /WACC|Tax Engine/ }).first();
    await expect(waccBtn).toBeVisible({ timeout: 10000 });
    await waccBtn.click();
    await page.waitForTimeout(700);
    allHealthy = (await assertRuntimeHealth(page, state, 'StitchHub', '5_WaccTaxCalculator')) && allHealthy;

    // Navigate Back to Portfolio -> Watchlist -> open scrip into StockDetails
    await page.locator('header button:has(svg.lucide-arrow-left)').first().click();
    await page.waitForTimeout(500);
    await page.locator('nav button', { hasText: /Watchlist|वाचलिस्ट/ }).first().click();
    await page.waitForTimeout(600);

    // 6. StockDetails (click NABIL or first clickable scrip card in main)
    const nabilCard = page.locator('main div.cursor-pointer', { hasText: /NABIL|SHIVM/ }).first();
    await expect(nabilCard).toBeVisible({ timeout: 10000 });
    await nabilCard.click();
    await page.waitForTimeout(900);
    allHealthy = (await assertRuntimeHealth(page, state, 'StitchHub', '6_StockDetails')) && allHealthy;

    // 7. OrderExecution modal (triggered from StockDetails Buy/Sell button)
    const orderBtn = page.locator('main button', { hasText: /Buy\/Sell|किनबेच/ }).first();
    await expect(orderBtn).toBeVisible({ timeout: 10000 });
    await orderBtn.click();
    await page.waitForTimeout(700);
    allHealthy = (await assertRuntimeHealth(page, state, 'StitchHub', '7_OrderExecution')) && allHealthy;

    if (state.consoleErrors.length > 0) {
      recordFailure({
        module: 'StitchHub',
        tabPath: 'all_7_views',
        failureType: 'CONSOLE_ERROR',
        details: state.consoleErrors.join(' | '),
      });
    }

    expect(state.pageErrors).toEqual([]);
    expect(state.consoleErrors).toEqual([]);
    expect(allHealthy).toBe(true);
  });

  test('Audit all 14 internal tabs inside StockInformationHubModal.tsx (NABIL)', async ({ page }) => {
    const state = await setupAuditPage(page);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await dismissDisclaimerIfVisible(page);
    await page.waitForFunction(() => typeof (window as any).__openStockDetail === 'function', { timeout: 60000 });

    await page.evaluate(() => {
      (window as any).__openStockDetail('NABIL');
    });

    const detailModal = page.locator('div[style*="z-index: 99999"], div[style*="zIndex: 99999"]').first();
    await expect(detailModal).toBeVisible({ timeout: 30000 });

    const telemetryTrigger = detailModal.locator('button[title="Open Unified Floorsheet & Market Data Telemetry Hub"]').first();
    await expect(telemetryTrigger).toBeVisible({ timeout: 15000 });
    await telemetryTrigger.click();

    const hubModal = page.locator('div[style*="z-index: 100000"], div[style*="zIndex: 100000"]').first();
    await expect(hubModal).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1500);

    let allHealthy = true;

    for (const tabLabel of TELEMETRY_HUB_14_TABS) {
      const tabBtn = hubModal.locator('button', { hasText: tabLabel }).first();
      await expect(tabBtn, `Missing Telemetry Hub tab: ${tabLabel}`).toBeVisible({ timeout: 10000 });
      await tabBtn.click();
      await page.waitForTimeout(700);

      const ok = await assertRuntimeHealth(page, state, 'StockInformationHubModal', tabLabel);
      if (!ok) allHealthy = false;
    }

    if (state.consoleErrors.length > 0) {
      recordFailure({
        module: 'StockInformationHubModal',
        tabPath: 'all_14_tabs',
        failureType: 'CONSOLE_ERROR',
        details: state.consoleErrors.join(' | '),
      });
    }

    expect(state.pageErrors).toEqual([]);
    expect(state.consoleErrors).toEqual([]);
    expect(allHealthy).toBe(true);
  });
});

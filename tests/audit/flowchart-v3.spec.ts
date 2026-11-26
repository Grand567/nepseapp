/**
 * tests/audit/flowchart-v3.spec.ts
 *
 * Verifies the 6-Gate Flowchart v3.0 Engine UI & /api/radar/flowchart-v3 integration
 * inside Stock Selection Screener & Short-Term Swing Selector with zero console/page/network errors.
 */

import { test, expect } from '@playwright/test';
import { setupAuditPage, assertRuntimeHealth } from './audit-helpers';

test.describe('Drabyashree NEPSE - Flowchart v3.0 Screener Integration', () => {
  test('Renders Flowchart v3.0 panel in Swing Selector & Stock Screener with clean API responses', async ({ page }) => {
    const state = await setupAuditPage(page);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof (window as any).__setActiveTab === 'function', { timeout: 60000 });
    await page.evaluate(() => (window as any).__setActiveTab('services'));
    await page.waitForFunction(() => {
      const txt = document.body.innerText;
      return txt.includes('Flagship Analytical Suites') || txt.includes('Services Hub');
    }, { timeout: 60000 });

    const servicesToCheck = ['swing-trade-selector', 'stock-selection-screener'];

    for (const serviceId of servicesToCheck) {
      const apiPromise = page.waitForResponse(
        (res) => res.url().includes('/api/radar/flowchart-v3') && res.status() === 200,
        { timeout: 20000 }
      );

      await page.evaluate((id) => {
        window.dispatchEvent(new CustomEvent('open_service', { detail: { serviceId: id } }));
      }, serviceId);

      await page.waitForSelector('.services-detail-header', { timeout: 10000 });
      const apiRes = await apiPromise;
      const json = await apiRes.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.candidates)).toBe(true);

      await expect(page.getByText('Flowchart v3.0 • 7–10D Engine')).toBeVisible({ timeout: 10000 });

      // Test toggling All Prices -> < Rs. 500
      const allPricesPromise = page.waitForResponse(
        (res) => res.url().includes('/api/radar/flowchart-v3?maxPrice=0') && res.status() === 200,
        { timeout: 20000 }
      );
      await page.getByRole('button', { name: 'All Prices' }).click();
      const allRes = await allPricesPromise;
      const allJson = await allRes.json();
      expect(allJson.success).toBe(true);

      await page.getByRole('button', { name: '< Rs. 500' }).click();
      await page.waitForTimeout(400);

      const healthy = await assertRuntimeHealth(page, state, 'FlowchartV3', serviceId);
      expect(healthy, `Runtime health check failed in ${serviceId}`).toBe(true);

      await page.evaluate(() => {
        const btn = document.querySelector('.services-back-btn');
        if (btn) (btn as HTMLElement).click();
      });
      await page.waitForSelector('.services-detail-header', { state: 'detached', timeout: 5000 }).catch(() => {});
    }
  });
});

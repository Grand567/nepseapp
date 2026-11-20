/**
 * tests/audit/services-125.spec.ts
 *
 * Parallel Audit Spec 2:
 * Dynamically loops through all 125+ services in the Services tab,
 * opening each service, visiting nested sub-tabs, cards, and sub-cards,
 * and asserting all runtime health and data integrity invariants.
 */

import { test, expect } from '@playwright/test';
import { setupAuditPage, assertRuntimeHealth, recordFailure } from './audit-helpers';
import { getAllServices, ServiceItem } from './services-registry';

test.describe('Drabyashree NEPSE - 125+ Services Hub Audit', () => {
  const allServices = getAllServices();
  const categories = Array.from(new Set(allServices.map(s => s.cat)));

  test.beforeAll(() => {
    console.log(`Discovered ${allServices.length} total services across ${categories.length} categories.`);
  });

  for (const cat of categories) {
    const catServices = allServices.filter(s => s.cat === cat);

    test(`Audit ${catServices.length} Services in category: [${cat}]`, async ({ page }) => {
      // Extended timeout for looping through category services
      test.setTimeout(300000);

      const state = await setupAuditPage(page);

      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof (window as any).__setActiveTab === 'function', { timeout: 25000 });

      // Navigate to Services Hub
      await page.evaluate(() => {
        (window as any).__setActiveTab('services');
      });

      // Wait for Services Hub to render
      await page.waitForFunction(() => {
        const txt = document.body.innerText;
        return txt.includes('Flagship Analytical Suites') || txt.includes('Matching Tools');
      }, { timeout: 25000 });

      let catFailures = 0;

      for (const s of catServices) {
        console.log(`[Category: ${cat}] Auditing service: ${s.id} ("${s.name}")`);

        // Open Service via open_service event
        await page.evaluate((id) => {
          window.dispatchEvent(new CustomEvent('open_service', { detail: { serviceId: id } }));
        }, s.id);

        try {
          await page.waitForSelector('.services-detail-header', { timeout: 7000 });
        } catch (err: any) {
          catFailures++;
          recordFailure({
            module: 'ServicesHub',
            tabPath: `${cat}/${s.id}`,
            failureType: 'PAGE_ERROR',
            details: `Service ${s.id} failed to render .services-detail-header within 7s: ${err.message}`
          });
          continue;
        }

        // Brief settling delay for data fetches
        await page.waitForTimeout(400);

        // Interact with sub-tabs / pills if present
        const subTabs = await page.locator('.services-detail-body button.segmented-pill, .services-detail-body button.tab-btn, .services-detail-body [role="tab"]').all();
        if (subTabs.length > 0) {
          for (let i = 0; i < Math.min(subTabs.length, 3); i++) {
            try {
              if (await subTabs[i].isVisible()) {
                await subTabs[i].click({ timeout: 1000 });
                await page.waitForTimeout(250);
              }
            } catch (_) {}
          }
        }

        // Assert all invariants (corrupt strings, errors, stuck spinners, zero-dim charts)
        const healthy = await assertRuntimeHealth(page, state, `Service_${cat}`, s.id);
        if (!healthy) {
          catFailures++;
        }

        // Click back button to return to grid
        await page.evaluate(() => {
          const btn = document.querySelector('.services-back-btn');
          if (btn) (btn as HTMLElement).click();
        });
        await page.waitForSelector('.services-detail-header', { state: 'detached', timeout: 5000 }).catch(() => {});
      }

      expect(catFailures, `Detected ${catFailures} invariant failures in category ${cat}`).toBe(0);
    });
  }
});

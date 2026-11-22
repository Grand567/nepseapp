/**
 * tests/audit/predictor-guru.spec.ts
 *
 * Parallel Audit Spec 4:
 * 1. Predictor Tab:
 *    - Crawl all 7 sub-tabs: 'nepse_agent', 'master_100_profit', 'nepse',
 *      'short_term_plan', 'stocks', 'entry_exit', 'macro_sentiment'
 *    - Verify non-empty predictions, valid numeric bounds, zero corrupt strings
 * 2. Guru AI Tab:
 *    - Crawl all 5 sub-tabs: 'agent', 'stock', 'sandbox', 'market', 'chat'
 *    - Verify quantitative model bounds, zero stuck spinners, runtime health
 */

import { test, expect } from '@playwright/test';
import { setupAuditPage, assertRuntimeHealth, getDbConnection, recordFailure } from './audit-helpers';

test.describe('Drabyashree NEPSE - Predictor & Guru AI Audit', () => {
  let db: any;

  test.beforeAll(() => {
    db = getDbConnection();
  });

  test.afterAll(() => {
    if (db) db.close();
  });

  test('Audit Predictor Hub (All 7 Sub-Tabs & Strategy Presets)', async ({ page }) => {
    const state = await setupAuditPage(page);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof (window as any).__setActiveTab === 'function', { timeout: 60000 });

    // Navigate to Predictor
    await page.evaluate(() => (window as any).__setActiveTab('predictor'));

    // Wait for Predictor to render
    await page.waitForFunction(() => {
      const txt = document.body.innerText;
      return txt.includes('Index Predictor') || txt.includes('Predictor');
    }, { timeout: 60000 });

    const PREDICTOR_SUBTABS = [
      { id: 'nepse_agent', label: 'NEPSE Agent' },
      { id: 'master_100_profit', label: '100% Master Guide' },
      { id: 'nepse', label: 'Index Predictor' },
      { id: 'short_term_plan', label: 'Profit Plan' },
      { id: 'stocks', label: 'Stock Screener' },
      { id: 'entry_exit', label: 'Entry/Exit Analyzer' },
      { id: 'macro_sentiment', label: 'Macro & Sentiment' },
    ];

    for (const sub of PREDICTOR_SUBTABS) {
      console.log(`[Predictor Hub] Auditing Sub-Tab: ${sub.label} (${sub.id})`);

      // Click sub-tab
      const btn = page.locator(`.predictor-subtabs-wrap button:has-text("${sub.label}")`).first();
      if (await btn.isVisible()) {
        await btn.click();
        await page.waitForTimeout(600);
      } else {
        // Fallback: switch via custom event or evaluate
        await page.evaluate((tabId) => {
          window.dispatchEvent(new CustomEvent('switch_predictor_tab', { detail: { tab: tabId } }));
        }, sub.id);
        await page.waitForTimeout(600);
      }

      // Check sub-filters or buttons inside active view
      if (sub.id === 'stocks') {
        // Click Momentum, Volume, Low Float filters if visible
        for (const f of ['Momentum', 'Volume', 'Low Float']) {
          const fBtn = page.locator(`button:has-text("${f}")`).first();
          if (await fBtn.isVisible()) {
            await fBtn.click();
            await page.waitForTimeout(300);
          }
        }
      }

      // Verify no corrupt text, no stuck spinners, no errors
      const healthy = await assertRuntimeHealth(page, state, 'PredictorHub', sub.id);
      expect(healthy).toBe(true);
    }
  });

  test('Audit Guru AI Hub (Stock Quant, Market Macro, Paper Sandbox, Agent, Chat)', async ({ page }) => {
    const state = await setupAuditPage(page);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof (window as any).__setActiveTab === 'function', { timeout: 60000 });

    // Navigate to Guru AI
    await page.evaluate(() => (window as any).__setActiveTab('ai'));

    // Wait for Guru AI to render
    await page.waitForFunction(() => {
      const txt = document.body.innerText;
      return txt.includes('Guru') || txt.includes('AI') || txt.includes('Quantitative');
    }, { timeout: 60000 });

    const AI_SUBTABS = [
      { id: 'agent', label: 'NEPSE Agent' },
      { id: 'stock', label: 'Stock Analysis' },
      { id: 'sandbox', label: 'Virtual Sandbox' },
      { id: 'market', label: 'Market Outlook' },
      { id: 'chat', label: 'AI Dialogue' },
    ];

    for (const sub of AI_SUBTABS) {
      console.log(`[Guru AI Hub] Auditing Sub-Tab: ${sub.label} (${sub.id})`);

      // Find and click the tab button inside Guru AI tab navigation
      const tabBtn = page.locator(`button:has-text("${sub.label}")`).first();
      if (await tabBtn.isVisible()) {
        await tabBtn.click();
        await page.waitForTimeout(600);
      }

      // Invariant check on each AI tab
      const healthy = await assertRuntimeHealth(page, state, 'GuruAIHub', sub.id);
      expect(healthy).toBe(true);
    }
  });
});

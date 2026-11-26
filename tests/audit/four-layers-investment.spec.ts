/**
 * tests/audit/four-layers-investment.spec.ts
 *
 * Deterministic Playwright Audit for the 4 Focused Investment Layers in ServicesHub:
 * Layer 1: Regime & Risk Vetoes
 * Layer 2: Smart Money & Entry Timing
 * Layer 3: Valuation & Solvency
 * Layer 4: Position Sizing & Post-Buy Protection
 */

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { setupAuditPage, assertRuntimeHealth } from './audit-helpers';

const FOUR_LAYER_SERVICES = [
  // Layer 1: Regime & Risk Vetoes
  { layer: 'Layer1_RegimeAndVetoes', id: 'swing-trade-selector' },
  { layer: 'Layer1_RegimeAndVetoes', id: 'promoter-shares' },
  { layer: 'Layer1_RegimeAndVetoes', id: 'distribution-leaders' },
  { layer: 'Layer1_RegimeAndVetoes', id: 'nrb-safety-shield' },

  // Layer 2: Smart Money & Entry Timing
  { layer: 'Layer2_SmartMoneyAndTiming', id: 'entry-exit-analyzer' },
  { layer: 'Layer2_SmartMoneyAndTiming', id: 'broker-smart-flow' },
  { layer: 'Layer2_SmartMoneyAndTiming', id: 'stealth-accumulation-tracker' },
  { layer: 'Layer2_SmartMoneyAndTiming', id: 'broker-dominance' },
  { layer: 'Layer2_SmartMoneyAndTiming', id: 'broker-heatmap' },
  { layer: 'Layer2_SmartMoneyAndTiming', id: 'breakout-stocks' },
  { layer: 'Layer2_SmartMoneyAndTiming', id: 'market-depth' },
  { layer: 'Layer2_SmartMoneyAndTiming', id: 'signals-track-record' },

  // Layer 3: Valuation & Solvency
  { layer: 'Layer3_ValuationAndSolvency', id: 'fundamentals-pro' },
  { layer: 'Layer3_ValuationAndSolvency', id: 'fundamental-scanner' },
  { layer: 'Layer3_ValuationAndSolvency', id: 'pe-ranking' },
  { layer: 'Layer3_ValuationAndSolvency', id: 'graham-intrinsic' },
  { layer: 'Layer3_ValuationAndSolvency', id: 'lynch-garp' },
  { layer: 'Layer3_ValuationAndSolvency', id: 'dividend-history' },
  { layer: 'Layer3_ValuationAndSolvency', id: 'dividend-kings' },
  { layer: 'Layer3_ValuationAndSolvency', id: 'equity-risk-premium' },
  { layer: 'Layer3_ValuationAndSolvency', id: 'minervini-leaderboard' },
  { layer: 'Layer3_ValuationAndSolvency', id: 'multibagger-hunter' },
  { layer: 'Layer3_ValuationAndSolvency', id: 'compare-stocks' },

  // Layer 4: Position Sizing & Post-Buy Protection
  { layer: 'Layer4_SizingAndProtection', id: 'risk-reward' },
  { layer: 'Layer4_SizingAndProtection', id: 'calculator' },
  { layer: 'Layer4_SizingAndProtection', id: 'watchlist-entry-alerts' },
  { layer: 'Layer4_SizingAndProtection', id: 'portfolio' },
];

test.describe('Drabyashree NEPSE - 4 Focused Investment Layers Audit', () => {
  test('Audits all 27 core investment services across Layers 1-4 for runtime health, API errors, and data population', async ({ page }) => {
    test.setTimeout(240000);
    const state = await setupAuditPage(page);

    const apiFailures: Array<{ serviceId: string; status: number; url: string }> = [];
    let currentServiceId = 'boot';

    // Unlock ProGate strictly inside this Playwright audit context so all 11 Pro investment services render and get audited
    await page.route('**/api/license/status*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          subscription: {
            isPro: true,
            tier: 'pro',
            source: 'server_verified',
            planDuration: '12m',
            expiresAt: Date.now() + 30 * 86400 * 1000,
          },
        }),
      });
    });

    page.on('response', (res) => {
      const url = res.url();
      if (url.includes('/api/') && res.status() >= 400) {
        apiFailures.push({ serviceId: currentServiceId, status: res.status(), url });
      }
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof (window as any).__setActiveTab === 'function', { timeout: 60000 });
    await page.evaluate(() => (window as any).__setActiveTab('services'));
    await page.waitForFunction(() => {
      const txt = document.body.innerText;
      return txt.includes('Flagship Analytical Suites') || txt.includes('Matching Tools');
    }, { timeout: 60000 });

    const report: any[] = [];

    for (const svc of FOUR_LAYER_SERVICES) {
      currentServiceId = svc.id;
      const beforeApiFailCount = apiFailures.length;
      const beforeConsoleCount = state.consoleErrors.length;
      const beforePageErrCount = state.pageErrors.length;

      await page.evaluate((id) => {
        window.dispatchEvent(new CustomEvent('open_service', { detail: { serviceId: id } }));
      }, svc.id);

      let headerOk = true;
      try {
        await page.waitForSelector('.services-detail-header', { timeout: 8000 });
      } catch {
        headerOk = false;
      }

      // Allow data fetches, lazy chunks, and loading spinners to settle cleanly
      await page.waitForFunction(() => {
        const body = document.querySelector('.services-detail-body') as HTMLElement | null;
        if (!body) return false;
        const txt = (body.innerText || '').trim();
        if (txt.length < 30) return false;
        if (/^(Loading |Constructing Broker Heatmap|Fetching real dividend|Scanning )/i.test(txt)) return false;
        if (body.querySelector('.animate-spin, .loading-shimmer-bar')) return false;
        return true;
      }, { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(400);

      // Click up to 3 sub-tabs to verify nested views don't crash
      const subTabs = await page.locator('.services-detail-body button.segmented-pill, .services-detail-body button.tab-btn, .services-detail-body [role="tab"]').all();
      let subTabCount = subTabs.length;
      for (let i = 0; i < Math.min(subTabs.length, 3); i++) {
        try {
          if (await subTabs[i].isVisible()) {
            await subTabs[i].click({ timeout: 1000 });
            await page.waitForTimeout(300);
          }
        } catch {}
      }

      const domMetrics = await page.evaluate(() => {
        const body = document.querySelector('.services-detail-body') as HTMLElement | null;
        if (!body) return { textLen: 0, rowCount: 0, inputCount: 0, emptyMatch: 'MISSING_BODY', sample: '' };
        const txt = (body.innerText || '').trim();
        const rows = body.querySelectorAll('tbody tr, .stock-row, [data-symbol], .svc-row').length;
        const inputs = body.querySelectorAll('input, select').length;
        const emptyHints = [
          'no matching stocks',
          '0 stocks',
          'no stocks match',
          'no data available',
          'something went wrong',
          'failed to load',
          'error loading',
        ];
        const lower = txt.toLowerCase();
        let hitEmpty = emptyHints.find((h) => lower.includes(h)) || '';
        if (!hitEmpty && /\b(NaN|undefined|Infinity)\b/.test(txt)) {
          hitEmpty = 'CORRUPT_TOKEN';
        }
        return {
          textLen: txt.length,
          rowCount: rows,
          inputCount: inputs,
          emptyMatch: hitEmpty,
          sample: txt.slice(0, 220).replace(/\s+/g, ' '),
        };
      });

      const healthy = await assertRuntimeHealth(page, state, svc.layer, svc.id);

      const newApiFails = apiFailures.slice(beforeApiFailCount);
      const newConsoleErrs = state.consoleErrors.slice(beforeConsoleCount);
      const newPageErrs = state.pageErrors.slice(beforePageErrCount);

      report.push({
        layer: svc.layer,
        id: svc.id,
        headerOk,
        healthy,
        subTabCount,
        ...domMetrics,
        apiFailCount: newApiFails.length,
        apiFails: newApiFails.map((f) => `${f.status} ${f.url}`),
        consoleErrors: newConsoleErrs,
        pageErrors: newPageErrs,
      });

      console.log(
        `[${svc.layer}] ${svc.id}: header=${headerOk} healthy=${healthy} rows=${domMetrics.rowCount} inputs=${domMetrics.inputCount} textLen=${domMetrics.textLen} apiFails=${newApiFails.length} empty="${domMetrics.emptyMatch}"`
      );

      await page.evaluate(() => {
        const btn = document.querySelector('.services-back-btn');
        if (btn) (btn as HTMLElement).click();
      });
      await page.waitForSelector('.services-detail-header', { state: 'detached', timeout: 5000 }).catch(() => {});
    }

    const outPath = path.resolve(process.cwd(), 'audit-reports/four-layers-audit.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

    const unhealthy = report.filter((r) => !r.headerOk || !r.healthy || r.pageErrors.length > 0);
    expect(unhealthy.length, `Unhealthy services: ${unhealthy.map((u) => u.id).join(', ')}`).toBe(0);
  });
});

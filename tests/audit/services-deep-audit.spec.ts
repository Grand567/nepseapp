/**
 * tests/audit/services-deep-audit.spec.ts
 *
 * Deep Pro-Unlocked, Data-Aware, Card & Sub-Tab Playwright Audit across ALL 125+ ServicesHub services.
 * Writes complete structured diagnostics to audit-reports/all-services-deep-audit.json.
 */

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { setupAuditPage, assertRuntimeHealth } from './audit-helpers';
import { getAllServices } from './services-registry';

const SKIP_BTN_RE = /^(refresh|reload|export|csv|excel|pdf|print|copy|share|back|close|delete|remove|reset|clear|add|save|submit|buy|sell|fetch|analyze|calculate|run|scan|×|✕|\+|−|-)$/i;

test.describe('Drabyashree NEPSE - Deep 125+ Services, Cards & Sub-Tabs Audit', () => {
  test('Audits every ServicesHub service with Pro unlocked, full settle waits, and sub-tab/card sweeps', async ({ page }) => {
    test.setTimeout(480000);
    const onlySet = process.env.ONLY_SERVICES
      ? new Set(process.env.ONLY_SERVICES.split(',').map((s) => s.trim()).filter(Boolean))
      : null;
    const allServices = onlySet ? getAllServices().filter((s) => onlySet.has(s.id)) : getAllServices();
    console.log(`[DeepAudit] Discovered ${allServices.length} services in ServicesHub${onlySet ? ' (filtered)' : ''}.`);

    const state = await setupAuditPage(page);
    const apiFailures: Array<{ serviceId: string; status: number; url: string }> = [];
    let currentServiceId = 'boot';

    // Unlock ProGate strictly inside Playwright audit context so all Pro services render their full UI
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

    const inspectDom = async () => {
      return await page.evaluate(() => {
        const body = document.querySelector('.services-detail-body') as HTMLElement | null;
        if (!body) {
          return {
            textLen: 0,
            rowCount: 0,
            cardCount: 0,
            inputCount: 0,
            stuckLoading: true,
            flags: ['MISSING_BODY'],
            flagDetails: ['Missing .services-detail-body'],
            sample: '',
          };
        }
        const txt = (body.innerText || '').trim();
        const lower = txt.toLowerCase();
        const rows = body.querySelectorAll('tbody tr, .stock-row, [data-symbol], .svc-row').length;
        const cards = body.querySelectorAll('.rounded-xl, .rounded-2xl, .card, .svc-card').length;
        const inputs = body.querySelectorAll('input, select').length;
        const flags: string[] = [];
        const flagDetails: string[] = [];

        if (txt.length < 60) {
          flags.push('BLANK_BODY');
          flagDetails.push(`Very short body text (${txt.length} chars)`);
        }

        const stuckLoading =
          /^(Loading |Constructing Broker Heatmap|Fetching real dividend|Scanning )/i.test(txt) ||
          Boolean(body.querySelector('.loading-shimmer-bar'));
        if (stuckLoading) {
          flags.push('STUCK_LOADING');
          flagDetails.push(`Still loading: "${txt.slice(0, 80)}"`);
        }

        const emptyPatterns: Array<{ re: RegExp; label: string }> = [
          { re: /\b0\s+matching\s+securities\b/i, label: '0 Matching Securities' },
          { re: /\bno\s+matching\s+stocks\b/i, label: 'No matching stocks' },
          { re: /\bno\s+stocks\s+match\b/i, label: 'No stocks match' },
          { re: /\bno\s+data\s+available\b/i, label: 'No Data Available' },
          { re: /\bsomething\s+went\s+wrong\b/i, label: 'Something went wrong' },
          { re: /\bfailed\s+to\s+load\b/i, label: 'Failed to load' },
          { re: /\berror\s+loading\b/i, label: 'Error loading' },
          { re: /\bcoming\s+soon\b/i, label: 'Coming soon' },
          { re: /\bupgrade\s+to\s+pro\b/i, label: 'ProGate still locked' },
        ];
        for (const p of emptyPatterns) {
          if (p.re.test(txt)) {
            if (!flags.includes('EMPTY_OR_ERROR')) flags.push('EMPTY_OR_ERROR');
            flagDetails.push(p.label);
          }
        }

        const formatPatterns: Array<{ re: RegExp; label: string }> = [
          { re: /\bNaN\b/, label: 'NaN' },
          { re: /\bundefined\b/, label: 'undefined' },
          { re: /\[object Object\]/, label: '[object Object]' },
          { re: /(?:\d|\))%%/, label: 'Double %%' },
          { re: /\)\s*%(?!\s*\w)/, label: 'Trailing )%' },
          { re: /\bInfinity%|\bRs\.?\s*Infinity\b/, label: 'Infinity value' },
          { re: /LTP:\s*Rs\.?\s*0(?:\.0+)?\b/, label: 'LTP Rs. 0' },
        ];
        for (const p of formatPatterns) {
          const m = txt.match(p.re);
          if (m) {
            if (!flags.includes('FORMAT_BUG')) flags.push('FORMAT_BUG');
            const idx = m.index ?? 0;
            const snippet = txt.slice(Math.max(0, idx - 20), Math.min(txt.length, idx + 35)).replace(/\s+/g, ' ');
            flagDetails.push(`${p.label}: "${snippet}"`);
          }
        }

        return {
          textLen: txt.length,
          rowCount: rows,
          cardCount: cards,
          inputCount: inputs,
          stuckLoading,
          flags,
          flagDetails,
          sample: txt.slice(0, 240).replace(/\s+/g, ' '),
        };
      });
    };

    for (const svc of allServices) {
      currentServiceId = svc.id;
      const beforeApiFailCount = apiFailures.length;
      const beforeConsoleCount = state.consoleErrors.length;
      const beforePageErrCount = state.pageErrors.length;

      await page.evaluate((id) => {
        window.dispatchEvent(new CustomEvent('open_service', { detail: { serviceId: id } }));
      }, svc.id);

      let headerOk = true;
      try {
        await page.waitForSelector('.services-detail-header', { timeout: 6000 });
      } catch {
        headerOk = false;
      }

      // Smart settle wait for lazy chunks & API data
      if (headerOk) {
        await page.waitForFunction(() => {
          const body = document.querySelector('.services-detail-body') as HTMLElement | null;
          if (!body) return false;
          const txt = (body.innerText || '').trim();
          if (txt.length < 40) return false;
          if (/^(Loading |Constructing Broker Heatmap|Fetching real dividend|Scanning )/i.test(txt)) return false;
          if (body.querySelector('.animate-spin, .loading-shimmer-bar')) return false;
          return true;
        }, { timeout: 6500 }).catch(() => {});
        await page.waitForTimeout(250);
      }

      const mainMetrics = await inspectDom();

      // Sweep visible sub-tabs / filter tabs inside the service body (up to 4 safe tabs)
      const subTabFindings: Array<{ label: string; flags: string[]; flagDetails: string[] }> = [];
      let subTabsClicked = 0;
      if (headerOk) {
        const candidateBtns = await page.locator(
          '.services-detail-body [role="tab"], .services-detail-body button.segmented-pill, .services-detail-body button.tab-btn, .services-detail-body .flex.gap-1 button, .services-detail-body .flex.gap-2 button'
        ).all();

        const seenLabels = new Set<string>();
        for (const btn of candidateBtns) {
          if (subTabsClicked >= 4) break;
          try {
            if (!(await btn.isVisible())) continue;
            const rawLabel = ((await btn.innerText()) || '').trim().replace(/\s+/g, ' ');
            if (!rawLabel || rawLabel.length > 36 || seenLabels.has(rawLabel)) continue;
            if (SKIP_BTN_RE.test(rawLabel) || /export|download|refresh|reset|clear|delete|remove|copy|share|print|pdf|csv|excel|add |open |view |trade|buy|sell/i.test(rawLabel)) {
              continue;
            }
            seenLabels.add(rawLabel);
            await btn.click({ timeout: 1000 });
            subTabsClicked++;
            await page.waitForTimeout(300);
            const subDom = await inspectDom();
            if (subDom.flags.length > 0) {
              subTabFindings.push({
                label: rawLabel,
                flags: subDom.flags,
                flagDetails: subDom.flagDetails,
              });
            }
          } catch {}
        }
      }

      const healthy = await assertRuntimeHealth(page, state, `Deep_${svc.cat}`, svc.id);
      const newApiFails = apiFailures.slice(beforeApiFailCount);
      const newConsoleErrs = state.consoleErrors.slice(beforeConsoleCount);
      const newPageErrs = state.pageErrors.slice(beforePageErrCount);

      const allFlags = [...mainMetrics.flags];
      if (!headerOk) allFlags.push('MISSING_HEADER');
      if (!healthy) allFlags.push('RUNTIME_UNHEALTHY');
      if (newApiFails.length > 0) allFlags.push('API_ERROR');
      if (newConsoleErrs.length > 0) allFlags.push('CONSOLE_ERROR');
      if (newPageErrs.length > 0) allFlags.push('PAGE_ERROR');
      if (subTabFindings.length > 0) allFlags.push('SUBTAB_ISSUE');

      const entry = {
        id: svc.id,
        name: svc.name,
        cat: svc.cat,
        headerOk,
        healthy,
        textLen: mainMetrics.textLen,
        rowCount: mainMetrics.rowCount,
        cardCount: mainMetrics.cardCount,
        inputCount: mainMetrics.inputCount,
        subTabsClicked,
        flags: Array.from(new Set(allFlags)),
        flagDetails: mainMetrics.flagDetails,
        subTabFindings,
        apiFailCount: newApiFails.length,
        apiFails: newApiFails.map((f) => `${f.status} ${f.url}`),
        consoleErrors: newConsoleErrs,
        pageErrors: newPageErrs,
        sample: mainMetrics.sample,
      };
      report.push(entry);

      if (entry.flags.length > 0) {
        console.log(`[FLAG] [${svc.cat}] ${svc.id}: flags=${entry.flags.join(',')} details=${JSON.stringify(entry.flagDetails)} subTabs=${JSON.stringify(subTabFindings)} apiFails=${entry.apiFailCount}`);
      }

      // Close detail back to hub
      await page.evaluate(() => {
        const btn = document.querySelector('.services-back-btn');
        if (btn) (btn as HTMLElement).click();
      });
      await page.waitForSelector('.services-detail-header', { state: 'detached', timeout: 4000 }).catch(() => {});
    }

    const outName = onlySet ? 'audit-reports/services-reverify-audit.json' : 'audit-reports/all-services-deep-audit.json';
    const outPath = path.resolve(process.cwd(), outName);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify({
      auditedAt: new Date().toISOString(),
      totalServices: report.length,
      flaggedCount: report.filter((r) => r.flags.length > 0).length,
      cleanCount: report.filter((r) => r.flags.length === 0).length,
      flagged: report.filter((r) => r.flags.length > 0),
      all: report,
    }, null, 2), 'utf8');

    console.log(`[DeepAudit] DONE: ${report.length} services audited | ${report.filter((r) => r.flags.length === 0).length} clean | ${report.filter((r) => r.flags.length > 0).length} flagged.`);
    expect(report.length).toBeGreaterThan(0);
  });
});

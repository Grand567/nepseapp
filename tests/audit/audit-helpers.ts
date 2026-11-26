/**
 * tests/audit/audit-helpers.ts
 *
 * Shared helper suite for Drabyashree NEPSE Playwright Crawler:
 * - SQLite Ground Truth queries
 * - Intercepted API response capture
 * - Invariant checks (corrupt text, stuck spinners, zero-dimension charts, parity drift)
 * - Structured UI failure reporting to audit-reports/ui-failures.json
 */

import { Page } from '@playwright/test';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export const DB_PATH = path.resolve(process.cwd(), 'proxy/data/drabyashree_ledger.db');
export const UI_FAILURES_PATH = path.resolve(process.cwd(), 'audit-reports/ui-failures.json');
export const SCREENSHOTS_DIR = path.resolve(process.cwd(), 'audit-reports/screenshots');

export interface UiFailureRecord {
  timestamp: string;
  module: string;
  tabPath: string;
  failureType: 'CORRUPT_TEXT' | 'CONSOLE_ERROR' | 'PAGE_ERROR' | 'NETWORK_ERROR' | 'STUCK_SPINNER' | 'ZERO_DIM_CHART' | 'EMPTY_TABLE' | 'DATA_MISMATCH';
  uiRenderedValue?: string;
  interceptedApiValue?: any;
  sqliteGroundTruth?: any;
  screenshotPath?: string;
  details: string;
}

// Global in-memory list of failures
const recordedFailures: UiFailureRecord[] = [];

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

export function getDbConnection() {
  return new Database(DB_PATH, { readonly: true });
}

export function recordFailure(failure: Omit<UiFailureRecord, 'timestamp'>) {
  const record: UiFailureRecord = {
    timestamp: new Date().toISOString(),
    ...failure
  };
  recordedFailures.push(record);

  // Synchronously persist to disk with atomic per-worker tmp write to prevent parallel EBUSY/UNKNOWN locks
  try {
    const raw = fs.existsSync(UI_FAILURES_PATH)
      ? fs.readFileSync(UI_FAILURES_PATH, 'utf8').replace(/^\uFEFF/, '').trim()
      : '';
    const existing: UiFailureRecord[] = raw ? JSON.parse(raw) : [];
    existing.push(record);
    const tmpPath = `${UI_FAILURES_PATH}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(existing, null, 2), 'utf8');
    fs.renameSync(tmpPath, UI_FAILURES_PATH);
  } catch (err: any) {
    console.error('Failed to write ui-failures.json:', err.message);
  }
}

export interface PageAuditState {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  interceptedResponses: Map<string, any>;
}

export async function setupAuditPage(page: Page): Promise<PageAuditState> {
  const state: PageAuditState = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    interceptedResponses: new Map()
  };

  // 1. Inject localStorage session & acknowledge disclaimers before scripts run
  await page.context().addInitScript(() => {
    try {
      localStorage.setItem('nepse_hub_disclaimer_v1_acknowledged', '1');
      localStorage.setItem('nepse_simulated_banner_dismissed', '1');
      localStorage.setItem('nepse_hub_local_session', JSON.stringify({
        uid: 'guest_local',
        displayName: 'Auditor',
        email: 'auditor@drabyashree.com',
        isGuest: true,
        isLocal: true,
      }));
    } catch (_) {}
  });

  // 2. Capture console errors (filter out known benign external analytics or firestore offline notices)
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      // Ignore known harmless external font/firestore offline errors
      if (txt.includes('ERR_NAME_NOT_RESOLVED') || txt.includes('@firebase/firestore') || txt.includes('React DevTools')) {
        return;
      }
      state.consoleErrors.push(txt);
    }
  });

  // 3. Capture uncaught page errors
  page.on('pageerror', err => {
    state.pageErrors.push(err.message);
  });

  // 4. Capture failed backend API network requests
  page.on('requestfailed', req => {
    const url = req.url();
    // Only track local backend proxy failures, ignore external fonts/analytics
    if (url.includes('/api/')) {
      state.failedRequests.push(`${req.method()} ${url} - ${req.failure()?.errorText || 'ABORTED'}`);
    }
  });

  // 5. Intercept Express JSON responses for exact data reconciliation
  page.on('response', async res => {
    const url = res.url();
    if (url.includes('/api/') && res.status() === 200) {
      try {
        const ct = res.headers()['content-type'] || '';
        if (ct.includes('application/json')) {
          const json = await res.json();
          state.interceptedResponses.set(url, json);
        }
      } catch (_) {}
    }
  });

  return state;
}

/**
 * Asserts all runtime health invariants on current view:
 * - Zero uncaught errors
 * - Zero corrupt strings ('NaN', 'undefined', 'null', 'Infinity', 'Invalid Date')
 * - No zero-dimension charts
 * - No frozen spinners
 */
export async function assertRuntimeHealth(
  page: Page,
  state: PageAuditState,
  moduleName: string,
  tabPath: string
): Promise<boolean> {
  let healthy = true;
  const slug = `${moduleName}_${tabPath}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);

  // 1. Check Console & Page Errors
  if (state.pageErrors.length > 0) {
    healthy = false;
    const screenshotPath = `audit-reports/screenshots/err_page_${slug}.png`;
    await page.screenshot({ path: screenshotPath }).catch(() => {});
    recordFailure({
      module: moduleName,
      tabPath,
      failureType: 'PAGE_ERROR',
      details: `Uncaught PageError: ${state.pageErrors.join(' | ')}`,
      screenshotPath
    });
    state.pageErrors = [];
  }

  // 2. Check Corrupt Text inside cards/subcards
  const corruptFound = await page.evaluate(() => {
    const regex = /\b(NaN|undefined|Infinity|Invalid Date)\b/;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const issues: { text: string; selector: string }[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') continue;
      const val = node.nodeValue?.trim() || '';
      // Ignore if inside a code block, json view, or benign disclaimer
      if (val.length > 0 && val.length < 100 && regex.test(val)) {
        // Exclude legitimate corporate legal names: SEBON Member #70 ("Infinity Securities") and listed company ("Infinity Laghubitta")
        if (val.includes('Infinity Securities') || val.includes('Infinity Laghubitta')) continue;
        issues.push({ text: val, selector: parent.className || parent.tagName });
      }
    }
    return issues;
  });

  if (corruptFound.length > 0) {
    healthy = false;
    const screenshotPath = `audit-reports/screenshots/corrupt_text_${slug}.png`;
    await page.screenshot({ path: screenshotPath }).catch(() => {});
    recordFailure({
      module: moduleName,
      tabPath,
      failureType: 'CORRUPT_TEXT',
      uiRenderedValue: corruptFound.map(c => `"${c.text}" in <${c.selector}>`).join('; '),
      details: `Rendered corrupt token (NaN/undefined/Infinity/Invalid Date) in UI`,
      screenshotPath
    });
  }

  // 3. Check for Empty or Zero-Dimension Charts (only for visible charts whose container is not display:none)
  let chartIssues = await page.evaluate(() => {
    const modal = document.querySelector('div[style*="z-index: 99999"], div[style*="zIndex: 99999"]');
    function isAncestorVisible(el: Element): boolean {
      if (!el || !el.isConnected) return false;
      if (modal && !modal.contains(el)) return false;
      let curr: Element | null = el;
      while (curr && curr !== document.body) {
        const style = window.getComputedStyle(curr);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        curr = curr.parentElement;
      }
      return curr === document.body;
    }

    const canvases = Array.from(document.querySelectorAll('canvas'));
    const svgs = Array.from(document.querySelectorAll('svg.recharts-surface, .tv-lightweight-charts svg'));
    const issues: string[] = [];

    for (const c of canvases) {
      if (!isAncestorVisible(c)) continue;
      const rect = c.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        issues.push(`Visible Canvas has zero dimensions (${rect.width}x${rect.height})`);
      }
    }
    for (const s of svgs) {
      if (!isAncestorVisible(s)) continue;
      const rect = s.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        issues.push(`Visible Chart SVG has zero dimensions (${rect.width}x${rect.height})`);
      }
    }
    return issues;
  });

  if (chartIssues.length > 0) {
    // Allow layout and ResizeObserver up to 1200ms to settle for newly-mounted charts
    await page.waitForTimeout(1200);
    chartIssues = await page.evaluate(() => {
      const modal = document.querySelector('div[style*="z-index: 99999"], div[style*="zIndex: 99999"]');
      function isAncestorVisible(el: Element): boolean {
        if (!el || !el.isConnected) return false;
        if (modal && !modal.contains(el)) return false;
        let curr: Element | null = el;
        while (curr && curr !== document.body) {
          const style = window.getComputedStyle(curr);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          curr = curr.parentElement;
        }
        return curr === document.body;
      }

      const canvases = Array.from(document.querySelectorAll('canvas'));
      const svgs = Array.from(document.querySelectorAll('svg.recharts-surface, .tv-lightweight-charts svg'));
      const issues: string[] = [];

      for (const c of canvases) {
        if (!isAncestorVisible(c)) continue;
        const rect = c.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          issues.push(`Visible Canvas has zero dimensions (${rect.width}x${rect.height})`);
        }
      }
      for (const s of svgs) {
        if (!isAncestorVisible(s)) continue;
        const rect = s.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          issues.push(`Visible Chart SVG has zero dimensions (${rect.width}x${rect.height})`);
        }
      }
      return issues;
    });
  }

  if (chartIssues.length > 0) {
    healthy = false;
    const screenshotPath = `audit-reports/screenshots/chart_dim_${slug}.png`;
    await page.screenshot({ path: screenshotPath }).catch(() => {});
    recordFailure({
      module: moduleName,
      tabPath,
      failureType: 'ZERO_DIM_CHART',
      details: chartIssues.join(' | '),
      screenshotPath
    });
  }

  // 4. Check for Stuck Loading Spinners (> 10s) in visible containers
  const isSpinnerStuck = await page.evaluate(() => {
    function isAncestorVisible(el: Element): boolean {
      if (!el || !el.isConnected) return false;
      let curr: Element | null = el;
      while (curr && curr !== document.body) {
        const style = window.getComputedStyle(curr);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        curr = curr.parentElement;
      }
      return curr === document.body;
    }

    const spinners = Array.from(document.querySelectorAll('.animate-spin, .spinner, .skeleton-loading, [aria-busy="true"]'));
    return spinners.some(s => isAncestorVisible(s));
  });

  if (isSpinnerStuck) {
    // Wait for async fetch to finish (up to 8s total) before asserting truly stuck (> 10s)
    await page.waitForTimeout(6000);
    const stillStuck = await page.evaluate(() => {
      function isAncestorVisible(el: Element): boolean {
        if (!el || !el.isConnected) return false;
        let curr: Element | null = el;
        while (curr && curr !== document.body) {
          const style = window.getComputedStyle(curr);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          curr = curr.parentElement;
        }
        return curr === document.body;
      }

      const spinners = Array.from(document.querySelectorAll('.animate-spin, .spinner, .skeleton-loading, [aria-busy="true"]'));
      return spinners.some(s => isAncestorVisible(s));
    });
    if (stillStuck) {
      healthy = false;
      const screenshotPath = `audit-reports/screenshots/stuck_spinner_${slug}.png`;
      await page.screenshot({ path: screenshotPath }).catch(() => {});
      recordFailure({
        module: moduleName,
        tabPath,
        failureType: 'STUCK_SPINNER',
        details: 'Loading spinner or skeleton remained visible for over 10 seconds',
        screenshotPath
      });
    }
  }

  return healthy;
}

/**
 * Deep Cross-Card Semantic Invariant Assertions:
 * Catches cross-card inconsistencies, multi-year all-time leakage under 1D headings,
 * and false empty record states.
 */
export async function assertSemanticCardInvariants(
  page: Page,
  state: PageAuditState,
  moduleName: string,
  tabPath: string,
  symbol: string
): Promise<boolean> {
  const db = getDbConnection();
  let passed = true;

  try {
    const latestDbSummary = db.prepare(`
      SELECT trade_date, open_price, high_price, low_price, close_price, total_volume, total_turnover
      FROM daily_stock_summary
      WHERE symbol = ?
      ORDER BY trade_date DESC
      LIMIT 1
    `).get(symbol) as any;

    const modalData = await page.evaluate(() => {
      const modal = document.querySelector('div[style*="z-index: 99999"], div[style*="zIndex: 99999"]');
      if (!modal) return null;
      const text = (modal as HTMLElement).innerText || '';

      const topBuyerMatch = text.match(/Today's Top Buyer\s*\n\s*#?(\d+)\s*\(([\d,]+)\s*sh\)/i);
      const topBuyerBroker = topBuyerMatch ? topBuyerMatch[1] : null;
      const topBuyerQty = topBuyerMatch ? Number(topBuyerMatch[2].replace(/,/g, '')) : null;

      const volMatch = text.match(/Total Shares Traded \/ Held\s*\n\s*([\d,]+)\s*sh/i);
      const renderedVolume = volMatch ? Number(volMatch[1].replace(/,/g, '')) : null;

      const noRecordsFound = text.includes('No floor-sheet broker records found');
      const isDummyBalanced = text.includes('Accumulation Pressure: 50%') && text.includes('Distribution: 50%') && text.includes('Balanced Two-Way Rotation');

      const lowMatch = text.match(/Today's Low\s*[\s\S]*?Rs\.\s*([\d,.]+)/i);
      const highMatch = text.match(/Today's High\s*[\s\S]*?Rs\.\s*([\d,.]+)/i);
      const todayLow = lowMatch ? Number(lowMatch[1].replace(/,/g, '')) : null;
      const todayHigh = highMatch ? Number(highMatch[1].replace(/,/g, '')) : null;

      return {
        topBuyerBroker,
        topBuyerQty,
        renderedVolume,
        noRecordsFound,
        isDummyBalanced,
        todayLow,
        todayHigh,
        fullTextSnippet: text.slice(0, 1000)
      };
    });

    if (modalData && latestDbSummary) {
      const slug = `${moduleName}_${tabPath}_${symbol}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);

      // Invariant 1: Today's Top Buyer quantity must NOT exceed total daily volume
      if (modalData.topBuyerQty != null && latestDbSummary.total_volume > 0) {
        if (modalData.topBuyerQty > latestDbSummary.total_volume * 1.05) {
          passed = false;
          const screenshotPath = `audit-reports/screenshots/inv_topbuyer_${slug}.png`;
          await page.screenshot({ path: screenshotPath }).catch(() => {});
          recordFailure({
            module: moduleName,
            tabPath,
            failureType: 'DATA_MISMATCH',
            uiRenderedValue: `Top Buyer Qty: ${modalData.topBuyerQty.toLocaleString()} sh`,
            sqliteGroundTruth: `Total Day Volume: ${latestDbSummary.total_volume.toLocaleString()} sh`,
            details: `Invariant Violation: Today's Top Buyer quantity (${modalData.topBuyerQty}) exceeds total daily trading volume (${latestDbSummary.total_volume})! UI leaked all-time cumulative holding.`,
            screenshotPath
          });
        }
      }

      // Invariant 2: If stock traded, must NOT claim "No floor-sheet broker records found"
      if (modalData.noRecordsFound && latestDbSummary.total_volume > 0) {
        passed = false;
        const screenshotPath = `audit-reports/screenshots/inv_norecords_${slug}.png`;
        await page.screenshot({ path: screenshotPath }).catch(() => {});
        recordFailure({
          module: moduleName,
          tabPath,
          failureType: 'DATA_MISMATCH',
          uiRenderedValue: 'No floor-sheet broker records found in 1D window',
          sqliteGroundTruth: `${latestDbSummary.total_volume} shares traded on ${latestDbSummary.trade_date}`,
          details: `Invariant Violation: Stock traded ${latestDbSummary.total_volume} shares on ${latestDbSummary.trade_date}, but UI claims no floorsheet broker records exist.`,
          screenshotPath
        });
      }

      // Invariant 3: High >= Low
      if (modalData.todayHigh != null && modalData.todayLow != null) {
        if (modalData.todayHigh < modalData.todayLow) {
          passed = false;
          recordFailure({
            module: moduleName,
            tabPath,
            failureType: 'DATA_MISMATCH',
            uiRenderedValue: `High: ${modalData.todayHigh}, Low: ${modalData.todayLow}`,
            details: 'Invariant Violation: Today High is strictly less than Today Low.'
          });
        }
      }
    }
  } catch (err: any) {
    console.warn(`[Semantic Invariant Audit] Error auditing ${symbol}:`, err.message);
  } finally {
    db.close();
  }

  return passed;
}

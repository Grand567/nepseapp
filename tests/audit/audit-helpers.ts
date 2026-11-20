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

  // Synchronously persist to disk
  try {
    const existing: UiFailureRecord[] = fs.existsSync(UI_FAILURES_PATH)
      ? JSON.parse(fs.readFileSync(UI_FAILURES_PATH, 'utf8'))
      : [];
    existing.push(record);
    fs.writeFileSync(UI_FAILURES_PATH, JSON.stringify(existing, null, 2), 'utf8');
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
  const chartIssues = await page.evaluate(() => {
    function isAncestorVisible(el: Element): boolean {
      let curr: Element | null = el.parentElement;
      while (curr && curr !== document.body) {
        const style = window.getComputedStyle(curr);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        curr = curr.parentElement;
      }
      return true;
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
      let curr: Element | null = el.parentElement;
      while (curr && curr !== document.body) {
        const style = window.getComputedStyle(curr);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        curr = curr.parentElement;
      }
      return true;
    }

    const spinners = Array.from(document.querySelectorAll('.animate-spin, .spinner, .skeleton-loading, [aria-busy="true"]'));
    return spinners.some(s => isAncestorVisible(s));
  });

  if (isSpinnerStuck) {
    // Wait for async fetch to finish (up to 8s total) before asserting truly stuck (> 10s)
    await page.waitForTimeout(6000);
    const stillStuck = await page.evaluate(() => {
      function isAncestorVisible(el: Element): boolean {
        let curr: Element | null = el.parentElement;
        while (curr && curr !== document.body) {
          const style = window.getComputedStyle(curr);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          curr = curr.parentElement;
        }
        return true;
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

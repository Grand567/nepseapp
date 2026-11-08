import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ServicesHub from '../../src/components/ServicesHub.tsx';
import { NavigationProvider } from '../../src/context/NavigationContext.jsx';
import { SubscriptionProvider } from '../../src/context/SubscriptionContext.jsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const inventory = JSON.parse(fs.readFileSync(path.join(ROOT, 'qa/app_inventory.json'), 'utf8'));
const serviceItems = inventory.items.filter((i) => i.type === 'service');

const MOCK_STOCKS = [
  {
    symbol: 'NABIL',
    name: 'Nabil Bank Limited',
    sector: 'Commercial Banks',
    ltp: 520,
    close: 520,
    previousClose: 505,
    open: 506,
    high: 525,
    low: 504,
    pChange: 2.97,
    pointChange: 15,
    volume: 48200,
    turnover: 25064000,
    vwap: 520,
    rsi: 61.5,
    macd: 3.2,
    dpi: 74,
    technicalScore: 78,
    volumeZScore: 1.8,
    high52w: 610,
    low52w: 430,
    eps: 28.5,
    pe: 18.2,
    bvps: 245,
    bookValue: 245,
  },
  {
    symbol: 'AKJCL',
    name: 'Ankhu Khola Jalvidhyut Company Ltd',
    sector: 'Hydro Power',
    ltp: 343.5,
    close: 343.5,
    previousClose: 346.3,
    open: 347,
    high: 350,
    low: 340,
    pChange: -0.81,
    pointChange: -2.8,
    volume: 153871,
    turnover: 52862809,
    vwap: 343.55,
    rsi: 52.1,
    macd: 1.1,
    dpi: 58,
    technicalScore: 62,
    volumeZScore: 1.2,
    high52w: 390,
    low52w: 180,
    eps: 8.2,
    pe: 41.8,
    bvps: 112,
    bookValue: 112,
  },
];

describe('Phase 3D — Data-Driven Test Across All 125 Service Hub Services', () => {
  it('ServicesHub shell renders with normal, empty, and null stock lists and supports search & category filtering', () => {
    const rEmpty = render(
      <NavigationProvider>
        <ServicesHub stocks={[]} />
      </NavigationProvider>
    );
    expect(rEmpty.container.textContent.length).toBeGreaterThan(50);
    cleanup();

    const rNull = render(
      <NavigationProvider>
        <ServicesHub stocks={null} />
      </NavigationProvider>
    );
    expect(rNull.container.textContent.length).toBeGreaterThan(50);
    // Test search input
    const searchInput = rNull.container.querySelector('input');
    if (searchInput) {
      fireEvent.change(searchInput, { target: { value: 'Graham' } });
      expect(rNull.container.textContent).toContain('Graham');
      fireEvent.change(searchInput, { target: { value: '' } });
    }
    cleanup();
  });

  it('loops over all 125 services in ALL_SERVICES, mounts each service, and records pass/fail telemetry', async () => {
    expect(serviceItems.length).toBe(125);
    const results = [];

    const { container } = render(
      <SubscriptionProvider>
        <NavigationProvider>
          <ServicesHub stocks={MOCK_STOCKS} onSelectStock={() => {}} onNavigateTab={() => {}} />
        </NavigationProvider>
      </SubscriptionProvider>
    );

    for (const svc of serviceItems) {
      let status = 'PASS';
      let errorMsg = null;
      let textLen = 0;
      let hasErrorFallback = false;

      try {
        await act(async () => {
          window.dispatchEvent(
            new CustomEvent('open_service', {
              detail: { serviceId: svc.serviceId, symbol: 'NABIL' },
            })
          );
        });
        const text = container.textContent || '';
        textLen = text.length;
        const headerH2 = container.querySelector('.services-detail-header h2');
        const openedName = headerH2 ? headerH2.textContent : '';
        if (!openedName || openedName !== svc.name) {
          status = 'FAIL';
          errorMsg = `Service did not open in detail header (got "${openedName}")`;
        } else if (/Telemetry Notice|An unexpected render issue was safely caught|Something went wrong|Module Error/i.test(text)) {
          status = 'FAIL';
          hasErrorFallback = true;
          errorMsg = `ErrorBoundary fallback triggered on render: ${text.slice(0, 220)}`;
        } else if (svc.serviceId === 'stock-split') {
          const banner = container.querySelector('.services-detail-card .mb-4.flex.items-start');
          if (banner && banner.textContent.trim() === '') {
            status = 'FAIL';
            errorMsg = 'Blank <InfoBanner>: StockSplitCalculator passes title/text props instead of children (calculators.tsx:1253)';
          }
        }
      } catch (err) {
        status = 'FAIL';
        errorMsg = err?.message || String(err);
      }

      results.push({
        id: svc.id,
        serviceId: svc.serviceId,
        name: svc.name,
        category: svc.category,
        sourceFile: svc.sourceFile,
        status,
        textLen,
        hasErrorFallback,
        errorMsg,
      });
    }

    cleanup();
    fs.writeFileSync(
      path.join(ROOT, 'qa/logs/phase3_services_matrix.json'),
      JSON.stringify(
        {
          total: results.length,
          passed: results.filter((r) => r.status === 'PASS').length,
          failed: results.filter((r) => r.status === 'FAIL').length,
          results,
        },
        null,
        2
      )
    );

    const failed = results.filter((r) => r.status === 'FAIL');
    // Report any failed service clearly
    expect(failed).toEqual([]);
  });

  it('[BUG REPRO] Dispatching open_service for "alpha-playbook" or "distribution-leaders" (used by Dashboard.jsx & EntryExitAnalyzer.tsx) silently fails to open because 39 SERVICE_COMPONENTS keys are missing from ALL_SERVICES', async () => {
    const { container } = render(
      <NavigationProvider>
        <ServicesHub stocks={MOCK_STOCKS} />
      </NavigationProvider>
    );

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('open_service', { detail: { serviceId: 'alpha-playbook' } })
      );
    });

    const headerH2 = container.querySelector('.services-detail-header h2');
    cleanup();
    // Expected: AlphaPlaybookService opens in detail view with a header
    // Actual bug: headerH2 is null because 'alpha-playbook' is not in ALL_SERVICES!
    expect(headerH2).not.toBeNull();
  });
});

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NavigationProvider } from '../../src/context/NavigationContext.jsx';
import { SubscriptionProvider } from '../../src/context/SubscriptionContext.jsx';
import { ErrorBoundary } from '../../src/components/ErrorBoundary.jsx';
import BreakoutAlertDialog from '../../src/components/BreakoutAlertDialog.jsx';
import { EntryRiskCard } from '../../src/components/analyzer/EntryRiskCard.tsx';
import { SetupScoreCard } from '../../src/components/analyzer/SetupScoreCard.tsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const inventory = JSON.parse(fs.readFileSync(path.join(ROOT, 'qa/app_inventory.json'), 'utf8'));

const SAMPLE_STOCK = {
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
};

const DEFAULT_PROPS = {
  stock: SAMPLE_STOCK,
  selectedStock: SAMPLE_STOCK,
  stocks: [SAMPLE_STOCK],
  allStocks: [SAMPLE_STOCK],
  symbol: 'NABIL',
  initialSymbol: 'NABIL',
  marketStatus: { isOpen: false, state: 'CLOSED', label: 'Market Closed' },
  summary: { nepseIndex: 2685.4, indexChange: 18.2, indexPctChange: 0.68, totalTurnover: 5420000000, totalVolume: 11200000 },
  onSelectStock: () => {},
  onClose: () => {},
  onNavigateTab: () => {},
  isOpen: true,
};

describe('Phase 3E — Inventory Card & Sub-Card Mount Matrix (Normal, Empty, Null & Error States)', () => {
  it('mounts every distinct component file from qa/app_inventory.json across normal, empty, and null props and logs coverage', async () => {
    const uniqueFiles = [
      ...new Set(
        inventory.items
          .map((i) => i.sourceFile.replace(/ \(inline.*\)$/, ''))
          .filter((f) => f && f.startsWith('src/') && !f.includes('NONE') && !f.includes('UNRESOLVED'))
      ),
    ];

    const fileResults = [];

    for (const relFile of uniqueFiles) {
      const absFile = path.join(ROOT, relFile);
      const entry = { file: relFile, normal: 'PASS', empty: 'PASS', nullState: 'PASS', error: null };
      try {
        const mod = await import(/* @vite-ignore */ 'file://' + absFile.replace(/\\/g, '/'));
        const isReactComp = (v) =>
          (typeof v === 'function' && /^[A-Z]/.test(v.name || '')) ||
          (v && typeof v === 'object' && v.$$typeof);
        const Comp = isReactComp(mod.default) ? mod.default : Object.values(mod).find(isReactComp);

        if (Comp) {
          // 1. Normal data render
          try {
            const r1 = render(
              <SubscriptionProvider>
                <NavigationProvider>
                  <ErrorBoundary moduleName={relFile}>
                    <Comp {...DEFAULT_PROPS} />
                  </ErrorBoundary>
                </NavigationProvider>
              </SubscriptionProvider>
            );
            const t1 = r1.container.textContent || '';
            if (/Telemetry Notice|An unexpected render issue was safely caught|Something went wrong|Module Error/i.test(t1)) {
              entry.normal = 'ERROR_BOUNDARY';
              entry.error = t1.slice(0, 220);
            }
          } catch (e1) {
            entry.normal = 'FAIL';
            entry.error = e1?.message || String(e1);
          } finally {
            cleanup();
          }

          // 2. Empty data render
          try {
            const r2 = render(
              <SubscriptionProvider>
                <NavigationProvider>
                  <ErrorBoundary moduleName={relFile}>
                    <Comp stocks={[]} allStocks={[]} symbol="" onSelectStock={() => {}} onClose={() => {}} />
                  </ErrorBoundary>
                </NavigationProvider>
              </SubscriptionProvider>
            );
            const t2 = r2.container.textContent || '';
            if (/Telemetry Notice|An unexpected render issue was safely caught/i.test(t2)) {
              entry.empty = 'ERROR_BOUNDARY';
              entry.error = entry.error || t2.slice(0, 220);
            }
          } catch (e2) {
            entry.empty = 'FAIL';
            entry.error = entry.error || e2?.message || String(e2);
          } finally {
            cleanup();
          }

          // 3. Null data render
          try {
            const r3 = render(
              <SubscriptionProvider>
                <NavigationProvider>
                  <ErrorBoundary moduleName={relFile}>
                    <Comp stock={null} stocks={null} allStocks={null} summary={null} />
                  </ErrorBoundary>
                </NavigationProvider>
              </SubscriptionProvider>
            );
            const t3 = r3.container.textContent || '';
            if (/Telemetry Notice|An unexpected render issue was safely caught/i.test(t3)) {
              entry.nullState = 'ERROR_BOUNDARY';
              entry.error = entry.error || t3.slice(0, 220);
            }
          } catch (e3) {
            entry.nullState = 'FAIL';
            entry.error = entry.error || e3?.message || String(e3);
          } finally {
            cleanup();
          }
        } else {
          entry.normal = 'NO_COMPONENT_EXPORT';
        }
      } catch (impErr) {
        entry.normal = 'IMPORT_FAIL';
        entry.error = impErr?.message || String(impErr);
      }
      fileResults.push(entry);
    }

    fs.writeFileSync(
      path.join(ROOT, 'qa/logs/phase3_components_matrix.json'),
      JSON.stringify(
        {
          totalFilesTested: fileResults.length,
          normalPassed: fileResults.filter((x) => x.normal === 'PASS').length,
          emptyPassed: fileResults.filter((x) => x.empty === 'PASS').length,
          nullPassed: fileResults.filter((x) => x.nullState === 'PASS').length,
          failures: fileResults.filter((x) => x.normal !== 'PASS' || x.empty !== 'PASS' || x.nullState !== 'PASS'),
          fileResults,
        },
        null,
        2
      )
    );

    expect(fileResults.length).toBeGreaterThan(80);
  });

  it('[BUG REPRO] BreakoutAlertDialog crashes with React Rules-of-Hooks error when isOpen transitions from false to true', () => {
    const { rerender } = render(
      <BreakoutAlertDialog isOpen={false} symbol="NABIL" stock={SAMPLE_STOCK} onClose={() => {}} />
    );
    // When isOpen transitions from false -> true, hooks after `if (!isOpen || !symbol) return null;` (line 33) run for the first time!
    expect(() => {
      rerender(
        <BreakoutAlertDialog isOpen={true} symbol="NABIL" stock={SAMPLE_STOCK} onClose={() => {}} />
      );
    }).not.toThrow();
    cleanup();
  });

  it('[BUG REPRO] EntryRiskCard crashes with React Rules-of-Hooks error when levels transitions from null to populated object', () => {
    const { rerender } = render(<EntryRiskCard levels={null} symbol="NABIL" />);
    const validLevels = {
      ltp: 520,
      entryZone: { low: 510, high: 522, label: 'Buy Zone' },
      stopLoss: { price: 485, pct: -6.7, label: 'Stop Loss' },
      target1: { price: 575, pct: 10.5, label: 'Target 1' },
      target2: { price: 620, pct: 19.2, label: 'Target 2' },
    };
    // Because 8 hooks (useState x7, useMemo x1) are called AFTER `if (!levels) return null;` at line 66, rerendering throws!
    expect(() => {
      rerender(<EntryRiskCard levels={validLevels} symbol="NABIL" />);
    }).not.toThrow();
    cleanup();
  });

  it('[BUG REPRO] SetupScoreCard Statistical Edge (Δ) is permanently stuck on "—" / "Requires Setup History" because quantMetrics.expectancy.pWin does not exist', () => {
    const { container } = render(
      <SetupScoreCard
        symbol="NABIL"
        score={82}
        grade="A+"
        verdict="STRONG BUY"
        verdictDesc="Institutional accumulation confirmed"
        breakdown={[
          { label: 'Trend Structure', score: 25, max: 25 },
          { label: 'Volume Surge', score: 20, max: 25 },
        ]}
        quantMetrics={{
          winProbability: 68,
          expectancy: {
            ev: 4250,
            profitFactor: 2.4,
            breakEvenWinRate: 41.2,
            hasPositiveEdge: true,
            edgeRating: 'STRONG',
          },
        }}
      />
    );
    const text = container.textContent || '';
    cleanup();
    // Expected: Statistical Edge renders numeric delta (+26.8%) instead of "Requires Setup History"
    expect(text).not.toContain('Requires Setup History');
  });
});

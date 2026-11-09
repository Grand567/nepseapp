// tests/failedChunkLoadErrorBoundary.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { retryableLazy } from '../src/utils/retryableLazy.js';

test('Point 4 Verification: Error boundary with Retry button wraps every lazy tab & handles failed chunk load', async (t) => {

  await t.test('1. Every lazy-loaded tab and modal in App.jsx is wrapped in an ErrorBoundary and retryableLazy', () => {
    const appPath = path.resolve('src/App.jsx');
    const appContent = fs.readFileSync(appPath, 'utf8');

    // Verify retryableLazy is imported and used
    assert.ok(appContent.includes("import { retryableLazy } from './utils/retryableLazy';"), 'retryableLazy must be imported in App.jsx');

    const expectedLazyComponents = [
      'Dashboard',
      'ServicesHub',
      'PredictorHub',
      'PortfolioHub',
      'Calculator',
      'AiAnalyst',
      'Resources',
      'StitchHub',
      'StockDetailModal'
    ];

    for (const comp of expectedLazyComponents) {
      const match = new RegExp(`const\\s+${comp}\\s*=\\s*retryableLazy`).test(appContent);
      assert.ok(match, `${comp} must be wrapped with retryableLazy in App.jsx`);
    }

    // Verify ErrorBoundaries around all tabs
    const expectedModules = [
      'Market Dashboard',
      'Portfolio & IPO Hub',
      'Predictor & Quant Hub',
      'Services & Tools Hub',
      'Calculator Hub',
      'Guru AI Analyst',
      'Resources & Education',
      'Stitch UI System',
      'Stock Details Modal'
    ];

    for (const mod of expectedModules) {
      assert.ok(
        appContent.includes(`moduleName="${mod}"`),
        `ErrorBoundary for module '${mod}' must be present in App.jsx`
      );
    }
  });

  await t.test('2. ErrorBoundary source has Retry button with handleReset', () => {
    const ebPath = path.resolve('src/components/ErrorBoundary.jsx');
    const ebContent = fs.readFileSync(ebPath, 'utf8');

    assert.ok(ebContent.includes('handleReset'), 'ErrorBoundary must define handleReset');
    assert.ok(ebContent.includes('Retry Render') || ebContent.includes('Retry'), 'ErrorBoundary must render Retry button');
    assert.ok(ebContent.includes('this.setState({ hasError: false, error: null })'), 'handleReset must reset error state');
    assert.ok(ebContent.includes('this.props.onReset'), 'handleReset must trigger optional onReset callback');
  });

  await t.test('3. Dynamic chunk failure simulation and recovery via retryableLazy', async () => {
    let loadAttempts = 0;

    const mockChunkFactory = async () => {
      loadAttempts++;
      if (loadAttempts === 1) {
        // Simulate network failure / 404 chunk load failure
        const err = new TypeError('Failed to fetch dynamically imported module: https://nepse.app/assets/PortfolioHub-chunk-fail.js');
        throw err;
      }
      return {
        default: function MockComponent() {
          return { type: 'div', props: { children: 'Mock Tab Data' } };
        }
      };
    };

    const LazyTab = retryableLazy(mockChunkFactory);

    // Initial invocation throws promise during lazy initialization
    let initialError = null;
    try {
      LazyTab._init(LazyTab._payload);
    } catch (thrown) {
      // In React.lazy, the initial call throws the pending Promise
      if (thrown && typeof thrown.then === 'function') {
        try {
          await thrown;
        } catch (rejection) {
          initialError = rejection;
        }
      } else {
        initialError = thrown;
      }
    }

    assert.ok(initialError, 'Initial chunk load attempt must reject');
    assert.ok(initialError.message.includes('Failed to fetch dynamically imported module'), 'Error message must match chunk failure');
    assert.equal(loadAttempts, 1, 'Initial chunk load attempt count must be 1');

    // Wait for the asynchronous microtask / setTimeout reset in retryableLazy
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Confirm payload status was reset to -1 (Uninitialized)
    assert.equal(LazyTab._payload._status, -1, 'Payload status must be reset to -1 to allow retry');

    // Simulate ErrorBoundary retry: re-render triggers lazyInitializer again
    let recoveredModule = null;
    try {
      recoveredModule = LazyTab._init(LazyTab._payload);
    } catch (thrown) {
      if (thrown && typeof thrown.then === 'function') {
        recoveredModule = await thrown;
      } else {
        throw thrown;
      }
    }

    assert.equal(loadAttempts, 2, 'Retry must re-invoke import factory');
    assert.ok(recoveredModule, 'Recovered module must not be null');
    assert.equal(typeof (recoveredModule.default || recoveredModule), 'function', 'Recovered module must export a component');
  });
});

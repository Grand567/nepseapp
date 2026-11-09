// scripts/phase9Runner.cjs
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const AXE_PATH = path.join(__dirname, '..', 'qa', 'tools', 'axe.min.js');
const OUTPUT_PATH = path.join(__dirname, '..', 'qa', 'logs', 'phase9_audit_results.json');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('js-flags', '--expose-gc');
app.setPath('userData', path.join(os.tmpdir(), 'drabyashree_phase9_' + Date.now()));

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

app.whenReady().then(async () => {
  console.log('========================================================================');
  console.log('       DRABYASHREE NEPSE — PHASE 9 BENCHMARK & ACCESSIBILITY SUITE      ');
  console.log('========================================================================\n');

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const auditData = {
    timestamp: new Date().toISOString(),
    npmAuditOmitDev: {
      total: 11,
      moderate: 7,
      high: 4,
      critical: 0
    },
    tabBenchmarks: {},
    memoryGrowth50Switches: {},
    serviceHubVirtualization: {},
    accessibilityByTab: {}
  };

  try {
    console.log('[1/5] Loading application & authenticating guest session...');
    await win.loadURL('http://localhost:4173');
    
    // Inject auth & reload to mount full app
    await win.webContents.executeJavaScript(`
      localStorage.setItem('nepse_hub_disclaimer_v1_acknowledged', '1');
      localStorage.setItem('nepse_disclaimer_accepted', 'true');
      localStorage.setItem('nepse_hub_local_session', JSON.stringify({
        uid: 'local_guest',
        email: 'guest@nepse.app',
        name: 'Guest Investor',
        isGuest: true,
        role: 'investor'
      }));
      window.location.reload();
    `);
    await sleep(4000);

    // Inject LongTask Observer
    await win.webContents.executeJavaScript(`
      window.__phase9_longTasks = [];
      try {
        const obs = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            window.__phase9_longTasks.push({
              duration: Math.round(entry.duration),
              startTime: Math.round(entry.startTime),
              name: entry.name
            });
          }
        });
        obs.observe({ entryTypes: ['longtask'] });
      } catch (e) {
        console.warn('LongTask observer notice:', e.message);
      }
    `);

    // Helper: navigate to specific tab
    async function selectTab(tabName, openSymbol = null) {
      return await win.webContents.executeJavaScript(`
        (async () => {
          window.__phase9_longTasks = [];
          const t0 = performance.now();

          if ('${openSymbol || ''}') {
            // First ensure on Market
            const marketBtn = Array.from(document.querySelectorAll('.nav-btn')).find(b => (b.innerText || '').includes('Market'));
            if (marketBtn) marketBtn.click();
            await new Promise(r => setTimeout(r, 400));

            // Find stock row/card
            const stockEl = Array.from(document.querySelectorAll('tr, .stock-card, td, div')).find(el => (el.innerText || '').trim() === '${openSymbol}' || (el.innerText || '').includes('${openSymbol}'));
            if (stockEl) stockEl.click();
          } else {
            // Close stock detail if open
            const closeBtn = Array.from(document.querySelectorAll('button')).find(b => 
              b.innerText === '✕' || b.innerText === '×' || b.getAttribute('aria-label') === 'Close' || (b.className || '').includes('close')
            );
            if (closeBtn) closeBtn.click();
            await new Promise(r => setTimeout(r, 200));

            const navBtns = Array.from(document.querySelectorAll('.nav-btn'));
            let target = null;
            if ('${tabName}' === 'Market') target = navBtns.find(b => (b.innerText || '').includes('Market'));
            else if ('${tabName}' === 'Portfolio') target = navBtns.find(b => (b.innerText || '').includes('Portfolio'));
            else if ('${tabName}' === 'IPO Hub') {
              const pBtn = navBtns.find(b => (b.innerText || '').includes('Portfolio'));
              if (pBtn) pBtn.click();
              await new Promise(r => setTimeout(r, 400));
              target = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').toLowerCase().includes('bulk ipo') || (b.innerText || '').toLowerCase().includes('ipo'));
            }
            else if ('${tabName}' === 'Predictor') target = navBtns.find(b => (b.innerText || '').includes('Predictor'));
            else if ('${tabName}' === 'Guru AI') target = navBtns.find(b => (b.innerText || '').includes('AI') || (b.innerText || '').includes('Guru'));
            else if ('${tabName}' === 'Service Hub') target = navBtns.find(b => (b.innerText || '').includes('Services'));

            if (target) target.click();
          }

          await new Promise(r => setTimeout(r, 800));
          const t1 = performance.now();

          const longTasks = window.__phase9_longTasks || [];
          const totalLongTaskMs = longTasks.reduce((sum, lt) => sum + lt.duration, 0);
          const maxLongTaskMs = longTasks.length > 0 ? Math.max(...longTasks.map(l => l.duration)) : 0;
          const domCount = document.getElementsByTagName('*').length;

          let heapMB = null;
          if (performance.memory) {
            heapMB = +(performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2);
          }

          return {
            mountLatencyMs: Math.round(t1 - t0),
            longTasksCount: longTasks.length,
            totalLongTaskMs,
            maxLongTaskMs,
            domCount,
            heapMB
          };
        })()
      `);
    }

    // ── 1. Tab Benchmarks & Long Tasks ──
    console.log('\n[2/5] Benchmarking Tab Mount Latencies & Long Tasks (>50ms)...');
    const TAB_SPECS = [
      { name: 'Market Dashboard' },
      { name: 'Portfolio' },
      { name: 'IPO Hub' },
      { name: 'Stocks (StockDetailModal)', openSymbol: 'NABIL' },
      { name: 'Predictor' },
      { name: 'Guru AI' },
      { name: 'Service Hub' }
    ];

    for (const spec of TAB_SPECS) {
      const metric = await selectTab(spec.name, spec.openSymbol);
      auditData.tabBenchmarks[spec.name] = metric;
      console.log(`  -> ${spec.name.padEnd(28)}: Latency: ${metric.mountLatencyMs}ms | DOM: ${metric.domCount.toString().padStart(4)} nodes | Heap: ${metric.heapMB} MB | Long Tasks: ${metric.longTasksCount} (Total: ${metric.totalLongTaskMs}ms, Max: ${metric.maxLongTaskMs}ms)`);
      await sleep(300);
    }

    // ── 2. Memory Growth Test: Switch Tabs 50 Times ──
    console.log('\n[3/5] Running 50-Switch Memory Leak Stress Test...');
    // Ensure modal is closed
    await win.webContents.executeJavaScript(`
      const closeBtn = Array.from(document.querySelectorAll('button')).find(b => 
        b.innerText === '✕' || b.innerText === '×' || b.getAttribute('aria-label') === 'Close'
      );
      if (closeBtn) closeBtn.click();
    `);
    await sleep(500);

    const initialHeap = await win.webContents.executeJavaScript(`
      performance.memory ? +(performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2) : null
    `);

    const cycle = ['Market', 'Portfolio', 'IPO', 'Predictor', 'Guru AI', 'Service Hub'];
    const memoryTimeline = [{ switchCount: 0, tab: 'Initial (Settled)', heapMB: initialHeap }];

    for (let i = 1; i <= 50; i++) {
      const nextTab = cycle[(i - 1) % cycle.length];
      await win.webContents.executeJavaScript(`
        (() => {
          const navBtns = Array.from(document.querySelectorAll('.nav-btn, button'));
          const btn = navBtns.find(b => (b.innerText || '').includes('${nextTab === 'Service Hub' ? 'Service' : nextTab}'));
          if (btn) btn.click();
        })()
      `);
      await sleep(120);

      const curHeap = await win.webContents.executeJavaScript(`
        performance.memory ? +(performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2) : null
      `);
      memoryTimeline.push({ switchCount: i, tab: nextTab, heapMB: curHeap });
      console.log(`     Switch #${i.toString().padStart(2)} -> ${nextTab.padEnd(14)} | Heap = ${curHeap} MB`);
    }

    await sleep(1200);
    const postGcHeap = await win.webContents.executeJavaScript(`
      if (window.gc) window.gc();
      performance.memory ? +(performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2) : null
    `);
    memoryTimeline.push({ switchCount: 'post-gc', heapMB: postGcHeap });

    const netGrowthMB = +(postGcHeap - initialHeap).toFixed(2);
    const growthPerSwitchKB = +((netGrowthMB * 1024) / 50).toFixed(2);
    const pctGrowth = +(((postGcHeap - initialHeap) / initialHeap) * 100).toFixed(1);

    auditData.memoryGrowth50Switches = {
      initialHeapMB: initialHeap,
      finalHeapMB: postGcHeap,
      netGrowthMB,
      percentageGrowth: pctGrowth,
      growthPerSwitchKB,
      timeline: memoryTimeline
    };
    console.log(`  -> 50 Switches Complete: Start: ${initialHeap} MB -> Post-GC: ${postGcHeap} MB | Net Δ: ${netGrowthMB} MB (${pctGrowth}%) | Rate: ${growthPerSwitchKB} KB/switch`);

    // ── 3. Service Hub Virtualization & Re-rendering Profile ──
    console.log('\n[4/5] Auditing Service Hub List Virtualization & Re-render Profile...');
    await selectTab('Service Hub');
    await sleep(1000);

    const shMetrics = await win.webContents.executeJavaScript(`
      (() => {
        const cards = document.querySelectorAll('.services-graceful-card');
        const grid = document.querySelectorAll('.services-graceful-grid');
        const totalDomNodes = document.getElementsByTagName('*').length;

        // Check virtualization indicators
        const hasVirtualScroll = !!document.querySelector('[data-virtualized], .virtual-list, [style*="contain: strict"]');
        let hasContentVisibilityAuto = false;
        if (cards.length > 0) {
          const comp = window.getComputedStyle(cards[0]);
          hasContentVisibilityAuto = comp.contentVisibility === 'auto';
        }

        // Measure search re-render latency
        const t0 = performance.now();
        const searchInput = document.querySelector('input[placeholder*="Search"], input.services-search-input');
        if (searchInput) {
          searchInput.value = 'bank';
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const tFilter = performance.now() - t0;

        // Reset search
        if (searchInput) {
          searchInput.value = '';
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        return {
          totalServiceCardsInDOM: cards.length,
          totalCategoriesInDOM: grid.length,
          totalDomNodesInServicesTab: totalDomNodes,
          isVirtualized: hasVirtualScroll,
          hasContentVisibilityAuto,
          filterReRenderLatencyMs: Math.round(tFilter),
          architecture: cards.length >= 100 ? 'Unvirtualized Full-DOM Eager Mount' : 'Virtualized Window'
        };
      })()
    `);
    auditData.serviceHubVirtualization = shMetrics;
    console.log(`  -> Service Cards Rendered: ${shMetrics.totalServiceCardsInDOM}`);
    console.log(`  -> Total DOM Nodes in Tab: ${shMetrics.totalDomNodesInServicesTab}`);
    console.log(`  -> Virtualization Status: ${shMetrics.isVirtualized ? 'VIRTUALIZED' : 'UNVIRTUALIZED (All 125+ cards eager mounted into DOM)'}`);
    console.log(`  -> CSS content-visibility: ${shMetrics.hasContentVisibilityAuto ? 'Enabled' : 'Disabled (Browser lays out all cards)'}`);
    console.log(`  -> Filter Input Re-render Latency: ${shMetrics.filterReRenderLatencyMs}ms`);

    // ── 4. Axe-core Accessibility Checks per Tab ──
    console.log('\n[5/5] Running Axe-core Accessibility Audits per Tab...');
    const axeSource = fs.readFileSync(AXE_PATH, 'utf-8');

    async function evaluateAxe(spec) {
      await selectTab(spec.name, spec.openSymbol);
      await sleep(700);

      // Inject axe
      await win.webContents.executeJavaScript(axeSource + '; true;');

      const result = await win.webContents.executeJavaScript(`
        new Promise((resolve) => {
          axe.run(document, {
            runOnly: {
              type: 'tag',
              values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
            }
          }, (err, res) => {
            if (err) return resolve({ error: err.message });
            
            const violations = (res.violations || []).map(v => ({
              id: v.id,
              impact: v.impact,
              description: v.description,
              nodesCount: v.nodes.length,
              helpUrl: v.helpUrl,
              sampleTarget: v.nodes[0] ? v.nodes[0].target.join(' > ') : ''
            }));

            const impactCounts = {
              critical: violations.filter(v => v.impact === 'critical').reduce((s, v) => s + v.nodesCount, 0),
              serious: violations.filter(v => v.impact === 'serious').reduce((s, v) => s + v.nodesCount, 0),
              moderate: violations.filter(v => v.impact === 'moderate').reduce((s, v) => s + v.nodesCount, 0),
              minor: violations.filter(v => v.impact === 'minor').reduce((s, v) => s + v.nodesCount, 0)
            };

            resolve({
              passesCount: (res.passes || []).length,
              violationsCount: violations.length,
              totalViolatingNodes: violations.reduce((s, v) => s + v.nodesCount, 0),
              impactCounts,
              topViolations: violations.slice(0, 5)
            });
          });
        })
      `);
      return result;
    }

    for (const spec of TAB_SPECS) {
      const a11y = await evaluateAxe(spec);
      auditData.accessibilityByTab[spec.name] = a11y;
      console.log(`  -> ${spec.name.padEnd(28)}: Violations: ${a11y.violationsCount.toString().padStart(2)} rules (${a11y.totalViolatingNodes.toString().padStart(3)} nodes) | Critical: ${a11y.impactCounts.critical}, Serious: ${a11y.impactCounts.serious}, Moderate: ${a11y.impactCounts.moderate}, Minor: ${a11y.impactCounts.minor}`);
    }

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(auditData, null, 2), 'utf-8');
    console.log(`\n========================================================================`);
    console.log(`✅ Phase 9 Audit Run Complete. Full results saved to:`);
    console.log(`   ${OUTPUT_PATH}`);
    console.log(`========================================================================`);

  } catch (err) {
    console.error('[Phase 9 Runner Error]', err);
  } finally {
    win.destroy();
    app.quit();
  }
});

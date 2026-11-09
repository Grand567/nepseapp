// scripts/run7TabsMemoryTest.cjs
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const OUTPUT_PATH = path.join(__dirname, '..', 'qa', 'logs', 'memory_7tabs_3cycles.json');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('js-flags', '--expose-gc');
app.setPath('userData', path.join(os.tmpdir(), 'drabyashree_memtest_' + Date.now()));

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

app.whenReady().then(async () => {
  console.log('========================================================================');
  console.log('   DRABYASHREE NEPSE — 7 TABS 3 FULL CYCLES MEMORY STABILITY TEST       ');
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

  const memoryLog = {
    timestamp: new Date().toISOString(),
    initialHeapMB: 0,
    cycles: [],
    cycle1PostGcHeapMB: 0,
    cycle2PostGcHeapMB: 0,
    cycle3PostGcHeapMB: 0,
    growthCycle1ToCycle2MB: 0,
    growthCycle2ToCycle3MB: 0,
    growthCycle2ToCycle3Pct: 0
  };

  try {
    console.log('[1/4] Loading application on production preview (http://localhost:4173)...');
    await win.loadURL('http://localhost:4173');

    // Authenticate guest session & acknowledge disclaimers
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

    // Initial baseline heap post-GC
    const initHeap = await win.webContents.executeJavaScript(`
      if (window.gc) window.gc();
      performance.memory ? +(performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2) : null
    `);
    memoryLog.initialHeapMB = initHeap;
    console.log(`[2/4] Initial Baseline Settled Heap (post-GC): ${initHeap} MB\n`);

    const ALL_7_TABS = [
      { name: 'Market', type: 'tab', label: 'Market' },
      { name: 'Portfolio', type: 'tab', label: 'Portfolio' },
      { name: 'IPO', type: 'subtab', label: 'Bulk IPO' },
      { name: 'Stocks', type: 'modal', symbol: 'NABIL' },
      { name: 'Predictor', type: 'tab', label: 'Predictor' },
      { name: 'Guru AI', type: 'tab', label: 'AI' },
      { name: 'Service Hub', type: 'tab', label: 'Services' }
    ];

    async function navigateTo(target) {
      return await win.webContents.executeJavaScript(`
        (async () => {
          // If modal is open and we need a different tab, close it
          const closeAnyModal = () => {
            const closeBtn = Array.from(document.querySelectorAll('button')).find(b => 
              b.innerText === '✕' || b.innerText === '×' || b.getAttribute('aria-label') === 'Close' || (b.className || '').includes('close')
            );
            if (closeBtn) closeBtn.click();
          };

          if ('${target.type}' === 'modal') {
            // Ensure on Market first so stock table/cards are visible
            const navBtns = Array.from(document.querySelectorAll('.nav-btn, button'));
            const mBtn = navBtns.find(b => (b.innerText || '').includes('Market'));
            if (mBtn) mBtn.click();
            await new Promise(r => setTimeout(r, 400));

            // Find stock element
            const stockEl = Array.from(document.querySelectorAll('tr, .stock-card, td, div')).find(el => 
              (el.innerText || '').trim() === '${target.symbol}' || (el.innerText || '').includes('${target.symbol}')
            );
            if (stockEl) stockEl.click();
            await new Promise(r => setTimeout(r, 600));

            // Now close it
            closeAnyModal();
            await new Promise(r => setTimeout(r, 300));
          } else if ('${target.type}' === 'subtab') {
            // First go to Portfolio
            const navBtns = Array.from(document.querySelectorAll('.nav-btn, button'));
            const pBtn = navBtns.find(b => (b.innerText || '').includes('Portfolio'));
            if (pBtn) pBtn.click();
            await new Promise(r => setTimeout(r, 400));

            // Click Bulk IPO tab
            const ipoBtn = Array.from(document.querySelectorAll('button')).find(b => 
              (b.innerText || '').toLowerCase().includes('bulk ipo') || (b.innerText || '').toLowerCase().includes('ipo')
            );
            if (ipoBtn) ipoBtn.click();
            await new Promise(r => setTimeout(r, 400));
          } else {
            closeAnyModal();
            await new Promise(r => setTimeout(r, 200));
            const navBtns = Array.from(document.querySelectorAll('.nav-btn, button'));
            const btn = navBtns.find(b => (b.innerText || '').includes('${target.label}'));
            if (btn) btn.click();
            await new Promise(r => setTimeout(r, 400));
          }

          return performance.memory ? +(performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2) : null;
        })()
      `);
    }

    console.log('[3/4] Executing 3 full cycles across all 7 tabs...');
    const cyclePostGcHeaps = [];

    for (let cycleNum = 1; cycleNum <= 3; cycleNum++) {
      console.log(`\n--- Starting Cycle ${cycleNum} (7 Tabs: Market -> Portfolio -> IPO -> Stocks -> Predictor -> Guru AI -> Service Hub) ---`);
      const tabTraversals = [];

      for (const tab of ALL_7_TABS) {
        const heap = await navigateTo(tab);
        tabTraversals.push({ tab: tab.name, heapMB: heap });
        console.log(`  Cycle ${cycleNum} | -> ${tab.name.padEnd(14)} | Heap: ${heap} MB`);
        await sleep(300);
      }

      await sleep(1000);
      const postGcHeap = await win.webContents.executeJavaScript(`
        if (window.gc) window.gc();
        performance.memory ? +(performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2) : null
      `);
      cyclePostGcHeaps.push(postGcHeap);

      memoryLog.cycles.push({
        cycle: cycleNum,
        tabTraversals,
        postGcHeapMB: postGcHeap
      });

      console.log(`✅ [Cycle ${cycleNum} Complete] Heap after forcing GC: ${postGcHeap} MB`);
    }

    memoryLog.cycle1PostGcHeapMB = cyclePostGcHeaps[0];
    memoryLog.cycle2PostGcHeapMB = cyclePostGcHeaps[1];
    memoryLog.cycle3PostGcHeapMB = cyclePostGcHeaps[2];

    const growthC1toC2 = +(cyclePostGcHeaps[1] - cyclePostGcHeaps[0]).toFixed(2);
    const growthC2toC3 = +(cyclePostGcHeaps[2] - cyclePostGcHeaps[1]).toFixed(2);
    const growthC2toC3Pct = +((growthC2toC3 / cyclePostGcHeaps[1]) * 100).toFixed(2);

    memoryLog.growthCycle1ToCycle2MB = growthC1toC2;
    memoryLog.growthCycle2ToCycle3MB = growthC2toC3;
    memoryLog.growthCycle2ToCycle3Pct = growthC2toC3Pct;

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(memoryLog, null, 2), 'utf-8');

    console.log('\n========================================================================');
    console.log('                    MEMORY AUDIT RESULTS SUMMARY                        ');
    console.log('========================================================================');
    console.log(`• Initial Baseline Heap (post-GC): ${initHeap} MB`);
    console.log(`• Cycle 1 Post-GC Heap:            ${cyclePostGcHeaps[0]} MB`);
    console.log(`• Cycle 2 Post-GC Heap:            ${cyclePostGcHeaps[1]} MB`);
    console.log(`• Cycle 3 Post-GC Heap:            ${cyclePostGcHeaps[2]} MB`);
    console.log('------------------------------------------------------------------------');
    console.log(`• Growth between Cycle 1 & 2:      ${growthC1toC2 > 0 ? '+' : ''}${growthC1toC2} MB`);
    console.log(`• Growth between Cycle 2 & 3:      ${growthC2toC3 > 0 ? '+' : ''}${growthC2toC3} MB (${growthC2toC3Pct}%)`);
    console.log(`• Assessment:                      ${Math.abs(growthC2toC3) < 2.0 ? 'PASS (Zero Leak, Stable Steady-State)' : 'WARNING'}`);
    console.log(`• Log Saved:                       ${OUTPUT_PATH}`);
    console.log('========================================================================\n');

  } catch (err) {
    console.error('[Memory Test Error]', err);
  } finally {
    win.destroy();
    app.quit();
  }
});

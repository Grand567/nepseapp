const { app, BrowserWindow } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

const AXE_PATH = path.join(__dirname, '..', 'qa', 'tools', 'axe.min.js');
const axeSource = fs.readFileSync(AXE_PATH, 'utf-8');

app.setPath('userData', path.join(os.tmpdir(), 'drabyashree_axe_diag_' + Date.now()));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  try {
    await win.loadURL('http://localhost:4173');
    await win.webContents.executeJavaScript(`
      localStorage.setItem('nepse_hub_local_session', JSON.stringify({ uid: 'test_guest', isGuest: true }));
      localStorage.setItem('nepse_hub_disclaimer_v1_acknowledged', '1');
      localStorage.setItem('drabyashree_auth_user', JSON.stringify({ uid: 'test_guest', isGuest: true, role: 'investor' }));
      localStorage.setItem('nepse_disclaimer_accepted', 'true');
    `);
    await win.loadURL('http://localhost:4173');
    await new Promise(r => setTimeout(r, 2000));

    // Test tabs: Predictor, Guru AI, Stocks
    const tabsToTest = ['Predictor', 'Guru AI', 'Stocks'];

    for (const tabName of tabsToTest) {
      console.log(`\n=== Testing A11y on: ${tabName} ===`);
      await win.webContents.executeJavaScript(`
        const navBtn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').includes('${tabName}'));
        if (navBtn) navBtn.click();
      `);
      await new Promise(r => setTimeout(r, 1200));

      await win.webContents.executeJavaScript(axeSource + '; true;');

      const violations = await win.webContents.executeJavaScript(`
        new Promise((resolve) => {
          axe.run(document, {
            runOnly: {
              type: 'tag',
              values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
            }
          }, (err, res) => {
            if (err) return resolve({ error: err.message });
            resolve((res.violations || []).map(v => ({
              id: v.id,
              impact: v.impact,
              description: v.description,
              nodes: (v.nodes || []).map(n => ({
                target: n.target.join(' > '),
                html: n.html,
                failureSummary: n.failureSummary
              }))
            })));
          });
        });
      `);

      for (const v of violations) {
        console.log(`  Rule: [${v.impact}] ${v.id} (${v.nodes.length} nodes)`);
        for (const n of v.nodes) {
          console.log(`    Target: ${n.target}`);
          console.log(`    HTML: ${n.html.substring(0, 100)}...`);
          console.log(`    Summary: ${n.failureSummary ? n.failureSummary.split('\n')[0] : ''}`);
        }
      }
    }
  } catch (err) {
    console.error('Diagnostic error:', err);
  } finally {
    app.quit();
  }
});

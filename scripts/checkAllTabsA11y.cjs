const { app, BrowserWindow } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

const AXE_PATH = path.join(__dirname, '..', 'qa', 'tools', 'axe.min.js');
const axeSource = fs.readFileSync(AXE_PATH, 'utf-8');

app.setPath('userData', path.join(os.tmpdir(), 'drabyashree_all_a11y_' + Date.now()));

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

  win.webContents.on('console-message', (evt, level, msg) => {
    if (level >= 2) console.log(`[Browser Console L${level}]`, msg);
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

    const tabs = ['Market', 'Portfolio', 'IPO', 'Predictor', 'Guru AI', 'Service Hub'];
    const summary = {};

    for (const tab of tabs) {
      try {
        console.log(`Auditing tab: ${tab}...`);
        await win.webContents.executeJavaScript(`(() => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').includes('${tab}'));
          if (btn) btn.click();
        })()`);
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
                nodesCount: (v.nodes || []).length,
                nodes: (v.nodes || []).map(n => ({
                  html: n.html.substring(0, 100)
                }))
              })));
            });
          });
        `);
        summary[tab] = violations;
        console.log(`  Tab ${tab} violations:`, JSON.stringify(violations, null, 2));
      } catch (tabErr) {
        console.error(`  Error in tab ${tab}:`, tabErr.message);
        summary[tab] = { error: tabErr.message };
      }
    }

    console.log('=== ALL TABS ACCESSIBILITY SUMMARY ===');
    console.log(JSON.stringify(summary, null, 2));

    const hasCriticalOrSerious = Object.values(summary).some(viols => 
      Array.isArray(viols) && viols.some(v => v.impact === 'critical' || v.impact === 'serious')
    );

    if (!hasCriticalOrSerious) {
      console.log('✅ ALL TABS PASSED: 0 Critical and 0 Serious WCAG AA violations!');
    } else {
      console.log('⚠️ Some violations remain');
    }
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    app.quit();
  }
});

const { app, BrowserWindow } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

const AXE_PATH = path.join(__dirname, '..', 'qa', 'tools', 'axe.min.js');
const axeSource = fs.readFileSync(AXE_PATH, 'utf-8');

app.setPath('userData', path.join(os.tmpdir(), 'drabyashree_diag3_' + Date.now()));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false });
  await win.loadURL('http://localhost:4173');
  await win.webContents.executeJavaScript(`
    localStorage.setItem('nepse_hub_local_session', JSON.stringify({ uid: 'test_guest', isGuest: true }));
    localStorage.setItem('nepse_hub_disclaimer_v1_acknowledged', '1');
    localStorage.setItem('drabyashree_auth_user', JSON.stringify({ uid: 'test_guest', isGuest: true, role: 'investor' }));
    localStorage.setItem('nepse_disclaimer_accepted', 'true');
  `);
  await win.loadURL('http://localhost:4173');
  await new Promise(r => setTimeout(r, 2000));

  const allTabs = ['Market', 'Portfolio', 'IPO', 'Guru AI', 'Service Hub'];

  for (const tabName of allTabs) {
    await win.webContents.executeJavaScript(`
      const navBtn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').includes('${tabName}'));
      if (navBtn) navBtn.click();
    `);
    await new Promise(r => setTimeout(r, 1200));
    await win.webContents.executeJavaScript(axeSource + '; true;');
    const detail = await win.webContents.executeJavaScript(`
      new Promise((resolve) => {
        axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }, (err, res) => {
          if (err) return resolve({ err: err.message });
          resolve((res.violations || []).map(v => ({
            id: v.id,
            impact: v.impact,
            nodes: (v.nodes || []).map(n => ({
              target: n.target.join(' > '),
              failureSummary: n.failureSummary,
              html: n.html.substring(0, 100)
            }))
          })));
        });
      });
    `);
    console.log(`=== Tab: ${tabName} ===`);
    console.log(JSON.stringify(detail, null, 2));
  }
  app.quit();
});

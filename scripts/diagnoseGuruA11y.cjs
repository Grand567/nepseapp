const { app, BrowserWindow } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

const AXE_PATH = path.join(__dirname, '..', 'qa', 'tools', 'axe.min.js');
const axeSource = fs.readFileSync(AXE_PATH, 'utf-8');

app.setPath('userData', path.join(os.tmpdir(), 'drabyashree_guru_a11y_' + Date.now()));

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

  win.webContents.on('console-message', (evt, level, msg, line, src) => {
    console.log(`[Browser Console L${level}]`, msg);
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

    console.log('Clicking Guru AI button...');
    const clicked = await win.webContents.executeJavaScript(`
      const navBtn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').includes('Guru AI') || (b.innerText || '').includes('Guru'));
      if (navBtn) {
        navBtn.click();
        true;
      } else {
        false;
      }
    `);
    console.log('Clicked Guru AI:', clicked);
    await new Promise(r => setTimeout(r, 1500));

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

    console.log('Guru AI A11y Violations:', JSON.stringify(violations, null, 2));
  } catch (err) {
    console.error('Diagnostic error:', err);
  } finally {
    app.quit();
  }
});

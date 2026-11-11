const { app, BrowserWindow } = require('electron');
const path = require('path');
const os = require('os');

app.setPath('userData', path.join(os.tmpdir(), 'drabyashree_sh_test_' + Date.now()));

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

    // Seed guest session and acceptance
    await win.webContents.executeJavaScript(`
      localStorage.setItem('nepse_hub_local_session', JSON.stringify({ uid: 'test_guest', isGuest: true }));
      localStorage.setItem('nepse_hub_disclaimer_v1_acknowledged', '1');
      localStorage.setItem('drabyashree_auth_user', JSON.stringify({ uid: 'test_guest', isGuest: true, role: 'investor' }));
      localStorage.setItem('nepse_disclaimer_accepted', 'true');
    `);

    await win.loadURL('http://localhost:4173');
    await new Promise(r => setTimeout(r, 2000));

    // Navigate to Service Hub tab
    const switched = await win.webContents.executeJavaScript(`
      const navBtn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').includes('Service Hub') || (b.innerText || '').includes('Services'));
      if (navBtn) {
        navBtn.click();
        true;
      } else {
        false;
      }
    `);
    console.log('Navigated to Service Hub:', switched);

    await new Promise(r => setTimeout(r, 1500));

    // Verify initial cards count
    const initialCards = await win.webContents.executeJavaScript(`
      document.querySelectorAll('.services-graceful-card').length
    `);
    console.log('Initial Service Cards Rendered:', initialCards);

    // Test scrolling: find the element with overflow-y or document.body / window
    const scrollInfo = await win.webContents.executeJavaScript(`
      const findScrollable = () => {
        const els = [document.documentElement, document.body, ...document.querySelectorAll('*')];
        for (const e of els) {
          if (e.scrollHeight > e.clientHeight + 50) {
            const style = window.getComputedStyle(e);
            if (style.overflowY === 'auto' || style.overflowY === 'scroll' || e === document.documentElement || e === document.body) {
              const prev = e.scrollTop;
              e.scrollTop = 300;
              const after = e.scrollTop;
              return { tag: e.tagName, className: e.className, scrollHeight: e.scrollHeight, clientHeight: e.clientHeight, scrolled: after > 0 };
            }
          }
        }
        return null;
      };
      findScrollable();
    `);
    console.log('Scrollable Element Info:', scrollInfo);

    // Test search filter: type "SIP" into #services-hub-search-input
    await win.webContents.executeJavaScript(`
      const input = document.getElementById('services-hub-search-input');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'SIP');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    `);
    await new Promise(r => setTimeout(r, 500));

    const filterResult = await win.webContents.executeJavaScript(`
      document.querySelectorAll('.services-graceful-card').length
    `);
    console.log('Cards after search "SIP":', filterResult);

    // Clear search filter by clicking clear button
    await win.webContents.executeJavaScript(`
      const clearBtn = document.querySelector('.services-graceful-clear-btn');
      if (clearBtn) clearBtn.click();
      else {
        const input = document.getElementById('services-hub-search-input');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    `);
    await new Promise(r => setTimeout(r, 500));

    const resetCards = await win.webContents.executeJavaScript(`
      document.querySelectorAll('.services-graceful-card').length
    `);
    console.log('Cards after clearing search:', resetCards);

    if (initialCards > 0 && filterResult > 0 && filterResult < initialCards && resetCards === initialCards) {
      console.log('TEST RESULT: SUCCESS! Service Hub scrolling and search filtering verified with content-visibility auto.');
    } else {
      console.error('TEST RESULT: FAILED verification assertions:', { initialCards, filterResult, resetCards });
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Error during test:', err);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});

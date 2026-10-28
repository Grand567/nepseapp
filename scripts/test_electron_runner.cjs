const { app, BrowserWindow } = require('electron');

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
    await win.loadURL('http://localhost:3000');
    await new Promise(r => setTimeout(r, 1000));
    
    // First dismiss disclaimer if present
    await win.webContents.executeJavaScript(`
      const discBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.toLowerCase().includes('understand') || b.innerText.toLowerCase().includes('accept'));
      if (discBtn) discBtn.click();
    `);
    await new Promise(r => setTimeout(r, 1000));

    // Click 'Continue as Guest'
    const guestClicked = await win.webContents.executeJavaScript(`
      const guestBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Continue as Guest'));
      if (guestBtn) {
        guestBtn.click();
        'GUEST_CLICKED';
      } else {
        'GUEST_NOT_FOUND';
      }
    `);
    console.log('[LiveTester] Guest button status:', guestClicked);
    
    await new Promise(r => setTimeout(r, 3000));
    const navButtons = await win.webContents.executeJavaScript(`
      Array.from(document.querySelectorAll('.nav-btn')).map(b => b.innerText.trim().replace(/\\n/g, ' '))
    `);
    console.log('[LiveTester] Navigation buttons after guest login:', navButtons);
    
    const pageHeader = await win.webContents.executeJavaScript(`
      document.querySelector('header')?.innerText?.slice(0, 200) || document.body.innerText.slice(0, 200)
    `);
    console.log('[LiveTester] Page header/body:\n', pageHeader);
  } catch (err) {
    console.error('[LiveTester] Error:', err.message);
  } finally {
    app.quit();
  }
});
